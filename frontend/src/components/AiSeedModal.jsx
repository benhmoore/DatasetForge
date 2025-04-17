import React, { useState } from 'react';

const AiSeedModal = ({ isOpen, onClose, onGenerate, isGenerating }) => {
  const [numSeedsToGenerate, setNumSeedsToGenerate] = useState(3);
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  const handleGenerateClick = () => {
    onGenerate(numSeedsToGenerate, additionalInstructions);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative p-5 border w-96 shadow-lg rounded-md bg-white">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Generate Seeds with AI</h3>
        
        {/* Number of Seeds Input */}
        <div className="mb-4">
          <label htmlFor="numSeeds" className="block text-sm font-medium text-gray-700 mb-1">
            Number of new seeds to generate:
          </label>
          <input
            type="number"
            id="numSeeds"
            name="numSeeds"
            min="1"
            max="20" // Set a reasonable max
            value={numSeedsToGenerate}
            onChange={(e) => setNumSeedsToGenerate(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            disabled={isGenerating}
          />
        </div>

        {/* Additional Instructions Textarea */}
        <div className="mb-4">
          <label htmlFor="additionalInstructions" className="block text-sm font-medium text-gray-700 mb-1">
            Additional Instructions (Optional):
          </label>
          <textarea
            id="additionalInstructions"
            name="additionalInstructions"
            rows="3"
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="e.g., Make the tone more formal, focus on feature X..."
            disabled={isGenerating}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
            disabled={isGenerating}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerateClick}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-wait flex items-center"
            disabled={isGenerating}
          >
            {isGenerating && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiSeedModal;
