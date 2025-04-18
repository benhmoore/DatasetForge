import { useState, useRef, useEffect } from 'react';
import { toast } from 'react-toastify';
import ToolCallEditor from './ToolCallEditor';

const VariationCard = ({ 
  variation, 
  output, 
  onStar, 
  onEdit, 
  onRegenerate, 
  onDismiss, 
  isStarred = false,
  isGenerating = false,
  error = null,
  tool_calls = null,
  processed_prompt = null,
  onToolCallsChange // new prop for tool calls editing
}) => {
  const [editedOutput, setEditedOutput] = useState(output);
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [regenerateInstruction, setRegenerateInstruction] = useState('');
  const regenerateInputRef = useRef(null);
  const [showPrompt, setShowPrompt] = useState(false);  // State to control prompt visibility
  const outputDisplayRef = useRef(null); // Ref for the output display area
  const [isToolEditorOpen, setIsToolEditorOpen] = useState(false); // state for tool-call editor modal

  // Focus the instruction input when the modal opens
  useEffect(() => {
    if (isRegenerateModalOpen && regenerateInputRef.current) {
      regenerateInputRef.current.focus();
    }
  }, [isRegenerateModalOpen]);

  // Start editing mode
  const startEditing = (e) => { // Accept event argument
    // Check if the click originated within the tool calls section
    if (e && e.target.closest('[data-testid="tool-calls-section"]')) {
      return; // Do nothing if click is inside tool calls
    }

    if (isGenerating || isEditing) return;
    // Ensure the editor starts with the current output value
    setEditedOutput(output);
    setIsEditing(true);
  };

  // Save the edited output
  const saveEdit = () => {
    if (editedOutput.trim() === '') {
      toast.error('Output cannot be empty. Edit cancelled.');
      // Revert changes and exit editing mode
      setEditedOutput(output);
      setIsEditing(false);
      return;
    }
    // Only call onEdit if the content actually changed
    if (editedOutput !== output) {
      onEdit(editedOutput);
    }
    setIsEditing(false);
  };

  // Handle output text change
  const handleOutputChange = (e) => {
    setEditedOutput(e.target.value);
  };

  // Function to render tool calls
  const renderToolCalls = (toolCalls) => {
    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
      return null;
    }
    return (
      <div 
        data-testid="tool-calls-section" 
        className="mt-2 pt-2 border-t border-gray-200 cursor-pointer" 
        onClick={(e) => { e.stopPropagation(); setIsToolEditorOpen(true); }} // open editor on click
      >
        <h5 className="text-xs font-medium text-gray-700 mb-1">Tool Calls:</h5>
        <div className="space-y-1">
          {toolCalls.map((call, index) => {
            let name = "Unknown Tool";
            let parameters = {};
            
            if (call.function && typeof call.function === 'object') {
              name = call.function.name || "Unknown Tool";
              try {
                parameters = typeof call.function.arguments === 'string' 
                  ? JSON.parse(call.function.arguments) 
                  : call.function.arguments || {};
              } catch (e) {
                console.error("Error parsing tool call arguments:", e);
                parameters = { error: "Failed to parse arguments", raw: call.function.arguments };
              }
            } else if (call.name) {
              name = call.name;
              parameters = call.parameters || {};
            }
            
            return (
              <div key={index} className="p-1 bg-blue-50 border border-blue-100 rounded text-xs">
                <div className="font-medium text-blue-700">{name}</div>
                <pre className="text-xs mt-1 whitespace-pre-wrap text-gray-700 overflow-x-auto">
                  {JSON.stringify(parameters, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Handle star button click
  const handleStar = () => {
    if (isGenerating) return;
    onStar(isEditing ? editedOutput : output);
  };

  // Handle regenerate button click
  const handleRegenerate = () => {
    if (isGenerating) return;
    setIsRegenerateModalOpen(true);
  };
  
  // Handle regenerate with instruction
  const handleRegenerateWithInstruction = () => {
    onRegenerate(regenerateInstruction);
    setIsRegenerateModalOpen(false);
    setRegenerateInstruction('');
  };
  
  // Handle regenerate modal key press
  const handleRegenerateKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleRegenerateWithInstruction();
    } else if (e.key === 'Escape') {
      setIsRegenerateModalOpen(false);
      setRegenerateInstruction('');
    }
  };

  // Render loading state
  if (isGenerating) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm transition-all duration-300 hover:shadow-md">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-medium text-gray-900">{variation}</h4>
          <div className="flex items-center space-x-1 text-sm">
            <svg className="animate-spin h-4 w-4 text-primary-500 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-gray-500">Generating...</span>
          </div>
        </div>
        <div className="w-full h-32 bg-gray-100 rounded">
          <div className="h-full w-full overflow-hidden relative">
            <div className="animate-pulse absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:400%_100%]"></div>
          </div>
        </div>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="p-4 bg-white rounded-lg border border-red-200 shadow-sm transform transition-all duration-300 hover:shadow-md">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-medium text-gray-900">{variation}</h4>
        <div className="flex space-x-1">
        <button
          onClick={onDismiss}
          className="text-red-500 hover:text-red-700 p-1 transition-colors"
          title="Dismiss"
        >
          <span className="inline-block hover:scale-110 transition-transform duration-200">🗑️</span>
        </button>
        </div>
      </div>
      <div className="p-3 bg-red-50 text-red-700 rounded border border-red-100 text-sm animate-fadeIn">
        {error}
      </div>
      </div>
    );
  }

  return (
    <div 
      className={`p-4 bg-white rounded-lg border ${
        isStarred 
          ? 'border-primary-200 ring-1 ring-primary-500' 
          : 'border-gray-200'
      } shadow-sm transform transition-all duration-200 hover:shadow-md ${
        isStarred ? 'scale-[1.01]' : 'hover:scale-[1.01]'
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-medium text-gray-900">{variation}</h4>
        <div className="flex space-x-1">
          <button
            onClick={handleStar}
            className={`p-1 transition-all duration-200 transform ${
              isStarred 
                ? 'text-yellow-500 scale-110 bg-yellow-50 rounded-full shadow-inner' 
                : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100 hover:rounded-full'
            }`}
            title={isStarred ? 'Unstar' : 'Star'}
          >
            <span className={`inline-block ${isStarred ? 'text-xl' : 'text-lg'}`}>
              {isStarred ? '⭐' : '☆'}
            </span>
          </button>
          <button
            onClick={handleRegenerate}
            className="text-primary-600 hover:text-primary-800 p-1 transition-colors"
            title="Regenerate"
          >
            <span className="inline-block hover:rotate-180 transition-transform duration-500">🔄</span>
          </button>
          <button
            onClick={onDismiss}
            className="text-red-500 hover:text-red-700 p-1 transition-colors"
            title="Dismiss"
          >
            <span className="inline-block hover:scale-110 transition-transform duration-200">🗑️</span>
          </button>
        </div>
      </div>
      
      {isEditing ? (
        <textarea
          ref={outputDisplayRef}
          value={editedOutput}
          onChange={handleOutputChange}
          onBlur={saveEdit}
          className="w-full p-2 border border-gray-300 rounded-md h-32 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200"
          placeholder="Output"
          autoFocus
        />
      ) : (
        <div
          ref={outputDisplayRef}
          onClick={startEditing}
          className="p-3 bg-gray-50 rounded border border-gray-100 text-sm whitespace-pre-wrap transition-all duration-200 hover:border-gray-200 cursor-pointer min-h-[5rem]"
        >
          {output}
          {renderToolCalls(tool_calls)}
        </div>
      )}

      {processed_prompt && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center"
          >
            {showPrompt ? (
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            ) : (
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            )}
            {showPrompt ? 'Hide Processed Prompt' : 'Show Processed Prompt'}
          </button>
          {showPrompt && (
            <div className="mt-2 p-2 bg-gray-100 rounded border border-gray-200 text-xs whitespace-pre-wrap font-mono">
              {processed_prompt}
            </div>
          )}
        </div>
      )}
      
      {isRegenerateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl animate-fadeIn">
            <h3 className="text-lg font-medium mb-4">Regenerate with Instructions</h3>
            <div className="mb-4">
              <input
                ref={regenerateInputRef}
                type="text"
                value={regenerateInstruction}
                onChange={(e) => setRegenerateInstruction(e.target.value)}
                onKeyDown={handleRegenerateKeyPress}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Provide additional instructions for the model (e.g., 'Make it more concise' or 'Add more detail')"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsRegenerateModalOpen(false);
                  setRegenerateInstruction('');
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateWithInstruction}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
              >
                Regenerate
              </button>
            </div>
            <div className="mt-4 text-sm text-gray-500">
              <p>Press Enter to regenerate or Escape to cancel.</p>
              <p className="mt-1">Leave empty for standard regeneration.</p>
            </div>
          </div>
        </div>
      )}

      <ToolCallEditor
        isOpen={isToolEditorOpen}
        toolCalls={tool_calls}
        onChange={onToolCallsChange}
        onClose={() => setIsToolEditorOpen(false)}
      />
    </div>
  );
};

export default VariationCard;