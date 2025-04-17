import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

// Define the helper function to generate the prompt preview
const generatePromptPreview = (promptTemplate, slotValues) => {
  if (!promptTemplate) return '';
  let preview = promptTemplate;
  // Match placeholders like {slot_name}
  const placeholders = promptTemplate.match(/\{([^}]+)\}/g) || [];

  placeholders.forEach(placeholder => {
    const slotName = placeholder.slice(1, -1); // Extract slot name like 'slot_name'
    const value = slotValues[slotName]?.trim();
    // Replace with value or a placeholder like [slot_name] if empty/undefined
    const replacement = value ? value : `[${slotName}]`;
    // Use a regex with 'g' flag to replace all occurrences, escaping special regex chars in the placeholder
    preview = preview.replace(new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), replacement);
  });

  return preview;
};

const SeedForm = ({ template, onGenerate, isGenerating }) => {
  // Store a list of seeds, each seed is an object with slot values
  const [seedList, setSeedList] = useState([{}]); 
  const [currentSeedIndex, setCurrentSeedIndex] = useState(0);
  const [variationsPerSeed, setVariationsPerSeed] = useState(3); // Renamed from batchSize
  
  // Initialize/Reset seeds when template changes
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
      // Reset to a single seed with the correct structure
      setSeedList([initialSlots]);
      setCurrentSeedIndex(0);
    } else {
      console.warn('Invalid template or slots:', template);
      setSeedList([{}]); // Reset to single empty seed if template is invalid
      setCurrentSeedIndex(0);
    }
  }, [template]);

  // Get current seed based on index
  const currentSeed = seedList[currentSeedIndex] || {};

  // Generate the prompt preview for the current seed
  const promptPreview = template && template.user_prompt && currentSeed // Changed template.prompt to template.user_prompt
    ? generatePromptPreview(template.user_prompt, currentSeed)
    : '';

  // Add logging here
  console.log('Rendering SeedForm:');
  console.log('  Template:', template);
  console.log('  Current Seed:', currentSeed);
  console.log('  Prompt Preview:', promptPreview);

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate all seeds
    let allValid = true;
    const validatedSeeds = seedList.map((seed, index) => {
      const currentSeedSlots = template?.slots || [];
      const missingSlots = currentSeedSlots.filter(slot => !seed[slot]?.trim());
      if (missingSlots.length > 0) {
        toast.error(`Seed ${index + 1} is missing values for: ${missingSlots.join(', ')}`);
        allValid = false;
      }
      // Ensure only defined slots are included
      const validatedSeedData = currentSeedSlots.reduce((acc, slot) => {
        acc[slot] = seed[slot] || '';
        return acc;
      }, {});
      return { slots: validatedSeedData }; // Match SeedData schema { slots: {...} }
    });

    if (!allValid) return;
    
    if (!template || template.id === undefined) {
      toast.error('No template selected. Please select a template first.');
      return;
    }
    
    // Call the onGenerate callback with the list of seeds and count per seed
    onGenerate({
      template_id: template.id,
      seeds: validatedSeeds, // Pass the array of seed data
      count: variationsPerSeed // Pass variations per seed
    });
  };
  
  // Handle slot value changes for the current seed
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

  // Add a new seed (copying the current one)
  const addSeed = () => {
    setSeedList(prevList => [
      ...prevList,
      { ...currentSeed } // Copy current seed values
    ]);
    // Optionally switch to the new seed
    // setCurrentSeedIndex(seedList.length);
  };

  // Remove the current seed
  const removeSeed = () => {
    if (seedList.length <= 1) {
      toast.info("Cannot remove the last seed.");
      return;
    }
    setSeedList(prevList => {
      const newList = prevList.filter((_, index) => index !== currentSeedIndex);
      // Adjust index if the last seed was removed
      setCurrentSeedIndex(prevIndex => Math.min(prevIndex, newList.length - 1));
      return newList;
    });
  };

  // Navigate between seeds
  const navigateSeeds = (direction) => {
    setCurrentSeedIndex(prevIndex => {
      const newIndex = prevIndex + direction;
      if (newIndex >= 0 && newIndex < seedList.length) {
        return newIndex;
      }
      return prevIndex; // Stay within bounds
    });
  };
  
  // If no template is selected, show a message
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

          {/* Seed Navigation and Management */}
          <div className="flex items-center justify-between p-2 bg-gray-100 rounded-md">
            <span className="text-sm font-medium text-gray-700">
              Seed {currentSeedIndex + 1} of {seedList.length}
            </span>
            <div className="flex items-center space-x-1">
              <button 
                type="button" 
                onClick={() => navigateSeeds(-1)} 
                disabled={currentSeedIndex === 0 || isGenerating}
                className="px-2 py-1 text-xs bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
              >
                Prev
              </button>
              <button 
                type="button" 
                onClick={() => navigateSeeds(1)} 
                disabled={currentSeedIndex === seedList.length - 1 || isGenerating}
                className="px-2 py-1 text-xs bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
              >
                Next
              </button>
              <button 
                type="button" 
                onClick={addSeed} 
                disabled={isGenerating}
                className="px-2 py-1 text-xs bg-green-100 text-green-700 border border-green-300 rounded hover:bg-green-200"
                title="Add new seed (copies current)"
              >
                + Add
              </button>
              <button 
                type="button" 
                onClick={removeSeed} 
                disabled={seedList.length <= 1 || isGenerating}
                className="px-2 py-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded disabled:opacity-50 hover:bg-red-200"
                title="Remove current seed"
              >
                - Remove
              </button>
            </div>
          </div>

          {/* Render slot inputs for the current seed */}
          {template.slots.map(slot => (
            <div key={slot}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {slot.charAt(0).toUpperCase() + slot.slice(1)}
              </label>
              <input
                type="text"
                value={currentSeed[slot] || ''} // Use currentSeed state
                onChange={(e) => handleSlotChange(slot, e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200"
                placeholder={`Enter ${slot} for Seed ${currentSeedIndex + 1}`}
                disabled={isGenerating}
              />
            </div>
          ))}

          {/* Prompt Preview Section */}
          {promptPreview && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <label className="block text-xs font-medium text-gray-500 mb-1">Prompt Preview:</label>
              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{promptPreview}</p>
            </div>
          )}
          
          {/* Variations per Seed slider */}
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
              disabled={isGenerating}
            />
          </div>
          
          {/* Generate button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-2 px-4 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed transition-all duration-200 transform hover:shadow-md active:scale-[0.98]"
              disabled={isGenerating}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating ({seedList.length} Seeds)... 
                </span>
              ) : `Generate (${seedList.length} Seeds)`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default SeedForm;