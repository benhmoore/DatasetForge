import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

const SeedForm = ({ template, onGenerate, isGenerating }) => {
  const [slots, setSlots] = useState({});
  const [batchSize, setBatchSize] = useState(3);
  
  // Initialize slots when template changes
  useEffect(() => {
    console.log('Template in SeedForm:', template);
    
    if (template && template.slots && Array.isArray(template.slots)) {
      // Create an object with empty strings for each slot
      const initialSlots = template.slots.reduce((acc, slot) => {
        if (typeof slot === 'string') {
          acc[slot] = '';
        } else {
          console.warn('Invalid slot format:', slot);
        }
        return acc;
      }, {});
      
      console.log('Initialized slots:', initialSlots);
      setSlots(initialSlots);
    } else {
      console.warn('Invalid template or slots:', template);
      setSlots({});
    }
  }, [template]);
  
  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate slots
    const emptySlots = Object.entries(slots)
      .filter(([_, value]) => !value.trim())
      .map(([key]) => key);
    
    if (emptySlots.length > 0) {
      toast.error(`Please fill in all slots: ${emptySlots.join(', ')}`);
      return;
    }
    
    // Make sure template and template.id exist
    if (!template || template.id === undefined) {
      toast.error('No template selected. Please select a template first.');
      return;
    }
    
    // Call the onGenerate callback with slots and batch size
    // IMPORTANT: Use template_id (with underscore) to match backend API schema
    onGenerate({
      template_id: template.id,
      slots,
      count: batchSize
    });
  };
  
  // Handle slot value changes
  const handleSlotChange = (slot, value) => {
    setSlots(prevSlots => ({
      ...prevSlots,
      [slot]: value
    }));
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
          {/* Add note for model override */}
          {template.model_override && (
            <p className="text-xs text-gray-500 -mt-3 mb-2">
              (Using model: {template.model_override})
            </p>
          )}

          {/* Render slot inputs */}
          {template.slots.map(slot => (
            <div key={slot}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {slot.charAt(0).toUpperCase() + slot.slice(1)}
              </label>
              <input
                type="text"
                value={slots[slot] || ''}
                onChange={(e) => handleSlotChange(slot, e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200"
                placeholder={`Enter ${slot}`}
                disabled={isGenerating}
              />
            </div>
          ))}
          
          {/* Batch size slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Batch Size: {batchSize}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value))}
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
                  Generating...
                </span>
              ) : 'Generate Variations'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default SeedForm;