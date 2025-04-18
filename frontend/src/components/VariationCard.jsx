import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import ToolCallEditor from './ToolCallEditor';
import Icon from './Icons';
import api from '../api/apiClient';

const VariationCard = ({ 
  id, // Added id prop
  variation, 
  output, 
  onSelect, // Changed from onStar
  onEdit, 
  onRegenerate, 
  onDismiss, 
  isSelected = false, // Changed from isStarred
  isGenerating = false,
  error = null,
  tool_calls = null,
  processed_prompt = null,
  onToolCallsChange,
  template_id = null // Added template_id for paraphrasing
}) => {
  // State management
  const [editedOutput, setEditedOutput] = useState(output);
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [regenerateInstruction, setRegenerateInstruction] = useState('');
  const [isParaphraseModalOpen, setIsParaphraseModalOpen] = useState(false);
  const [paraphraseInstruction, setParaphraseInstruction] = useState('');
  const [paraphraseCount, setParaphraseCount] = useState(3);
  const [isParaphrasing, setIsParaphrasing] = useState(false);
  const [paraphrasedOutputs, setParaphrasedOutputs] = useState([]);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isToolEditorOpen, setIsToolEditorOpen] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState('8rem');
  
  // Refs
  const regenerateInputRef = useRef(null);
  const paraphraseInputRef = useRef(null);
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

  // Focus the paraphrase input when the paraphrase modal opens
  useEffect(() => {
    if (isParaphraseModalOpen && paraphraseInputRef.current) {
      paraphraseInputRef.current.focus();
    }
  }, [isParaphraseModalOpen]);

  // Handle escape key to exit modal or editing mode
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (isRegenerateModalOpen) {
          setIsRegenerateModalOpen(false);
          setRegenerateInstruction('');
        } else if (isParaphraseModalOpen) {
          setIsParaphraseModalOpen(false);
          setParaphraseInstruction('');
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
  }, [isRegenerateModalOpen, isParaphraseModalOpen, isEditing, isToolEditorOpen, output]);

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

  // Render tool calls section with improved UI and error handling
  const renderToolCalls = useCallback((toolCalls) => {
    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
      return null;
    }
    
    return (
      <div 
        data-testid="tool-calls-section" 
        className="mt-3 pt-3 border-t border-gray-200 transition-colors duration-200" 
      >
        <div 
          className="flex items-center mb-2 hover:bg-blue-50 p-1 rounded cursor-pointer"
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
          <h5 className="text-sm font-medium text-gray-700 flex items-center">
            <Icon name="tool" className="h-4 w-4 mr-1 text-blue-600" aria-hidden="true" />
            Tool Calls 
            <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
              {toolCalls.length}
            </span>
          </h5>
          <span className="ml-auto text-xs text-blue-600 flex items-center">
            <Icon name="edit" className="h-3 w-3 mr-1" aria-hidden="true" />
            Edit
          </span>
        </div>
        
        <div className="space-y-2">
          {toolCalls.map((call, index) => {
            // Extract function name and arguments based on structure
            let name = "Unknown Tool";
            let parameters = {};
            let error = null;
            
            try {
              if (call.function && typeof call.function === 'object') {
                // Standard OpenAI format
                name = call.function.name || "Unknown Tool";
                
                if (typeof call.function.arguments === 'string') {
                  try {
                    parameters = JSON.parse(call.function.arguments);
                  } catch (e) {
                    // Handle unparseable arguments
                    error = `Invalid JSON in arguments: ${e.message}`;
                    parameters = { _raw: call.function.arguments };
                  }
                } else {
                  parameters = call.function.arguments || {};
                }
              } else if (call.name) {
                // Simplified format
                name = call.name;
                parameters = call.parameters || call.arguments || {};
              } else if (call.function_call) {
                // Alternative OpenAI format
                name = call.function_call.name || "Unknown Tool";
                if (typeof call.function_call.arguments === 'string') {
                  try {
                    parameters = JSON.parse(call.function_call.arguments);
                  } catch (e) {
                    error = `Invalid JSON in arguments: ${e.message}`;
                    parameters = { _raw: call.function_call.arguments };
                  }
                } else {
                  parameters = call.function_call.arguments || {};
                }
              } else if (call.tool_use) {
                // Claude format
                name = call.tool_use.name || "Unknown Tool";
                parameters = call.tool_use.parameters || {};
              } else {
                error = "Unrecognized tool call format";
              }
            } catch (e) {
              console.error("Error processing tool call:", e);
              error = `Failed to process tool call: ${e.message}`;
            }
            
            // Count parameters for badge
            const paramCount = Object.keys(parameters).length;
            
            return (
              <div 
                key={index} 
                className={`p-2 ${error ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-100'} rounded-md text-xs hover:shadow-sm transition-shadow`}
              >
                <div className="flex justify-between items-center">
                  <div className="font-medium text-blue-700 flex items-center">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-200 text-blue-800 text-xs font-medium mr-2">
                      {index + 1}
                    </span>
                    {name}
                    {paramCount > 0 && (
                      <span className="ml-2 bg-blue-200 text-blue-800 text-xs px-1.5 py-0.5 rounded">
                        {paramCount} param{paramCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setIsToolEditorOpen(true); 
                    }}
                    className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100"
                    aria-label="Edit tool calls"
                  >
                    <Icon name="edit" className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
                
                {error && (
                  <div className="mt-1 text-red-600 bg-red-50 p-1 rounded border border-red-200 flex items-start">
                    <Icon name="alert" className="h-3 w-3 text-red-600 mt-0.5 mr-1 flex-shrink-0" />
                    <span className="text-xs">{error}</span>
                  </div>
                )}
                
                <div 
                  className="mt-1 overflow-hidden transition-all duration-300 bg-white bg-opacity-50 rounded border border-blue-100 p-1"
                >
                  <pre className="text-xs whitespace-pre-wrap text-gray-700 overflow-x-auto max-h-32 scrollbar-thin scrollbar-thumb-gray-300">
                    {JSON.stringify(parameters, null, 2)}
                  </pre>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, []);

  // Handler for selection button/area
  const handleSelect = useCallback(() => {
    if (isGenerating || isEditing) return; // Prevent selection change during generation or editing
    onSelect(id, isEditing ? editedOutput : output); // Pass id and current output
  }, [isGenerating, isEditing, id, editedOutput, output, onSelect]);

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

  // Handler for paraphrase button
  const handleParaphrase = useCallback(() => {
    if (isGenerating || isParaphrasing) return;
    setIsParaphraseModalOpen(true);
  }, [isGenerating, isParaphrasing]);
  
  // Paraphrase with instruction
  const handleParaphraseWithInstruction = useCallback(async () => {
    if (!template_id) {
      toast.error('Cannot paraphrase: No template ID provided.');
      return;
    }

    try {
      setIsParaphrasing(true);
      setParaphrasedOutputs([]);
      
      // Create a seed structure with output as the content
      const seeds = [{
        slots: {
          content: output
        }
      }];
      
      const response = await api.paraphraseSeeds({
        template_id,
        seeds,
        count: paraphraseCount,
        instructions: paraphraseInstruction || undefined
      });
      
      if (response && response.generated_seeds && response.generated_seeds.length > 0) {
        const paraphrased = response.generated_seeds.map(seed => seed.slots.content);
        setParaphrasedOutputs(paraphrased);
      } else {
        toast.warning('No paraphrases were generated.');
      }
    } catch (error) {
      console.error('Paraphrase error:', error);
      toast.error(`Failed to generate paraphrases: ${error.message || 'Unknown error'}`);
    } finally {
      setIsParaphrasing(false);
    }
  }, [template_id, output, paraphraseCount, paraphraseInstruction]);
  
  // Handle selecting a paraphrased output
  const handleSelectParaphrase = useCallback((text) => {
    onEdit(text);
    setIsParaphraseModalOpen(false);
    setParaphraseInstruction('');
    setParaphrasedOutputs([]);
  }, [onEdit]);
  
  // Handle key press in paraphrase modal
  const handleParaphraseKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleParaphraseWithInstruction();
    }
  }, [handleParaphraseWithInstruction]);

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
        isSelected 
          ? 'border-primary-300 ring-2 ring-primary-200' // Style for selected
          : 'border-gray-200'
      } shadow-sm transition-all duration-200 hover:shadow-md ${
        isSelected ? 'scale-[1.01]' : 'hover:scale-[1.01]'
      } relative cursor-pointer`} // Add cursor-pointer, ensure relative positioning
      onClick={handleSelect} // Make the whole card clickable for selection
      role="checkbox" // Role for accessibility
      aria-checked={isSelected} // State for accessibility
      tabIndex={0} // Make it focusable
      onKeyDown={(e) => { // Allow selection with Space key
        if (e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      }}
    >
      {/* Dimming overlay when editing */}
      {isEditing && (
        <div 
          className="absolute inset-0 bg-black bg-opacity-30 rounded-lg z-10" 
          onClick={(e) => { 
            e.stopPropagation(); // Prevent clicks on overlay from cancelling edit
            // Optionally, could cancel edit here if desired:
            // setEditedOutput(output); 
            // setIsEditing(false);
          }}
          aria-hidden="true" // Hide from screen readers
        />
      )}

      {/* Card Content - Needs higher z-index than overlay */}
      <div className="relative z-20"> 
        <div className="flex justify-between items-center mb-2">
          <h4 
            className="font-medium text-gray-900 truncate max-w-[75%]" 
            title={variation}
            onClick={(e) => e.stopPropagation()} // Prevent title click from toggling selection
          >
            {variation}
          </h4>
          <div className="flex space-x-1 items-center" onClick={(e) => e.stopPropagation()} /* Prevent button clicks from toggling selection */>
            {/* Selection Indicator - Made clickable */}
            <button 
              onClick={(e) => { 
                e.stopPropagation(); // Prevent card click
                handleSelect(); // Call the selection handler directly
              }}
              className={`flex items-center justify-center h-4 w-4 rounded border ${
                isSelected ? 'bg-primary-500 border-primary-600' : 'border-gray-300 bg-white'
              } transition-colors duration-200 mr-1 p-0 focus:outline-none focus:ring-1 focus:ring-primary-400`} // Added focus style
              aria-label={isSelected ? 'Deselect variation' : 'Select variation'} // ARIA label
              title={isSelected ? 'Deselect' : 'Select'} // Tooltip
            >
              {isSelected && <Icon name="check" className="h-3 w-3 text-white" />}
            </button>
            {/* Regenerate Button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleRegenerate(); }} // Stop propagation
              className="text-primary-600 hover:text-primary-800 p-1 transition-colors"
              title="Regenerate"
              aria-label="Regenerate output"
              disabled={isGenerating || isParaphrasing}
            >
              <Icon 
                name="refresh" 
                className="h-4 w-4 inline-block hover:rotate-180 transition-transform duration-500" 
                aria-hidden="true" 
              />
            </button>
            {/* Paraphrase Button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleParaphrase(); }} // Stop propagation
              className="text-primary-600 hover:text-primary-800 p-1 transition-colors"
              title="Paraphrase"
              aria-label="Paraphrase output"
              disabled={isGenerating || isParaphrasing || !template_id}
            >
              <Icon 
                name="language" 
                className="h-4 w-4 inline-block hover:scale-110 transition-transform duration-200" 
                aria-hidden="true" 
              />
            </button>
            {/* Dismiss Button */}
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(); }} // Stop propagation
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
          // Ensure the editing area is above the overlay
          <div className="relative z-30" onClick={(e) => e.stopPropagation()} /* Prevent clicks inside editor from toggling selection */>
            <textarea
              ref={textareaRef}
              value={editedOutput}
              onChange={handleOutputChange}
              // Removed onBlur={saveEdit} - Save is now explicit via button
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200 scrollbar-thin scrollbar-thumb-gray-300"
              placeholder="Output"
              autoFocus
              style={{ height: textareaHeight, minHeight: '8rem' }}
            />
            <div className="absolute bottom-2 right-2 flex space-x-1">
              <button
                onClick={() => {
                  setEditedOutput(output); // Revert
                  setIsEditing(false);
                }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded"
                title="Cancel Edit (Esc)"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="bg-primary-100 hover:bg-primary-200 text-primary-700 text-xs px-2 py-1 rounded"
                title="Save Edit"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={outputDisplayRef}
            onClick={(e) => { e.stopPropagation(); startEditing(e); }} // Stop propagation, allow editing on click
            className="p-3 bg-gray-50 rounded border border-gray-100 text-sm whitespace-pre-wrap transition-all duration-200 hover:border-gray-200 hover:bg-gray-75 cursor-text min-h-[5rem] max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300" // Changed cursor to text
            role="button" // Keep role for semantics, though interaction changes
            aria-label="Edit output"
            tabIndex={0} // Keep focusable
            onKeyDown={(e) => { // Allow editing with Enter/Space
              if (!isEditing && (e.key === 'Enter' || e.key === ' ')) {
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
          <div className="mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()} /* Prevent clicks from toggling selection */>
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center group"
              aria-expanded={showPrompt}
              aria-controls={`processed-prompt-${id}`} // Unique ID for ARIA
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
                id={`processed-prompt-${id}`} // Unique ID for ARIA
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
            aria-labelledby={`regenerate-modal-title-${id}`} // Unique ID
          >
            <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl animate-fadeIn" onClick={e => e.stopPropagation()}>
              <h3 id={`regenerate-modal-title-${id}`} className="text-lg font-medium mb-4">Regenerate with Instructions</h3>
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
        
        {isParaphraseModalOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsParaphraseModalOpen(false);
                setParaphraseInstruction('');
                setParaphrasedOutputs([]);
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`paraphrase-modal-title-${id}`}
          >
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full shadow-xl animate-fadeIn" onClick={e => e.stopPropagation()}>
              <h3 id={`paraphrase-modal-title-${id}`} className="text-lg font-medium mb-4">Paraphrase Output</h3>
              
              <div className="mb-4">
                <div className="flex flex-col space-y-2">
                  <label htmlFor={`paraphrase-instruction-${id}`} className="text-sm font-medium text-gray-700">
                    Additional Instructions (Optional)
                  </label>
                  <input
                    id={`paraphrase-instruction-${id}`}
                    ref={paraphraseInputRef}
                    type="text"
                    value={paraphraseInstruction}
                    onChange={(e) => setParaphraseInstruction(e.target.value)}
                    onKeyDown={handleParaphraseKeyPress}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="E.g., 'Change character names' or 'Make it more formal'"
                    aria-label="Paraphrase instructions"
                  />
                </div>
                
                <div className="flex flex-col space-y-2 mt-4">
                  <label htmlFor={`paraphrase-count-${id}`} className="text-sm font-medium text-gray-700">
                    Number of Paraphrases to Generate
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      id={`paraphrase-count-${id}`}
                      type="range"
                      min="1"
                      max="10"
                      value={paraphraseCount}
                      onChange={(e) => setParaphraseCount(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                    <span className="text-sm font-medium text-gray-700 min-w-[2rem] text-center">
                      {paraphraseCount}
                    </span>
                  </div>
                </div>
              </div>
              
              {paraphrasedOutputs.length > 0 && (
                <div className="mb-6 mt-6">
                  <h4 className="text-md font-medium mb-3">Select a Paraphrase</h4>
                  <div className="max-h-60 overflow-y-auto space-y-3 pr-2">
                    {paraphrasedOutputs.map((text, index) => (
                      <div 
                        key={index} 
                        className="p-3 bg-gray-50 rounded border border-gray-200 hover:border-primary-300 hover:shadow-sm cursor-pointer transition-all duration-200"
                        onClick={() => handleSelectParaphrase(text)}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-gray-500">Paraphrase {index + 1}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectParaphrase(text);
                            }}
                            className="text-xs text-primary-600 hover:text-primary-800"
                          >
                            Select
                          </button>
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setIsParaphraseModalOpen(false);
                    setParaphraseInstruction('');
                    setParaphrasedOutputs([]);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleParaphraseWithInstruction}
                  disabled={isParaphrasing}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 disabled:bg-primary-400"
                >
                  {isParaphrasing ? (
                    <span className="flex items-center">
                      <Icon name="spinner" className="animate-spin h-4 w-4 mr-2" aria-hidden="true" />
                      Paraphrasing...
                    </span>
                  ) : (
                    "Generate Paraphrases"
                  )}
                </button>
              </div>
              <div className="mt-4 text-sm text-gray-500">
                <p>Press Ctrl+Enter to generate paraphrases or Escape to cancel.</p>
                <p className="mt-1">Click on a paraphrase to select it.</p>
              </div>
            </div>
          </div>
        )}

        <ToolCallEditor
          isOpen={isToolEditorOpen}
          toolCalls={tool_calls}
          onChange={(newToolCalls) => {
            onToolCallsChange(id, newToolCalls); // Pass id
            setIsToolEditorOpen(false); // Close editor on change
          }}
          onClose={() => setIsToolEditorOpen(false)}
        />
      </div> 
      {/* End Card Content Wrapper */}
    </div>
  );
};

export default VariationCard;