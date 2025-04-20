import { useState, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import api from '../../../api/apiClient';

export const useGeneration = (
  selectedDataset,
  selectedTemplate,
  variationsRef,
  setVariations,
  setSelectedVariations,
  workflowEnabled,
  currentWorkflow,
  setIsExecutingWorkflow
) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef(null);

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      toast.info("Generation cancelled.");
      setVariations(prev => prev.map(v => v.isGenerating ? { ...v, isGenerating: false, error: 'Cancelled by user' } : v));
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleGenerate = useCallback(async (data) => {
    if (!selectedDataset || !selectedTemplate) {
      toast.warning('Please select a dataset and template first');
      return;
    }

    if (!data.template_id || data.template_id !== selectedTemplate.id) {
      toast.error('Template mismatch. Please try selecting the template again.');
      return;
    }

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const totalVariations = data.seeds.length * data.count;
    const existingVariationsCount = variationsRef.current.length; // Get count before adding new ones

    // Ensure template_id is set for all placeholder variations
    const currentTemplateId = data.template_id; // Explicitly capture template_id here
    
    const initialVariations = Array.from({ length: totalVariations }, (_, globalIndex) => {
      const seedIndex = Math.floor(globalIndex / data.count);
      const variationIndex = globalIndex % data.count;
      const seedData = data.seeds[seedIndex];
      const uniqueId = `temp-${existingVariationsCount + globalIndex}-${Date.now()}`; // Ensure unique ID across generations

      return {
        variation: `Seed ${seedIndex + 1} / Variation ${variationIndex + 1}`,
        output: '',
        tool_calls: null,
        processed_prompt: '',
        slots: seedData.slots,
        seed_index: seedIndex,
        variation_index: variationIndex,
        isGenerating: true,
        error: null,
        id: uniqueId, // Use the new unique ID
        template_id: currentTemplateId // Ensure template_id is set consistently
      };
    });
    // Prepend new variations instead of appending
    setVariations(prevVariations => [...initialVariations, ...prevVariations]);
    // Do not clear selected variations from previous generations

    try {
      if (workflowEnabled && currentWorkflow) {
        // Execute using workflow
        await handleExecuteWorkflow(data, initialVariations, signal);
      } else {
        // Standard generation
        await api.generate(data, (result) => {
          if (signal.aborted) {
            console.log("Skipping update for aborted request.");
            return;
          }
          
          // Add debug logging to track template_id
          console.log("Received result from backend with template_id:", result.template_id);
          
          setVariations(prevVariations => {
            const updated = [...prevVariations];
            const targetIndex = updated.findIndex(v =>
              v.seed_index === result.seed_index &&
              v.variation_index === result.variation_index &&
              v.isGenerating && v.id.startsWith('temp-') // Ensure we update the correct placeholder
            );

            if (targetIndex !== -1) {
              // Ensure template_id is explicitly preserved and logged
              const backendTemplateId = result.template_id || currentTemplateId;
              console.log(`Updating variation at index ${targetIndex} with template_id:`, backendTemplateId);
              
              updated[targetIndex] = {
                ...updated[targetIndex],
                ...result,
                isGenerating: false,
                error: result.output?.startsWith('[Error:') || result.output?.startsWith('[Ollama API timed out') ? result.output : null,
                template_id: backendTemplateId, // Always ensure template_id is set
                _source: 'stream' // Debug flag to track source
              };
            } else {
              console.error(`Could not find placeholder for seed ${result.seed_index}, variation ${result.variation_index}. It might have been dismissed.`);
            }
            return updated;
          });
        }, signal);
      }

      if (!signal.aborted) {
        toast.info('Generation stream finished.');
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Generation fetch aborted successfully.');
      } else {
        console.error('Generation stream failed:', error);
        toast.error(`Generation failed: ${error.message}`);
        setVariations(prev => prev.map(v => v.isGenerating ? { ...v, isGenerating: false, error: `Stream failed: ${error.message}` } : v));
      }
    } finally {
      if (!signal?.aborted) {
        setIsGenerating(false);
        setIsExecutingWorkflow(false);
      }
      abortControllerRef.current = null;
    }
  }, [selectedDataset, selectedTemplate, setVariations, workflowEnabled, currentWorkflow, variationsRef, setIsExecutingWorkflow]);

  const handleRegenerate = useCallback(async (id, instruction = '') => {
    if (!selectedTemplate || isGenerating) return;

    const variationIndex = variationsRef.current.findIndex(v => v.id === id);
    if (variationIndex === -1) {
      console.error('Cannot regenerate: variation not found with id', id);
      return;
    }
    const currentVariation = variationsRef.current[variationIndex];

    setVariations(prevVariations => {
      const updated = [...prevVariations];
      const index = updated.findIndex(v => v.id === id);
      if (index !== -1) {
        updated[index] = {
          ...updated[index],
          isGenerating: true,
          error: null,
          output: '',
          tool_calls: null
        };
      }
      return updated;
    });

    try {
      const slotData = currentVariation.slots || {};

      const regenParams = {
        template_id: selectedTemplate.id,
        seeds: [{ slots: slotData }],
        count: 1,
        ...(instruction && instruction.trim() !== '' && { instruction: instruction.trim() })
      };

      const originalSeedIndex = currentVariation.seed_index;
      const originalVariationIndex = currentVariation.variation_index;
      
      // Check if this is an output node variation
      const isOutputNodeVariation = currentVariation._output_node_id !== undefined;
      const outputNodeId = currentVariation._output_node_id;
      const outputNodeName = currentVariation._output_node_name;

      // Use workflow if enabled
      if (workflowEnabled && currentWorkflow) {
        try {
          // First set up progress tracking
          const nodeStatusMap = {};
          
          // Reset workflow progress
          setVariations(prevVariations => {
            const updated = [...prevVariations];
            const index = updated.findIndex(v => v.id === id);
            if (index !== -1) {
              // Reset workflow_progress
              updated[index] = {
                ...updated[index],
                workflow_progress: {
                  node_statuses: {},
                  started_at: new Date().toISOString()
                }
              };
            }
            return updated;
          });
          
          // Get output from the current variation for regeneration input
          // This must be passed as a STRING in all cases
          const variationOutput = currentVariation.output || "";
          
          // Log what we're sending to help with debugging
          console.log(`Preparing workflow input for regeneration:`, {
            hasOutput: !!currentVariation.output,
            outputPreview: currentVariation.output ? currentVariation.output.substring(0, 50) + '...' : 'empty',
            variationKeys: Object.keys(currentVariation),
            isOutputNodeVariation,
            outputNodeId,
            outputNodeName
          });
          
          // Full variation data for context
          const regenerationData = {
            slots: slotData,
            template_id: selectedTemplate.id,
            instruction: instruction || "",
            regenerating: true,
            original_output: variationOutput,
            // If this is an output node variation, include that information
            ...(isOutputNodeVariation && {
              target_output_node_id: outputNodeId,
              target_output_node_name: outputNodeName
            })
          };
          
          // First get the template output using standard generation
          const regenParams = {
            template_id: selectedTemplate.id,
            seeds: [{ slots: slotData }],
            count: 1,
            ...(instruction && instruction.trim() !== '' && { instruction: instruction.trim() })
          };
          
          // Temporary variable to store template output
          let templateOutput = "";
          
          console.log("Getting fresh template output for regeneration");
          
          // Get template output first (identical to standard template process)
          try {
            await api.generate(regenParams, (result) => {
              templateOutput = result.output || "";
              console.log("Received template output for workflow regeneration:", {
                hasOutput: !!templateOutput,
                outputLength: templateOutput.length,
                outputPreview: templateOutput.substring(0, 50) + (templateOutput.length > 50 ? '...' : '')
              });
            });
          } catch (error) {
            console.error("Failed to get template output for regeneration:", error);
            templateOutput = ""; // Use empty string if template generation fails
          }
          
          // Update the state to reflect we got template output
          setVariations(prevVariations => {
            const targetIndex = prevVariations.findIndex(v => v.id === id);
            if (targetIndex !== -1) {
              prevVariations[targetIndex].template_output = templateOutput;
            }
            return prevVariations;
          });
          
          // Use streaming API for progress updates (with template output)
          await api.executeWorkflowWithStream(
            currentWorkflow,
            templateOutput, // Now using fresh template output
            regenerationData,
            (progressData) => {
              // Handle progress updates
              if (progressData.type === 'init') {
                handleInitProgress(id, progressData, nodeStatusMap, currentWorkflow);
              }
              else if (progressData.type === 'progress') {
                handleProgressUpdate(id, progressData, nodeStatusMap);
              }
              else if (progressData.type === 'complete') {
                // If this is an output node variation, check for multiple output nodes
                if (isOutputNodeVariation) {
                  // Handle completion for a specific output node variation
                  const outputNodeResults = progressData.result?.output_node_results || {};
                  
                  // Check if our specific output node is in the results
                  if (outputNodeId && outputNodeResults[outputNodeId]) {
                    // Use the output from the specific node we're regenerating
                    const nodeOutput = outputNodeResults[outputNodeId];
                    const outputContent = nodeOutput.output || "No output from this node after regeneration";
                    
                    setVariations(prevVariations => {
                      const updated = [...prevVariations];
                      const targetIndex = updated.findIndex(v => v.id === id);
                      
                      if (targetIndex !== -1) {
                        updated[targetIndex] = {
                          ...updated[targetIndex],
                          output: outputContent,
                          processed_prompt: instruction || "",
                          isGenerating: false,
                          error: null,
                          template_id: selectedTemplate.id,
                          _source: 'workflow_regen',
                          workflow_results: progressData.result,
                          workflow_progress: {
                            ...updated[targetIndex].workflow_progress,
                            completed_at: new Date().toISOString(),
                            status: 'complete'
                          }
                        };
                        
                        // Deselect item if it was selected
                        if (variationsRef.current.find(v => v.id === id) && 
                            variationsRef.current.find(v => v.id === id).selected) {
                          setSelectedVariations(prevSelected => {
                            const newSelected = new Set(prevSelected);
                            newSelected.delete(id);
                            return newSelected;
                          });
                          toast.info("Deselected item due to regeneration.");
                        }
                      }
                      return updated;
                    });
                  } else {
                    // Our specific output node wasn't found in the results
                    // Fall back to default behavior
                    handleRegenerateWorkflowComplete(id, progressData, instruction);
                  }
                } else {
                  // Standard workflow completion handling
                  handleRegenerateWorkflowComplete(id, progressData, instruction);
                }
              }
              else if (progressData.type === 'error') {
                // Update variation with error
                setVariations(prevVariations => {
                  const updated = [...prevVariations];
                  const targetIndex = updated.findIndex(v => v.id === id);
                  
                  if (targetIndex !== -1) {
                    updated[targetIndex] = {
                      ...updated[targetIndex],
                      output: `[Error: Workflow execution failed - ${progressData.error}]`,
                      isGenerating: false,
                      error: `Workflow execution failed: ${progressData.error}`,
                      _source: 'workflow_regen_error',
                      workflow_progress: {
                        ...updated[targetIndex].workflow_progress,
                        status: 'error',
                        error: progressData.error,
                        completed_at: new Date().toISOString()
                      }
                    };
                  }
                  return updated;
                });
              }
            },
            null, // no signal for regeneration
            false // no debug mode
          );
        } catch (error) {
          console.error('Workflow regeneration failed:', error);
          setVariations(prevVariations => {
            const updated = [...prevVariations];
            const index = updated.findIndex(v => v.id === id);
            if (index !== -1) {
              updated[index] = {
                ...updated[index],
                isGenerating: false,
                error: `Workflow execution failed: ${error.message}`,
                _source: 'workflow_regen_error'
              };
            }
            return updated;
          });
        }
      } else {
        // Standard regeneration without workflow
        await api.generate(regenParams, (result) => {
          setVariations(prevVariations => {
            const updated = [...prevVariations];
            const targetIndex = updated.findIndex(v => v.id === id);

            if (targetIndex !== -1) {
              updated[targetIndex] = {
                ...updated[targetIndex],
                variation: result.variation,
                output: result.output,
                tool_calls: result.tool_calls,
                processed_prompt: result.processed_prompt,
                seed_index: result.seed_index ?? originalSeedIndex,
                variation_index: result.variation_index ?? originalVariationIndex,
                slots: result.slots ?? slotData,
                system_prompt: result.system_prompt, // Store system_prompt from backend
                template_id: result.template_id, // Properly update template_id from backend response
                isGenerating: false,
                error: result.output?.startsWith('[Error:') || result.output?.startsWith('[Ollama API timed out') ? result.output : null,
              };

              // Deselect item if it was selected, as it has been regenerated
              if (variationsRef.current.find(v => v.id === id) && 
                  variationsRef.current.find(v => v.id === id).selected) {
                setSelectedVariations(prevSelected => {
                  const newSelected = new Set(prevSelected);
                  newSelected.delete(id);
                  return newSelected;
                });
                toast.info("Deselected item due to regeneration.");
              }

            } else {
              console.error(`Could not find variation with id ${id} to update after regeneration.`);
            }
            return updated;
          });
        });
      }

    } catch (error) {
      console.error('Regeneration failed:', error);
      const errorMsg = error.message || 'Failed to regenerate. Please try again.';
      setVariations(prevVariations => {
        const updated = [...prevVariations];
        const index = updated.findIndex(v => v.id === id);
        if (index !== -1) {
          updated[index] = {
            ...updated[index],
            isGenerating: false,
            error: errorMsg
          };
        }
        return updated;
      });
    }
  }, [selectedTemplate, isGenerating, setVariations, workflowEnabled, currentWorkflow, variationsRef, setSelectedVariations]);

  // Helper function to handle workflow initialization
  const handleInitProgress = (id, progressData, nodeStatusMap, currentWorkflow) => {
    // Initialize node statuses
    const nodeIds = progressData.execution_order || [];
    
    // Some nodes might be isolated or not properly connected
    if (progressData.input_nodes) {
      console.log("Workflow structure analysis:", {
        input_nodes: progressData.input_nodes,
        output_nodes: progressData.output_nodes,
        isolated_nodes: progressData.isolated_nodes || [],
        execution_order: progressData.execution_order || []
      });
    }
    
    // Set all nodes to queued initially, including the node name
    nodeIds.forEach(nodeId => {
      const node = currentWorkflow?.nodes?.[nodeId];
      console.log("USING NODE DETAILS", node);
      const nodeName = node?.name || nodeId; // Get name or fallback to ID
      console.log(`[Workflow Init] Node ID: ${nodeId}, Node Data:`, node?.data, `Derived Name: ${nodeName}`);
      nodeStatusMap[nodeId] = { 
        status: 'queued',
        progress: 0,
        started_at: null,
        completed_at: null,
        node_name: nodeName // Store the node name
      };
    });
    
    // Update variation with workflow structure
    setVariations(prevVariations => {
      const updated = [...prevVariations];
      const targetIndex = updated.findIndex(v => v.id === id);
      
      if (targetIndex !== -1) {
        updated[targetIndex] = {
          ...updated[targetIndex],
          workflow_progress: {
            node_statuses: {...nodeStatusMap}, // Pass the map with names
            execution_order: progressData.execution_order,
            started_at: new Date().toISOString()
          }
        };
      }
      return updated; 
    });
  };

  // Helper function to handle progress updates
  const handleProgressUpdate = (id, progressData, nodeStatusMap) => {
    // Update node status
    const { node_id, status, progress, result } = progressData;
    
    if (nodeStatusMap[node_id]) {
      // Preserve existing node_name when updating status
      const existingNodeData = nodeStatusMap[node_id];
      nodeStatusMap[node_id] = {
        ...existingNodeData, // Keep existing data like node_name
        status: status,
        progress: progress,
        result: result || null,
        started_at: status === 'running' && progress === 0 
          ? new Date().toISOString() 
          : existingNodeData.started_at,
        completed_at: (status === 'success' || status === 'error') && progress === 1 
          ? new Date().toISOString() 
          : existingNodeData.completed_at
      };
      
      // Update variation with progress
      setVariations(prevVariations => {
        const updated = [...prevVariations];
        const targetIndex = updated.findIndex(v => v.id === id);
        
        if (targetIndex !== -1) {
          // Ensure workflow_progress exists before updating node_statuses
          const currentProgress = updated[targetIndex].workflow_progress || { node_statuses: {}, execution_order: [] };
          updated[targetIndex] = {
            ...updated[targetIndex],
            workflow_progress: {
              ...currentProgress,
              node_statuses: {...nodeStatusMap} // Pass updated map
            }
          };
        }
        return updated;
      });
    }
  };

  // Helper function to handle workflow completion for regeneration
  const handleRegenerateWorkflowComplete = (id, progressData, instruction) => {
    setVariations(prevVariations => {
      const updated = [...prevVariations];
      const targetIndex = updated.findIndex(v => v.id === id);
      
      if (targetIndex !== -1) {
        // Extract the final output from workflow result
        let workflowOutput = "";
        
        // Handle multiple output nodes if present
        const outputNodeResults = progressData.result?.output_node_results || {};
        const outputNodes = Object.keys(outputNodeResults);
        
        if (outputNodes.length > 0) {
          // Just use the first output node result
          const firstNodeId = outputNodes[0];
          const nodeOutput = outputNodeResults[firstNodeId];
          workflowOutput = nodeOutput.output || "";
          
          // Update the node ID and name
          updated[targetIndex]._output_node_id = firstNodeId;
          updated[targetIndex]._output_node_name = nodeOutput.name || firstNodeId;
          
          // Update variation name with node name
          if (nodeOutput.name) {
            // Extract the base variation name (before any parenthesis)
            const baseName = updated[targetIndex].variation.split(' (')[0];
            updated[targetIndex].variation = `${baseName} (${nodeOutput.name})`;
          }
        } else {
          // Try to get output from different places
          if (progressData.result?.final_output?.output) {
            workflowOutput = progressData.result.final_output.output;
          } else if (progressData.result?.final_output) {
            // If final_output exists but no output field, try other fields
            const finalOutput = progressData.result.final_output;
            for (const key of ['result', 'text', 'content', 'value']) {
              if (finalOutput[key]) {
                workflowOutput = finalOutput[key];
                break;
              }
            }
          }
          
          // If still empty, check results array for any output
          if (!workflowOutput && progressData.result?.results) {
            // Look for the last result with an output
            const results = progressData.result.results;
            for (let i = results.length - 1; i >= 0; i--) {
              if (results[i].output) {
                workflowOutput = results[i].output;
                break;
              }
            }
          }
        }
        
        // Final fallback
        if (!workflowOutput) {
          workflowOutput = "No output from workflow";
        }
        
        updated[targetIndex] = {
          ...updated[targetIndex],
          output: workflowOutput,
          processed_prompt: instruction || "",
          isGenerating: false,
          error: null,
          template_id: selectedTemplate.id,
          _source: 'workflow_regen',
          workflow_results: progressData.result,
          workflow_progress: {
            ...updated[targetIndex].workflow_progress,
            completed_at: new Date().toISOString(),
            status: 'complete'
          }
        };
        
        // Deselect item if it was selected, as it has been regenerated
        if (variationsRef.current.find(v => v.id === id)?.selected) {
          setSelectedVariations(prevSelected => {
            const newSelected = new Set(prevSelected);
            newSelected.delete(id);
            return newSelected;
          });
          toast.info("Deselected item due to regeneration.");
        }
      }
      return updated;
    });
  };

  // Function to execute a workflow
  const handleExecuteWorkflow = async (data, initialVariations, signal) => {
    setIsExecutingWorkflow(true);
    
    // Create a map of variations by seed/variation index for easy reference
    const variationMap = {};
    initialVariations.forEach(v => {
      const key = `${v.seed_index}_${v.variation_index}`;
      variationMap[key] = v;
    });
    
    // Track node statuses for progress visualization
    const nodeStatusMap = {};
    
    // First, we need to generate outputs using the normal template pipeline,
    // exactly as if workflow mode was disabled
    console.log("Running standard template generation before workflow processing");
    
    // Use the standard generation API to get template outputs
    try {
      await api.generate(data, (result) => {
        if (signal.aborted) {
          console.log("Skipping update for aborted request.");
          return;
        }
        
        // Update the variation with template output
        setVariations(prevVariations => {
          const updated = [...prevVariations];
          const targetIndex = updated.findIndex(v =>
            v.seed_index === result.seed_index &&
            v.variation_index === result.variation_index &&
            v.isGenerating && v.id.startsWith('temp-')
          );

          if (targetIndex !== -1) {
            // Store the template generation output, but keep isGenerating=true
            // since we'll now process it through the workflow
            updated[targetIndex] = {
              ...updated[targetIndex],
              ...result,
              _source: 'template_output',
              isGenerating: true, // Still generating because workflow processing is next
              error: null
            };
          } else {
            console.error(`Could not find placeholder for seed ${result.seed_index}, variation ${result.variation_index}`);
          }
          return updated;
        });
      }, signal);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Template generation failed before workflow:', error);
        toast.error(`Template generation failed: ${error.message}`);
      }
      // Ensure workflow execution stops if template generation fails
      setIsExecutingWorkflow(false); // Stop execution state
      // Update variations to show error and stop generating state
      setVariations(prev => prev.map(v => v.isGenerating ? { ...v, isGenerating: false, error: `Template generation failed: ${error.message}` } : v));
      return; // Exit the function
    }
    
    // At this point, our variations should have template outputs
    // Now we can process each through the workflow
    
    // Process each seed through the workflow
    for (let seedIndex = 0; seedIndex < data.seeds.length; seedIndex++) {
      const seedData = data.seeds[seedIndex];
      
      // Process multiple variations for this seed
      for (let variationIndex = 0; variationIndex < data.count; variationIndex++) {
        if (signal.aborted) {
          console.log("Skipping workflow execution for aborted request.");
          // Ensure workflow execution stops if aborted
          setIsExecutingWorkflow(false); // Stop execution state
          // Update variations to show cancelled state
          setVariations(prev => prev.map(v => v.isGenerating ? { ...v, isGenerating: false, error: 'Cancelled by user' } : v));
          return; // Exit the function
        }
        
        try {
          // Create a variation key for lookup
          const variationKey = `${seedIndex}_${variationIndex}`;
          
          // Find target variation - should now have template output
          let targetVariation = null;
          
          // Find the latest state of the variation (with template output)
          setVariations(prevVariations => {
            const varIndex = prevVariations.findIndex(v => 
              v.seed_index === seedIndex && 
              v.variation_index === variationIndex && 
              v.id.startsWith('temp-')
            );
            
            if (varIndex !== -1) {
              targetVariation = prevVariations[varIndex];
            }
            return prevVariations; // No state change
          });
          
          // Wait for state update to propagate
          await new Promise(resolve => setTimeout(resolve, 10));
          
          if (!targetVariation) {
            console.error(`Variation not found for seed ${seedIndex}, variation ${variationIndex}`);
            continue;
          }
          
          // Reset node status map for this variation
          nodeStatusMap[variationKey] = {};
          
          // Get the template output from the template generation step
          const templateOutput = targetVariation.output || "";
          
          console.log(`Feeding template output to workflow for variation ${variationKey}:`, {
            hasOutput: !!templateOutput,
            outputLength: templateOutput.length,
            outputPreview: templateOutput ? templateOutput.substring(0, 50) + (templateOutput.length > 50 ? '...' : '') : 'empty'
          });
          
          // Package all template results as context for the workflow
          const templateContext = {
            slots: seedData.slots,
            template_id: data.template_id,
            instruction: data.instruction || "",
            processed_prompt: targetVariation.processed_prompt || "",
            system_prompt: targetVariation.system_prompt || "",
            tool_calls: targetVariation.tool_calls || null,
            variation: targetVariation.variation || ""
          };
          
          // Track the original variation ID to update or create derivatives from
          const origVariationId = targetVariation.id;
          let createdOutputVariations = {}; // Track created output variations
          
          // Execute workflow with streaming for this seed/variation
          await api.executeWorkflowWithStream(
            currentWorkflow,
            templateOutput, // Template output becomes workflow input
            templateContext, // Context data for workflow
            (progressData) => {
              // Handle progress updates
              if (progressData.type === 'init') {
                // Initialize node statuses
                const nodeIds = progressData.execution_order || [];
                
                // Some nodes might be isolated or not properly connected
                if (progressData.input_nodes) {
                  console.log("Workflow structure analysis:", {
                    input_nodes: progressData.input_nodes,
                    output_nodes: progressData.output_nodes,
                    isolated_nodes: progressData.isolated_nodes || [],
                    execution_order: progressData.execution_order || []
                  });
                }
                
                // Set all nodes to queued initially, including the node name
                nodeIds.forEach(nodeId => {
                  const node = currentWorkflow?.nodes?.[nodeId];
                  const nodeName = node?.name || nodeId; // Get name from node data or fallback to ID
                  console.log(`[Workflow Init] Node ID: ${nodeId}, Node Data:`, node?.data, `Derived Name: ${nodeName}`); // Added logging
                  nodeStatusMap[variationKey][nodeId] = { 
                    status: 'queued',
                    progress: 0,
                    started_at: null,
                    completed_at: null,
                    node_name: nodeName // Store the node name
                  };
                });
                
                // Update variation with workflow structure
                setVariations(prevVariations => {
                  const updated = [...prevVariations];
                  const targetIndex = updated.findIndex(v => v.id === origVariationId);
                  
                  if (targetIndex !== -1) {
                    updated[targetIndex] = {
                      ...updated[targetIndex],
                      workflow_progress: {
                        node_statuses: {...nodeStatusMap[variationKey]}, // Pass the map with names
                        execution_order: progressData.execution_order,
                        started_at: new Date().toISOString()
                      }
                    };
                  }
                  return updated;
                });
              }
              else if (progressData.type === 'progress') {
                // Update node status
                const { node_id, status, progress, result } = progressData;
                
                if (nodeStatusMap[variationKey][node_id]) {
                  // Preserve existing node_name when updating status
                  const existingNodeData = nodeStatusMap[variationKey][node_id];
                  nodeStatusMap[variationKey][node_id] = {
                    ...existingNodeData, // Keep existing data like node_name
                    status: status,
                    progress: progress,
                    result: result || null,
                    started_at: status === 'running' && progress === 0 
                      ? new Date().toISOString() 
                      : existingNodeData.started_at,
                    completed_at: (status === 'success' || status === 'error') && progress === 1 
                      ? new Date().toISOString() 
                      : existingNodeData.completed_at
                  };
                  
                  // Update variation with progress
                  setVariations(prevVariations => {
                    const updated = [...prevVariations];
                    const targetIndex = updated.findIndex(v => v.id === origVariationId);
                    
                    if (targetIndex !== -1) {
                      // Ensure workflow_progress exists before updating node_statuses
                      const currentProgress = updated[targetIndex].workflow_progress || { node_statuses: {}, execution_order: [] };
                      updated[targetIndex] = {
                        ...updated[targetIndex],
                        workflow_progress: {
                          ...currentProgress,
                          node_statuses: {...nodeStatusMap[variationKey]} // Pass updated map
                        }
                      };
                    }
                    return updated;
                  });
                }
              }
              else if (progressData.type === 'complete') {
                // Get all the node results
                const allResults = progressData.result?.results || [];
                
                // Filter to find just the output nodes
                const outputNodeResults = allResults.filter(result => 
                  result.node_type === 'output'
                );
                
                if (outputNodeResults.length <= 1) {
                  // If there's only one output node, update the original variation as before
                  setVariations(prevVariations => {
                    const updated = [...prevVariations];
                    const targetIndex = updated.findIndex(v => v.id === origVariationId);
                    
                    if (targetIndex !== -1) {
                      const baseVariation = updated[targetIndex];
                      // Extract the output content
                      const finalOutput = progressData.result?.final_output?.output || '';
                      // Extract node info if available
                      const outputNode = outputNodeResults[0];
                      const nodeId = outputNode?.node_id || 'unknown_output';
                      const nodeName = outputNode?.node_name || nodeId;
                      
                      updated[targetIndex] = {
                        ...baseVariation,
                        output: finalOutput, // Use final_output if only one output node
                        variation: `${baseVariation.variation.split(' (')[0]} (${nodeName})`, // Update name
                        isGenerating: false,
                        error: null,
                        template_id: data.template_id,
                        _source: 'workflow_output',
                        _output_node_id: nodeId,
                        _output_node_name: nodeName,
                        workflow_results: progressData.result,
                        workflow_progress: {
                          ...baseVariation.workflow_progress,
                          completed_at: new Date().toISOString(),
                          status: 'complete'
                        }
                      };
                    }
                    return updated;
                  });
                } else {
                  // Multiple output nodes - create multiple variation cards
                  setVariations(prevVariations => {
                    const updated = [...prevVariations];
                    const targetIndex = updated.findIndex(v => v.id === origVariationId);
                    
                    if (targetIndex !== -1) {
                      const baseVariation = updated[targetIndex];
                      const newVariations = [];
                      
                      // Process each output node result
                      outputNodeResults.forEach((nodeResult, index) => {

                        console.log("Processing output node result:", nodeResult);
                        // Extract node info and output
                        const nodeId = nodeResult.node_id;
                        const nodeName = nodeResult?.node_name || nodeId; // Fallback to ID if name is not available
                        const outputContent = nodeResult.output?.output || '';
                        
                        if (index === 0) {
                          // Update the original variation with the first output
                          updated[targetIndex] = {
                            ...baseVariation,
                            output: outputContent,
                            variation: `${baseVariation.variation.split(' (')[0]} (${nodeName})`,
                            isGenerating: false,
                            error: null,
                            template_id: data.template_id,
                            _source: 'workflow_output',
                            _output_node_id: nodeId,
                            _output_node_name: nodeName,
                            workflow_results: progressData.result,
                            workflow_progress: {
                              ...baseVariation.workflow_progress,
                              completed_at: new Date().toISOString(),
                              status: 'complete'
                            }
                          };
                        } else {
                          // Create new variations for additional outputs
                          const newVariationId = `${origVariationId}-output-${nodeId}-${Date.now()}`;
                          
                          newVariations.push({
                            ...baseVariation,
                            id: newVariationId,
                            output: outputContent,
                            variation: `${baseVariation.variation.split(' (')[0]} (${nodeName})`,
                            isGenerating: false,
                            error: null,
                            template_id: data.template_id,
                            _source: 'workflow_output',
                            _output_node_id: nodeId,
                            _output_node_name: nodeName,
                            workflow_results: progressData.result,
                            workflow_progress: {
                              ...baseVariation.workflow_progress,
                              completed_at: new Date().toISOString(),
                              status: 'complete'
                            }
                          });
                        }
                      });
                      
                      // Add all new variations to the updated array
                      // Insert new variations right after the original one
                      updated.splice(targetIndex + 1, 0, ...newVariations);
                      return updated;
                    }
                    return updated;
                  });
                }
              }
              else if (progressData.type === 'error') {
                // Update variation with error
                setVariations(prevVariations => {
                  const updated = [...prevVariations];
                  const targetIndex = updated.findIndex(v => v.id === origVariationId);
                  
                  if (targetIndex !== -1) {
                    updated[targetIndex] = {
                      ...updated[targetIndex],
                      output: `[Error: Workflow execution failed - ${progressData.error}]`,
                      isGenerating: false,
                      error: `Workflow execution failed: ${progressData.error}`,
                      template_id: data.template_id,
                      _source: 'workflow_error',
                      workflow_progress: {
                        ...updated[targetIndex].workflow_progress,
                        status: 'error',
                        error: progressData.error,
                        completed_at: new Date().toISOString()
                      }
                    };
                  }
                  return updated;
                });
              }
            },
            signal,
            data.debug_mode || false
          );
          
        } catch (error) {
          if (error.name === 'AbortError') {
            console.log("Workflow execution aborted.");
            // Ensure workflow execution stops if aborted during API call
            setIsExecutingWorkflow(false); // Stop execution state
            // Update variations to show cancelled state
            setVariations(prev => prev.map(v => v.isGenerating ? { ...v, isGenerating: false, error: 'Cancelled by user' } : v));
            return; // Exit the function
          }
          
          console.error(`Workflow execution failed for seed ${seedIndex}, variation ${variationIndex}:`, error);
          
          // Update the variation with error
          setVariations(prevVariations => {
            const updated = [...prevVariations];
            const targetIndex = updated.findIndex(v =>
              v.seed_index === seedIndex &&
              v.variation_index === variationIndex &&
              v.isGenerating && v.id.startsWith('temp-')
            );

            if (targetIndex !== -1) {
              updated[targetIndex] = {
                ...updated[targetIndex],
                output: `[Error: Workflow execution failed - ${error.message}]`,
                isGenerating: false,
                error: `Workflow execution failed: ${error.message}`,
                template_id: data.template_id,
                _source: 'workflow_error'
              };
            }
            return updated;
          });
        }
      }
    }
    
    // Only set isExecutingWorkflow to false if the process wasn't aborted
    if (!signal.aborted) {
      setIsExecutingWorkflow(false);
    }
  };

  return {
    isGenerating,
    handleGenerate,
    handleCancelGeneration,
    handleRegenerate
  };
};

export default useGeneration;