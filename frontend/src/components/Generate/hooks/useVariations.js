import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';

export const useVariations = (selectedTemplate, selectedDataset) => {
  const [variations, setVariations] = useState([]);
  const [selectedVariations, setSelectedVariations] = useState(new Set());
  const [isParaphrasing, setIsParaphrasing] = useState(false);
  
  // State for ParaphraseModal
  const [isParaphraseModalOpen, setIsParaphraseModalOpen] = useState(false);
  const [paraphraseSourceText, setParaphraseSourceText] = useState('');
  const [paraphraseSourceId, setParaphraseSourceId] = useState(null);
  
  const variationsRef = useRef(variations);

  // Calculate counts for dynamic actions
  const selectedCount = selectedVariations.size;
  const validVariationsCount = variations.filter(v => !v.isGenerating && !v.error).length;
  const totalVariationsCount = variations.length;

  useEffect(() => {
    variationsRef.current = variations;
  }, [variations]);

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

  // Determine button text and action based on selected variations
  const saveButtonText = selectedCount > 0
    ? `Save Selected (${selectedCount})`
    : `Save All (${validVariationsCount})`;

  // Determine if the save button should be enabled
  const isSaveButtonDisabled = (selectedCount === 0 && validVariationsCount === 0) || 
                              !selectedDataset || 
                              selectedDataset?.archived;

  // Determine Clear button text and disabled state
  const clearButtonText = selectedCount > 0
    ? `Clear Selected (${selectedCount})`
    : `Clear All (${totalVariationsCount})`;

  const isClearButtonDisabled = totalVariationsCount === 0;
  
  return {
    variations,
    setVariations,
    variationsRef,
    selectedVariations,
    setSelectedVariations,
    isParaphrasing,
    setIsParaphrasing,
    isParaphraseModalOpen,
    paraphraseSourceText,
    paraphraseSourceId,
    selectedCount,
    validVariationsCount,
    totalVariationsCount,
    handleSelect,
    handleEdit,
    handleAddVariations,
    handleDismiss,
    handleToolCallsChange,
    handleClear,
    handleOpenParaphraseModal,
    handleCloseParaphraseModal,
    saveButtonText,
    isSaveButtonDisabled,
    clearButtonText,
    isClearButtonDisabled
  };
};

export default useVariations;