import { useState, useEffect } from 'react';
import api from '../api/apiClient';
import CustomTextInput from './CustomTextInput';

const SystemPromptEditor = ({ value, onChange, templateId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Fetch prompt history when the component loads or templateId changes
  useEffect(() => {
    if (templateId && isExpanded) {
      fetchHistory();
    }
  }, [templateId, isExpanded]);

  // Fetch prompt history from API
  const fetchHistory = async () => {
    if (!templateId) return;
    
    setIsLoadingHistory(true);
    
    try {
      const data = await api.getTemplateHistory(templateId);
      setHistory(data);
    } catch (error) {
      console.error('Failed to fetch prompt history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Handle selecting a history item
  const handleSelectHistory = (historyItem) => {
    onChange(historyItem);
  };

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
          
          {templateId && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">History</h4>
              
              {isLoadingHistory ? (
                <div className="text-sm text-gray-500">Loading history...</div>
              ) : history.length === 0 ? (
                <div className="text-sm text-gray-500">No history available</div>
              ) : (
                <ul className="max-h-40 overflow-y-auto border border-gray-200 rounded-md divide-y">
                  {history.map((item, index) => (
                    <li
                      key={index}
                      className="p-2 text-sm cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSelectHistory(item)}
                    >
                      {item.length > 100 ? `${item.substring(0, 100)}...` : item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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