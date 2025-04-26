import React, { useState, useEffect } from 'react';
import Icon from '../Icons';
import api from '../../api/apiClient';
import CustomTextInput from '../CustomTextInput';

const AiSeedModal = ({ isOpen, onClose, onGenerate, isGenerating }) => {
  const [numSeedsToGenerate, setNumSeedsToGenerate] = useState(3);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [paraModel, setParaModel] = useState('');

  // Fetch user preferences to show paraphrase model
  useEffect(() => {
    if (isOpen) {
      const fetchUserPreferences = async () => {
        try {
          const preferences = await api.getUserPreferences();
          setParaModel(preferences.default_para_model);
        } catch (error) {
          console.error('Failed to fetch user preferences:', error);
        }
      };
      fetchUserPreferences();
    }
  }, [isOpen]);

  const handleGenerateClick = () => {
    onGenerate(numSeedsToGenerate, additionalInstructions);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative p-5 border w-96 shadow-lg rounded-md bg-white">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Generate Seeds with AI</h3>
        
        {paraModel && (
          <p className="text-xs text-gray-500 -mt-3 mb-2">
            (Using paraphrase model: {paraModel})
          </p>
        )}
        
        {/* Number of Seeds Input */}
        <div className="mb-4">
          <CustomTextInput
            id="numSeeds"
            name="numSeeds"
            label="Number of new seeds to generate:"
            mode="single"
            value={numSeedsToGenerate.toString()}
            onChange={(e) => setNumSeedsToGenerate(Math.max(1, parseInt(e.target.value) || 1))}
            disabled={isGenerating}
            showAiActionButton={false}
            actionButtons={
              <>
                <button
                  type="button"
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors rounded-full"
                  onClick={() => setNumSeedsToGenerate(prev => Math.max(1, prev - 1))}
                  disabled={numSeedsToGenerate <= 1 || isGenerating}
                  title="Decrease"
                >
                  <Icon name="minus" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors rounded-full"
                  onClick={() => setNumSeedsToGenerate(prev => Math.min(20, prev + 1))}
                  disabled={numSeedsToGenerate >= 20 || isGenerating}
                  title="Increase"
                >
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </>
            }
            helpText="Enter a number between 1 and 20"
          />
        </div>

        {/* Additional Instructions Textarea */}
        <div className="mb-4">
          <CustomTextInput
            id="additionalInstructions"
            name="additionalInstructions"
            label="Additional Instructions (Optional):"
            mode="multi"
            rows={3}
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            placeholder="e.g., Make the tone more formal, focus on feature X..."
            disabled={isGenerating}
            aiContext="You are helping craft instructions for an AI seed generation process. Provide clear, specific guidance that will help create quality dataset seed examples."
            systemPrompt="Improve these instructions to be more specific, detailed, and helpful for generating high-quality dataset examples. Maintain the user's intent but make the instructions more effective."
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
            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-wait flex items-center"
            disabled={isGenerating}
          >
            {isGenerating && (
              <Icon name="refresh" className="animate-spin h-5 w-5 mr-2" aria-hidden="true" />
            )}
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiSeedModal;
