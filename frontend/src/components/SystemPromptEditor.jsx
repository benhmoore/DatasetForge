import { useState } from 'react';
import CustomTextInput from './CustomTextInput';

const SystemPromptEditor = ({ value, onChange, templateId }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <label className="block text-sm font-medium text-gray-700">
          System Prompt
        </label>
        <button
          type="button"
          className="text-primary-600 hover:text-primary-800 text-sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      
      {isExpanded ? (
        <div className="space-y-2">
          <CustomTextInput
            value={value}
            onChange={(e) => onChange(e.target.value)}
            mode="multi"
            rows={6}
            placeholder="Enter system prompt"
            aiContext="You are assisting with writing a system prompt for an AI assistant. System prompts define the AI's role, behavior, and constraints."
            systemPrompt="Improve this system prompt to be more specific, detailed, and effective. Maintain the user's intent but enhance clarity, specificity, and helpfulness."
            collapsible={false}
            autoExpandThreshold={200}
          />
        </div>
      ) : (
        <div 
          className="p-2 border border-gray-300 rounded-md bg-gray-50 cursor-pointer"
          onClick={() => setIsExpanded(true)}
        >
          {value ? (
            <p className="text-sm line-clamp-2">{value}</p>
          ) : (
            <p className="text-sm text-gray-400">No system prompt set</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SystemPromptEditor;