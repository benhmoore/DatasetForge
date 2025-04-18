import { useState, useEffect, useRef, useCallback } from 'react'; // Added useCallback
import { useLocation } from 'react-router-dom'; // Import useLocation
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import SeedForm from './SeedForm';
import VariationCard from './VariationCard';
import ExampleTable from './ExampleTable';
import SettingsModal from './SettingsModal';
import CustomSelect from './CustomSelect';

const Generate = ({ context }) => { // Accept context as prop
  // Destructure selectedDataset from context
  const { selectedDataset } = context;
  const location = useLocation(); // Get location object

  const [templates, setTemplates] = useState([]);
  // Store ID instead of object directly from selection
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  // Derived state holding the actual template object
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // Keep track of loading state
  const [isGenerating, setIsGenerating] = useState(false);
  const [variations, setVariations] = useState([]);
  const [starredVariations, setStarredVariations] = useState(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshExamplesTrigger, setRefreshExamplesTrigger] = useState(0);
  const variationsRef = useRef(variations); // Ref to access latest variations in callbacks

  // Update ref whenever variations state changes
  useEffect(() => {
    variationsRef.current = variations;
  }, [variations]);

  // Fetch templates when the component becomes active (navigates to /generate)
  useEffect(() => {
    let isMounted = true; // Prevent state updates on unmounted component

    const fetchTemplates = async () => {
      console.log('Generate component is active, fetching templates...');
      // Set loading true only when actually fetching
      if (isMounted) setIsLoading(true);
      try {
        const fetchedTemplates = await api.getTemplates();
        if (isMounted) {
          const activeTemplates = fetchedTemplates.filter(t => !t.archived);
          setTemplates(activeTemplates);

          // If a template was previously selected, find its updated version
          if (selectedTemplateId) {
            const updatedSelected = activeTemplates.find(t => t.id === selectedTemplateId);
            if (updatedSelected) {
              console.log('Re-selecting updated template:', updatedSelected.name);
              // Update the selected template object state
              setSelectedTemplate(updatedSelected);
            } else {
              // The previously selected template might have been archived/deleted
              console.log('Previously selected template not found after refresh, clearing selection.');
              setSelectedTemplateId(null); // Clear the ID
              setSelectedTemplate(null);  // Clear the object
              setVariations([]); // Clear variations as template is gone
              setStarredVariations(new Set());
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        if (isMounted) {
          toast.error('Failed to load templates.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false); // Set loading false after fetch attempt
        }
      }
    };

    // Only fetch if the current path is /generate
    if (location.pathname === '/generate') {
      fetchTemplates();
    } else {
      if (isMounted) setIsLoading(false);
    }

    return () => {
      isMounted = false; // Cleanup function
    };
  }, [location.pathname, selectedTemplateId]);

  // Handle template selection change (updates the ID)
  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId); // Store the ID
    // Find the template object from the *current* list and set it immediately
    const template = templates.find(t => t.id === templateId);
    setSelectedTemplate(template);
    setVariations([]); // Clear variations when template changes
    setStarredVariations(new Set());
  };

  // Handle generate button click from SeedForm
  const handleGenerate = useCallback(async (data) => {
    if (!selectedDataset || !selectedTemplate) {
      toast.warning('Please select a dataset and template first');
      return;
    }

    if (!data.template_id || data.template_id !== selectedTemplate.id) {
      console.error('Mismatched template_id in generate request:', data.template_id, 'vs selected:', selectedTemplate.id);
      toast.error('Template mismatch. Please try selecting the template again.');
      return;
    }

    console.log('Generation request data:', data);

    setIsGenerating(true);
    const totalVariations = data.seeds.length * data.count;

    // Initialize variations with placeholders for all expected results
    const initialVariations = Array.from({ length: totalVariations }, (_, globalIndex) => {
      const seedIndex = Math.floor(globalIndex / data.count);
      const variationIndex = globalIndex % data.count;
      const seedData = data.seeds[seedIndex];

      return {
        variation: `Seed ${seedIndex + 1} / Variation ${variationIndex + 1}`, // Initial label
        output: '',
        tool_calls: null,
        processed_prompt: '',
        slots: seedData.slots, // Store the slots used for this seed
        seed_index: seedIndex, // Store seed index
        variation_index: variationIndex, // Store variation index within the seed
        isGenerating: true,
        error: null,
        id: `temp-${seedIndex}-${variationIndex}-${Date.now()}` // Unique temporary ID
      };
    });
    setVariations(initialVariations);
    setStarredVariations(new Set()); // Clear stars

    try {
      // Use the streaming API call
      await api.generate(data, (result) => {
        console.log('Received variation data:', result);

        // Calculate the global index in the variations array
        const globalIndex = result.seed_index * data.count + result.variation_index;

        // Update the specific variation in the state using the ref
        setVariations(prevVariations => {
          const updated = [...prevVariations];
          if (globalIndex >= 0 && globalIndex < updated.length) {
            updated[globalIndex] = {
              ...updated[globalIndex], // Keep existing placeholder data like slots, indices, id
              ...result, // Overwrite with received data (includes variation label, output, etc.)
              isGenerating: false, // Mark as finished
              error: result.output?.startsWith('[Error:') || result.output?.startsWith('[Ollama API timed out') ? result.output : null, // Store error if present
            };
          } else {
            console.error(`Invalid global index ${globalIndex} calculated from seed ${result.seed_index}, variation ${result.variation_index}`);
          }
          return updated;
        });
      });

      toast.info('Generation stream finished.');

    } catch (error) {
      console.error('Generation stream failed:', error);
      toast.error(`Generation failed: ${error.message}`);
      setVariations(prev => prev.map(v => v.isGenerating ? { ...v, isGenerating: false, error: 'Stream failed' } : v));
    } finally {
      setIsGenerating(false);
    }
  }, [selectedDataset, selectedTemplate]);

  // Handle star button click
  const handleStar = (index, output) => {
    const newStarred = new Set(starredVariations);

    if (newStarred.has(index)) {
      newStarred.delete(index);
    } else {
      if (!variationsRef.current[index]?.error) {
        newStarred.add(index);
      } else {
        toast.warning("Cannot star an item with an error.");
        return;
      }
    }

    if (output !== variationsRef.current[index]?.output) {
      setVariations(prevVariations => {
        const updatedVariations = [...prevVariations];
        updatedVariations[index] = { ...updatedVariations[index], output };
        return updatedVariations;
      });
    }

    setStarredVariations(newStarred);
  };

  // Handle edit button save
  const handleEdit = (index, newOutput) => {
    setVariations(prevVariations => {
      const updatedVariations = [...prevVariations];
      updatedVariations[index] = { ...updatedVariations[index], output: newOutput };
      if (starredVariations.has(index)) {
        const newStarred = new Set(starredVariations);
        newStarred.delete(index);
        setStarredVariations(newStarred);
        toast.info("Unstarred item due to edit.");
      }
      return updatedVariations;
    });
  };

  // Handle regenerate button click
  const handleRegenerate = useCallback(async (index, instruction = '') => {
    if (!selectedTemplate || isGenerating) return;

    const currentVariation = variationsRef.current[index];
    if (!currentVariation) {
      console.error('Cannot regenerate: variation not found at index', index);
      return;
    }

    setVariations(prevVariations => {
      const updated = [...prevVariations];
      updated[index] = { 
        ...updated[index], 
        isGenerating: true,
        error: null,
        output: '',
        tool_calls: null
      };
      return updated;
    });

    try {
      const slotData = currentVariation.slots || {};
      console.log('Regeneration slots:', slotData);
      console.log('Regeneration instruction:', instruction);

      if (Object.keys(slotData).length === 0) {
        throw new Error('Cannot regenerate: missing slot data');
      }

      const regenParams = {
        template_id: selectedTemplate.id,
        seeds: [{ slots: slotData }],
        count: 1,
        ...(instruction && instruction.trim() !== '' && { instruction: instruction.trim() })
      };

      console.log('Final regenerate payload:', regenParams);

      await api.generate(regenParams, (result) => {
        console.log('Received regenerated variation data:', result);
        setVariations(prevVariations => {
          const updated = [...prevVariations];
          updated[index] = {
            ...updated[index],
            ...result,
            isGenerating: false,
            error: result.output?.startsWith('[Error:') || result.output?.startsWith('[Ollama API timed out') ? result.output : null,
          };
          return updated;
        });

        if (starredVariations.has(index)) {
          setStarredVariations(prevStarred => {
            const newStarred = new Set(prevStarred);
            newStarred.delete(index);
            return newStarred;
          });
        }
      });

    } catch (error) {
      console.error('Regeneration failed:', error);
      const errorMsg = error.message || 'Failed to regenerate. Please try again.';
      setVariations(prevVariations => {
        const updated = [...prevVariations];
        updated[index] = {
          ...updated[index],
          isGenerating: false,
          error: errorMsg
        };
        return updated;
      });
    }
  }, [selectedTemplate, isGenerating, starredVariations]);

  // Handle save to dataset
  const handleSaveToDataset = async () => {
    if (!selectedDataset) {
      toast.warning('Please select a dataset first');
      return;
    }

    if (!selectedTemplate) {
      toast.warning('Cannot save: Template not selected.');
      return;
    }

    if (starredVariations.size === 0) {
      toast.warning('Please star at least one variation to save');
      return;
    }

    const examplesToSave = Array.from(starredVariations).map(index => {
      const variation = variationsRef.current[index];
      let slotData = variation.slots || {};

      console.log('Saving variation with slots:', slotData);

      if (!slotData || Object.keys(slotData).length === 0) {
        console.warn('Missing slots for variation at index', index, '- attempting to save anyway');
      }

      return {
        system_prompt: selectedTemplate.system_prompt || "",
        user_prompt: variation.processed_prompt || "",
        slots: slotData,
        output: variation.output,
        tool_calls: variation.tool_calls || null
      };
    });

    console.log('Examples to save:', examplesToSave);

    try {
      await api.saveExamples(selectedDataset.id, examplesToSave);
      toast.success(`${examplesToSave.length} example(s) saved to ${selectedDataset.name}`);
      
      const savedIndices = new Set(starredVariations);
      setVariations(prevVariations => 
        prevVariations.filter((_, index) => !savedIndices.has(index))
      );
      setStarredVariations(new Set());
      setRefreshExamplesTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save examples:', error);
      toast.error(`Failed to save examples: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleDismiss = (index) => {
    setVariations(prevVariations => prevVariations.filter((_, i) => i !== index));
    setStarredVariations(prevStarred => {
      const newStarred = new Set(prevStarred);
      newStarred.delete(index);
      return newStarred;
    });
  };

  const templateOptions = templates.map(template => ({
    value: template.id,
    label: template.name
  }));

  return (
    <div className="space-y-8">
      {/* Changed grid layout to allow variations to expand */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6"> {/* Changed grid definition */}
        <div className="space-y-4"> {/* Removed md:col-span-2 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Template
            </label>
            <CustomSelect
              options={templateOptions}
              value={selectedTemplateId || ''}
              onChange={handleTemplateChange}
              placeholder="Select a template..."
              isLoading={isLoading}
              disabled={isLoading || isGenerating || templates.length === 0}
            />
          </div>

          <SeedForm
            template={selectedTemplate}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
          />

          {variations.length > 0 && starredVariations.size > 0 && (
            <div className="mt-4">
              <button
                onClick={handleSaveToDataset}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                disabled={starredVariations.size === 0}
              >
                Save {starredVariations.size} to Dataset
              </button>
            </div>
          )}
        </div>

        <div className="px-4"> {/* Removed md:col-span-3 and added padding */}
          <h3 className="text-lg font-medium mb-3">Generated Variations</h3>

          {variations.length === 0 && !isGenerating ? (
            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <p className="text-gray-500">
                Fill in the form and click "Generate" to create variations.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> {/* Changed from space-y-4 to grid */}
              {variations.map((variation, index) => (
                <VariationCard
                  key={variation.id} // Use the unique temporary ID
                  variation={variation.variation}
                  output={variation.output}
                  tool_calls={variation.tool_calls}
                  processed_prompt={variation.processed_prompt}
                  isStarred={starredVariations.has(index)}
                  isGenerating={variation.isGenerating || false}
                  error={variation.error || null}
                  onStar={(output) => handleStar(index, output)}
                  onEdit={(output) => handleEdit(index, output)}
                  onRegenerate={(instruction) => handleRegenerate(index, instruction)}
                  onDismiss={() => handleDismiss(index)} // Pass dismiss handler
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedDataset && (
        <div className="border-t pt-6">
          <ExampleTable 
            datasetId={selectedDataset.id}
            datasetName={selectedDataset.name}
            refreshTrigger={refreshExamplesTrigger} 
          />
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