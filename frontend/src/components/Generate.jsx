import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import SeedForm from './SeedForm';
import VariationCard from './VariationCard';
import ExampleTable from './ExampleTable';
import SettingsModal from './SettingsModal';
import ParaphraseModal from './ParaphraseModal';
import CustomSelect from './CustomSelect';
import Icon from './Icons'; // Import Icon component
import WorkflowManager from './WorkflowManager'; // Import WorkflowManager component

const Generate = ({ context }) => {
  const { selectedDataset } = context;
  const location = useLocation();

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
  
  // Workflow related state
  const [workflowEnabled, setWorkflowEnabled] = useState(false);
  const [currentWorkflow, setCurrentWorkflow] = useState(null);
  const [isExecutingWorkflow, setIsExecutingWorkflow] = useState(false);
  
  const variationsRef = useRef(variations);
  const abortControllerRef = useRef(null);

  // Calculate counts for the dynamic save button
  const selectedCount = selectedVariations.size;
  const validVariationsCount = variations.filter(v => !v.isGenerating && !v.error).length;
  const totalVariationsCount = variations.length;

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

  // Load workflow from localStorage
  useEffect(() => {
    try {
      const savedWorkflow = localStorage.getItem('datasetforge_currentWorkflow');
      if (savedWorkflow) {
        setCurrentWorkflow(JSON.parse(savedWorkflow));
      }
      
      const workflowEnabledSetting = localStorage.getItem('datasetforge_workflowEnabled');
      if (workflowEnabledSetting) {
        setWorkflowEnabled(workflowEnabledSetting === 'true');
      }
    } catch (error) {
      console.error('Failed to load workflow from localStorage:', error);
      // Clear potentially corrupted data
      localStorage.removeItem('datasetforge_currentWorkflow');
      localStorage.removeItem('datasetforge_workflowEnabled');
    }
  }, []);
  
  // Save workflow to localStorage when it changes
  useEffect(() => {
    if (currentWorkflow) {
      localStorage.setItem('datasetforge_currentWorkflow', JSON.stringify(currentWorkflow));
    } else {
      localStorage.removeItem('datasetforge_currentWorkflow');
    }
  }, [currentWorkflow]);
  
  // Save workflow enabled setting to localStorage
  useEffect(() => {
    localStorage.setItem('datasetforge_workflowEnabled', workflowEnabled.toString());
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
          
          // Find target variation
          const targetVariation = variationMap[variationKey];
          if (!targetVariation) {
            console.error(`Variation not found for seed ${seedIndex}, variation ${variationIndex}`);
            continue;
          }
          
          // Reset node status map for this variation
          nodeStatusMap[variationKey] = {};
          
          // Execute workflow with streaming for this seed/variation
          await api.executeWorkflowWithStream(
            currentWorkflow,
            seedData,
            (progressData) => {
              // Handle progress updates
              if (progressData.type === 'init') {
                // Initialize node statuses
                const nodeIds = progressData.execution_order || [];
                
                // Set all nodes to queued initially
                nodeIds.forEach(nodeId => {
                  nodeStatusMap[variationKey][nodeId] = { 
                    status: 'queued',
                    progress: 0,
                    started_at: null,
                    completed_at: null
                  };
                });
                
                // Update variation with workflow structure
                setVariations(prevVariations => {
                  const updated = [...prevVariations];
                  const targetIndex = updated.findIndex(v => v.id === targetVariation.id);
                  
                  if (targetIndex !== -1) {
                    updated[targetIndex] = {
                      ...updated[targetIndex],
                      workflow_progress: {
                        node_statuses: {...nodeStatusMap[variationKey]},
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
                  nodeStatusMap[variationKey][node_id] = {
                    ...nodeStatusMap[variationKey][node_id],
                    status: status,
                    progress: progress,
                    result: result || null,
                    started_at: status === 'running' && progress === 0 
                      ? new Date().toISOString() 
                      : nodeStatusMap[variationKey][node_id].started_at,
                    completed_at: (status === 'success' || status === 'error') && progress === 1 
                      ? new Date().toISOString() 
                      : nodeStatusMap[variationKey][node_id].completed_at
                  };
                  
                  // Update variation with progress
                  setVariations(prevVariations => {
                    const updated = [...prevVariations];
                    const targetIndex = updated.findIndex(v => v.id === targetVariation.id);
                    
                    if (targetIndex !== -1) {
                      updated[targetIndex] = {
                        ...updated[targetIndex],
                        workflow_progress: {
                          ...updated[targetIndex].workflow_progress,
                          node_statuses: {...nodeStatusMap[variationKey]}
                        }
                      };
                    }
                    return updated;
                  });
                }
              }
              else if (progressData.type === 'complete') {
                // Update variation with final results
                setVariations(prevVariations => {
                  const updated = [...prevVariations];
                  const targetIndex = updated.findIndex(v => v.id === targetVariation.id);
                  
                  if (targetIndex !== -1) {
                    // Extract the final output from workflow result
                    const workflowOutput = progressData.result?.final_output?.output || "No output from workflow";
                    
                    updated[targetIndex] = {
                      ...updated[targetIndex],
                      output: workflowOutput,
                      processed_prompt: data.instruction || "",
                      isGenerating: false,
                      error: null,
                      template_id: data.template_id,
                      _source: 'workflow',
                      workflow_results: progressData.result,
                      workflow_progress: {
                        ...updated[targetIndex].workflow_progress,
                        completed_at: new Date().toISOString(),
                        status: 'complete'
                      }
                    };
                  }
                  return updated;
                });
              }
              else if (progressData.type === 'error') {
                // Update variation with error
                setVariations(prevVariations => {
                  const updated = [...prevVariations];
                  const targetIndex = updated.findIndex(v => v.id === targetVariation.id);
                  
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
          
          // Use streaming API for progress updates
          await api.executeWorkflowWithStream(
            currentWorkflow,
            { slots: slotData },
            (progressData) => {
              // Handle progress updates
              if (progressData.type === 'init') {
                // Initialize node statuses
                const nodeIds = progressData.execution_order || [];
                
                // Set all nodes to queued initially
                nodeIds.forEach(nodeId => {
                  nodeStatusMap[nodeId] = { 
                    status: 'queued',
                    progress: 0,
                    started_at: null,
                    completed_at: null
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
                        node_statuses: {...nodeStatusMap},
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
                  nodeStatusMap[node_id] = {
                    ...nodeStatusMap[node_id],
                    status: status,
                    progress: progress,
                    result: result || null,
                    started_at: status === 'running' && progress === 0 
                      ? new Date().toISOString() 
                      : nodeStatusMap[node_id].started_at,
                    completed_at: (status === 'success' || status === 'error') && progress === 1 
                      ? new Date().toISOString() 
                      : nodeStatusMap[node_id].completed_at
                  };
                  
                  // Update variation with progress
                  setVariations(prevVariations => {
                    const updated = [...prevVariations];
                    const targetIndex = updated.findIndex(v => v.id === id);
                    
                    if (targetIndex !== -1) {
                      updated[targetIndex] = {
                        ...updated[targetIndex],
                        workflow_progress: {
                          ...updated[targetIndex].workflow_progress,
                          node_statuses: {...nodeStatusMap}
                        }
                      };
                    }
                    return updated;
                  });
                }
              }
              else if (progressData.type === 'complete') {
                // Update variation with final results
                setVariations(prevVariations => {
                  const updated = [...prevVariations];
                  const targetIndex = updated.findIndex(v => v.id === id);
                  
                  if (targetIndex !== -1) {
                    // Extract the final output from workflow result
                    const workflowOutput = progressData.result?.final_output?.output || "No output from workflow";
                    
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
              if (selectedVariations.has(id)) {
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
  }, [selectedTemplate, isGenerating, isParaphrasing, selectedVariations, workflowEnabled, currentWorkflow]);

  const handleSaveSelectedToDataset = async () => {
    if (!selectedDataset) {
      toast.warning('Please select a dataset first');
      return;
    }

    if (selectedVariations.size === 0) {
      toast.warning('Please select at least one variation to save');
      return;
    }

    const variationsToSave = Array.from(selectedVariations)
      .map(id => variationsRef.current.find(v => v.id === id))
      .filter(v => v); // Filter out any potential undefined if ID mismatch

    const examplesToSave = variationsToSave.map(variation => {
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
  
  // Handler for toggling workflow mode
  const handleToggleWorkflow = () => {
    setWorkflowEnabled(!workflowEnabled);
  };

  // Handler for workflow import/export
  const handleWorkflowImport = (workflow) => {
    setCurrentWorkflow(workflow);
    toast.success(`Workflow "${workflow.name}" imported`);
  };

  const handleWorkflowExport = () => {
    toast.success('Workflow exported');
  };

  // Determine button text and action based on selected variations
  const saveButtonText = selectedCount > 0
    ? `Save Selected (${selectedCount})`
    : `Save All (${validVariationsCount})`;

  const handleSaveClick = selectedCount > 0 ? handleSaveSelectedToDataset : handleSaveAllValidToDataset;

  // Determine if the save button should be enabled
  const isSaveButtonDisabled = (selectedCount === 0 && validVariationsCount === 0) || selectedDataset?.archived || isGenerating || isParaphrasing;

  // Determine Clear button text and disabled state
  const clearButtonText = selectedCount > 0
    ? `Clear Selected (${selectedCount})`
    : `Clear All (${totalVariationsCount})`;
  const isClearButtonDisabled = totalVariationsCount === 0 || isGenerating || isParaphrasing;

  const templateOptions = templates.map(template => ({
    value: template.id,
    label: template.name
  }));

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
            
            {/* Workflow Toggle */}
            <div className="mt-3 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Workflow Mode
              </label>
              <div className="relative inline-block w-10 align-middle select-none">
                <input
                  type="checkbox"
                  name="workflow-toggle"
                  id="workflow-toggle"
                  className="opacity-0 absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                  checked={workflowEnabled}
                  onChange={handleToggleWorkflow}
                  disabled={isGenerating || isParaphrasing}
                />
                <label
                  htmlFor="workflow-toggle"
                  className={`block overflow-hidden h-6 rounded-full cursor-pointer ${
                    workflowEnabled ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out ${
                      workflowEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  ></span>
                </label>
              </div>
            </div>
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

          {variations.length === 0 && !isGenerating ? (
            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <p className="text-gray-500">
                {selectedDataset?.archived
                  ? 'Generation is disabled for archived datasets.'
                  : 'Fill in the form and click "Generate" to create variations.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {variations.map((variation) => (
                <VariationCard
                  key={variation.id}
                  id={variation.id} // Pass id
                  variation={variation.variation}
                  output={variation.output}
                  tool_calls={variation.tool_calls}
                  processed_prompt={variation.processed_prompt}
                  isSelected={selectedVariations.has(variation.id)} // Use selected state
                  isGenerating={variation.isGenerating || false}
                  isParaphrasing={isParaphrasing}
                  error={variation.error || null}
                  workflow_results={variation.workflow_results} // Pass workflow results if available
                  workflow_progress={variation.workflow_progress} // Pass workflow progress if available
                  onSelect={() => handleSelect(variation.id)} // Use select handler
                  onEdit={(output) => handleEdit(variation.id, output)}
                  onRegenerate={(instruction) => handleRegenerate(variation.id, instruction)}
                  onDismiss={() => handleDismiss(variation.id)}
                  onToolCallsChange={(newToolCalls) => handleToolCallsChange(variation.id, newToolCalls)} // Pass variation id
                  onOpenParaphraseModal={(id, text) => handleOpenParaphraseModal(id, text)} // For opening paraphrase modal
                />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Workflow Manager */}
      {workflowEnabled && (
        <div className="border-t pt-6 w-full">
          <WorkflowManager
            visible={workflowEnabled}
            workflow={currentWorkflow}
            setWorkflow={setCurrentWorkflow}
            onImport={handleWorkflowImport}
            onExport={handleWorkflowExport}
            disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
          />
        </div>
      )}

      {selectedDataset && (
        <div className="border-t pt-6 w-full">
          <div className="w-full"> {/* Negative margin to expand full width */}
            <ExampleTable 
              datasetId={selectedDataset.id}
              datasetName={selectedDataset.name}
              refreshTrigger={refreshExamplesTrigger} 
            />
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

export default Generate;