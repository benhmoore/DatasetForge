import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import ToolCallEditor from './ToolCallEditor';
import Icon from './Icons';

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
  onToolCallsChange
}) => {
  // State management
  const [editedOutput, setEditedOutput] = useState(output);
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [regenerateInstruction, setRegenerateInstruction] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [isToolEditorOpen, setIsToolEditorOpen] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState('8rem');
  
  // Refs
  const regenerateInputRef = useRef(null);
  const outputDisplayRef = useRef(null);
  const textareaRef = useRef(null);

  // Update edited output when the output prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditedOutput(output);
    }
  }, [output, isEditing]);
  
  // Focus the instruction input when the regenerate modal opens
  useEffect(() => {
    if (isRegenerateModalOpen && regenerateInputRef.current) {
      regenerateInputRef.current.focus();
    }
  }, [isRegenerateModalOpen]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = 'auto';
      // Set to scrollHeight to fit content (+ small buffer)
      const newHeight = `${Math.max(textareaRef.current.scrollHeight + 5, 128)}px`;
      textareaRef.current.style.height = newHeight;
      setTextareaHeight(newHeight);
    }
  }, [editedOutput, isEditing]);

  // Handle escape key to exit modal or editing mode
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (isRegenerateModalOpen) {
          setIsRegenerateModalOpen(false);
          setRegenerateInstruction('');
        } else if (isEditing) {
          // Cancel editing and revert to original output
          setEditedOutput(output);
          setIsEditing(false);
        } else if (isToolEditorOpen) {
          setIsToolEditorOpen(false);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isRegenerateModalOpen, isEditing, isToolEditorOpen, output]);

  // Memoized handler for starting edit mode
  const startEditing = useCallback((e) => {
    // Prevent editing if generating, already editing, or clicked on tool calls section
    if (isGenerating || isEditing || (e && e.target.closest('[data-testid="tool-calls-section"]'))) {
      return;
    }
    
    // Ensure the editor starts with current output value
    setEditedOutput(output);
    setIsEditing(true);
  }, [isGenerating, isEditing, output]);

  // Save the edited output with validation
  const saveEdit = useCallback(() => {
    const trimmedOutput = editedOutput.trim();
    
    if (trimmedOutput === '') {
      toast.error('Output cannot be empty. Edit cancelled.');
      // Revert changes and exit editing mode
      setEditedOutput(output);
      setIsEditing(false);
      return;
    }
    
    // Only call onEdit if content changed
    if (trimmedOutput !== output.trim()) {
      onEdit(trimmedOutput);
    }
    
    setIsEditing(false);
  }, [editedOutput, output, onEdit]);

  // Handle output text change
  const handleOutputChange = useCallback((e) => {
    setEditedOutput(e.target.value);
  }, []);

  // Render tool calls section
  const renderToolCalls = useCallback((toolCalls) => {
    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
      return null;
    }
    
    return (
      <div 
        data-testid="tool-calls-section" 
        className="mt-2 pt-2 border-t border-gray-200 cursor-pointer transition-colors duration-200 hover:bg-blue-50" 
        onClick={(e) => { 
          e.stopPropagation(); 
          setIsToolEditorOpen(true); 
        }}
        role="button"
        aria-label="Edit tool calls"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsToolEditorOpen(true);
          }
        }}
      >
        <div className="flex items-center mb-1">
          <h5 className="text-xs font-medium text-gray-700">Tool Calls:</h5>
          <span className="ml-auto text-xs text-blue-600 flex items-center">
            <Icon name="edit" className="h-3 w-3 mr-1" aria-hidden="true" />
            Edit
          </span>
        </div>
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
              <div key={index} className="p-1.5 bg-blue-50 border border-blue-100 rounded text-xs">
                <div className="font-medium text-blue-700">{name}</div>
                <pre className="text-xs mt-1 whitespace-pre-wrap text-gray-700 overflow-x-auto max-h-32 scrollbar-thin scrollbar-thumb-gray-300">
                  {JSON.stringify(parameters, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, []);

  // Handler for star button
  const handleStar = useCallback(() => {
    if (isGenerating) return;
    onStar(isEditing ? editedOutput : output);
  }, [isGenerating, isEditing, editedOutput, output, onStar]);

  // Handler for regenerate button
  const handleRegenerate = useCallback(() => {
    if (isGenerating) return;
    setIsRegenerateModalOpen(true);
  }, [isGenerating]);
  
  // Regenerate with instruction
  const handleRegenerateWithInstruction = useCallback(() => {
    onRegenerate(regenerateInstruction);
    setIsRegenerateModalOpen(false);
    setRegenerateInstruction('');
  }, [regenerateInstruction, onRegenerate]);
  
  // Handle key press in regenerate modal
  const handleRegenerateKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleRegenerateWithInstruction();
    }
  }, [handleRegenerateWithInstruction]);

  // Conditional rendering for loading state
  if (isGenerating) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm transition-all duration-300 hover:shadow-md">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-medium text-gray-900">{variation}</h4>
          <div className="flex items-center space-x-1 text-sm">
            <Icon
              name="spinner"
              className="animate-spin h-4 w-4 text-primary-500 mr-1"
              aria-hidden="true"
            />
            <span className="text-gray-500">Generating...</span>
          </div>
        </div>
        <div className="w-full h-32 bg-gray-100 rounded overflow-hidden">
          <div className="h-full w-full relative">
            <div className="animate-pulse absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:400%_100%] animate-shimmer"></div>
          </div>
        </div>
      </div>
    );
  }
  
  // Conditional rendering for error state
  if (error) {
    return (
      <div className="p-4 bg-white rounded-lg border border-red-200 shadow-sm transition-all duration-300 hover:shadow-md relative" role="alert">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-medium text-gray-900">{variation}</h4>
          <div className="flex space-x-1">
            <button
              onClick={onDismiss}
              className="text-red-500 hover:text-red-700 p-1 transition-colors"
              title="Dismiss"
              aria-label="Dismiss error"
            >
              <Icon name="trash" className="h-4 w-4 inline-block hover:scale-110 transition-transform duration-200" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="p-3 bg-red-50 text-red-700 rounded border border-red-100 text-sm animate-fadeIn">
          <Icon name="alert" className="h-4 w-4 inline-block mr-1.5 text-red-600" aria-hidden="true" />
          {error}
        </div>
      </div>
    );
  }

  // Main render for normal state
  return (
    <div 
      className={`p-4 bg-white rounded-lg border ${
        isStarred 
          ? 'border-primary-200 ring-1 ring-primary-500' 
          : 'border-gray-200'
      } shadow-sm transition-all duration-200 hover:shadow-md ${
        isStarred ? 'scale-[1.01]' : 'hover:scale-[1.01]'
      } relative`}
    >
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-medium text-gray-900 truncate max-w-[75%]" title={variation}>{variation}</h4>
        <div className="flex space-x-1">
          <button
            onClick={handleStar}
            className={`p-1 transition-all duration-200 transform ${
              isStarred 
                ? 'text-yellow-500 scale-110' 
                : 'text-gray-400 hover:text-yellow-500'
            }`}
            title={isStarred ? 'Unstar' : 'Star'}
            aria-label={isStarred ? 'Unstar variation' : 'Star variation'}
            aria-pressed={isStarred}
          >
            <Icon
              name="star"
              variant={isStarred ? 'solid' : 'outline'}
              className="inline-block h-5 w-5"
              aria-hidden="true"
            />
          </button>
          <button
            onClick={handleRegenerate}
            className="text-primary-600 hover:text-primary-800 p-1 transition-colors"
            title="Regenerate"
            aria-label="Regenerate output"
            disabled={isGenerating}
          >
            <Icon 
              name="refresh" 
              className="h-4 w-4 inline-block hover:rotate-180 transition-transform duration-500" 
              aria-hidden="true" 
            />
          </button>
          <button
            onClick={onDismiss}
            className="text-red-500 hover:text-red-700 p-1 transition-colors"
            title="Dismiss"
            aria-label="Dismiss variation"
          >
            <Icon 
              name="trash" 
              className="h-4 w-4 inline-block hover:scale-110 transition-transform duration-200" 
              aria-hidden="true" 
            />
          </button>
        </div>
      </div>
      
      {isEditing ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={editedOutput}
            onChange={handleOutputChange}
            onBlur={saveEdit}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200 scrollbar-thin scrollbar-thumb-gray-300"
            placeholder="Output"
            autoFocus
            style={{ height: textareaHeight, minHeight: '8rem' }}
          />
          <div className="absolute bottom-4 right-4 flex space-x-1">
            <button
              onClick={() => {
                setEditedOutput(output);
                setIsEditing(false);
              }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded"
              title="Cancel"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="bg-primary-100 hover:bg-primary-200 text-primary-700 text-xs px-2 py-1 rounded"
              title="Save"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={outputDisplayRef}
          onClick={startEditing}
          className="p-3 bg-gray-50 rounded border border-gray-100 text-sm whitespace-pre-wrap transition-all duration-200 hover:border-gray-200 hover:bg-gray-75 cursor-pointer min-h-[5rem] max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300"
          role="button"
          aria-label="Edit output"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              startEditing(e);
            }
          }}
        >
          {output || <span className="text-gray-400 italic">No output</span>}
          {renderToolCalls(tool_calls)}
        </div>
      )}

      {processed_prompt && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center group"
            aria-expanded={showPrompt}
            aria-controls="processed-prompt"
          >
            <Icon
              name={showPrompt ? 'chevronUp' : 'chevronDown'}
              className="w-3 h-3 mr-1 inline-block group-hover:text-primary-500 transition-colors"
              aria-hidden="true"
            />
            {showPrompt ? 'Hide Processed Prompt' : 'Show Processed Prompt'}
          </button>
          {showPrompt && (
            <div 
              id="processed-prompt"
              className="mt-2 p-2 bg-gray-100 rounded border border-gray-200 text-xs whitespace-pre-wrap font-mono max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300"
            >
              {processed_prompt}
            </div>
          )}
        </div>
      )}
      
      {isRegenerateModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsRegenerateModalOpen(false);
              setRegenerateInstruction('');
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="regenerate-modal-title"
        >
          <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl animate-fadeIn" onClick={e => e.stopPropagation()}>
            <h3 id="regenerate-modal-title" className="text-lg font-medium mb-4">Regenerate with Instructions</h3>
            <div className="mb-4">
              <input
                ref={regenerateInputRef}
                type="text"
                value={regenerateInstruction}
                onChange={(e) => setRegenerateInstruction(e.target.value)}
                onKeyDown={handleRegenerateKeyPress}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Provide additional instructions (e.g., 'Make it more concise')"
                aria-label="Regeneration instructions"
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
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
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