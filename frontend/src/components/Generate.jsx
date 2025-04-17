import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { useOutletContext, Navigate } from 'react-router-dom';
import api from '../api/apiClient';
import SeedForm from './SeedForm';
import VariationCard from './VariationCard';
import ExampleTable from './ExampleTable';
import SettingsModal from './SettingsModal';
import CustomSelect from './CustomSelect'; // Import the new component

const Generate = () => {
  const { selectedDataset } = useOutletContext();

  // Redirect if no dataset is selected
  if (!selectedDataset) {
    toast.warning('Please select a dataset first');
    return <Navigate to="/" />;
  }

  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [variations, setVariations] = useState([]);
  const [starredVariations, setStarredVariations] = useState(new Set());
  const variationsRef = useRef(variations); // Ref to access latest variations in callback

  // Update ref whenever variations change
  useEffect(() => {
    variationsRef.current = variations;
  }, [variations]);

  // Fetch templates on component mount
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);

      try {
        const data = await api.getTemplates();
        setTemplates(data);

        // Check for previously selected template in session storage
        const savedTemplateId = sessionStorage.getItem(`selectedTemplate_${selectedDataset.id}`);
        let templateToSelect = null;

        if (savedTemplateId) {
          // Find the saved template by ID
          const savedTemplate = data.find(t => t.id === parseInt(savedTemplateId));
          if (savedTemplate && !savedTemplate.archived) {
            console.log('Restoring saved template from session storage:', savedTemplate);
            templateToSelect = savedTemplate;
          }
        }

        // If no saved template or it wasn't found, use the first available
        if (!templateToSelect) {
          // Select the first non-archived template if available
          const activeTemplates = data.filter(t => !t.archived);
          if (activeTemplates.length > 0) {
            console.log('Setting initial template:', activeTemplates[0]);
            templateToSelect = activeTemplates[0];
          } else if (data.length > 0) {
            console.log('No active templates, setting first available:', data[0]);
            templateToSelect = data[0];
          } else {
            console.warn('No templates available');
          }
        }

        if (templateToSelect) {
          setSelectedTemplate(templateToSelect);
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        toast.error('Failed to load templates');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, [selectedDataset.id]);

  // Handle template selection
  const handleTemplateChange = (templateId) => { // Changed parameter to templateId
    try {
      if (templateId === null || templateId === undefined) {
        console.warn('Invalid template ID:', templateId);
        setSelectedTemplate(null);
        return;
      }

      const template = templates.find(t => t.id === templateId);
      if (!template) {
        console.warn('Template not found for ID:', templateId);
        toast.error('Selected template was not found. Please try another template.');
        return;
      }

      console.log('Selected template:', template);
      setSelectedTemplate(template);

      // Save to session storage
      sessionStorage.setItem(`selectedTemplate_${selectedDataset.id}`, template.id);

      // Clear variations when changing template
      setVariations([]);
      setStarredVariations(new Set());
    } catch (error) {
      console.error('Error selecting template:', error);
      toast.error('Error selecting template. Please try again.');
    }
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshExamplesTrigger, setRefreshExamplesTrigger] = useState(0);

  // Handle generate button click
  const handleGenerate = async (data) => {
    if (!selectedDataset || !selectedTemplate) {
      toast.warning('Please select a dataset and template first');
      return;
    }

    if (!data.template_id) {
      console.error('Missing template_id in generate request:', data);
      toast.error('Missing template ID. Please refresh and try again.');
      return;
    }

    console.log('Generation request data:', data);

    setIsGenerating(true);
    // Initialize variations with placeholders
    const initialVariations = Array.from({ length: data.count }, (_, i) => ({
      variation: `Variation ${i + 1}`,
      output: '', // Empty initially
      tool_calls: null,
      processed_prompt: '', // Empty initially
      slots: data.slots, // Keep slots for potential regeneration
      isGenerating: true, // Mark as generating
      error: null,
      id: `temp-${i}-${Date.now()}` // Unique temporary ID for key prop
    }));
    setVariations(initialVariations);
    setStarredVariations(new Set()); // Clear stars

    try {
      // Use the streaming API call
      await api.generate(data, (result) => {
        // This callback runs for each received variation
        console.log('Received variation data:', result);

        // Find the index for this variation (e.g., "Variation 1" -> index 0)
        const variationNumberMatch = result.variation?.match(/Variation (\d+)/);
        if (!variationNumberMatch) {
          console.error('Could not determine variation index from:', result.variation);
          return;
        }
        const index = parseInt(variationNumberMatch[1], 10) - 1;

        // Update the specific variation in the state using the ref
        setVariations(prevVariations => {
          const updated = [...prevVariations];
          if (index >= 0 && index < updated.length) {
            updated[index] = {
              ...updated[index], // Keep existing placeholder data like slots
              ...result, // Overwrite with received data
              isGenerating: false, // Mark as finished
              error: result.error || null, // Store error if present
              id: updated[index].id // Keep the temporary ID
            };
          } else {
            console.error(`Invalid index ${index} for received variation.`);
          }
          return updated;
        });
      });

      toast.info('Generation stream finished.');

    } catch (error) {
      console.error('Generation stream failed:', error);
      toast.error(`Generation failed: ${error.message}`);
      setVariations(prev => prev.map(v => ({ ...v, isGenerating: false, error: 'Stream failed' })));
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle star button click
  const handleStar = (index, output) => {
    const newStarred = new Set(starredVariations);

    if (newStarred.has(index)) {
      newStarred.delete(index);
    } else {
      newStarred.add(index);
    }

    if (output !== variations[index].output) {
      const updatedVariations = [...variations];
      updatedVariations[index] = { ...updatedVariations[index], output };
      setVariations(updatedVariations);
    }

    setStarredVariations(newStarred);
  };

  // Handle edit button save
  const handleEdit = (index, newOutput) => {
    const updatedVariations = [...variations];
    updatedVariations[index] = { ...updatedVariations[index], output: newOutput };
    setVariations(updatedVariations);
  };

  // Handle regenerate button click
  const handleRegenerate = async (index, instruction = '') => {
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

      const regenParams = {
        template_id: selectedTemplate.id,
        slots: slotData,
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
            error: result.error || null,
            id: updated[index].id
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
  };

  // Handle save to dataset
  const handleSaveToDataset = async () => {
    if (!selectedDataset) {
      toast.warning('Please select a dataset first');
      return;
    }

    if (starredVariations.size === 0) {
      toast.warning('Please star at least one variation to save');
      return;
    }

    const examples = Array.from(starredVariations).map(index => {
      const variation = variations[index];
      let slotData = variation.slots || {};

      console.log('Saving variation with slots:', slotData);

      if (!slotData || Object.keys(slotData).length === 0) {
        console.warn('Missing slots for variation', index);
        slotData = { "_default": "No slot data available" };
      }

      const example = {
        system_prompt: selectedTemplate.system_prompt,
        user_prompt: variation.processed_prompt,
        slots: slotData,
        output: variation.output
      };

      if (variation.tool_calls && Array.isArray(variation.tool_calls) && variation.tool_calls.length > 0) {
        example.tool_calls = variation.tool_calls;
        console.log('Including tool calls in saved example:', variation.tool_calls);
      }

      return example;
    });

    try {
      await api.saveExamples(selectedDataset.id, examples);
      toast.success(`Saved ${examples.length} examples to dataset`);

      const remainingVariations = variations.filter((_, index) => !starredVariations.has(index));
      setVariations(remainingVariations);
      setStarredVariations(new Set());

      setRefreshExamplesTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save examples:', error);
      toast.error('Failed to save examples to dataset');
    }
  };

  // Prepare options for CustomSelect
  const templateOptions = templates.map(template => ({
    value: template.id,
    label: template.name
  }));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Template
            </label>
            {/* Replace select with CustomSelect */}
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
            isGenerating={isGenerating}
          />

          {variations.length > 0 && starredVariations.size > 0 && (
            <div className="mt-4">
              <button
                onClick={handleSaveToDataset}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700"
                disabled={isGenerating}
              >
                Save {starredVariations.size} to Dataset
              </button>
            </div>
          )}
        </div>

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
                  key={variation.id}
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