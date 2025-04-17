import { useState, useEffect, useRef, useCallback } from 'react'; // Added useCallback
import { toast } from 'react-toastify';
import { useOutletContext, Navigate } from 'react-router-dom';
import api from '../api/apiClient';
import SeedForm from './SeedForm';
import VariationCard from './VariationCard';
import ExampleTable from './ExampleTable';
import SettingsModal from './SettingsModal';
import CustomSelect from './CustomSelect';

const Generate = () => {
  const { selectedDataset } = useOutletContext();

  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
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

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      try {
        const fetchedTemplates = await api.getTemplates();
        setTemplates(fetchedTemplates.filter(t => !t.archived));
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        toast.error('Failed to load templates.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  // Handle template selection change
  const handleTemplateChange = (templateId) => {
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

    if (!data.template_id) {
      console.error('Missing template_id in generate request:', data);
      toast.error('Missing template ID. Please refresh and try again.');
      return;
    }
    
    if (!data.seeds || data.seeds.length === 0) {
      console.error('Missing seeds in generate request:', data);
      toast.error('No seeds provided for generation.');
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
        // This callback runs for each received variation
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
      // Mark all remaining generating variations as failed
      setVariations(prev => prev.map(v => v.isGenerating ? { ...v, isGenerating: false, error: 'Stream failed' } : v));
    } finally {
      setIsGenerating(false);
    }
  }, [selectedDataset, selectedTemplate]); // Dependencies for useCallback

  // Handle star button click
  const handleStar = (index, output) => {
    // Index is the global index in the variations array
    const newStarred = new Set(starredVariations);

    if (newStarred.has(index)) {
      newStarred.delete(index);
    } else {
      // Only allow starring if there's no error
      if (!variationsRef.current[index]?.error) {
        newStarred.add(index);
      } else {
        toast.warning("Cannot star an item with an error.");
        return; // Don't proceed with starring or updating output
      }
    }

    // Update output if it was edited before starring
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
    // Index is the global index
    setVariations(prevVariations => {
      const updatedVariations = [...prevVariations];
      updatedVariations[index] = { ...updatedVariations[index], output: newOutput };
      // If the item was starred, unstar it because it has been edited
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
    // Index is the global index
    if (!selectedTemplate || isGenerating) return;

    const currentVariation = variationsRef.current[index];
    if (!currentVariation) {
      console.error('Cannot regenerate: variation not found at index', index);
      return;
    }

    // Mark this specific variation as regenerating
    setVariations(prevVariations => {
      const updated = [...prevVariations];
      updated[index] = { 
        ...updated[index], 
        isGenerating: true,
        error: null,
        output: '', // Clear previous output
        tool_calls: null // Clear previous tool calls
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

      // Prepare a request for a single seed (the one being regenerated) and count 1
      const regenParams = {
        template_id: selectedTemplate.id,
        seeds: [{ slots: slotData }], // Send as a single seed in the seeds array
        count: 1,
        ...(instruction && instruction.trim() !== '' && { instruction: instruction.trim() })
      };

      console.log('Final regenerate payload:', regenParams);

      // Use the same streaming API, but expect only one result
      await api.generate(regenParams, (result) => {
        console.log('Received regenerated variation data:', result);
        // The result will have seed_index 0 and variation_index 0
        // We need to update the original global index
        setVariations(prevVariations => {
          const updated = [...prevVariations];
          updated[index] = {
            ...updated[index], // Keep original id, seed_index, variation_index, slots
            ...result, // Overwrite with new output, variation label, tool_calls, etc.
            isGenerating: false,
            error: result.output?.startsWith('[Error:') || result.output?.startsWith('[Ollama API timed out') ? result.output : null,
          };
          return updated;
        });

        // Ensure the regenerated item is not starred
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
    // No finally block needed here as isGenerating is managed per-card for regeneration
  }, [selectedTemplate, isGenerating, starredVariations]); // Dependencies for useCallback

  // Handle save to dataset
  const handleSaveToDataset = async () => {
    if (!selectedDataset) {
      toast.warning('Please select a dataset first');
      return;
    }
    
    // Ensure a template is selected to get the system prompt
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

      // Construct the example payload based on ExampleCreate schema
      return {
        system_prompt: selectedTemplate.system_prompt || "", // Add system_prompt from the selected template
        user_prompt: variation.processed_prompt || "", // Use the processed prompt from the result
        slots: slotData,
        output: variation.output,
        tool_calls: variation.tool_calls || null
      };
    });

    console.log('Examples to save:', examplesToSave);

    try {
      await api.saveExamples(selectedDataset.id, examplesToSave);
      toast.success(`${examplesToSave.length} example(s) saved to ${selectedDataset.name}`);
      setStarredVariations(new Set()); // Clear stars after saving
      setRefreshExamplesTrigger(prev => prev + 1); // Trigger refresh in ExampleTable
    } catch (error) {
      console.error('Failed to save examples:', error);
      toast.error(`Failed to save examples: ${error.response?.data?.detail || error.message}`);
    }
  };

  // Prepare template options for CustomSelect
  const templateOptions = templates.map(template => ({
    value: template.id,
    label: template.name
  }));

  // Redirect if no dataset is selected (moved logic here for clarity)
  if (!selectedDataset) {
    toast.warning('Please select a dataset first');
    return <Navigate to="/" />;
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Template Selection & Seed Form */}
        <div className="md:col-span-1 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Template
            </label>
            <CustomSelect
              options={templateOptions}
              value={selectedTemplate?.id || ''}
              onChange={handleTemplateChange}
              placeholder="Select a template..."
              isLoading={isLoading}
              disabled={isLoading || isGenerating || templates.length === 0}
            />
          </div>

          <SeedForm
            template={selectedTemplate}
            onGenerate={handleGenerate}
            isGenerating={isGenerating} // Pass global isGenerating flag
          />

          {/* Save Button - appears only if there are starred variations */}
          {variations.length > 0 && starredVariations.size > 0 && (
            <div className="mt-4">
              <button
                onClick={handleSaveToDataset}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                disabled={isGenerating} // Disable while any generation is happening
              >
                Save {starredVariations.size} to Dataset
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Generated Variations */}
        <div className="md:col-span-2">
          <h3 className="text-lg font-medium mb-3">Generated Variations</h3>

          {variations.length === 0 && !isGenerating ? (
            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <p className="text-gray-500">
                Fill in the form and click "Generate" to create variations.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {variations.map((variation, index) => (
                <VariationCard
                  key={variation.id} // Use the unique temporary ID
                  variation={variation.variation} // Display the combined label
                  output={variation.output}
                  tool_calls={variation.tool_calls}
                  processed_prompt={variation.processed_prompt}
                  isStarred={starredVariations.has(index)}
                  isGenerating={variation.isGenerating || false} // Use per-variation generating flag
                  error={variation.error || null}
                  onStar={(output) => handleStar(index, output)}
                  onEdit={(output) => handleEdit(index, output)}
                  onRegenerate={(instruction) => handleRegenerate(index, instruction)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Example Table Section */}
      {selectedDataset && (
        <div className="border-t pt-6">
          <ExampleTable 
            datasetId={selectedDataset.id}
            datasetName={selectedDataset.name}
            refreshTrigger={refreshExamplesTrigger} 
          />
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

export default Generate;