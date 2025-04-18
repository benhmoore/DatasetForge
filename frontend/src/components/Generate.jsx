import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import SeedForm from './SeedForm';
import VariationCard from './VariationCard';
import ExampleTable from './ExampleTable';
import SettingsModal from './SettingsModal';
import CustomSelect from './CustomSelect';

const Generate = ({ context }) => {
  const { selectedDataset } = context;
  const location = useLocation();

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [variations, setVariations] = useState([]);
  const [starredVariations, setStarredVariations] = useState(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshExamplesTrigger, setRefreshExamplesTrigger] = useState(0);
  const variationsRef = useRef(variations);

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

          if (selectedTemplateId) {
            const updatedSelected = activeTemplates.find(t => t.id === selectedTemplateId);
            if (updatedSelected) {
              setSelectedTemplate(updatedSelected);
            } else {
              setSelectedTemplateId(null);
              setSelectedTemplate(null);
              setVariations([]);
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
  }, [location.pathname, selectedTemplateId]);

  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    setSelectedTemplate(template);
    setVariations([]);
    setStarredVariations(new Set());
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
    const totalVariations = data.seeds.length * data.count;

    const initialVariations = Array.from({ length: totalVariations }, (_, globalIndex) => {
      const seedIndex = Math.floor(globalIndex / data.count);
      const variationIndex = globalIndex % data.count;
      const seedData = data.seeds[seedIndex];

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
        id: `temp-${seedIndex}-${variationIndex}-${Date.now()}`
      };
    });
    setVariations(initialVariations);
    setStarredVariations(new Set());

    try {
      await api.generate(data, (result) => {
        setVariations(prevVariations => {
          const updated = [...prevVariations];
          const targetIndex = updated.findIndex(v =>
            v.seed_index === result.seed_index &&
            v.variation_index === result.variation_index &&
            v.isGenerating
          );

          if (targetIndex !== -1) {
            updated[targetIndex] = {
              ...updated[targetIndex],
              ...result,
              isGenerating: false,
              error: result.output?.startsWith('[Error:') || result.output?.startsWith('[Ollama API timed out') ? result.output : null,
            };
          } else {
            console.error(`Could not find placeholder for seed ${result.seed_index}, variation ${result.variation_index}. It might have been dismissed.`);
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

  const handleStar = (id, output) => {
    const variationIndex = variationsRef.current.findIndex(v => v.id === id);
    if (variationIndex === -1) {
      console.error('Cannot star: variation not found with id', id);
      return;
    }
    const variation = variationsRef.current[variationIndex];

    const newStarred = new Set(starredVariations);

    if (newStarred.has(id)) {
      newStarred.delete(id);
    } else {
      if (!variation?.error) {
        newStarred.add(id);
      } else {
        toast.warning("Cannot star an item with an error.");
        return;
      }
    }

    if (output !== variation?.output) {
      setVariations(prevVariations => {
        const updatedVariations = [...prevVariations];
        const idx = updatedVariations.findIndex(v => v.id === id);
        if (idx !== -1) {
          updatedVariations[idx] = { ...updatedVariations[idx], output };
        }
        return updatedVariations;
      });
    }

    setStarredVariations(newStarred);
  };

  const handleEdit = (id, newOutput) => {
    setVariations(prevVariations => {
      const updatedVariations = [...prevVariations];
      const index = updatedVariations.findIndex(v => v.id === id);
      if (index !== -1) {
        updatedVariations[index] = { ...updatedVariations[index], output: newOutput };
        if (starredVariations.has(id)) {
          const newStarred = new Set(starredVariations);
          newStarred.delete(id);
          setStarredVariations(newStarred);
          toast.info("Unstarred item due to edit.");
        }
      } else {
        console.error('Cannot edit: variation not found with id', id);
      }
      return updatedVariations;
    });
  };

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
              isGenerating: false,
              error: result.output?.startsWith('[Error:') || result.output?.startsWith('[Ollama API timed out') ? result.output : null,
            };

            if (starredVariations.has(id)) {
              setStarredVariations(prevStarred => {
                const newStarred = new Set(prevStarred);
                newStarred.delete(id);
                return newStarred;
              });
            }

          } else {
            console.error(`Could not find variation with id ${id} to update after regeneration.`);
          }
          return updated;
        });
      });

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
  }, [selectedTemplate, isGenerating, starredVariations]);

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

    const variationsToSave = Array.from(starredVariations)
      .map(id => variationsRef.current.find(v => v.id === id))
      .filter(v => v);

    const examplesToSave = variationsToSave.map(variation => {
      let slotData = variation.slots || {};

      return {
        system_prompt: selectedTemplate.system_prompt || "",
        user_prompt: variation.processed_prompt || "",
        slots: slotData,
        output: variation.output,
        tool_calls: variation.tool_calls || null
      };
    });

    try {
      await api.saveExamples(selectedDataset.id, examplesToSave);
      toast.success(`${examplesToSave.length} example(s) saved to ${selectedDataset.name}`);

      const savedIds = new Set(starredVariations);
      setVariations(prevVariations =>
        prevVariations.filter(v => !savedIds.has(v.id))
      );
      setStarredVariations(new Set());
      setRefreshExamplesTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save examples:', error);
      toast.error(`Failed to save examples: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleDismiss = (id) => {
    setVariations(prevVariations => prevVariations.filter(v => v.id !== id));
    setStarredVariations(prevStarred => {
      const newStarred = new Set(prevStarred);
      newStarred.delete(id);
      return newStarred;
    });
  };

  const templateOptions = templates.map(template => ({
    value: template.id,
    label: template.name
  }));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6">
        <div className="space-y-4">
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

        <div className="px-4">
          <h3 className="text-lg font-medium mb-3">Generated Variations</h3>

          {variations.length === 0 && !isGenerating ? (
            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <p className="text-gray-500">
                Fill in the form and click "Generate" to create variations.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {variations.map((variation) => (
                <VariationCard
                  key={variation.id}
                  id={variation.id}
                  variation={variation.variation}
                  output={variation.output}
                  tool_calls={variation.tool_calls}
                  processed_prompt={variation.processed_prompt}
                  isStarred={starredVariations.has(variation.id)}
                  isGenerating={variation.isGenerating || false}
                  error={variation.error || null}
                  onStar={(output) => handleStar(variation.id, output)}
                  onEdit={(output) => handleEdit(variation.id, output)}
                  onRegenerate={(instruction) => handleRegenerate(variation.id, instruction)}
                  onDismiss={() => handleDismiss(variation.id)}
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