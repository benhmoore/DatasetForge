import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import api from '../../../api/apiClient';

export const useDatasetSave = (
  selectedDataset,
  selectedTemplate,
  templates,
  variationsRef,
  setVariations,
  setSelectedVariations
) => {
  const [refreshExamplesTrigger, setRefreshExamplesTrigger] = useState(0);

  const handleSaveSelectedToDataset = async (selectedVariations) => {
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

  // Function to save all valid variations
  const handleSaveAllValidToDataset = useCallback(async (variations) => {
    if (!selectedDataset) {
      toast.warning('Please select a dataset first');
      return;
    }

    const validVariations = variations.filter(v => !v.isGenerating && !v.error);

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
  }, [selectedDataset, selectedTemplate, templates, setVariations, setSelectedVariations]);

  return {
    refreshExamplesTrigger,
    handleSaveSelectedToDataset,
    handleSaveAllValidToDataset
  };
};

export default useDatasetSave;