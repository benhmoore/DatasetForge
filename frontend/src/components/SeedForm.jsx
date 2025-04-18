import { useState, useEffect } from 'react';
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

  useEffect(() => {
    console.log('Template in SeedForm:', template);
    if (template && template.slots && Array.isArray(template.slots)) {
      const initialSlots = template.slots.reduce((acc, slot) => {
        if (typeof slot === 'string') {
          acc[slot] = '';
        } else {
          console.warn('Invalid slot format:', slot);
        }
        return acc;
      }, {});
      setSeedList([initialSlots]);
      setCurrentSeedIndex(0);
    } else {
      console.warn('Invalid template or slots:', template);
      setSeedList([{}]);
      setCurrentSeedIndex(0);
    }
  }, [template]);

  const currentSeed = seedList[currentSeedIndex] || {};

  const promptPreview = template && template.user_prompt && currentSeed
    ? generatePromptPreview(template.user_prompt, currentSeed)
    : '';

  console.log('Rendering SeedForm:');
  console.log('  Template:', template);
  console.log('  Current Seed:', currentSeed);
  console.log('  Prompt Preview:', promptPreview);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    let allValid = true;
    const validatedSeeds = seedList.map((seed, index) => {
      const currentSeedSlots = template?.slots || [];
      const missingSlots = currentSeedSlots.filter(slot => !seed[slot]?.trim());
      if (missingSlots.length > 0) {
        toast.error(`Seed ${index + 1} is missing values for: ${missingSlots.join(', ')}`);
        allValid = false;
      }
      const validatedSeedData = currentSeedSlots.reduce((acc, slot) => {
        acc[slot] = seed[slot] || '';
        return acc;
      }, {});
      return { slots: validatedSeedData };
    });

    if (!allValid) return;
    
    if (!template || template.id === undefined) {
      toast.error('No template selected. Please select a template first.');
      return;
    }
    
    onGenerate({
      template_id: template.id,
      seeds: validatedSeeds,
      count: variationsPerSeed
    });
  };
  
  const handleSlotChange = (slot, value) => {
    setSeedList(prevList => {
      const newList = [...prevList];
      newList[currentSeedIndex] = {
        ...newList[currentSeedIndex],
        [slot]: value
      };
      return newList;
    });
  };

  // Add a new seed (blank)
  const addSeed = () => {
    setSeedList(prevList => {
      const templateSlots = template?.slots || [];
      // Create a new blank seed object based on template slots
      const blankSeed = templateSlots.reduce((acc, slot) => {
        acc[slot] = ''; // Initialize each slot with an empty string
        return acc;
      }, {});

      const newList = [
        ...prevList,
        blankSeed // Add the new blank seed
      ];
      
      // Set the index to the newly added blank seed
      setCurrentSeedIndex(newList.length - 1);
      
      // Return the list with the new blank seed added
      return newList; 
    });
  };

  const removeSeed = () => {
    if (seedList.length <= 1) {
      toast.info("Cannot remove the last seed.");
      return;
    }
    setSeedList(prevList => {
      const newList = prevList.filter((_, index) => index !== currentSeedIndex);
      setCurrentSeedIndex(prevIndex => Math.min(prevIndex, newList.length - 1));
      return newList;
    });
  };

  const navigateSeeds = (direction) => {
    setCurrentSeedIndex(prevIndex => {
      const newIndex = prevIndex + direction;
      if (newIndex >= 0 && newIndex < seedList.length) {
        return newIndex;
      }
      return prevIndex;
    });
  };

  const handleParaphraseSeeds = async (count, instructions) => {
    if (!template || !template.id) {
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
      console.log('Sending data for paraphrasing:', payload);
      const response = await api.paraphraseSeeds(payload);
      
      if (response && Array.isArray(response.generated_seeds)) {
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
  };
  
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
            <span className="text-sm font-medium text-gray-700">
              Seed {currentSeedIndex + 1} of {seedList.length}
            </span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => navigateSeeds(-1)}
                disabled={currentSeedIndex === 0 || isGenerating || isParaphrasing}
                className="p-1.5 text-xs bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50 flex items-center justify-center"
                title="Previous Seed"
              >
                <Icon name="chevronLeft" className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigateSeeds(1)}
                disabled={currentSeedIndex === seedList.length - 1 || isGenerating || isParaphrasing}
                className="p-1.5 text-xs bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50 flex items-center justify-center"
                title="Next Seed"
              >
                <Icon name="chevronRight" className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={addSeed}
                disabled={isGenerating || isParaphrasing}
                className="px-2 py-1 text-xs bg-green-100 text-green-700 border border-green-300 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                title="Add new blank seed"
              >
                <Icon name="plus" className="w-3 h-3" />
                <span>Add</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(true)}
                disabled={seedList.length < 1 || isGenerating || isParaphrasing}
                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 border border-blue-300 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                title="Generate more seeds using AI (requires >= 1 seed)"
              >
                {isParaphrasing ? (
                  <>
                    <Icon name="spinner" className="animate-spin -ml-0.5 mr-1 h-3 w-3 text-blue-700" />
                    <span>AI...</span>
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" className="w-3 h-3" />
                    <span>AI</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={removeSeed}
                disabled={seedList.length <= 1 || isGenerating || isParaphrasing}
                className="px-2 py-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded disabled:opacity-50 hover:bg-red-200 flex items-center space-x-1"
                title="Remove current seed"
              >
                <Icon name="trash" className="w-3 h-3" />
                <span>Remove</span>
              </button>
            </div>
          </div>

          {template.slots.map(slot => (
            <div key={slot}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {slot.charAt(0).toUpperCase() + slot.slice(1)}
              </label>
              <input
                type="text"
                value={currentSeed[slot] || ''}
                onChange={(e) => handleSlotChange(slot, e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200"
                placeholder={`Enter ${slot} for Seed ${currentSeedIndex + 1}`}
                disabled={isGenerating || isParaphrasing}
              />
            </div>
          ))}

          {promptPreview && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <label className="block text-xs font-medium text-gray-500 mb-1">Prompt Preview:</label>
              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{promptPreview}</p>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Variations per Seed: {variationsPerSeed}
            </label>
            <input
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