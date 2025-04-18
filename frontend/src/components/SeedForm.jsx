import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient'; // Correct: Import the default export 'api'
import AiSeedModal from './AiSeedModal'; // Import the new modal component
import Icon from './Icons'; // Import the Icon component

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

const SeedForm = ({ template, onGenerate, isGenerating, onCancel, isParaphrasing, setIsParaphrasing }) => {
  const [seedList, setSeedList] = useState([{}]); 
  const [currentSeedIndex, setCurrentSeedIndex] = useState(0);
  const [variationsPerSeed, setVariationsPerSeed] = useState(3);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

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

  // Reset state when template changes
  useEffect(() => {
    if (template?.slots && Array.isArray(template.slots)) {
      const initialSlots = createInitialSeed(template.slots);
      setSeedList([initialSlots]);
      setCurrentSeedIndex(0);
    } else {
      console.warn('Invalid template or slots:', template);
      setSeedList([{}]);
      setCurrentSeedIndex(0);
    }
  }, [template, createInitialSeed]);

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

  // Memoized validation function
  const validateSeeds = useCallback((seeds) => {
    if (!template?.slots) return { valid: false, validated: [] };
    
    let allValid = true;
    const validatedSeeds = seeds.map((seed, index) => {
      const missingSlots = template.slots.filter(slot => !seed[slot]?.trim());
      
      if (missingSlots.length > 0) {
        toast.error(`Seed ${index + 1} is missing values for: ${missingSlots.join(', ')}`);
        allValid = false;
      }
      
      return { 
        slots: template.slots.reduce((acc, slot) => {
          acc[slot] = seed[slot] || '';
          return acc;
        }, {})
      };
    });
    
    return { valid: allValid, validated: validatedSeeds };
  }, [template]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    
    const { valid, validated } = validateSeeds(seedList);
    if (!valid) return;
    
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
    setSeedList(prevList => {
      const newList = [...prevList];
      newList[currentSeedIndex] = {
        ...newList[currentSeedIndex],
        [slot]: value
      };
      return newList;
    });
  }, [currentSeedIndex]);

  // Add a new seed (blank)
  const addSeed = useCallback(() => {
    setSeedList(prevList => {
      const blankSeed = createInitialSeed(template?.slots);
      const newList = [...prevList, blankSeed];
      setCurrentSeedIndex(newList.length - 1);
      return newList;
    });
  }, [template, createInitialSeed]);

  const removeSeed = useCallback(() => {
    if (seedList.length <= 1) {
      toast.info("Cannot remove the last seed.");
      return;
    }
    
    setSeedList(prevList => {
      const newList = prevList.filter((_, index) => index !== currentSeedIndex);
      setCurrentSeedIndex(prevIndex => Math.min(prevIndex, newList.length - 1));
      return newList;
    });
  }, [seedList.length, currentSeedIndex]);

  const navigateSeeds = useCallback((direction) => {
    setCurrentSeedIndex(prevIndex => {
      const newIndex = prevIndex + direction;
      if (newIndex >= 0 && newIndex < seedList.length) {
        return newIndex;
      }
      return prevIndex;
    });
  }, [seedList.length]);
  
  // Navigate to first seed
  const navigateToFirstSeed = useCallback(() => {
    setCurrentSeedIndex(0);
  }, []);
  
  // Navigate to last seed
  const navigateToLastSeed = useCallback(() => {
    setCurrentSeedIndex(seedList.length - 1);
  }, [seedList.length]);

  const handleParaphraseSeeds = useCallback(async (count, instructions) => {
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
  }, [template, seedList, setIsParaphrasing]);

  // Memoize the pagination indicators to prevent unnecessary recalculations
  const renderPaginationIndicators = useMemo(() => {
    if (seedList.length <= 1) return null;
    
    return (
      <div className="flex items-center justify-center mx-2 relative">
        {/* Left edge indicator when there are more seeds to the left */}
        {seedList.length > 5 && currentSeedIndex > 0 && (
          <div 
            className="absolute left-0 top-1/2 transform -translate-y-1/2 h-2 flex items-center z-20 cursor-pointer"
            onClick={navigateToFirstSeed}
            title="Go to first seed"
            aria-label="Go to first seed"
            role="button"
            tabIndex={isGenerating || isParaphrasing ? -1 : 0}
            onKeyDown={(e) => e.key === 'Enter' && navigateToFirstSeed()}
          >
            <div className="w-1 h-full bg-gray-400"></div>
            <div className="absolute left-1 top-0 bottom-0 w-4 bg-gradient-to-r from-gray-100 to-transparent"></div>
          </div>
        )}
        
        <div className="flex items-center space-x-1 relative z-0 px-2">
            {/* Always show exactly 5 indicators regardless of seed count */}
            {Array.from({ length: 5 }, (_, i) => {
              if (seedList.length <= 5) {
                // For 5 or fewer seeds, each dot represents one seed
                // Hide dots that don't correspond to actual seeds
                return i < seedList.length ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentSeedIndex(i)}
                    className={`w-1.5 h-1.5 rounded-full ${
                      currentSeedIndex === i
                        ? 'bg-primary-600'
                        : 'bg-gray-300'
                    } transition-colors duration-150`}
                    title={`Go to seed ${i + 1}`}
                    aria-label={`Go to seed ${i + 1}`}
                    disabled={isGenerating || isParaphrasing}
                  />
                ) : null;
              } else {
                // For more than 5 seeds, divide into segments
                const segmentSize = seedList.length / 5;
                const segmentStart = Math.floor(i * segmentSize);
                const segmentEnd = Math.floor((i + 1) * segmentSize) - 1;
                
                // Check if current seed index falls within this segment
                const isActive = currentSeedIndex >= segmentStart && currentSeedIndex <= segmentEnd;
                
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentSeedIndex(segmentStart)}
                    className={`w-1.5 h-1.5 rounded-full ${
                      isActive ? 'bg-primary-600' : 'bg-gray-300'
                    } transition-colors duration-150`}
                    title={`Go to seeds ${segmentStart + 1}-${segmentEnd + 1}`}
                    aria-label={`Go to seeds ${segmentStart + 1}-${segmentEnd + 1}`}
                    disabled={isGenerating || isParaphrasing}
                  />
                );
              }
            })}
          </div>
        
        {/* Right edge indicator when there are more seeds to the right */}
        {seedList.length > 5 && currentSeedIndex < seedList.length - 1 && (
          <div 
            className="absolute right-0 top-1/2 transform -translate-y-1/2 h-2 flex items-center justify-end z-20 cursor-pointer"
            onClick={navigateToLastSeed}
            title="Go to last seed"
            aria-label="Go to last seed"
            role="button"
            tabIndex={isGenerating || isParaphrasing ? -1 : 0}
            onKeyDown={(e) => e.key === 'Enter' && navigateToLastSeed()}
          >
            <div className="w-1 h-full bg-gray-400"></div>
            <div className="absolute right-1 top-0 bottom-0 w-4 bg-gradient-to-l from-gray-100 to-transparent"></div>
          </div>
        )}
      </div>
    );
  }, [seedList.length, currentSeedIndex, navigateToFirstSeed, navigateToLastSeed, isGenerating, isParaphrasing]);

  // Memoize the seed form fields
  const renderSeedFields = useMemo(() => {
    if (!template?.slots) return null;
    
    return template.slots.map(slot => (
      <div key={slot} className="mb-3">
        <label htmlFor={`seed-${currentSeedIndex}-${slot}`} className="block text-sm font-medium text-gray-700 mb-1">
          {slot.charAt(0).toUpperCase() + slot.slice(1)}
        </label>
        <input
          id={`seed-${currentSeedIndex}-${slot}`}
          type="text"
          value={currentSeed[slot] || ''}
          onChange={(e) => handleSlotChange(slot, e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200"
          placeholder={`Enter ${slot} for Seed ${currentSeedIndex + 1}`}
          disabled={isGenerating || isParaphrasing}
        />
      </div>
    ));
  }, [template, currentSeed, currentSeedIndex, handleSlotChange, isGenerating, isParaphrasing]);

  // Render the form if template exists, otherwise show a message
  if (!template) {
    return (
      <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500 text-center">Please select a template to generate content.</p>
      </div>
    );
  }
  
  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200">
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">{template.name}</h3>
          {template.model_override && (
            <p className="text-xs text-gray-500 -mt-3 mb-2">
              (Using model: {template.model_override})
            </p>
          )}

          <div className="flex items-center justify-between p-2 bg-gray-100 rounded-md">
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Seed {currentSeedIndex + 1} of {seedList.length}
              </span>
            </div>
            
            <div className="flex items-center space-x-1">
              {renderPaginationIndicators}
              
              <button
                type="button"
                onClick={addSeed}
                disabled={isGenerating || isParaphrasing}
                className="px-2 py-1 text-xs bg-green-100 text-green-700 border border-green-300 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors duration-150"
                title="Add new blank seed"
                aria-label="Add new blank seed"
              >
                <Icon name="plus" className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(true)}
                disabled={seedList.length < 1 || isGenerating || isParaphrasing}
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
                disabled={seedList.length <= 1 || isGenerating || isParaphrasing}
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
                disabled={currentSeedIndex === 0 || isGenerating || isParaphrasing}
                className="p-1.5 text-xs bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50 flex items-center justify-center transition-colors duration-150"
                title="Previous Seed"
                aria-label="Previous Seed"
              >
                <Icon name="chevronLeft" className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigateSeeds(1)}
                disabled={currentSeedIndex === seedList.length - 1 || isGenerating || isParaphrasing}
                className="p-1.5 text-xs bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50 flex items-center justify-center transition-colors duration-150"
                title="Next Seed"
                aria-label="Next Seed"
              >
                <Icon name="chevronRight" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {renderSeedFields}

          {promptPreview && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <label className="block text-xs font-medium text-gray-500 mb-1">Prompt Preview:</label>
              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{promptPreview}</p>
            </div>
          )}
          
          <div>
            <label htmlFor="variations-slider" className="block text-sm font-medium text-gray-700 mb-1">
              Variations per Seed: {variationsPerSeed}
            </label>
            <input
              id="variations-slider"
              type="range"
              min="1"
              max="10"
              value={variationsPerSeed}
              onChange={(e) => setVariationsPerSeed(parseInt(e.target.value))}
              className="w-full"
              disabled={isGenerating || isParaphrasing}
            />
          </div>
          
          <div className="pt-2 flex space-x-2">
            <button
              type="submit"
              className="flex-grow py-2 px-4 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed transition-all duration-200 transform hover:shadow-md active:scale-[0.98]"
              disabled={isGenerating || isParaphrasing}
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
    </div>
  );
};

export default SeedForm;