import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient'; // Correct: Import the default export 'api'
import AiSeedModal from './AiSeedModal'; // Import the new modal component
import SeedBankModal from './SeedBankModal'; // Import the seed bank modal
import Icon from './Icons'; // Import the Icon component
import CustomSlider from './CustomSlider'; // Import the new CustomSlider component

// Define the helper function to generate the prompt preview
const generatePromptPreview = (promptTemplate, slotValues) => {
  if (!promptTemplate) return '';
  let preview = promptTemplate;
  const placeholders = promptTemplate.match(/\{([^}]+)\}/g) || [];

  placeholders.forEach(placeholder => {
    const slotName = placeholder.slice(1, -1);
    const value = slotValues[slotName]?.trim();
    const replacement = value ? value : `[${slotName}]`;
    preview = preview.replace(new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), replacement);
  });

  return preview;
};

// Helper function to check if a seed is blank
const isBlankSeed = (seed, slots) => {
  if (!seed || !slots || slots.length === 0) {
    return true;
  }
  return slots.every(slot => !seed[slot]?.trim());
};

// Helper function to remove blank seeds after adding new ones
const cleanupSeedList = (list, slots) => {
  if (!list || list.length === 0 || !slots || slots.length === 0) {
    return list;
  }

  const nonBlankSeeds = list.filter(seed => !isBlankSeed(seed, slots));

  if (nonBlankSeeds.length > 0) {
    return nonBlankSeeds;
  } else {
    return list.length > 0 ? [list[0]] : [];
  }
};

// --- Session Storage Persistence ---
const SS_PREFIX = 'seedForm_';
const SS_KEYS = {
  TEMPLATE_ID: `${SS_PREFIX}templateId`,
  SEED_LIST: `${SS_PREFIX}seedList`,
  CURRENT_INDEX: `${SS_PREFIX}currentSeedIndex`,
  VARIATIONS: `${SS_PREFIX}variationsPerSeed`,
  VALIDATION_ERRORS: `${SS_PREFIX}validationErrors`,
};

const clearSessionStorage = () => {
  Object.values(SS_KEYS).forEach(key => sessionStorage.removeItem(key));
};

const loadStateFromSessionStorage = (templateId) => {
  const storedTemplateId = sessionStorage.getItem(SS_KEYS.TEMPLATE_ID);
  if (storedTemplateId && templateId && storedTemplateId === templateId.toString()) {
    try {
      const storedSeedList = JSON.parse(sessionStorage.getItem(SS_KEYS.SEED_LIST) || '[{}]');
      const storedIndex = parseInt(sessionStorage.getItem(SS_KEYS.CURRENT_INDEX) || '0', 10);
      const storedVariations = parseInt(sessionStorage.getItem(SS_KEYS.VARIATIONS) || '3', 10);
      const storedErrors = JSON.parse(sessionStorage.getItem(SS_KEYS.VALIDATION_ERRORS) || '{}');

      // Basic validation on loaded data
      if (Array.isArray(storedSeedList) && storedSeedList.length > 0 && !isNaN(storedIndex) && !isNaN(storedVariations) && typeof storedErrors === 'object') {
         const validIndex = Math.min(Math.max(0, storedIndex), storedSeedList.length - 1);
         return {
            seedList: storedSeedList,
            currentSeedIndex: validIndex,
            variationsPerSeed: storedVariations,
            validationErrors: storedErrors,
            loaded: true
         };
      }
    } catch (e) {
      console.error("Failed to parse seed state from session storage:", e);
      clearSessionStorage(); // Clear potentially corrupted storage
    }
  }
  return { loaded: false }; // Indicate state wasn't loaded
};
// --- End Session Storage Persistence ---

const SeedForm = ({ template, selectedDataset, onGenerate, isGenerating, onCancel, isParaphrasing, setIsParaphrasing }) => {
  const [seedList, setSeedList] = useState([{}]); 
  const [currentSeedIndex, setCurrentSeedIndex] = useState(0);
  const [variationsPerSeed, setVariationsPerSeed] = useState(3);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isSeedBankModalOpen, setIsSeedBankModalOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState({}); // { seedIndex: { slotName: true } }
  const [isInitialized, setIsInitialized] = useState(false); // Track if initial load/reset is done

  // Determine disabled state based on generation, paraphrasing, or archived dataset
  const isDisabled = isGenerating || isParaphrasing || !!selectedDataset?.archived;

  // Create a memoized initial seed object when template changes
  const createInitialSeed = useCallback((templateSlots) => {
    if (!templateSlots || !Array.isArray(templateSlots)) return {};
    
    return templateSlots.reduce((acc, slot) => {
      if (typeof slot === 'string') {
        acc[slot] = '';
      }
      return acc;
    }, {});
  }, []);

  // Effect to load/reset state when template prop becomes available or changes
  useEffect(() => {
    const templateId = template?.id;
    const { loaded, ...loadedState } = loadStateFromSessionStorage(templateId);

    if (loaded) {
      // If loaded from storage for the *current* template, set the state
      setSeedList(loadedState.seedList);
      setCurrentSeedIndex(loadedState.currentSeedIndex);
      setVariationsPerSeed(loadedState.variationsPerSeed);
      setValidationErrors(loadedState.validationErrors);
    } else {
      // If not loaded (no storage, different template ID, or invalid data),
      // reset to initial state based on the *new* template.
      clearSessionStorage(); // Clear storage for the old/invalid template ID
      if (template?.slots && Array.isArray(template.slots)) {
        const initialSlots = createInitialSeed(template.slots);
        setSeedList([initialSlots]);
      } else {
        // Handle case where template becomes invalid/null
        setSeedList([{}]);
      }
      // Reset other state regardless of template validity if not loaded
      setCurrentSeedIndex(0);
      setVariationsPerSeed(3); // Reset variations to default
      setValidationErrors({});
    }
    setIsInitialized(true); // Mark initialization complete for this template
  }, [template, createInitialSeed]); // Rerun when template changes

  // Effect to save state to session storage whenever it changes
  useEffect(() => {
    // Only save after the initial state load/reset is complete for the current template
    // and if the template is valid
    if (isInitialized && template?.id) {
      try {
        sessionStorage.setItem(SS_KEYS.TEMPLATE_ID, template.id.toString());
        sessionStorage.setItem(SS_KEYS.SEED_LIST, JSON.stringify(seedList));
        sessionStorage.setItem(SS_KEYS.CURRENT_INDEX, currentSeedIndex.toString());
        sessionStorage.setItem(SS_KEYS.VARIATIONS, variationsPerSeed.toString());
        sessionStorage.setItem(SS_KEYS.VALIDATION_ERRORS, JSON.stringify(validationErrors));
      } catch (e) {
        console.error("Failed to save seed state to session storage:", e);
      }
    }
  }, [seedList, currentSeedIndex, variationsPerSeed, validationErrors, template?.id, isInitialized]);

  // Memoize the current seed to prevent unnecessary re-renders
  const currentSeed = useMemo(() => 
    seedList[currentSeedIndex] || {}, 
    [seedList, currentSeedIndex]
  );

  // Memoize the prompt preview calculation
  const promptPreview = useMemo(() => 
    template?.user_prompt && currentSeed
      ? generatePromptPreview(template.user_prompt, currentSeed)
      : '',
    [template, currentSeed]
  );

  // Memoized validation function - returns detailed errors
  const validateSeeds = useCallback((seeds) => {
    if (!template?.slots) return { valid: false, validated: [], errors: {} };

    let allValid = true;
    const errors = {};
    const validatedSeeds = seeds.map((seed, index) => {
      const missingSlots = template.slots.filter(slot => !seed[slot]?.trim());

      if (missingSlots.length > 0) {
        allValid = false;
        errors[index] = missingSlots.reduce((acc, slot) => {
          acc[slot] = true; // Mark missing slot as an error
          return acc;
        }, {});
      }

      return {
        slots: template.slots.reduce((acc, slot) => {
          acc[slot] = seed[slot] || '';
          return acc;
        }, {})
      };
    });

    return { valid: allValid, validated: validatedSeeds, errors };
  }, [template]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    setValidationErrors({}); // Clear previous errors

    const { valid, validated, errors } = validateSeeds(seedList);
    if (!valid) {
      setValidationErrors(errors);
      // Find the first seed with an error and navigate to it
      const firstErrorIndex = Object.keys(errors)[0];
      if (firstErrorIndex !== undefined) {
        setCurrentSeedIndex(parseInt(firstErrorIndex, 10));
      }
      toast.error('Please fix the errors in the highlighted fields.');
      return;
    }

    if (!template?.id) {
      toast.error('No template selected. Please select a template first.');
      return;
    }
    
    onGenerate({
      template_id: template.id,
      seeds: validated,
      count: variationsPerSeed
    });
  }, [seedList, template, variationsPerSeed, onGenerate, validateSeeds]);

  const handleSlotChange = useCallback((slot, value) => {
    if (isDisabled) return; // Prevent changes if disabled
    setSeedList(prevList => {
      const newList = [...prevList];
      newList[currentSeedIndex] = {
        ...newList[currentSeedIndex],
        [slot]: value
      };
      return newList;
    });
    // Clear validation error for this specific slot if it exists
    setValidationErrors(prevErrors => {
      const currentSeedErrors = prevErrors[currentSeedIndex];
      if (currentSeedErrors && currentSeedErrors[slot]) {
        const newSeedErrors = { ...currentSeedErrors };
        delete newSeedErrors[slot];
        const newErrors = { ...prevErrors };
        if (Object.keys(newSeedErrors).length === 0) {
          delete newErrors[currentSeedIndex]; // Remove seed index if no errors left
        } else {
          newErrors[currentSeedIndex] = newSeedErrors;
        }
        return newErrors;
      }
      return prevErrors;
    });
  }, [currentSeedIndex, isDisabled]);

  // Add a new seed (blank)
  const addSeed = useCallback(() => {
    if (isDisabled) return; // Prevent changes if disabled
    setSeedList(prevList => {
      // Create a new blank seed
      const blankSeed = createInitialSeed(template?.slots);
      // Important: We need to create a new array to avoid React state mutation issues 
      // but we must use the spread operator to preserve ALL existing seeds
      const newList = [...prevList, blankSeed];
      // Navigate to the newly added seed
      setCurrentSeedIndex(newList.length - 1);
      setValidationErrors({}); // Clear errors when adding/navigating
      return newList;
    });
  }, [template, createInitialSeed, isDisabled]);

  const removeSeed = useCallback(() => {
    if (isDisabled) return; // Prevent changes if disabled
    if (seedList.length <= 1) {
      toast.info("Cannot remove the last seed.");
      return;
    }
    
    setSeedList(prevList => {
      const newList = prevList.filter((_, index) => index !== currentSeedIndex);
      const newIndex = Math.min(currentSeedIndex, newList.length - 1);
      setCurrentSeedIndex(newIndex);
      // Clear errors for the removed seed and potentially shift others
      setValidationErrors(prevErrors => {
        const newErrors = {};
        Object.entries(prevErrors).forEach(([idxStr, seedErrors]) => {
          const idx = parseInt(idxStr, 10);
          if (idx < currentSeedIndex) {
            newErrors[idx] = seedErrors;
          } else if (idx > currentSeedIndex) {
            newErrors[idx - 1] = seedErrors; // Shift index down
          }
        });
        return newErrors;
      });
      return newList;
    });
  }, [seedList.length, currentSeedIndex, isDisabled]);

  const navigateSeeds = useCallback((direction) => {
    if (isDisabled) return; // Prevent changes if disabled
    setCurrentSeedIndex(prevIndex => {
      const newIndex = prevIndex + direction;
      if (newIndex >= 0 && newIndex < seedList.length) {
        return newIndex;
      }
      return prevIndex;
    });
  }, [seedList.length, isDisabled]);
  
  // Navigate to first seed
  const navigateToFirstSeed = useCallback(() => {
    if (isDisabled) return; // Prevent changes if disabled
    setCurrentSeedIndex(0);
  }, [isDisabled]);
  
  // Navigate to last seed
  const navigateToLastSeed = useCallback(() => {
    if (isDisabled) return; // Prevent changes if disabled
    setCurrentSeedIndex(seedList.length - 1);
  }, [seedList.length, isDisabled]);

  const handleParaphraseSeeds = useCallback(async (count, instructions) => {
    if (isDisabled) return; // Prevent changes if disabled
    if (!template?.id) {
      toast.error('Cannot paraphrase without a selected template.');
      return;
    }
    
    if (seedList.length < 1) { 
      toast.info('Need at least one seed to generate more via paraphrasing.');
      return;
    }

    setIsAiModalOpen(false);
    setIsParaphrasing(true);
    setValidationErrors({}); // Clear validation errors before generating new seeds
    
    try {
      const payload = {
        template_id: template.id,
        seeds: seedList.map(seed => ({ slots: seed })), 
        count: count,
        instructions: instructions
      };
      
      const response = await api.paraphraseSeeds(payload);
      
      if (response?.generated_seeds?.length) {
        const templateSlots = template.slots || [];
        const newSeeds = response.generated_seeds.map(newSeedData => {
          const seedSlots = newSeedData.slots || {};
          return templateSlots.reduce((acc, slotName) => {
            acc[slotName] = seedSlots[slotName] || '';
            return acc;
          }, {});
        });

        setSeedList(prevList => {
          const updatedList = [...prevList, ...newSeeds];
          const cleanedList = cleanupSeedList(updatedList, templateSlots);
          setCurrentSeedIndex(prevIndex => Math.min(prevIndex, cleanedList.length - 1));
          setValidationErrors({}); // Clear errors after successful paraphrase
          return cleanedList;
        });
        
        toast.success(`Added ${newSeeds.length} new seeds using paraphrasing.`);
      } else {
        console.error('Unexpected response format:', response);
        toast.error('Failed to parse paraphrased seeds from response.');
      }
    } catch (error) {
      console.error('Error paraphrasing seeds:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to generate paraphrased seeds.';
      toast.error(errorMsg);
    } finally {
      setIsParaphrasing(false);
    }
  }, [template, seedList, setIsParaphrasing, isDisabled]);

  // --- Import/Export Logic ---
  const handleExportSeeds = useCallback(() => {
    if (isDisabled) return; // Prevent changes if disabled
    if (!template?.name || seedList.length === 0) {
      toast.info("No seeds to export.");
      return;
    }

    try {
      const exportData = seedList.map(seed => {
        const cleanSeed = {};
        template.slots.forEach(slot => {
          cleanSeed[slot] = seed[slot] || '';
        });
        return cleanSeed;
      });

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTemplateName = template.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.href = url;
      link.download = `seed_bank_${safeTemplateName || 'export'}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${exportData.length} seeds.`);
    } catch (error) {
      console.error("Error exporting seeds:", error);
      toast.error("Failed to export seeds.");
    }
  }, [seedList, template, isDisabled]);

  const handleImportSeeds = useCallback(() => {
    if (isDisabled) return; // Prevent changes if disabled
    if (!template?.slots) {
      toast.error("Cannot import seeds without a selected template.");
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        let ignoredSlots = new Set(); // Keep track of ignored slots across all imported seeds
        try {
          const content = e.target?.result;
          if (typeof content !== 'string') {
            throw new Error("Failed to read file content.");
          }
          const importedData = JSON.parse(content);

          if (!Array.isArray(importedData)) {
            throw new Error("Invalid format: Imported file must contain a JSON array.");
          }

          if (importedData.length === 0) {
            toast.info("Imported file contains no seeds.");
            return;
          }

          const templateSlots = template.slots || [];
          const templateSlotSet = new Set(templateSlots); // Use a Set for efficient lookup

          const newSeeds = importedData.map((importedSeed, index) => {
            if (typeof importedSeed !== 'object' || importedSeed === null) {
              console.warn(`Skipping invalid entry at index ${index} during import.`);
              return null;
            }

            // Check for extra slots not in the current template
            Object.keys(importedSeed).forEach(key => {
              if (!templateSlotSet.has(key)) {
                ignoredSlots.add(key); // Add extra key to the set
              }
            });

            // Create the new seed object using only the template's slots
            return templateSlots.reduce((acc, slotName) => {
              acc[slotName] = importedSeed[slotName]?.toString() || '';
              return acc;
            }, {});
          }).filter(seed => seed !== null);

          if (newSeeds.length === 0) {
             toast.warn("No valid seed objects found in the imported file.");
             return;
          }

          const cleanedList = cleanupSeedList(newSeeds, templateSlots);
          setSeedList(cleanedList.length > 0 ? cleanedList : [createInitialSeed(templateSlots)]);
          setCurrentSeedIndex(0);
          setValidationErrors({});
          toast.success(`Successfully imported ${newSeeds.length} seeds.`);

          // Display warning about ignored slots if any were found
          if (ignoredSlots.size > 0) {
            const ignoredSlotsList = Array.from(ignoredSlots).join(', ');
            toast.warn(`Warning: The following slots from the imported file were ignored as they are not in the current template: ${ignoredSlotsList}`, { autoClose: 5000 });
          }

        } catch (error) {
          console.error("Error importing seeds:", error);
          toast.error(`Import failed: ${error.message || "Could not parse JSON file."}`);
        }
      };

      reader.onerror = (e) => {
        console.error("Error reading file:", e);
        toast.error("Failed to read the selected file.");
      };

      reader.readAsText(file);
    };

    input.click();
  }, [template, createInitialSeed, isDisabled]);
  // --- End Import/Export Logic ---

  // Handler for importing a file's content into a specific seed slot
  const handleImportFileToSlot = useCallback((slot) => {
    if (isDisabled) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt,.json,.csv,.text,.markdown,.html';
    
    input.onchange = (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      
      // Check if file is text-based by MIME type
      const validTextTypes = [
        'text/plain', 
        'text/markdown', 
        'text/csv', 
        'text/html', 
        'application/json',
        'application/x-md',
        'application/markdown'
      ];
      
      // Also allow any type with no specified MIME type but valid extension
      const validExtensions = ['.md', '.txt', '.text', '.markdown', '.csv', '.json', '.html'];
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      
      if (!validTextTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
        toast.error(`Unsupported file type. Please select a text file (markdown, plaintext, etc).`);
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result;
          if (typeof content !== 'string') {
            throw new Error("Failed to read file content.");
          }
          
          // Update the slot with the file content
          handleSlotChange(slot, content);
          toast.success(`Successfully imported content from ${file.name} into ${slot}.`);
        } catch (error) {
          console.error("Error importing file content:", error);
          toast.error(`Failed to import file: ${error.message || "Unknown error"}`);
        }
      };
      
      reader.onerror = (e) => {
        console.error("Error reading file:", e);
        toast.error("Failed to read the selected file.");
      };
      
      reader.readAsText(file);
    };
    
    input.click();
  }, [handleSlotChange, isDisabled]);

  // Memoize the pagination indicators to prevent unnecessary recalculations
  const renderPaginationIndicators = useMemo(() => {
    if (seedList.length <= 1) return null;
    
    return (
      <div className="flex items-center justify-center mx-2 relative">
        {seedList.length > 5 && currentSeedIndex > 0 && (
          <div 
            className="absolute left-0 top-1/2 transform -translate-y-1/2 h-2 flex items-center z-20 cursor-pointer"
            onClick={navigateToFirstSeed}
            title="Go to first seed"
            aria-label="Go to first seed"
            role="button"
            tabIndex={isDisabled ? -1 : 0}
            onKeyDown={(e) => !isDisabled && e.key === 'Enter' && navigateToFirstSeed()}
          >
            <div className="w-1 h-full bg-gray-400"></div>
            <div className="absolute left-1 top-0 bottom-0 w-4 bg-gradient-to-r from-gray-100 to-transparent"></div>
          </div>
        )}
        
        <div className="flex items-center space-x-1 relative z-0 px-2">
            {Array.from({ length: 5 }, (_, i) => {
              if (seedList.length <= 5) {
                return i < seedList.length ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => !isDisabled && setCurrentSeedIndex(i)}
                    className={`w-1.5 h-1.5 rounded-full ${
                      currentSeedIndex === i
                        ? 'bg-primary-600'
                        : 'bg-gray-300'
                    } transition-colors duration-150`}
                    title={`Go to seed ${i + 1}`}
                    aria-label={`Go to seed ${i + 1}`}
                    disabled={isDisabled}
                  />
                ) : null;
              } else {
                const segmentSize = seedList.length / 5;
                const segmentStart = Math.floor(i * segmentSize);
                const segmentEnd = Math.floor((i + 1) * segmentSize) - 1;
                
                const isActive = currentSeedIndex >= segmentStart && currentSeedIndex <= segmentEnd;
                
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => !isDisabled && setCurrentSeedIndex(segmentStart)}
                    className={`w-1.5 h-1.5 rounded-full ${
                      isActive ? 'bg-primary-600' : 'bg-gray-300'
                    } transition-colors duration-150`}
                    title={`Go to seeds ${segmentStart + 1}-${segmentEnd + 1}`}
                    aria-label={`Go to seeds ${segmentStart + 1}-${segmentEnd + 1}`}
                    disabled={isDisabled}
                  />
                );
              }
            })}
          </div>
        
        {seedList.length > 5 && currentSeedIndex < seedList.length - 1 && (
          <div 
            className="absolute right-0 top-1/2 transform -translate-y-1/2 h-2 flex items-center justify-end z-20 cursor-pointer"
            onClick={navigateToLastSeed}
            title="Go to last seed"
            aria-label="Go to last seed"
            role="button"
            tabIndex={isDisabled ? -1 : 0}
            onKeyDown={(e) => !isDisabled && e.key === 'Enter' && navigateToLastSeed()}
          >
            <div className="w-1 h-full bg-gray-400"></div>
            <div className="absolute right-1 top-0 bottom-0 w-4 bg-gradient-to-l from-gray-100 to-transparent"></div>
          </div>
        )}
      </div>
    );
  }, [seedList.length, currentSeedIndex, navigateToFirstSeed, navigateToLastSeed, isDisabled]);

  // Memoize the seed form fields with validation styling
  const renderSeedFields = useMemo(() => {
    if (!template?.slots) return null;

    const currentErrors = validationErrors[currentSeedIndex] || {};

    return template.slots.map(slot => {
      const hasError = !!currentErrors[slot];
      const inputId = `seed-${currentSeedIndex}-${slot}`;
      const errorId = `${inputId}-error`;

      return (
        <div key={slot} className="mb-3">
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1 flex justify-between">
            <span>{slot.charAt(0).toUpperCase() + slot.slice(1)}</span>
            {hasError && <span className="text-red-500 ml-1">*</span>}
            <button
              type="button"
              onClick={() => handleImportFileToSlot(slot)}
              disabled={isDisabled}
              className="text-xs text-purple-600 hover:text-purple-800 disabled:text-purple-300 disabled:cursor-not-allowed flex items-center transition-colors duration-150"
              title={`Import file content into ${slot}`}
              aria-label={`Import file content into ${slot}`}
            >
              <Icon name="document" className="w-3 h-3 mr-1" />
              <span>Import file</span>
            </button>
          </label>
          <div className="relative">
            <input
              id={inputId}
              type="text"
              value={currentSeed[slot] || ''}
              onChange={(e) => handleSlotChange(slot, e.target.value)}
              className={`w-full p-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200
                          ${hasError ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-700 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'}
                          ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              placeholder={`Enter ${slot} for Seed ${currentSeedIndex + 1}`}
              disabled={isDisabled}
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
            />
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
              <button
                type="button"
                onClick={() => handleImportFileToSlot(slot)}
                disabled={isDisabled}
                className="p-1 text-gray-400 hover:text-purple-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-full hover:bg-gray-100 transition-colors"
                title={`Import content from text file into ${slot}`}
                aria-label={`Import content from text file into ${slot}`}
              >
                <Icon name="upload" className="w-4 h-4" />
              </button>
            </div>
          </div>
          {hasError && (
            <p id={errorId} className="mt-1 text-xs text-red-600 font-medium">
              This field is required for Seed {currentSeedIndex + 1}.
            </p>
          )}
          {currentSeed[slot] && currentSeed[slot].length > 100 && (
            <p className="mt-1 text-xs text-gray-500">
              {currentSeed[slot].length.toLocaleString()} characters
            </p>
          )}
        </div>
      );
    });
  }, [template, currentSeed, currentSeedIndex, handleSlotChange, handleImportFileToSlot, isDisabled, validationErrors]);

  // Calculate total error count across all seeds
  const totalErrorCount = useMemo(() => {
    return Object.values(validationErrors).reduce((count, seedErrors) => count + Object.keys(seedErrors).length, 0);
  }, [validationErrors]);

  // Render the form if template exists, otherwise show a message
  if (!template) {
    return (
      <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500 text-center">Please select a template to generate content.</p>
      </div>
    );
  }
  
  // Render loading state until initialized to prevent flicker
  if (!isInitialized) {
     return (
       <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 flex justify-center items-center h-64">
         <Icon name="spinner" className="animate-spin h-8 w-8 text-primary-600" />
       </div>
     );
  }

  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200 relative">
      {/* Overlay and message for archived dataset */} 
      {selectedDataset?.archived && (
        <div className="absolute inset-0 bg-gray-100 bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
          <p className="text-center text-gray-600 font-medium p-4 bg-white m-3 rounded shadow border border-gray-200">
            <Icon name="archiveBox" className="h-5 w-5 inline-block mr-2 align-text-bottom text-gray-500" />
            Seed editing and generation are disabled for archived datasets.
          </p>
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className={`space-y-4 ${selectedDataset?.archived ? 'opacity-50' : ''}`}>
          <h3 className="text-lg font-medium text-gray-900">{template.name}</h3>
          {template.model_override && (
            <p className="text-xs text-gray-500 -mt-3 mb-2">
              (Using model: {template.model_override})
            </p>
          )}

          <div className="flex items-center justify-between p-2 bg-gray-100 rounded-md">
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                {currentSeedIndex + 1} of {seedList.length}
              </span>
              <button
                type="button"
                onClick={() => setIsSeedBankModalOpen(true)}
                disabled={isDisabled}
                className="ml-2 px-2 py-1 text-xs bg-teal-100 text-teal-700 border border-teal-300 rounded hover:bg-teal-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors duration-150"
                title="View and edit all seeds"
                aria-label="View and edit all seeds"
              >
                <Icon name="database" className="w-3 h-3 mr-1" />
              </button>
            </div>
            
            <div className="flex items-center space-x-1">
              {renderPaginationIndicators}

              {/* Import Button */}
              <button
                type="button"
                onClick={handleImportSeeds}
                disabled={isDisabled}
                className="px-2 py-1 text-xs bg-purple-100 text-purple-700 border border-purple-300 rounded hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors duration-150"
                title="Import seeds from JSON file"
                aria-label="Import seeds from JSON file"
              >
                <Icon name="upload" className="w-3 h-3" />
              </button>
              {/* Export Button */}
              <button
                type="button"
                onClick={handleExportSeeds}
                disabled={isDisabled || seedList.length === 0}
                className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 border border-indigo-300 rounded hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors duration-150"
                title="Export current seeds to JSON file"
                aria-label="Export current seeds to JSON file"
              >
                <Icon name="download" className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={addSeed}
                disabled={isDisabled}
                className="px-2 py-1 text-xs bg-green-100 text-green-700 border border-green-300 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors duration-150"
                title="Add new blank seed"
                aria-label="Add new blank seed"
              >
                <Icon name="plus" className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => !isDisabled && setIsAiModalOpen(true)}
                disabled={isDisabled || seedList.length < 1}
                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 border border-blue-300 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors duration-150"
                title="Generate more seeds using AI (requires >= 1 seed)"
                aria-label="Generate more seeds using AI"
              >
                {isParaphrasing ? (
                  <Icon name="spinner" className="animate-spin h-3 w-3 text-blue-700" />
                ) : (
                  <Icon name="sparkles" className="w-3 h-3" />
                )}
              </button>
              <button
                type="button"
                onClick={removeSeed}
                disabled={isDisabled || seedList.length <= 1}
                className="px-2 py-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded disabled:opacity-50 hover:bg-red-200 flex items-center space-x-1 transition-colors duration-150"
                title="Remove current seed"
                aria-label="Remove current seed"
              >
                <Icon name="trash" className="w-3 h-3" />
              </button>
              <div className="w-px h-4 bg-gray-300 mx-3" />
              <button
                type="button"
                onClick={() => navigateSeeds(-1)}
                disabled={isDisabled || currentSeedIndex === 0}
                className="p-1.5 text-xs bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50 flex items-center justify-center transition-colors duration-150"
                title="Previous Seed"
                aria-label="Previous Seed"
              >
                <Icon name="chevronLeft" className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigateSeeds(1)}
                disabled={isDisabled || currentSeedIndex === seedList.length - 1}
                className="p-1.5 text-xs bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50 flex items-center justify-center transition-colors duration-150"
                title="Next Seed"
                aria-label="Next Seed"
              >
                <Icon name="chevronRight" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {renderSeedFields}

          {totalErrorCount > 0 && (
             <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
               <Icon name="exclamationTriangle" className="h-4 w-4 inline-block mr-2 align-text-bottom" />
               Please fill in all required fields for {totalErrorCount} missing value{totalErrorCount !== 1 ? 's' : ''} across all seeds. Use the navigation controls above to check each seed.
             </div>
          )}

          {promptPreview && !totalErrorCount && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <label className="block text-xs font-medium text-gray-500 mb-1">Prompt Preview:</label>
              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{promptPreview}</p>
            </div>
          )}
          
          <div>
            <CustomSlider
              label="Variations per Seed"
              min={1}
              max={10}
              step={1}
              value={variationsPerSeed}
              onChange={(value) => !isDisabled && setVariationsPerSeed(value)}
              disabled={isDisabled}
              showValue={true}
            />
          </div>
          
          <div className="pt-2 flex space-x-2">
            <button
              type="submit"
              className="flex-grow py-2 px-4 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed transition-all duration-200 transform hover:shadow-md active:scale-[0.98]"
              disabled={isDisabled}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center">
                  <Icon name="spinner" className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                  Generating ({seedList.length * variationsPerSeed} Examples)... 
                </span>
              ) : isParaphrasing ? (
                <span className="flex items-center justify-center">
                  <Icon name="spinner" className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                  Generating Seeds...
                </span>
              ) : `Generate (${seedList.length * variationsPerSeed} Example${seedList.length * variationsPerSeed !== 1 ? 's' : ''})`}
            </button>
            {isGenerating && (
              <button
                type="button"
                onClick={onCancel}
                className="py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200"
                aria-label="Cancel generation"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </form>

      <AiSeedModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onGenerate={handleParaphraseSeeds}
        isGenerating={isParaphrasing}
      />
      
      <SeedBankModal 
        isOpen={isSeedBankModalOpen}
        onClose={() => setIsSeedBankModalOpen(false)}
        seedList={seedList}
        setSeedList={setSeedList}
        template={template}
        isDisabled={isDisabled}
        currentSeedIndex={currentSeedIndex}
        setCurrentSeedIndex={setCurrentSeedIndex}
      />
    </div>
  );
};

export default SeedForm;