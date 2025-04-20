import React from 'react';

const VariationActions = ({ 
  saveButtonText, 
  isSaveButtonDisabled, 
  onSave,
  clearButtonText, 
  isClearButtonDisabled, 
  onClear 
}) => {
  return (
    <div className="space-y-2">
      {/* Save Button */}
      <div>
        <button
          onClick={onSave}
          className={`w-full py-2 px-4 text-white rounded-md transition-colors duration-200 ${
            saveButtonText.includes('Selected') 
              ? 'bg-green-600 hover:bg-green-700' 
              : 'bg-blue-600 hover:bg-blue-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          disabled={isSaveButtonDisabled}
        >
          {saveButtonText}
        </button>
      </div>

      {/* Clear Button */}
      <div className="text-center">
        <button
          onClick={onClear}
          className={`py-1 px-2 rounded-md transition-colors duration-200 text-sm ${
            clearButtonText.includes('Selected') 
              ? 'text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100' 
              : 'text-red-600 hover:text-red-800 hover:bg-red-100'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          disabled={isClearButtonDisabled}
          title={clearButtonText.includes('Selected') 
            ? 'Deselect all currently selected variations' 
            : 'Remove all variations from the list'}
        >
          {clearButtonText}
        </button>
      </div>
    </div>
  );
};

export default VariationActions;