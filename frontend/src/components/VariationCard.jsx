import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import ToolCallEditor from './ToolCallEditor';
import Icon from './Icons';
import api from '../api/apiClient';
import CustomTextInput from './CustomTextInput';

const VariationCard = ({ 
  id, // Added id prop
  variation, 
  output, 
  onSelect, // Changed from onStar
  onEdit, 
  onRegenerate, 
  onDismiss, 
  onOpenParaphraseModal, // New prop to open the paraphrase modal in the parent
  isSelected = false, // Changed from isStarred
  isGenerating = false,
  isParaphrasing = false, // To disable buttons during paraphrasing
  error = null,
  tool_calls = null,
  system_prompt = null,
  processed_prompt = null,
  workflow_results = null, // New prop for workflow results
  workflow_progress = null, // New prop for streaming workflow progress
  onToolCallsChange,
  onOpenRegenerateModal // New prop to open the regenerate modal in the parent
}) => {
  // State management
  const [editedOutput, setEditedOutput] = useState(output);
  const [isEditing, setIsEditing] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isToolEditorOpen, setIsToolEditorOpen] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState('8rem');
  const [showWorkflowResults, setShowWorkflowResults] = useState(false);
  const [isDragging, setIsDragging] = useState(false); // Added for drag state
  
  // Refs
  const outputDisplayRef = useRef(null);
  const textareaRef = useRef(null);

  // Update edited output when the output prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditedOutput(output);
    }
  }, [output, isEditing]);
  
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

  // Handle escape key to exit modal or editing mode
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          // Save changes instead of canceling when pressing Escape
          saveEdit();
        } else if (isToolEditorOpen) {
          setIsToolEditorOpen(false);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isEditing, isToolEditorOpen, saveEdit]);

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
  
  // Render workflow results section
  const renderWorkflowResults = useCallback(() => {
    if (!workflow_results) return null;
    
    const nodeResults = workflow_results.results || [];
    
    return (
      <div className="mt-3 pt-3 border-t border-gray-200">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowWorkflowResults(!showWorkflowResults);
          }}
          className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center group"
          aria-expanded={showWorkflowResults}
        >
          <Icon
            name={showWorkflowResults ? 'chevronUp' : 'chevronDown'}
            className="w-3 h-3 mr-1 inline-block group-hover:text-primary-500 transition-colors"
            aria-hidden="true"
          />
          {showWorkflowResults ? 'Hide Workflow Processing' : 'Show Workflow Processing'}
          <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
            {nodeResults.length} node{nodeResults.length !== 1 ? 's' : ''}
          </span>
          <span className="ml-2 text-xs text-gray-500">
            {(workflow_results.execution_time || 0).toFixed(2)}s
          </span>
        </button>
        
        {showWorkflowResults && (
          <div className="mt-2 space-y-3">
            {nodeResults.map((node, index) => (
              <div 
                key={index}
                className={`p-3 rounded text-xs ${
                  node.status === 'error' 
                    ? 'bg-red-50 border border-red-200' 
                    : 'bg-blue-50 border border-blue-100'
                }`}
              >
                <div className="flex justify-between mb-1">
                  <div className="font-medium text-blue-700 flex items-center">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-200 text-blue-800 text-xs font-medium mr-2">
                      {index + 1}
                    </span>
                    {/* Use node_name if available, otherwise fallback to node_id */}
                    {node.node_name || node.node_id} ({node.node_type}) 
                    <span className="ml-2 text-xs text-gray-500">
                      {node.execution_time.toFixed(2)}s
                    </span>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-xs ${
                    node.status === 'success' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {node.status}
                  </div>
                </div>
                
                {node.status === 'error' && node.error_message && (
                  <div className="mb-2 text-red-600 bg-red-50 p-1 rounded border border-red-200 flex items-start">
                    <Icon name="alert" className="h-3 w-3 text-red-600 mt-0.5 mr-1 flex-shrink-0" />
                    <span className="text-xs">{node.error_message}</span>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1">Input</div>
                    <div className="p-1 bg-white bg-opacity-50 rounded border border-gray-200 max-h-24 overflow-auto">
                      <pre className="text-xs whitespace-pre-wrap">
                        {JSON.stringify(node.input, null, 2)}
                      </pre>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1">Output</div>
                    <div className="p-1 bg-white bg-opacity-50 rounded border border-gray-200 max-h-24 overflow-auto">
                      <pre className="text-xs whitespace-pre-wrap">
                        {JSON.stringify(node.output, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Final output summary */}
            <div className="p-3 bg-green-50 border border-green-200 rounded text-xs">
              <div className="font-medium text-green-800 mb-1">Final Output</div>
              <div className="p-2 bg-white rounded border border-green-100">
                <pre className="text-xs whitespace-pre-wrap">
                  {JSON.stringify(workflow_results.final_output, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }, [workflow_results, showWorkflowResults]);

  // Handler for selection button/area
  const handleSelect = useCallback(() => {
    if (isGenerating || isEditing) return; // Prevent selection change during generation or editing
    onSelect(id, isEditing ? editedOutput : output); // Pass id and current output
  }, [isGenerating, isEditing, id, editedOutput, output, onSelect]);

  // Handler for regenerate button
  const handleRegenerate = useCallback(() => {
    if (isGenerating || isParaphrasing) return;
    
    // Instead of opening modal locally, trigger the parent's modal
    if (onOpenRegenerateModal) {
      onOpenRegenerateModal(id, output);
    } else {
      // Fallback to direct regeneration if modal function not provided
      onRegenerate('');
    }
  }, [isGenerating, isParaphrasing, id, output, onRegenerate, onOpenRegenerateModal]);
  
  // Handler for paraphrase button
  const handleParaphrase = useCallback(() => {
    if (isGenerating || isParaphrasing) return;
    // Instead of opening a modal in this component, we'll trigger the parent's onOpenParaphraseModal
    if (onOpenParaphraseModal) {
      onOpenParaphraseModal(id, output);
    }
  }, [isGenerating, isParaphrasing, id, output, onOpenParaphraseModal]);
  

  // Render workflow progress indicators
  const renderWorkflowProgress = useCallback(() => {
    if (!workflow_progress || !workflow_progress.node_statuses) return null;
    
    const nodeStatuses = workflow_progress.node_statuses;
    const executionOrder = workflow_progress.execution_order || Object.keys(nodeStatuses);
    
    return (
      <div className="mt-3 space-y-2 animate-fadeIn">
        <div className="text-xs font-medium text-gray-700 mb-1 flex justify-between">
          <span>Workflow Progress</span>
          {workflow_progress.status === 'complete' && 
            <span className="text-green-600">Complete</span>
          }
        </div>
        
        <div className="space-y-2">
          {executionOrder.map((nodeId) => {
            const nodeStatus = nodeStatuses[nodeId] || { status: 'queued', progress: 0 };
            const status = nodeStatus.status;
            const progress = nodeStatus.progress || 0;
            
            // Determine status color
            let statusColor = 'bg-gray-200'; // default for queued
            let textColor = 'text-gray-600';
            
            if (status === 'running') {
              statusColor = 'bg-blue-100';
              textColor = 'text-blue-700';
            } else if (status === 'success') {
              statusColor = 'bg-green-100';
              textColor = 'text-green-700';
            } else if (status === 'error') {
              statusColor = 'bg-red-100';
              textColor = 'text-red-700';
            }
            
            return (
              <div key={nodeId} className="flex flex-col space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className={`font-medium ${textColor}`}>
                    {nodeStatus.node_name || nodeId} {/* Display node name or fallback to ID */}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${textColor} ${statusColor}`}>
                    {status === 'running' && (
                      <Icon name="spinner" className="animate-spin h-3 w-3 inline-block mr-1" aria-hidden="true" />
                    )}
                    {status === 'success' && (
                      <Icon name="check" className="h-3 w-3 inline-block mr-1" aria-hidden="true" />
                    )}
                    {status === 'error' && (
                      <Icon name="alert" className="h-3 w-3 inline-block mr-1" aria-hidden="true" />
                    )}
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                </div>
                
                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      status === 'success' ? 'bg-green-500' : 
                      status === 'error' ? 'bg-red-500' : 
                      status === 'running' ? 'bg-blue-500' : 
                      'bg-gray-400'
                    }`}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                
                {/* Display error if there is one */}
                {status === 'error' && nodeStatus.error && (
                  <div className="text-xs text-red-600 bg-red-50 p-1 rounded mt-1">
                    {nodeStatus.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [workflow_progress]);

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
            <span className="text-gray-500">
              {workflow_progress ? 'Processing workflow...' : 'Generating...'}
            </span>
          </div>
        </div>
        
        {workflow_progress ? (
          // Show workflow progress indicators
          <div className="w-full">
            {renderWorkflowProgress()}
          </div>
        ) : (
          // Default loading indicator
          <div className="w-full h-32 bg-gray-100 rounded overflow-hidden">
            <div className="h-full w-full relative">
              <div className="animate-pulse absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:400%_100%] animate-shimmer"></div>
            </div>
          </div>
        )}
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
      ref={outputDisplayRef}
      className={`p-4 bg-white rounded-lg border ${
        isSelected 
          ? 'border-primary-300 ring-2 ring-primary-200' // Style for selected
          : 'border-gray-200'
      } shadow-sm transition-all duration-200 hover:shadow-md ${
        isSelected ? 'scale-[1.01]' : 'hover:scale-[1.01]'
      } relative cursor-pointer ${isDragging ? 'opacity-50' : ''} focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-300`} // Added visible focus styles
      onClick={handleSelect} // Make the whole card clickable for selection
      role="checkbox" // Role for accessibility
      aria-checked={isSelected} // State for accessibility
      tabIndex={0} // Make it focusable
      data-variation-id={id} // Add data attribute for auto-focusing
      onKeyDown={(e) => {
        // Space to toggle selection
        if (e.key === ' ' && 
            e.target.tagName !== 'INPUT' && 
            e.target.tagName !== 'TEXTAREA' && 
            !e.target.isContentEditable) {
          e.preventDefault();
          handleSelect();
        }
        // Enter key to start editing
        else if (e.key === 'Enter' && !isEditing && !isGenerating) {
          e.preventDefault();
          startEditing();
        }
        // Delete or Backspace key to remove card
        else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onDismiss();
        }
        // Arrow key navigation between cards
        else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault();
          
          // Get all focusable variation cards
          const cards = Array.from(document.querySelectorAll('[data-variation-id]'));
          if (cards.length <= 1) return; // No navigation needed with only one card
          
          const currentIndex = cards.findIndex(card => card === e.target);
          if (currentIndex === -1) return;
          
          let nextIndex;
          const cardsPerRow = window.innerWidth >= 768 ? 2 : 1; // Based on md:grid-cols-2
          
          switch(e.key) {
            case 'ArrowLeft':
              nextIndex = currentIndex > 0 ? currentIndex - 1 : cards.length - 1;
              break;
            case 'ArrowRight':
              nextIndex = currentIndex < cards.length - 1 ? currentIndex + 1 : 0;
              break;
            case 'ArrowUp':
              nextIndex = currentIndex - cardsPerRow;
              if (nextIndex < 0) {
                // Go to last row, same column
                const lastRowItems = cards.length % cardsPerRow || cardsPerRow;
                const column = currentIndex % cardsPerRow;
                nextIndex = cards.length - lastRowItems + Math.min(column, lastRowItems - 1);
              }
              break;
            case 'ArrowDown':
              nextIndex = currentIndex + cardsPerRow;
              if (nextIndex >= cards.length) {
                // Go to first row, same column
                nextIndex = currentIndex % cardsPerRow;
              }
              break;
          }
          
          if (nextIndex >= 0 && nextIndex < cards.length) {
            cards[nextIndex].focus();
          }
        }
      }}
      draggable={!isEditing && !isGenerating} // Enable dragging when not editing or generating
      onDragStart={(e) => {
        if (isEditing || isGenerating) return;
        
        setIsDragging(true);
        
        // Create data payload for the variation
        const payload = JSON.stringify({
          id,
          variation,
          output,
          processed_prompt,
          tool_calls,
          slots: {}, // Add any slots if available in your variation data
          system_prompt: system_prompt,
        });
        
        // Set the data transfer
        e.dataTransfer.setData("application/json", payload);
        e.dataTransfer.effectAllowed = "copy";
        
        // Create a ghost image of the card
        const dragImg = document.createElement("div");
        dragImg.className = "bg-primary-100 border border-primary-300 rounded p-2 text-sm font-medium text-primary-700";
        dragImg.innerHTML = `Drag to save: ${variation}`;
        dragImg.style.position = "absolute";
        dragImg.style.top = "-1000px";
        document.body.appendChild(dragImg);
        
        e.dataTransfer.setDragImage(dragImg, 0, 0);
        
        // Clean up the ghost element after a short delay
        setTimeout(() => {
          document.body.removeChild(dragImg);
        }, 0);
      }}
      onDragEnd={() => {
        setIsDragging(false);
      }}
    >
      {/* Workflow indicator badge */}
      {workflow_results && (
        <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full shadow-sm">
          <Icon name="flow" className="h-3 w-3 inline-block mr-1" aria-hidden="true" />
          Workflow
        </div>
      )}
    
      {/* Removed Dimming overlay when editing */}

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
              disabled={isGenerating || isParaphrasing || !onOpenParaphraseModal}
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
            <CustomTextInput
              ref={textareaRef}
              value={editedOutput}
              onChange={handleOutputChange}
              onBlur={saveEdit} // Save on blur (clicking outside)
              placeholder="Output"
              autoFocus
              mode="multi"
              rows={6}
              className="transition-colors duration-200 scrollbar-thin scrollbar-thumb-gray-300"
              containerClassName="mb-0"
              style={{ minHeight: '8rem' }}
              aiContext="You are helping to edit a variation output in a dataset generation tool. The content should be high-quality and match the intended purpose."
              systemPrompt="Improve this output to be more coherent, well-structured, and accurate while maintaining the original intent and information."
              collapsible={false}
              autoExpandThreshold={200}
            />
            {/* Removed save/cancel buttons */}
          </div>
        ) : (
          <div
            ref={outputDisplayRef}
            onClick={(e) => { e.stopPropagation(); startEditing(e); }} // Stop propagation, allow editing on click
            className="p-3 bg-gray-50 rounded border border-gray-100 text-sm whitespace-pre-wrap transition-all duration-200 hover:border-gray-200 hover:bg-gray-75 cursor-text min-h-[5rem] max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300" // Changed cursor to text
            role="button" // Keep role for semantics, though interaction changes
            aria-label="Edit output"
            tabIndex={0} // Keep focusable
            onKeyDown={(e) => { // Allow editing with Enter
              if (!isEditing && e.key === 'Enter') {
                e.preventDefault();
                startEditing(e);
              }
            }}
          >
            {output || <span className="text-gray-400 italic">No output</span>}
            {renderToolCalls(tool_calls)}
          </div>
        )}

        {/* Workflow results section */}
        {renderWorkflowResults()}
        
        {/* Processed prompt section */}
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