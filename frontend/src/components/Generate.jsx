import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useDebouncedCallback } from 'use-debounce'; // Import useDebouncedCallback
import api from '../api/apiClient';
import SeedForm from './SeedForm';
import VariationCard from './VariationCard';
import ExampleTable from './ExampleTable';
import ParaphraseModal from './modals/ParaphraseModal';
import RegenerateModal from './modals/RegenerateModal';
import CustomSelect from './CustomSelect';
import Icon from './Icons'; // Import Icon component
import ToggleSwitch from './ToggleSwitch'; // Import ToggleSwitch
import WorkflowManager from './WorkflowManager'; // Import WorkflowManager component
import WorkflowSelectionModal from './modals/WorkflowSelectionModal'; // Import WorkflowSelectionModal component

const Generate = ({ context }) => {
  const { selectedDataset } = context;
  const location = useLocation();

  // Constants for localStorage keys
  const STORAGE_KEY_WORKFLOW_ENABLED = 'datasetforge_workflowEnabled';
  const STORAGE_KEY_SELECTED_WORKFLOW = 'datasetforge_selectedWorkflowId';

  const [templates, setTemplates] = useState([]);
  // Initialize selectedTemplateId from localStorage
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => {
    return localStorage.getItem('datasetforge_selectedTemplateId') || null;
  });
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParaphrasing, setIsParaphrasing] = useState(false);
  const [variations, setVariations] = useState([]);
  const [selectedVariations, setSelectedVariations] = useState(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshExamplesTrigger, setRefreshExamplesTrigger] = useState(0);
  const [examples, setExamples] = useState([]);
  
  // State for ParaphraseModal
  const [isParaphraseModalOpen, setIsParaphraseModalOpen] = useState(false);
  const [paraphraseSourceText, setParaphraseSourceText] = useState('');
  const [paraphraseSourceId, setParaphraseSourceId] = useState(null);
  
  // State for RegenerateModal
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [regenerateSourceText, setRegenerateSourceText] = useState('');
  const [regenerateSourceId, setRegenerateSourceId] = useState(null);
  
  // Workflow related state
  // Initialize workflowEnabled from localStorage
  const [workflowEnabled, setWorkflowEnabled] = useState(() => {
    const savedValue = localStorage.getItem(STORAGE_KEY_WORKFLOW_ENABLED);
    return savedValue === 'true';
  });
  
  const [currentWorkflow, setCurrentWorkflow] = useState(null);
  const [isExecutingWorkflow, setIsExecutingWorkflow] = useState(false);
  const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false); 
  const [workflowSaveRequest, setWorkflowSaveRequest] = useState(null);
  const [workflowsList, setWorkflowsList] = useState([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  
  // Initialize selectedWorkflowId from localStorage
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(() => {
    const savedId = localStorage.getItem(STORAGE_KEY_SELECTED_WORKFLOW);
    return savedId ? parseInt(savedId, 10) : null;
  });
  
  // Add this state to track animations in progress
  const [animationsInProgress, setAnimationsInProgress] = useState(new Set());
  
  const variationsRef = useRef(variations);
  const abortControllerRef = useRef(null);
  // Add this reference at the top of your component
  const workflowManagerRef = useRef(null);

  // Add reference collections for variation refs and animation queue
  const variationRefsMap = useRef(new Map());
  const emptyVariationsToAnimate = useRef([]);

  // Register variation refs
  const registerVariationRef = useCallback((id, ref) => {
    if (ref && id) {
      console.log(`Registered variation ref for ${id}`);
      variationRefsMap.current.set(id, ref);
    }
  }, []);

  // Calculate counts for the dynamic save button
  const selectedCount = selectedVariations?.size || 0;
  const validVariationsCount = (variations || []).filter(v => !v.isGenerating && !v.error).length;
  const totalVariationsCount = variations?.length || 0;

  useEffect(() => {
    variationsRef.current = variations;
  }, [variations]);

  useEffect(() => {
    let isMounted = true;

    const fetchTemplates = async () => {
      if (isMounted) setIsLoading(true);
      try {
        const fetchedTemplates = await api.getTemplates();
        if (isMounted) {
          const activeTemplates = fetchedTemplates.filter(t => !t.archived);
          setTemplates(activeTemplates);

          // Validate and set the selected template based on localStorage or default
          const currentSelectedId = localStorage.getItem('datasetforge_selectedTemplateId');
          let templateToSelect = null;
          if (currentSelectedId) {
            templateToSelect = activeTemplates.find(t => t.id.toString() === currentSelectedId);
          }
          
          // If saved ID is invalid or not found, maybe select the first one?
          // Or just leave it null if no valid saved ID.
          if (!templateToSelect && activeTemplates.length > 0) {
            // Optionally select the first template as a default if no valid saved one
            // templateToSelect = activeTemplates[0]; 
            // For now, let's clear invalid selection
            localStorage.removeItem('datasetforge_selectedTemplateId');
            setSelectedTemplateId(null);
          }

          if (templateToSelect) {
            setSelectedTemplateId(templateToSelect.id);
            setSelectedTemplate(templateToSelect);
          } else {
            // If no template could be selected (empty list or invalid saved ID)
            setSelectedTemplateId(null);
            setSelectedTemplate(null);
            setVariations([]);
            setSelectedVariations(new Set());
          }
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        if (isMounted) {
          toast.error('Failed to load templates.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    if (location.pathname === '/generate') {
      fetchTemplates();
    } else {
      if (isMounted) setIsLoading(false);
    }

    return () => {
      isMounted = false;
    };
  // Remove selectedTemplateId from dependency array to avoid loop
  }, [location.pathname]); 

  // Save selectedTemplateId to localStorage when it changes
  useEffect(() => {
    if (selectedTemplateId) {
      localStorage.setItem('datasetforge_selectedTemplateId', selectedTemplateId.toString());
    } else {
      localStorage.removeItem('datasetforge_selectedTemplateId');
    }
  }, [selectedTemplateId]);

  // Save workflowEnabled to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WORKFLOW_ENABLED, workflowEnabled.toString());
  }, [workflowEnabled]);

  // Save selectedWorkflowId to localStorage when it changes
  useEffect(() => {
    if (selectedWorkflowId) {
      localStorage.setItem(STORAGE_KEY_SELECTED_WORKFLOW, selectedWorkflowId.toString());
    } else {
      localStorage.removeItem(STORAGE_KEY_SELECTED_WORKFLOW);
    }
  }, [selectedWorkflowId]);

  // Fetch workflows from API when workflow mode is enabled
  useEffect(() => {
    if (workflowEnabled) {
      fetchWorkflows();
    }
  }, [workflowEnabled]);
  
  // Function to fetch workflows from API
  const fetchWorkflows = async () => {
    if (!workflowEnabled) return;
    
    setIsLoadingWorkflows(true);
    try {
      const result = await api.getWorkflows(1, 50); // Get first page with up to 50 workflows
      setWorkflowsList(result.items);
      
      // If there's a selected workflow ID but no current workflow data,
      // or if there's no selected ID but we have workflows, select the first one
      if (selectedWorkflowId && !currentWorkflow) {
        // Find and load the selected workflow
        const selectedWorkflow = result.items.find(w => w.id === selectedWorkflowId);
        if (selectedWorkflow) {
          loadWorkflow(selectedWorkflow.id);
        }
      } else if (!selectedWorkflowId && result.items.length > 0) {
        // Auto-select the first workflow if none is selected
        setSelectedWorkflowId(result.items[0].id);
        loadWorkflow(result.items[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
      toast.error('Failed to load workflows');
    } finally {
      setIsLoadingWorkflows(false);
    }
  };
  
  // Function to load a single workflow by ID
  const loadWorkflow = async (id) => {
    if (!id) return;
    
    setIsLoadingWorkflows(true);
    try {
      const workflow = await api.getWorkflowById(id);
      setCurrentWorkflow(workflow);
      setSelectedWorkflowId(workflow.id);
      console.log(`Loaded workflow: ${workflow.name} (ID: ${workflow.id})`);
    } catch (error) {
      console.error(`Failed to load workflow ${id}:`, error);
      toast.error('Failed to load selected workflow');
    } finally {
      setIsLoadingWorkflows(false);
    }
  };
  
  // When workflow mode is toggled, trigger workflows fetch if enabled
  useEffect(() => {
    // If workflow mode was just enabled, fetch workflows
    if (workflowEnabled) {
      fetchWorkflows();
    }
  }, [workflowEnabled]);

  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    setSelectedTemplate(template);
    // Variations are no longer cleared when the template changes.
    // setVariations([]);
    // setSelectedVariations(new Set());
  };

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      toast.info("Generation cancelled.");
      setVariations(prev => prev.map(v => v.isGenerating ? { ...v, isGenerating: false, error: 'Cancelled by user' } : v));
      setIsGenerating(false);
      setIsExecutingWorkflow(false); // Add this line to reset workflow execution state
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
              // Check if the result is empty
              const isEmpty = (!result.output || result.output.trim() === '') && (!result.tool_calls || result.tool_calls.length === 0);
              
              if (isEmpty) {
                // Create a ref map if it doesn't exist
                if (!variationRefsMap.current) {
                  variationRefsMap.current = new Map();
                }
                
                const variationId = updated[targetIndex].id;
                
                // Check if this variation is already queued for animation
                const isAlreadyQueued = emptyVariationsToAnimate.current.some(item => item.id === variationId);
                
                if (!isAlreadyQueued) {
                  // Store the to-be-removed variation for animation
                  console.log(`Queueing removal animation for empty variation: ${variationId}`); 
                  emptyVariationsToAnimate.current.push({
                    index: targetIndex,
                    id: variationId,
                    reason: "Empty generation removed"
                  });
                } else {
                  console.log(`Variation ${variationId} already queued for animation, skipping duplicate`);
                }
                
                // Keep it in the array but mark for removal
                // It will be animated out in the useEffect below
                updated[targetIndex] = {
                  ...updated[targetIndex],
                  ...result,
                  _pendingRemoval: true,
                  _animateOut: true, // Add a flag to show we want to animate this out
                  isGenerating: false,
                  template_id: result.template_id || currentTemplateId
                };
              } else {
                // Update the variation as usual
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
              }
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
      // Add a final cleanup step to remove any remaining placeholders that didn't receive results
      // This might happen if the stream ends prematurely or an error occurs before all results arrive
      setVariations(prev => prev.filter(v => !(v.isGenerating && v.id.startsWith('temp-'))));
    }
  }, [selectedDataset, selectedTemplate, workflowEnabled, currentWorkflow]);
  
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
      return;
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
          return;
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
                  // Access nodes through the data property of currentWorkflow
                  const node = currentWorkflow?.data?.nodes?.[nodeId];
                  const nodeName = node?.name || nodeId; // Get name or fallback to ID
                  console.log(`[Workflow Init] Node ID: ${nodeId}, Node Data:`, node, `Derived Name: ${nodeName}`); // Added logging
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
                console.log("Workflow execution complete, processing results");
                
                // First, check if we have output_node_results property (new API format)
                const outputNodeResults = progressData.result?.output_node_results || {};
                const outputNodes = Object.keys(outputNodeResults);
                
                if (outputNodes.length > 0) {
                  console.log(`Found ${outputNodes.length} output nodes in result`);
                  
                  if (outputNodes.length <= 1) {
                    // Single output node - update the original variation
                    const nodeId = outputNodes[0];
                    const nodeResult = outputNodeResults[nodeId];
                    
                    setVariations(prevVariations => {
                      const updated = [...prevVariations];
                      const targetIndex = updated.findIndex(v => v.id === origVariationId);
                      
                      if (targetIndex !== -1) {
                        const baseVariation = updated[targetIndex];
                        
                        // Get output content and tool calls from the node result
                        const outputContent = nodeResult.output || "";
                        // Assuming tool calls might be part of the node result, adjust if needed
                        const toolCalls = nodeResult.tool_calls || baseVariation.tool_calls || null; 
                        const isEmpty = (!outputContent || outputContent.trim() === '') && (!toolCalls || toolCalls.length === 0);

                        if (isEmpty) {
                          // Check if this variation is already queued for animation
                          const isAlreadyQueued = emptyVariationsToAnimate.current.some(item => item.id === origVariationId);
                          
                          if (!isAlreadyQueued) {
                            // Instead of immediate removal, queue for animation
                            console.log(`Queueing removal animation for empty workflow variation: ${origVariationId}`);
                            emptyVariationsToAnimate.current.push({
                              index: targetIndex,
                              id: origVariationId,
                              reason: "Empty workflow result removed"
                            });
                          } else {
                            console.log(`Variation ${origVariationId} already queued for animation, skipping duplicate`);
                          }
                          
                          // Mark for removal but keep in array for animation
                          updated[targetIndex] = {
                            ...baseVariation,
                            ...nodeResult,
                            _pendingRemoval: true,
                            _animateOut: true,
                            isGenerating: false,
                            error: null,
                            template_id: data.template_id,
                            _source: 'workflow_output'
                          };
                        } else {
                          // Update the variation with the workflow result as before
                          updated[targetIndex] = {
                            ...baseVariation,
                            output: outputContent,
                            tool_calls: toolCalls, // Update tool calls
                            variation: `${baseVariation.variation.split(' (')[0]} (${nodeResult.name || nodeId})`,
                            isGenerating: false,
                            error: null,
                            template_id: data.template_id,
                            _source: 'workflow_output',
                            _output_node_id: nodeId,
                            _output_node_name: nodeResult.name || nodeId,
                            workflow_results: progressData.result,
                            workflow_progress: {
                              ...baseVariation.workflow_progress,
                              completed_at: new Date().toISOString(),
                              status: 'complete'
                            }
                          };
                        }
                      }
                      return updated;
                    });
                  } else {
                    // Multiple output nodes - create multiple variation cards
                    setVariations(prevVariations => {
                      let updated = [...prevVariations];
                      const targetIndex = updated.findIndex(v => v.id === origVariationId);
                      
                      if (targetIndex !== -1) {
                        const baseVariation = updated[targetIndex];
                        const newVariations = [];
                        let originalUpdated = false; // Track if original variation was updated or removed
                        
                        // Process each output node
                        outputNodes.forEach((nodeId, index) => {
                          const nodeResult = outputNodeResults[nodeId];
                          const outputContent = nodeResult.output || '';
                          // Assuming tool calls might be part of the node result
                          const toolCalls = nodeResult.tool_calls || baseVariation.tool_calls || null; 
                          const isEmpty = (!outputContent || outputContent.trim() === '') && (!toolCalls || toolCalls.length === 0);

                          if (index === 0) {
                            if (isEmpty) {
                              // Check if this variation is already queued for animation
                              const isAlreadyQueued = emptyVariationsToAnimate.current.some(item => item.id === origVariationId);
                              
                              if (!isAlreadyQueued) {
                                // Queue for animation instead of immediate removal
                                console.log(`Queueing removal animation for empty workflow variation (multi-output): ${origVariationId}`);
                                emptyVariationsToAnimate.current.push({
                                  index: targetIndex,
                                  id: origVariationId,
                                  reason: "Empty workflow result removed"
                                });
                              } else {
                                console.log(`Variation ${origVariationId} already queued for animation, skipping duplicate`);
                              }
                              
                              // Mark for animation but keep in array
                              updated[targetIndex] = {
                                ...baseVariation,
                                ...nodeResult,
                                _pendingRemoval: true,
                                _animateOut: true,
                                isGenerating: false,
                                error: null,
                                template_id: data.template_id,
                                _source: 'workflow_output'
                              };
                              originalUpdated = true; // Mark as updated
                            } else {
                              // Update the original variation with the first output
                              updated[targetIndex] = {
                                ...baseVariation,
                                output: outputContent,
                                tool_calls: toolCalls,
                                variation: `${baseVariation.variation.split(' (')[0]} (${nodeResult.name || nodeId})`,
                                isGenerating: false,
                                error: null,
                                template_id: data.template_id,
                                _source: 'workflow_output',
                                _output_node_id: nodeId,
                                _output_node_name: nodeResult.name || nodeId,
                                workflow_results: progressData.result,
                                workflow_progress: { // Copy progress but mark complete
                                  ...(baseVariation.workflow_progress || {}),
                                  completed_at: new Date().toISOString(),
                                  status: 'complete'
                                }
                              };
                              originalUpdated = true; // Mark as updated
                            }
                          } else {
                            // Create new variations for additional outputs only if not empty
                            if (!isEmpty) {
                              const newVariationId = `${origVariationId}-output-${nodeId}-${Date.now()}`;
                              newVariations.push({
                                ...baseVariation, // Copy base properties
                                id: newVariationId,
                                output: outputContent,
                                tool_calls: toolCalls,
                                variation: `${baseVariation.variation.split(' (')[0]} (${nodeResult.name || nodeId})`,
                                isGenerating: false,
                                error: null,
                                template_id: data.template_id,
                                _source: 'workflow_output',
                                _output_node_id: nodeId,
                                _output_node_name: nodeResult.name || nodeId,
                                workflow_results: progressData.result,
                                workflow_progress: { // Copy progress but mark complete
                                  ...(baseVariation.workflow_progress || {}),
                                  completed_at: new Date().toISOString(),
                                  status: 'complete'
                                }
                              });
                            } else {
                               console.log(`Skipping empty workflow variation (multi-output, additional): Node ${nodeId}`);
                            }
                          }
                        });
                        
                        // Add all new non-empty variations to the array
                        // If the original was removed, updated already reflects that
                        // If the original was updated, updated contains the modified original
                        return [...updated, ...newVariations];
                      }
                      return updated; // Return unchanged if targetIndex was -1
                    });
                  }
                } else {
                  // Fallback to processing all results if no output_node_results
                  console.log("No output_node_results found, using fallback processing");
                  
                  // Get the final output and potential tool calls from the result if available
                  const finalOutput = progressData.result?.final_output?.output || "";
                  const finalToolCalls = progressData.result?.final_output?.tool_calls || null;
                  const isEmpty = (!finalOutput || finalOutput.trim() === '') && (!finalToolCalls || finalToolCalls.length === 0);

                  setVariations(prevVariations => {
                    const updated = [...prevVariations];
                    const targetIndex = updated.findIndex(v => v.id === origVariationId);
                    
                    if (targetIndex !== -1) {
                      const baseVariation = updated[targetIndex];
                      
                      if (isEmpty) {
                        // Check if this variation is already queued for animation
                        const isAlreadyQueued = emptyVariationsToAnimate.current.some(item => item.id === origVariationId);
                        
                        if (!isAlreadyQueued) {
                          // Queue for animation instead of immediate removal
                          console.log(`Queueing removal animation for empty workflow variation (fallback): ${origVariationId}`);
                          emptyVariationsToAnimate.current.push({
                            index: targetIndex,
                            id: origVariationId,
                            reason: "Empty workflow result removed"
                          });
                        } else {
                          console.log(`Variation ${origVariationId} already queued for animation, skipping duplicate`);
                        }
                        
                        // Mark for animation but keep in array
                        updated[targetIndex] = {
                          ...baseVariation,
                          _pendingRemoval: true, 
                          _animateOut: true,
                          isGenerating: false,
                          output: finalOutput,
                          tool_calls: finalToolCalls,
                          template_id: data.template_id,
                          _source: 'workflow_output'
                        };
                      } else {
                        // Update the variation with the workflow result
                        updated[targetIndex] = {
                          ...baseVariation,
                          output: finalOutput,
                          tool_calls: finalToolCalls, // Update tool calls
                          isGenerating: false,
                          error: null,
                          template_id: data.template_id,
                          _source: 'workflow_output',
                          workflow_results: progressData.result,
                          workflow_progress: {
                            ...baseVariation.workflow_progress,
                            completed_at: new Date().toISOString(),
                            status: 'complete'
                          }
                        };
                      }
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
            return;
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
    
    setIsExecutingWorkflow(false);
  };

  const handleSelect = (id) => {
    const variationIndex = variationsRef.current.findIndex(v => v.id === id);
    if (variationIndex === -1) {
      console.error('Cannot select: variation not found with id', id);
      return;
    }
    const variation = variationsRef.current[variationIndex];

    // Cannot select items with errors or while generating
    if (variation.error || variation.isGenerating) {
      toast.warning("Cannot select an item with an error or while it's generating.");
      return;
    }

    setSelectedVariations(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return newSelected;
    });
  };

  const handleEdit = (id, newOutput) => {
    setVariations(prevVariations => {
      const updatedVariations = [...prevVariations];
      const index = updatedVariations.findIndex(v => v.id === id);
      if (index !== -1) {
        updatedVariations[index] = { ...updatedVariations[index], output: newOutput };
        // Deselect item if it was selected, as it has been modified
        if (selectedVariations.has(id)) {
          setSelectedVariations(prevSelected => {
            const newSelected = new Set(prevSelected);
            newSelected.delete(id);
            return newSelected;
          });
          toast.info("Deselected item due to edit.");
        }
      } else {
        console.error('Cannot edit: variation not found with id', id);
      }
      return updatedVariations;
    });
  };
  
  // Add multiple new variations (used for multi-select paraphrasing)
  const handleAddVariations = (id, newOutputs) => {
    if (!newOutputs || newOutputs.length === 0) return;
    
    setVariations(prevVariations => {
      // Find the source variation to copy properties from
      const sourceIndex = prevVariations.findIndex(v => v.id === id);
      if (sourceIndex === -1) {
        console.error('Cannot add variations: source variation not found with id', id);
        return prevVariations;
      }
      
      const sourceVariation = prevVariations[sourceIndex];
      
      // Create new variations based on the source, but with different outputs
      const newVariations = newOutputs.map((output, index) => {
        return {
          ...sourceVariation,
          id: Date.now() + index, // Generate unique IDs
          output: output,
          variation: `${sourceVariation.variation} (Paraphrase ${index + 1})`,
          _source: 'paraphrase' // Track the source of this variation
        };
      });
      
      // Add the new variations to the list
      return [...prevVariations, ...newVariations];
    });
    
    toast.success(`Added ${newOutputs.length} new variation${newOutputs.length > 1 ? 's' : ''} from paraphrases.`);
  };

  const handleRegenerate = useCallback(async (id, instruction = '') => {
    if (!selectedTemplate || isGenerating || isParaphrasing) return;

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
                  // Access nodes through the data property of currentWorkflow
                  const node = currentWorkflow?.data?.nodes?.[nodeId];
                  const nodeName = node?.name || nodeId; // Get name or fallback to ID
                  console.log(`[Workflow Init] Node ID: ${nodeId}, Node Data:`, node, `Derived Name: ${nodeName}`); // Added logging
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
              }
              else if (progressData.type === 'progress') {
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
                        if (selectedVariations.has(id)) {
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
              // Check if the regeneration result is empty
              const isEmpty = (!result.output || result.output.trim() === '') && (!result.tool_calls || result.tool_calls.length === 0);

              if (isEmpty) {
                // Check if this variation is already queued for animation
                const isAlreadyQueued = emptyVariationsToAnimate.current.some(item => item.id === id);
                
                if (!isAlreadyQueued) {
                  // Queue for animation instead of immediate removal
                  console.log(`Queueing removal animation for empty regenerated variation (standard): ${id}`);
                  emptyVariationsToAnimate.current.push({
                    index: targetIndex,
                    id: id,
                    reason: "Empty regeneration removed"
                  });
                } else {
                  console.log(`Variation ${id} already queued for animation, skipping duplicate`);
                }
                
                // Mark for animation but keep in array
                updated[targetIndex] = {
                  ...updated[targetIndex],
                  _pendingRemoval: true, 
                  _animateOut: true,
                  isGenerating: false,
                  output: result.output,
                  tool_calls: result.tool_calls,
                  template_id: result.template_id,
                  _source: 'standard_regen_empty'
                };
                
                // Also remove from selection if it was selected
                setSelectedVariations(prevSelected => {
                  const newSelected = new Set(prevSelected);
                  newSelected.delete(id);
                  return newSelected;
                });
                toast.info("Removed empty variation after regeneration.");
              } else {
                // Update the variation as usual
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
                if (selectedVariations.has(id)) {
                  setSelectedVariations(prevSelected => {
                    const newSelected = new Set(prevSelected);
                    newSelected.delete(id);
                    return newSelected;
                  });
                  toast.info("Deselected item due to regeneration.");
                }
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
  }, [selectedTemplate, isGenerating, isParaphrasing, selectedVariations, workflowEnabled, currentWorkflow]);

  // Helper function to handle workflow completion for regeneration
  const handleRegenerateWorkflowComplete = (id, progressData, instruction) => {
    setVariations(prevVariations => {
      const updated = [...prevVariations];
      const targetIndex = updated.findIndex(v => v.id === id);
      
      if (targetIndex !== -1) {
        // Extract the final output and tool calls from workflow result
        let workflowOutput = "";
        let workflowToolCalls = updated[targetIndex].tool_calls || null; // Keep original tool calls unless overwritten
        
        // Handle multiple output nodes if present
        const outputNodeResults = progressData.result?.output_node_results || {};
        const outputNodes = Object.keys(outputNodeResults);
        
        if (outputNodes.length > 0) {
          // ... (logic to find the correct node output) ...
          const existingOutputNodeId = updated[targetIndex]._output_node_id;
          let nodeOutputData = null;

          if (existingOutputNodeId && outputNodeResults[existingOutputNodeId]) {
            nodeOutputData = outputNodeResults[existingOutputNodeId];
          } else if (outputNodes.length > 0) {
            // Fallback to first node if specific node not found or not applicable
            const firstNodeId = outputNodes[0];
            nodeOutputData = outputNodeResults[firstNodeId];
            // Update node ID and name if falling back
            updated[targetIndex]._output_node_id = firstNodeId;
            updated[targetIndex]._output_node_name = nodeOutputData.name || firstNodeId;
            if (nodeOutputData.name) {
              const baseName = updated[targetIndex].variation.split(' (')[0];
              updated[targetIndex].variation = `${baseName} (${nodeOutputData.name})`;
            }
          }
          
          if (nodeOutputData) {
            workflowOutput = nodeOutputData.output || "";
            // Check if the node result contains tool calls
            if (nodeOutputData.tool_calls !== undefined) {
              workflowToolCalls = nodeOutputData.tool_calls;
            }
          }
          
        } else {
          // Try to get output and tool calls from different places in the fallback
          if (progressData.result?.final_output) {
             workflowOutput = progressData.result.final_output.output || "";
             if (progressData.result.final_output.tool_calls !== undefined) {
               workflowToolCalls = progressData.result.final_output.tool_calls;
             }
          } else if (progressData.result?.results) {
            // Look for the last result with an output or tool_calls
            const results = progressData.result.results;
            for (let i = results.length - 1; i >= 0; i--) {
              if (results[i].output?.output) {
                workflowOutput = results[i].output.output;
              }
              if (results[i].output?.tool_calls !== undefined) {
                 workflowToolCalls = results[i].output.tool_calls;
              }
              // Stop if we found both or reached the beginning
              if (workflowOutput || workflowToolCalls !== null) break; 
            }
          }
        }
        
        // Final fallback for output
        if (!workflowOutput && !workflowToolCalls) {
          workflowOutput = "No output from workflow";
        }

        // Check if the final result is empty
        const isEmpty = (!workflowOutput || workflowOutput.trim() === '') && (!workflowToolCalls || workflowToolCalls.length === 0);

        if (isEmpty) {
          // Check if this variation is already queued for animation
          const isAlreadyQueued = emptyVariationsToAnimate.current.some(item => item.id === id);
          
          if (!isAlreadyQueued) {
            // Queue for animation instead of immediate removal
            console.log(`Queueing removal animation for empty regenerated variation (workflow): ${id}`);
            emptyVariationsToAnimate.current.push({
              index: targetIndex,
              id: id,
              reason: "Empty workflow regeneration removed"
            });
          } else {
            console.log(`Variation ${id} already queued for animation, skipping duplicate`);
          }
          
          // Mark for animation but keep in array
          updated[targetIndex] = {
            ...updated[targetIndex],
            _pendingRemoval: true, 
            _animateOut: true,
            isGenerating: false,
            output: workflowOutput,
            tool_calls: workflowToolCalls, // Update tool calls
            processed_prompt: instruction || "",
            template_id: selectedTemplate.id, // Ensure template_id is present
            _source: 'workflow_regen',
            workflow_results: progressData.result,
            workflow_progress: {
              ...updated[targetIndex].workflow_progress,
              completed_at: new Date().toISOString(),
              status: 'complete'
            }
          };
          
          // Also remove from selection if it was selected
          setSelectedVariations(prevSelected => {
            const newSelected = new Set(prevSelected);
            newSelected.delete(id);
            return newSelected;
          });
          toast.info("Removed empty variation after workflow regeneration.");
        } else {
          // Update the variation
          updated[targetIndex] = {
            ...updated[targetIndex],
            output: workflowOutput,
            tool_calls: workflowToolCalls, // Update tool calls
            processed_prompt: instruction || "",
            isGenerating: false,
            error: null,
            template_id: selectedTemplate.id, // Ensure template_id is present
            _source: 'workflow_regen',
            workflow_results: progressData.result,
            workflow_progress: {
              ...updated[targetIndex].workflow_progress,
              completed_at: new Date().toISOString(),
              status: 'complete'
            }
          };
          
          // Deselect item if it was selected, as it has been regenerated
          if (selectedVariations.has(id)) {
            setSelectedVariations(prevSelected => {
              const newSelected = new Set(prevSelected);
              newSelected.delete(id);
              return newSelected;
            });
            toast.info("Deselected item due to regeneration.");
          }
        }
      }
      return updated;
    });
  };

  const handleSaveSelectedToDataset = async () => {
    if (!selectedDataset) {
      toast.warning('Please select a dataset first');
      return;
    }

    if (selectedVariations.size === 0) {
      toast.warning('Please select at least one variation to save');
      return;
    }

    console.log("Selected Variations: ", selectedVariations);
    console.log("Current Variations Reference: ", variationsRef.current);
    
    // Get variations to save - log the results to see if they're correctly found
    const variationsToSave = Array.from(selectedVariations)
      .map(id => {
        const variation = variationsRef.current.find(v => v.id === id);
        if (!variation) {
          console.error(`Couldn't find variation with ID: ${id}`);
        }
        return variation;
      })
      .filter(v => v);
    
    console.log("Variations to save found: ", variationsToSave.length);
    
    const examplesToSave = variationsToSave.map(variation => {
      let slotData = variation.slots || {};
      console.log("Processing variation: ", variation.id, variation.variation);
      
      // Ensure template_id exists, fall back to current template if missing
      const templateId = variation.template_id || selectedTemplate?.id;
      
      if (!templateId) {
        console.error(`Missing template_id for variation ${variation.id}. Cannot save.`, variation);
        toast.error(`Error saving variation ${variation.variation}: No template associated.`);
        return null; // Skip this variation
      }
      
      // Find the original template used for this variation
      const originalTemplate = templates.find(t => t.id === templateId);
      
      console.log("Template ID: ", templateId, "Template Found: ", !!originalTemplate);

      if (!originalTemplate) {
        console.error(`Could not find template with ID ${templateId} for variation ${variation.id}. Skipping save.`, {
          templateId,
          variationId: variation.id,
          availableTemplates: templates.map(t => ({ id: t.id, name: t.name }))
        });
        toast.error(`Error saving variation ${variation.variation}: Original template not found.`);
        return null; // Skip this variation
      }

      return {
        system_prompt: originalTemplate.system_prompt || "", // Use original template's prompt
        user_prompt: variation.processed_prompt || "",
        system_prompt_mask: originalTemplate.system_prompt_mask || null, // Use original template's mask
        user_prompt_mask: originalTemplate.user_prompt_mask || null, // Use original template's mask
        slots: slotData,
        output: variation.output,
        tool_calls: variation.tool_calls || null
      };
    }).filter(example => example !== null); // Filter out skipped variations
    
    console.log("Examples to save after processing: ", examplesToSave.length);

    if (examplesToSave.length === 0) {
      toast.warning('No valid variations could be prepared for saving.');
      return;
    }

    try {
      await api.saveExamples(selectedDataset.id, examplesToSave);
      toast.success(`${examplesToSave.length} example(s) saved to ${selectedDataset.name}`);

      const savedIds = new Set(variationsToSave.map(v => v.id)); // Use the IDs from the successfully prepared variations
      setVariations(prevVariations =>
        prevVariations.filter(v => !savedIds.has(v.id))
      );
      setSelectedVariations(new Set()); // Clear selection after saving
      setRefreshExamplesTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save examples:', error);
      toast.error(`Failed to save examples: ${error.response?.data?.detail || error.message}`);
    }
  };

  // New function to save all valid variations
  const handleSaveAllValidToDataset = async () => {
    if (!selectedDataset) {
      toast.warning('Please select a dataset first');
      return;
    }

    const validVariations = variationsRef.current.filter(v => !v.isGenerating && !v.error);

    if (validVariations.length === 0) {
      toast.warning('No valid variations to save.');
      return;
    }

    const examplesToSave = validVariations.map(variation => {
      let slotData = variation.slots || {};
      
      // Ensure template_id exists, fall back to current template if missing
      const templateId = variation.template_id || selectedTemplate?.id;
      
      if (!templateId) {
        console.error(`Missing template_id for variation ${variation.id}. Cannot save.`);
        toast.error(`Error saving variation ${variation.variation}: No template associated.`);
        return null; // Skip this variation
      }
      
      // Find the original template used for this variation
      const originalTemplate = templates.find(t => t.id === templateId);

      if (!originalTemplate) {
        console.error(`Could not find template with ID ${templateId} for variation ${variation.id}. Skipping save.`);
        toast.error(`Error saving variation ${variation.variation}: Original template not found.`);
        return null; // Skip this variation
      }

      return {
        system_prompt: originalTemplate.system_prompt || "", // Use original template's prompt
        user_prompt: variation.processed_prompt || "",
        system_prompt_mask: originalTemplate.system_prompt_mask || null, // Use original template's mask
        user_prompt_mask: originalTemplate.user_prompt_mask || null, // Use original template's mask
        slots: slotData,
        output: variation.output,
        tool_calls: variation.tool_calls || null
      };
    }).filter(example => example !== null); // Filter out skipped variations

    if (examplesToSave.length === 0) {
      toast.warning('No valid variations could be prepared for saving.');
      return;
    }

    try {
      await api.saveExamples(selectedDataset.id, examplesToSave);
      toast.success(`${examplesToSave.length} valid example(s) saved to ${selectedDataset.name}`);

      const savedIds = new Set(validVariations.map(v => v.id)); // Use the IDs from the successfully prepared variations
      setVariations(prevVariations =>
        prevVariations.filter(v => !savedIds.has(v.id))
      );
      // Clear selected variations as well, since the items are removed
      setSelectedVariations(new Set()); 
      setRefreshExamplesTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save all valid examples:', error);
      toast.error(`Failed to save examples: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleDismiss = (id) => {
    setVariations(prevVariations => prevVariations.filter(v => v.id !== id));
    // Also remove from selection if it was selected
    setSelectedVariations(prevSelected => {
      const newSelected = new Set(prevSelected);
      newSelected.delete(id);
      return newSelected;
    });
  };

  // Function to handle updates to tool calls from VariationCard
  const handleToolCallsChange = (variationId, newToolCalls) => {
    setVariations(prevVariations => {
      const updatedVariations = [...prevVariations];
      const index = updatedVariations.findIndex(v => v.id === variationId);
      if (index !== -1) {
        updatedVariations[index] = { 
          ...updatedVariations[index], 
          tool_calls: newToolCalls 
        };
        // If the item was selected, deselect it because it has been modified
        if (selectedVariations.has(variationId)) {
          setSelectedVariations(prevSelected => {
            const newSelected = new Set(prevSelected);
            newSelected.delete(variationId);
            return newSelected;
          });
          toast.info("Deselected item due to tool call edit.");
        }
      } else {
        console.error('Cannot update tool calls: variation not found with id', variationId);
      }
      return updatedVariations;
    });
  };

  // Handler for the Clear button
  const handleClear = () => {
    if (selectedCount > 0) {
      // Clear selection
      setSelectedVariations(new Set());
      toast.info('Selection cleared.');
    } else if (totalVariationsCount > 0) {
      // Clear all variations
      setVariations([]);
      setSelectedVariations(new Set()); // Ensure selection is also cleared
      toast.info('All variations cleared.');
    }
  };
  
  // Handler to open the paraphrase modal
  const handleOpenParaphraseModal = useCallback((variationId, text) => {
    const variationIndex = variationsRef.current.findIndex(v => v.id === variationId);
    if (variationIndex === -1) {
      console.error('Cannot paraphrase: variation not found with id', variationId);
      return;
    }
    
    setParaphraseSourceId(variationId);
    setParaphraseSourceText(text);
    setIsParaphraseModalOpen(true);
    setIsParaphrasing(true); // Set global paraphrasing flag to disable other controls
  }, []);
  
  // Handler to close the paraphrase modal
  const handleCloseParaphraseModal = useCallback(() => {
    setIsParaphraseModalOpen(false);
    setParaphraseSourceText('');
    setParaphraseSourceId(null);
    setIsParaphrasing(false); // Reset global paraphrasing flag
  }, []);
  
  // Handler to open the regenerate modal
  const handleOpenRegenerateModal = useCallback((variationId, text) => {
    const variationIndex = variationsRef.current.findIndex(v => v.id === variationId);
    if (variationIndex === -1) {
      console.error('Cannot regenerate: variation not found with id', variationId);
      return;
    }
    
    setRegenerateSourceId(variationId);
    setRegenerateSourceText(text);
    setIsRegenerateModalOpen(true);
  }, []);
  
  // Handler to close the regenerate modal
  const handleCloseRegenerateModal = useCallback(() => {
    setIsRegenerateModalOpen(false);
    setRegenerateSourceText('');
    setRegenerateSourceId(null);
  }, []);
  
  // Handler for toggling workflow mode
  const handleToggleWorkflow = () => {
    const newValue = !workflowEnabled;
    setWorkflowEnabled(newValue);
    
    // If enabling workflow mode, fetch workflows
    if (newValue) {
      fetchWorkflows();
    } else {
      // If disabling, clear workflow-related state
      setCurrentWorkflow(null);
      setSelectedWorkflowId(null);
    }
  };

  // Handler for workflow selection from dropdown
  const handleWorkflowSelection = (id) => {
    if (!id) return;
    loadWorkflow(id);
  };

  // Handler for workflow selection from modal
  const handleWorkflowSelectedFromModal = (workflow) => {
    if (!workflow) return;
    
    console.log("Workflow selected from modal:", workflow);
    
    // If selecting a new workflow template
    if (workflow.isNew) {
      console.log("Creating new workflow from template");
      // Create a new workflow via API
      api.createWorkflow(workflow)
        .then(createdWorkflow => {
          console.log("Workflow created successfully:", createdWorkflow);
          setSelectedWorkflowId(createdWorkflow.id);
          
          // Set workflow AFTER closing modal (avoids flicker)
          setIsWorkflowModalOpen(false);
          setTimeout(() => {
            setCurrentWorkflow(createdWorkflow);
            toast.success(`Created new workflow "${createdWorkflow.name}"`);
            // Refresh the workflow list
            fetchWorkflows();
          }, 50);
        })
        .catch(error => {
          console.error('Failed to create workflow:', error);
          toast.error('Failed to create new workflow');
          setIsWorkflowModalOpen(false);
        });
    } else {
      // Load existing workflow (already loaded from API)
      console.log("Selected existing workflow:", workflow.id);
      setSelectedWorkflowId(workflow.id);
      
      // Close modal first
      setIsWorkflowModalOpen(false);
      
      // Small delay to ensure modal is closed before setting workflow
      setTimeout(() => {
        setCurrentWorkflow(workflow);
      }, 50);
    }
  };

  // Handler for workflow import/export
  const handleWorkflowImport = (workflow) => {
    setCurrentWorkflow(workflow);
    toast.success(`Workflow "${workflow.name}" imported`);
  };

  const handleWorkflowExport = () => {
    toast.success('Workflow exported');
  };

  // Handler to open the workflow modal
  const handleOpenWorkflowModal = useCallback(() => {
    // Check if the button that initiated this was "Browse All" vs "Manage Workflow" or "Edit"
    const isBrowseAll = !currentWorkflow || 
                        (event && event.target && event.target.innerText === "Browse All");
    
    console.log("handleOpenWorkflowModal called with:", {
      isBrowseAll,
      hasCurrentWorkflow: !!currentWorkflow
    });
    
    if (isBrowseAll) {
      // Force null workflow to show selection modal
      console.log("Opening workflow selection modal (Browse All)");
      // First clear the current workflow to prevent the editor from showing
      setCurrentWorkflow(null);
      // Then open the modal
      setIsWorkflowModalOpen(true);
    } else {
      // Editing existing workflow - open the editor directly
      console.log("Opening workflow editor directly");
      setIsWorkflowModalOpen(true);
    }
  }, [currentWorkflow]);

  // Handler to close the workflow modal
  const handleCloseWorkflowModal = useCallback(() => {
    // Only trigger save if we're editing, not if we're just selecting from the list
    if (currentWorkflow && !isWorkflowModalOpen) {
      console.log("Generate: Requesting workflow save before closing modal");
      setWorkflowSaveRequest(Date.now()); // Use timestamp to trigger save
    } else if (currentWorkflow) {
      // If we're just selecting and not editing, don't save
      console.log("Generate: Closing workflow modal without saving");
      if (currentWorkflow) {
        const updatedWorkflow = {...currentWorkflow};
        updatedWorkflow._saveRequestId = "close_no_save";
        setCurrentWorkflow(updatedWorkflow);
      }
      setWorkflowSaveRequest("close_no_save");
    }
    
    // Set a small delay to ensure save completes before closing
    setTimeout(() => {
      setIsWorkflowModalOpen(false);
    }, 100);
  }, [currentWorkflow, isWorkflowModalOpen]);

  // Determine button text and action based on selected variations
  const saveButtonText = selectedCount > 0
    ? `Save Selected (${selectedCount})`
    : 'Select Cards to Save';

  const handleSaveClick = () => {
    if (selectedCount > 0) {
      handleSaveSelectedToDataset();
    } else {
      toast.info('Please select at least one card to save');
    }
  };

  // Determine if the save button should be enabled - only enable when cards are selected
  const isSaveButtonDisabled = selectedCount === 0 || selectedDataset?.archived || isGenerating || isParaphrasing;

  // Determine Clear button text and disabled state
  const clearButtonText = selectedCount > 0
    ? `Delete Selected (${selectedCount})`
    : `Delete All (${totalVariationsCount})`;
  const isClearButtonDisabled = totalVariationsCount === 0 || isGenerating || isParaphrasing;

  const templateOptions = templates.map(template => ({
    value: template.id,
    label: template.name
  }));

  // Global keyboard handler for saving cards with Cmd/Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Save selected cards with Cmd/Ctrl+S, but only when there are selections
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault(); // Prevent browser save dialog
        
        // Only proceed if there are selected items
        if (selectedCount > 0 && !isSaveButtonDisabled) {
          handleSaveSelectedToDataset();
        } else if (!selectedCount && !isSaveButtonDisabled) {
          toast.info('Please select at least one card to save');
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown); // Fixed the cleanup function
    };
  }, [selectedCount, isSaveButtonDisabled, handleSaveSelectedToDataset]);

  useEffect(() => {
    variationsRef.current = variations;
  }, [variations]);

  // Auto-focus the newest card when variations change
  useEffect(() => {
    if (variations.length > 0) {
      // Give time for rendering to complete, especially for workflow processing
      const timeoutDelay = 300; // Increased from 100ms to 300ms
      
      // Find the most recently added non-generating card (might not have _source if added differently)
      // Prioritize cards that just finished generating
      const justCompletedCard = variations.find(v => 
        !v.isGenerating && 
        !v.error && 
        !v._pendingRemoval && // Ensure it's not pending removal
        (v._source === 'workflow_output' || v._source === 'stream' || v._source === 'workflow_regen' || v._source === 'paraphrase')
      );

      // If no newly completed card, find the first non-generating, non-removing card
      const cardToFocus = justCompletedCard || variations.find(v => 
        !v.isGenerating && 
        !v.error && 
        !v._pendingRemoval && // Ensure it's not pending removal
        !animationsInProgress.has(v.id) // Ensure it's not currently animating out
      );
      
      // Only focus if we found a suitable card that is not being removed
      if (cardToFocus) {
        // Use setTimeout to ensure the DOM has updated
        setTimeout(() => {
          // Double-check the card still exists and isn't marked for removal in the DOM
          const cardElement = document.querySelector(`[data-variation-id="${cardToFocus.id}"]:not([data-removing="true"])`);
          if (cardElement) {
            // Scroll into view if needed before focusing
            cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            
            // Check if the element is already focused before focusing again
            if (document.activeElement !== cardElement) {
              cardElement.focus();
              console.log(`Focused variation card: ${cardToFocus.id}, variation: ${cardToFocus.variation}`);
            } else {
              console.log(`Card already focused: ${cardToFocus.id}`);
            }
          } else {
            console.log(`Could not find card element with id: ${cardToFocus.id} for focus (or it's being removed)`);
          }
        }, timeoutDelay);
      }
    }
  }, [variations, animationsInProgress]); // Rerun when variations or animations change

  // Remove variations that have completed their animations
  useEffect(() => {
    const processAnimations = async () => {
      const toAnimate = [...emptyVariationsToAnimate.current];
      if (toAnimate.length === 0) return;
      
      console.log(`Processing ${toAnimate.length} animations for empty variations`);
      
      // Clear the queue first to prevent duplicate processing
      emptyVariationsToAnimate.current = [];
      
      // Add to tracking set
      setAnimationsInProgress(prev => {
        const newSet = new Set(prev);
        toAnimate.forEach(item => newSet.add(item.id));
        return newSet;
      });
      
      // Process each empty variation that needs animation
      for (const item of toAnimate) {
        const { id, reason } = item;
        
        // Skip if we've already processed this ID (prevents duplicates)
        if (!variationRefsMap.current.has(id)) {
          console.log(`No ref found for variation ${id}, may have been removed already`);
          // Ensure it's removed from tracking if ref is gone
          setAnimationsInProgress(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
          continue;
        }
        
        const ref = variationRefsMap.current.get(id);
        
        if (ref && ref.triggerRemoveAnimation) {
          try {
            console.log(`Starting animation for empty variation: ${id}`);
            
            // Wait for animation to complete before removing from DOM
            await ref.triggerRemoveAnimation(reason);
            
            console.log(`Animation finished for empty variation: ${id}, removing from state`);
            
            // Now remove from state after animation completes
            setVariations(prev => prev.filter(v => v.id !== id));
            
            // Clean up reference
            variationRefsMap.current.delete(id);
          } catch (err) {
            console.error(`Error during removal animation for ${id}:`, err);
            // Remove directly if animation fails
            setVariations(prev => prev.filter(v => v.id !== id));
            variationRefsMap.current.delete(id);
          }
        } else {
          console.log(`No animation ref for variation ${id}, removing directly`);
          // Remove without animation if ref not available
          setVariations(prev => prev.filter(v => v.id !== id));
          variationRefsMap.current.delete(id); // Clean up ref map even if no animation
        }
        
        // Remove from tracking set
        setAnimationsInProgress(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      }
    };
    
    // Only run if there are animations to process and no animations are currently in progress
    if (emptyVariationsToAnimate.current.length > 0 && animationsInProgress.size === 0) {
      processAnimations();
    }
  }, [variations, animationsInProgress]); // Depend on variations and animationsInProgress

  return (
    <div className="space-y-8 w-full">
      {/* Paraphrase Modal - top level component */}
      <ParaphraseModal
        isOpen={isParaphraseModalOpen}
        onClose={handleCloseParaphraseModal}
        sourceText={paraphraseSourceText}
        variationId={paraphraseSourceId}
        onEdit={handleEdit}
        onAddVariations={handleAddVariations}
      />
      
      {/* RegenerateModal - top level component */}
      <RegenerateModal
        isOpen={isRegenerateModalOpen}
        onClose={handleCloseRegenerateModal}
        sourceText={regenerateSourceText}
        onRegenerate={(instruction) => {
          if (regenerateSourceId) {
            handleRegenerate(regenerateSourceId, instruction);
            handleCloseRegenerateModal();
          }
        }}
      />
      
      <div className="grid grid-cols-1 md:grid-cols-[500px_1fr] gap-6">
        <div className="space-y-4">
          <div className="pl-4 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Template
            </label>
            <CustomSelect
              options={templateOptions}
              value={selectedTemplateId || ''}
              onChange={handleTemplateChange}
              placeholder="Select a template..."
              isLoading={isLoading}
              disabled={isLoading || isGenerating || templates.length === 0 || selectedDataset?.archived} // Disable if archived
            />
            
            {/* Workflow Toggle & Manage Button */}
            <div className="mt-3 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <Icon name="workflow" className="h-4 w-4 mr-1.5 text-gray-500" />
                Workflow Mode
              </label>
              <div className="flex items-center space-x-2">
                {workflowEnabled && (
                  <button
                    onClick={handleOpenWorkflowModal}
                    className="text-sm text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
                    title="Open Workflow Editor"
                  >
                    Manage Workflow
                  </button>
                )}
                <ToggleSwitch
                  checked={workflowEnabled}
                  onChange={handleToggleWorkflow}
                  disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
                />
              </div>
            </div>
            
            {/* Workflow Mode Explanation */}
            {workflowEnabled && (
              <p className="text-xs text-gray-500 mt-1 pl-1">
                Process generated outputs through a custom workflow of models and advanced transformations.
              </p>
            )}
            
            {/* Workflow Selection UI */}
            {workflowEnabled && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">Selected Workflow:</span>
                  <button
                    onClick={() => {
                      // Clear current workflow first to force selection modal
                      setCurrentWorkflow(null); 
                      setIsWorkflowModalOpen(true);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 py-0.5 px-1.5 rounded hover:bg-blue-50 transition-colors"
                    title="Browse all workflows"
                    disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
                  >
                    Browse All
                  </button>
                </div>
                
                {currentWorkflow ? (
                  <button
                    onClick={handleOpenWorkflowModal}
                    className="flex w-full items-center p-2 border rounded bg-blue-50 border-blue-200 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
                    title="Open workflow editor"
                  >
                    <div className="flex-grow">
                      <div className="font-medium text-sm truncate" title={currentWorkflow.name}>
                        {currentWorkflow.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        Updated {new Date(currentWorkflow.updated_at).toLocaleString()} (v{currentWorkflow.version})
                      </div>
                    </div>
                    <div
                      className="ml-2 p-1.5 text-blue-600 hover:text-blue-800 rounded hover:bg-blue-100 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
                      title="Edit workflow"
                      aria-label="Edit workflow"
                    >
                      <Icon name="edit" className="w-4 h-4" />
                    </div>
                  </button>
                ) : isLoadingWorkflows ? (
                  <div className="flex items-center justify-center p-2 border rounded bg-gray-50 h-10">
                    <Icon name="spinner" className="w-4 h-4 mr-2 animate-spin text-blue-500" />
                    <span className="text-sm text-gray-600">Loading...</span>
                  </div>
                ) : workflowsList.length > 0 ? (
                  <div className="text-center p-2 border rounded bg-gray-50">
                    <button
                      onClick={handleOpenWorkflowModal}
                      className="text-sm text-blue-600 hover:text-blue-800 py-1 px-3 rounded hover:bg-blue-100"
                      disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
                    >
                      <Icon name="plus" className="w-3.5 h-3.5 mr-1 inline-block" />
                      Select Workflow
                    </button>
                  </div>
                ) : (
                  <div className="text-center p-2 border rounded bg-gray-50">
                    <button
                      onClick={handleOpenWorkflowModal}
                      className="text-sm text-blue-600 hover:text-blue-800 py-1 px-3 rounded hover:bg-blue-100"
                      disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
                    >
                      <Icon name="plus" className="w-3.5 h-3.5 mr-1 inline-block" />
                      Create New Workflow
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

          <div className="pl-4">
            <SeedForm
              template={selectedTemplate}
              selectedDataset={selectedDataset} // Pass selectedDataset
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              onCancel={handleCancelGeneration}
              isParaphrasing={isParaphrasing} // Pass paraphrasing state
              setIsParaphrasing={setIsParaphrasing} // Pass paraphrasing state setter
            />

            {/* Unified Save Button */}
          {(selectedCount > 0 || validVariationsCount > 0) && (
             <div className="mt-4">
               <button
                 onClick={handleSaveClick}
                 className={`w-full py-2 px-4 text-white rounded-md transition-colors duration-200 ${ 
                   selectedCount > 0 
                     ? 'bg-green-600 hover:bg-green-700' 
                     : 'bg-blue-600 hover:bg-blue-700'
                 } disabled:opacity-50 disabled:cursor-not-allowed`}
                 disabled={isSaveButtonDisabled}
               >
                 {saveButtonText}
               </button>
             </div>
           )}

          {/* Clear Button - Changed to text button */}
          <div className="mt-2 text-center"> {/* Center the text button */}
            <button
              onClick={handleClear}
              className={`py-1 px-2 rounded-md transition-colors duration-200 text-sm ${ 
                selectedCount > 0 
                  ? 'text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100' 
                  : 'text-red-600 hover:text-red-800 hover:bg-red-100'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              disabled={isClearButtonDisabled}
              title={selectedCount > 0 ? 'Deselect all currently selected variations' : 'Remove all variations from the list'}
            >
              {clearButtonText}
            </button>
          </div>

           </div>
         </div>

        <div className="px-4 pt-4">
          <h3 className="text-lg font-medium mb-3">Generated Variations</h3>
          
          {/* Keyboard Shortcut Cheatsheet */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
              <Icon name="keyboard" className="h-4 w-4 mr-1.5 text-gray-500" />
              Keyboard Shortcuts
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-white border border-gray-300 rounded shadow-sm mr-2 text-xs">← ↑ → ↓</kbd>
                <span>Navigate between cards</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-white border border-gray-300 rounded shadow-sm mr-2 text-xs">Space</kbd>
                <span>Select/deselect card</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-white border border-gray-300 rounded shadow-sm mr-2 text-xs">Delete/Backspace</kbd>
                <span>Remove current card</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-2 py-1 bg-white border border-gray-300 rounded shadow-sm mr-2 text-xs">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + S</kbd>
                <span>Save selected cards to dataset</span>
              </div>
            </div>
          </div>

          {(variations && variations.length === 0 && !isGenerating) ? (
            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <p className="text-gray-500">
                {selectedDataset?.archived
                  ? 'Generation is disabled for archived datasets.'
                  : 'Fill in the form and click "Generate" to create variations.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(variations || []).map((variation) => (
                <VariationCard
                  key={variation.id}
                  ref={(ref) => registerVariationRef(variation.id, ref)}
                  id={variation.id}
                  variation={variation.variation}
                  output={variation.output}
                  tool_calls={variation.tool_calls}
                  system_prompt={variation.system_prompt}
                  processed_prompt={variation.processed_prompt}
                  isSelected={selectedVariations?.has(variation.id)}
                  isGenerating={variation.isGenerating || false}
                  isParaphrasing={isParaphrasing}
                  error={variation.error || null}
                  workflow_results={variation.workflow_results}
                  workflow_progress={variation.workflow_progress}
                  onSelect={() => handleSelect(variation.id)}
                  onEdit={(output) => handleEdit(variation.id, output)}
                  onRegenerate={(instruction) => handleRegenerate(variation.id, instruction)}
                  onDismiss={() => handleDismiss(variation.id)}
                  onToolCallsChange={(newToolCalls) => handleToolCallsChange(variation.id, newToolCalls)}
                  onOpenParaphraseModal={(id, text) => handleOpenParaphraseModal(id, text)}
                  onOpenRegenerateModal={(id, text) => handleOpenRegenerateModal(id, text)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Workflow Selection Modal (only show when workflow manager isn't shown) */}
      <WorkflowSelectionModal
        isOpen={isWorkflowModalOpen && !currentWorkflow}
        onClose={handleCloseWorkflowModal}
        onSelect={handleWorkflowSelectedFromModal}
        currentWorkflowId={selectedWorkflowId}
      />
      
      {/* Workflow Manager Modal */}
      {isWorkflowModalOpen && currentWorkflow && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[600] overflow-hidden"
          onClick={handleCloseWorkflowModal} // Close on backdrop click
          role="dialog"
          aria-modal="true"
          aria-labelledby="workflow-manager-title"
        >
          <div 
            className="bg-white rounded-lg w-full max-w-[95vw] shadow-xl h-[95vh] flex flex-col animate-fadeIn"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
          >
            {/* Unified Modal Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center">
                <Icon name="workflow" className="h-5 w-5 mr-2 text-blue-600" />
                <h2 id="workflow-manager-title" className="text-xl font-semibold">
                  Workflow Manager: {currentWorkflow.name}
                </h2>
              </div>
              
              <div className="flex items-center space-x-3">
                {/* JSON/Visual Editor toggle */}
                <button
                  className={`px-3 py-1 ${workflowManagerRef.current?.showJsonEditor ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'} hover:bg-blue-700 hover:text-white rounded transition text-sm`}
                  onClick={() => {
                    if (workflowManagerRef.current) {
                      workflowManagerRef.current.toggleEditorMode();
                    }
                  }}
                  disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
                >
                  {workflowManagerRef.current?.showJsonEditor ? 'Visual Editor' : 'JSON Editor'}
                </button>
                
                {/* Close button */}
                <button
                  className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition-colors"
                  onClick={handleCloseWorkflowModal}
                  aria-label="Close workflow manager"
                  title="Close"
                >
                  <Icon name="close" className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            {/* Modal Body - WorkflowManager component */}
            <div className="flex-grow overflow-hidden"> {/* Changed to overflow-hidden and removed padding */}
              <WorkflowManager
                ref={workflowManagerRef}
                visible={isWorkflowModalOpen}
                workflow={currentWorkflow}
                setWorkflow={setCurrentWorkflow}
                onImport={handleWorkflowImport}
                onExport={handleWorkflowExport}
                disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
                saveRequest={workflowSaveRequest}
              />
            </div>
          </div>
        </div>
      )}

      {selectedDataset && (
        <div className="border-t pt-6 w-full">
          <div className="w-full"> {/* Negative margin to expand full width */}
            <ExampleTable 
              datasetId={selectedDataset.id}
              datasetName={selectedDataset.name}
              refreshTrigger={refreshExamplesTrigger}
              onVariationSaved={(variation) => {
                // Remove the saved variation from the auditioning interface
                setVariations(prevVariations => 
                  prevVariations.filter(v => v.id !== variation.id)
                );
                
                // Also remove from selection if it was selected
                setSelectedVariations(prevSelected => {
                  const newSelected = new Set(prevSelected);
                  newSelected.delete(variation.id);
                  return newSelected;
                });
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Generate;