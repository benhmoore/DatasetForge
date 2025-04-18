import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { toast } from 'react-toastify';
import PropTypes from 'prop-types';
import Icon from './Icons';

const ToolCallEditor = ({ isOpen, toolCalls, onChange = () => {}, onClose }) => {
  const [editText, setEditText] = useState('');
  const [formattedJson, setFormattedJson] = useState(true);
  const [validationError, setValidationError] = useState(null);
  const textareaRef = useRef(null);

  // Initialize editor content when modal opens
  useEffect(() => {
    if (isOpen) {
      try {
        const formatted = JSON.stringify(toolCalls || [], null, 2);
        setEditText(formatted);
        setValidationError(null);
        setFormattedJson(true);
      } catch (error) {
        console.error('Error stringifying tool calls:', error);
        setEditText('[]');
        setValidationError('Could not parse existing tool calls. Starting with empty array.');
      }
      
      // Focus the textarea when modal opens
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Position cursor intelligently if empty array
          if (textareaRef.current.value === '[]') {
            textareaRef.current.setSelectionRange(1, 1);
          }
        }
      }, 50);
    }
  }, [isOpen, toolCalls]);

  // Live validation as user types
  useEffect(() => {
    if (editText.trim() === '') {
      setValidationError('JSON cannot be empty');
      return;
    }
    
    try {
      const parsed = JSON.parse(editText);
      if (!Array.isArray(parsed)) {
        setValidationError('Tool calls must be an array');
      } else if (parsed.length > 0) {
        // Validate each tool call has the expected structure
        const invalidCalls = parsed.filter(call => {
          return !(
            (call.type === 'function' && call.function && typeof call.function.name === 'string') ||
            (call.function_call && typeof call.function_call.name === 'string') ||
            (call.name && (call.parameters || call.arguments))
          );
        });
        
        if (invalidCalls.length > 0) {
          setValidationError(`${invalidCalls.length} tool call(s) have invalid structure`);
        } else {
          setValidationError(null);
        }
      } else {
        setValidationError(null);
      }
    } catch (err) {
      setValidationError(`Invalid JSON: ${err.message}`);
    }
  }, [editText]);

  // Handle JSON formatting
  const handleFormat = () => {
    try {
      const parsed = JSON.parse(editText);
      const formatted = JSON.stringify(parsed, null, 2);
      setEditText(formatted);
      setFormattedJson(true);
      
      // Successful formatting clears error if json is valid
      if (Array.isArray(parsed)) {
        setValidationError(null);
      }
      
      toast.success('JSON formatted successfully');
    } catch (err) {
      toast.error(`Cannot format invalid JSON: ${err.message}`);
    }
  };

  // Handle save with validation
  const handleSave = () => {
    if (validationError) {
      toast.error(`Cannot save: ${validationError}`);
      return;
    }
    
    try {
      const parsed = JSON.parse(editText);
      
      // Normalize tool calls to ensure consistent format
      const normalized = parsed.map(call => {
        // Handle different formats and normalize to standard OpenAI format
        if (call.function_call) {
          return {
            type: 'function',
            function: {
              name: call.function_call.name,
              arguments: typeof call.function_call.arguments === 'string' 
                ? call.function_call.arguments 
                : JSON.stringify(call.function_call.arguments)
            }
          };
        } else if (call.name && (call.parameters || call.arguments)) {
          const params = call.parameters || call.arguments || {};
          return {
            type: 'function',
            function: {
              name: call.name,
              arguments: typeof params === 'string' ? params : JSON.stringify(params)
            }
          };
        }
        return call; // Already in expected format
      });
      
      onChange(normalized);
      onClose();
      toast.success('Tool calls saved successfully');
    } catch (err) {
      console.error('Failed to parse tool calls JSON:', err);
      toast.error(`Invalid JSON format: ${err.message}`);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    // Ctrl+S or Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
    // Ctrl+F or Cmd+F to format
    else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      handleFormat();
    }
    // Escape to close
    else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
    // Tab key for indentation (instead of changing focus)
    else if (e.key === 'Tab') {
      e.preventDefault();
      
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      
      // Insert tab at cursor position
      const newText = editText.substring(0, start) + "  " + editText.substring(end);
      setEditText(newText);
      
      // Move cursor position after the inserted tab
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
      
      setFormattedJson(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center overflow-auto p-4">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full shadow-xl max-h-[90vh] flex flex-col animate-fadeIn">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium flex items-center">
            <Icon name="tool" className="h-5 w-5 mr-2 text-primary-600" />
            Edit Tool Calls
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition-colors"
            title="Close"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        
        <div className="flex-grow overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="flex justify-between items-center mb-2 bg-gray-50 p-2 rounded-t-md border border-gray-200">
            <div className="text-sm text-gray-600">
              {validationError ? (
                <span className="text-red-600 flex items-center">
                  <Icon name="alert" className="h-4 w-4 mr-1" />
                  {validationError}
                </span>
              ) : (
                <span className="text-green-600 flex items-center">
                  <Icon name="check" className="h-4 w-4 mr-1" />
                  Valid JSON
                </span>
              )}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleFormat}
                className="px-2 py-1 bg-gray-200 text-gray-800 rounded text-sm hover:bg-gray-300 transition-colors flex items-center"
                title="Format JSON (Ctrl+F)"
                disabled={!editText.trim()}
              >
                <Icon name="code" className="h-4 w-4 mr-1" />
                Format
              </button>
              <button
                onClick={() => {
                  setEditText('[]');
                  setValidationError(null);
                }}
                className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200 transition-colors flex items-center"
                title="Clear all tool calls"
              >
                <Icon name="trash" className="h-4 w-4 mr-1" />
                Clear
              </button>
            </div>
          </div>
          
          {/* Editor */}
          <textarea
            ref={textareaRef}
            className={`w-full flex-grow p-3 border ${
              validationError ? 'border-red-300 bg-red-50' : 'border-gray-300'
            } rounded-b-md font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 overflow-auto scrollbar-thin scrollbar-thumb-gray-300`}
            value={editText}
            onChange={(e) => {
              setEditText(e.target.value);
              setFormattedJson(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={`[
  {
    "type": "function",
    "function": {
      "name": "tool_name",
      "arguments": "{\\"param\\": \\"value\\"}"
    }
  }
]`}
            spellCheck="false"
            style={{ minHeight: '300px' }}
          />
          
          {/* Help text */}
          <div className="text-xs text-gray-500 mt-2 space-y-1">
            <p><span className="font-medium">Format:</span> Tool calls must be an array of objects with the structure shown in the placeholder.</p>
            <p><span className="font-medium">Keyboard shortcuts:</span> Ctrl+F to format, Ctrl+S to save, Escape to cancel</p>
            <p><span className="font-medium">Arguments:</span> Can be a string containing JSON or a JSON object directly.</p>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="flex justify-end space-x-2 mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors flex items-center"
          >
            <Icon name="close" className="h-4 w-4 mr-2" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!!validationError}
            className={`px-4 py-2 ${
              validationError 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-primary-600 hover:bg-primary-700'
            } text-white rounded-md transition-colors flex items-center`}
          >
            <Icon name="save" className="h-4 w-4 mr-2" />
            Save Changes
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

ToolCallEditor.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  toolCalls: PropTypes.array,
  onChange: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};

export default ToolCallEditor;