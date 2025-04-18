import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import PropTypes from 'prop-types';

const ToolCallEditor = ({ isOpen, toolCalls, onChange = () => {}, onClose }) => { // Default onChange to no-op
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEditText(JSON.stringify(toolCalls || [], null, 2));
    }
  }, [isOpen, toolCalls]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(editText);
      if (!Array.isArray(parsed)) {
        throw new Error('Tool calls must be an array.');
      }
      onChange(parsed);
      onClose();
    } catch (err) {
      console.error('Failed to parse tool calls JSON:', err);
      toast.error(`Invalid JSON format: ${err.message}`);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full shadow-lg">
        <h3 className="text-lg font-medium mb-4">Edit Tool Calls</h3>
        <textarea
          className="w-full h-64 p-2 border border-gray-300 rounded-md font-mono text-sm focus:ring-primary-500 focus:border-primary-500"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
        />
        <div className="mt-4 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

ToolCallEditor.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  toolCalls: PropTypes.array,
  onChange: PropTypes.func, // Make onChange optional
  onClose: PropTypes.func.isRequired,
};

export default ToolCallEditor;