import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import Icon from './Icons';

const ExampleDetailModal = ({ isOpen, example, datasetId, onClose, onExampleUpdated }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedExample, setEditedExample] = useState(null);

  // Initialize edited example when the modal opens or when example changes
  useEffect(() => {
    if (example) {
      // Create a deep copy of the example to avoid reference issues
      setEditedExample(JSON.parse(JSON.stringify(example)));
      
      // Also reset editing state if example changes while modal is open
      if (isEditing) {
        setIsEditing(false);
      }
    }
  }, [example]);

  // If modal is not open or no example is provided, don't render anything
  if (!isOpen || !example) return null;

  // Handle input changes for system prompt, variation prompt, and output
  const handleInputChange = (field, value) => {
    setEditedExample(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle input changes for slots
  const handleSlotChange = (slotName, value) => {
    setEditedExample(prev => ({
      ...prev,
      slots: {
        ...prev.slots,
        [slotName]: value
      }
    }));
  };

  // Toggle edit mode
  const handleEdit = () => {
    setIsEditing(true);
  };

  // Cancel editing and reset to original values
  const handleCancel = () => {
    setEditedExample(JSON.parse(JSON.stringify(example)));
    setIsEditing(false);
  };

  // Save changes to the example
  const handleSave = async () => {
    if (!editedExample || !datasetId) return;
    
    setIsSaving(true);
    
    try {
      await api.updateExample(datasetId, example.id, editedExample);
      toast.success('Example updated successfully');
      setIsEditing(false);
      if (onExampleUpdated) {
        onExampleUpdated(editedExample);
      }
    } catch (error) {
      console.error('Failed to update example:', error);
      toast.error('Failed to update example');
    } finally {
      setIsSaving(false);
    }
  };

  // Get slot keys (if any)
  const slotKeys = example ? Object.keys(example.slots || {}) : [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {/* Make the modal container a flex column and set max height */}
      <div className="bg-white rounded-lg w-full max-w-4xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header - Make it non-shrinkable, add padding */}
        <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-semibold">Example Details</h2>
          <button
            className="text-gray-500 hover:text-gray-700"
            onClick={onClose}
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        {/* Content Area - Make it grow and scrollable, add padding */}
        <div className="space-y-4 flex-grow overflow-y-auto p-6">
          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              System Prompt
            </label>
            {isEditing ? (
              <textarea
                value={editedExample.system_prompt}
                onChange={(e) => handleInputChange('system_prompt', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                rows={4}
              />
            ) : (
              <div className="p-3 bg-gray-50 rounded-md whitespace-pre-wrap">
                {example.system_prompt}
              </div>
            )}
          </div>
          
          {/* User Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              User Prompt
            </label>
            {isEditing ? (
              <textarea
                value={editedExample.user_prompt}
                onChange={(e) => handleInputChange('user_prompt', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                rows={3}
              />
            ) : (
              <div className="p-3 bg-gray-50 rounded-md whitespace-pre-wrap">
                {example.user_prompt}
              </div>
            )}
          </div>

          {/* Slots */}
          {slotKeys.length > 0 && (
            <div>
              <h3 className="text-md font-medium text-gray-700 mb-2">Slots</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {slotKeys.map((slot) => (
                  <div key={slot}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {slot}
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedExample.slots[slot] || ''}
                        onChange={(e) => handleSlotChange(slot, e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                      />
                    ) : (
                      <div className="p-3 bg-gray-50 rounded-md">
                        {example.slots[slot] || ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Output
            </label>
            {isEditing ? (
              <textarea
                value={editedExample.output}
                onChange={(e) => handleInputChange('output', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                rows={6}
              />
            ) : (
              <div className="p-3 bg-gray-50 rounded-md whitespace-pre-wrap">
                {example.output}
              </div>
            )}
          </div>
          
          {/* Tool Calls */}
          {example.tool_calls && example.tool_calls.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tool Calls
              </label>
              <div className="p-3 bg-gray-50 rounded-md">
                {example.tool_calls.map((call, index) => {
                  // Extract function name and arguments based on the structure
                  let name = "Unknown Tool";
                  let args = {};
                  
                  if (call.function) {
                    // Standard OpenAI format
                    name = call.function.name || "Unknown Tool";
                    try {
                      args = typeof call.function.arguments === 'string' 
                        ? JSON.parse(call.function.arguments) 
                        : call.function.arguments || {};
                    } catch (e) {
                      console.error("Error parsing tool call arguments:", e);
                      args = { error: "Failed to parse", raw: call.function.arguments };
                    }
                  } else if (call.name) {
                    // Simple format with name and parameters directly
                    name = call.name;
                    args = call.parameters || {};
                  }
                  
                  return (
                    <div key={index} className="mb-2 pb-2 border-b border-gray-200 last:border-0">
                      <div className="font-medium text-blue-700">{name}</div>
                      <pre className="text-xs mt-1 bg-gray-100 p-2 rounded overflow-x-auto">
                        {JSON.stringify(args, null, 2)}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons - Make it non-shrinkable, add padding */}
        <div className="flex justify-end space-x-2 p-6 pt-4 border-t border-gray-200 flex-shrink-0">
          {isEditing ? (
            <>
              <button
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Icon name="spinner" className="animate-spin h-5 w-5 mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </>
          ) : (
            <>
              <button
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                onClick={onClose}
              >
                Close
              </button>
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                onClick={handleEdit}
              >
                Edit Example
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExampleDetailModal;