import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

const SeedForm = ({ template, onGenerate, isGenerating }) => {
  const [slots, setSlots] = useState({});
  const [batchSize, setBatchSize] = useState(3);
  
  // Initialize slots when template changes
  useEffect(() => {
    if (template && template.slots) {
      // Create an object with empty strings for each slot
      const initialSlots = template.slots.reduce((acc, slot) => {
        acc[slot] = '';
        return acc;
      }, {});
      
      setSlots(initialSlots);
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
    
    // Call the onGenerate callback with slots and batch size
    onGenerate({
      templateId: template.id,
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
                className="w-full p-2 border border-gray-300 rounded-md"
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
              className="w-full py-2 px-4 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed"
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate Variations'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default SeedForm;