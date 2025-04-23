import { motion } from "motion/react"
import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icons';
import api from '../api/apiClient'; // Import API client
import ContextMenu from './ContextMenu'; // Import ContextMenu component

/**
 * A custom text input component that can toggle between single-line input and textarea,
 * and supports action buttons on the right side.
 */
const CustomTextInput = React.forwardRef(({ 
  // Basic input props
  value = '',
  onChange,
  onBlur,
  placeholder = '',
  disabled = false,
  name = '',
  id,
  autoFocus = false,

  // Additional visual and functional props
  label,
  helpText,
  error,
  required = false,
  
  // Type control
  mode = 'both', // 'single', 'multi', or 'both' (default)
  rows = 3,
  
  // Action buttons
  actionButtons = null,
  
  // AI action button
  showAiActionButton = true,
  onAiAction = () => {},
  aiActionDisabled = false,
  systemPrompt = null,

  // Additional styling
  className = '',
  containerClassName = ''
}, ref) => {
  const allowToggle = mode === 'both';
  
  // State for toggling between input types if allowToggle is true
  const [isMultiline, setIsMultiline] = useState(mode === 'multi');
  
  // State for multi-line expansion
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Add loading state for AI button
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Add validation state for AI input
  const [aiValidationError, setAiValidationError] = useState(null);
  
  // Add state for AI menu
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [aiMenuPosition, setAiMenuPosition] = useState({ x: 0, y: 0 });
  
  // State to store selection range during AI processing
  const [selectionRange, setSelectionRange] = useState(null);
  
  // State to store previous value for undo functionality
  const [previousValue, setPreviousValue] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  
  // State for animation triggering
  const [generationKey, setGenerationKey] = useState(0);
  
  // References
  const internalInputRef = useRef(null);
  // Use forwarded ref or internal ref
  const inputRef = ref || internalInputRef;
  const aiButtonRef = useRef(null);
  
  // References for abort controller to cancel API requests
  const abortControllerRef = useRef(null);
  
  // Auto-focus handling and selection restoration
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
    
    // When switching modes, restore selection after the DOM is updated
    if (inputRef.current && selectionRange) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(selectionRange.start, selectionRange.end);
        }
      }, 0);
    }
  }, [autoFocus, isMultiline, selectionRange]);
  
  // Restore selection after AI processing completes
  useEffect(() => {
    if (!isAiLoading && selectionRange && inputRef.current) {
      // Only restore selection if we still have the selection range and we're not loading
      inputRef.current.focus();
      inputRef.current.setSelectionRange(selectionRange.start, selectionRange.end);
    }
  }, [isAiLoading, selectionRange]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Reset validation error when input changes
  useEffect(() => {
    if (value && aiValidationError) {
      setAiValidationError(null);
    }
  }, [value, aiValidationError]);

  // Restore selection after AI processing completes
  useEffect(() => {
    if (!isAiLoading && selectionRange && inputRef.current) {
      // Only restore selection if we still have the selection range and we're not loading
      inputRef.current.focus();
      inputRef.current.setSelectionRange(selectionRange.start, selectionRange.end);
    }
  }, [isAiLoading, selectionRange]);

  // Adjust textarea height when expanded or value changes
  useEffect(() => {
    if (isMultiline && isExpanded && inputRef.current) {
      const textarea = inputRef.current;
      // Temporarily reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto'; 
      // Set height based on content, respecting max-height from CSS
      textarea.style.height = `${textarea.scrollHeight}px`; 
    } else if (isMultiline && !isExpanded && inputRef.current) {
      // Reset height when collapsing
      inputRef.current.style.height = ''; 
    }
  }, [isExpanded, value, isMultiline]); // Rerun when expanded state, value, or mode changes

  // Toggle between input types
  const handleToggle = () => {
    if (allowToggle) {
      // Capture current selection before toggle
      if (inputRef.current) {
        const currentSelectionStart = inputRef.current.selectionStart;
        const currentSelectionEnd = inputRef.current.selectionEnd;
        
        if (currentSelectionEnd > currentSelectionStart) {
          setSelectionRange({ 
            start: currentSelectionStart, 
            end: currentSelectionEnd 
          });
        }
      }
      
      setIsMultiline(prev => !prev);
      // Reset expansion state and clear inline height style
      setIsExpanded(false); 
      if (inputRef.current) {
        inputRef.current.style.height = '';
      }
    }
  };

  // Handle double-click on action bar to expand/collapse textarea
  const handleActionBarDoubleClick = () => {
    if (isMultiline) {
      setIsExpanded(prev => !prev);
      // Height adjustment is now handled by the useEffect hook
    }
  };

  // Handle undo functionality
  const handleUndo = () => {
    if (canUndo && previousValue !== undefined) {
      // Call onChange to update the value in the parent with the previous value
      onChange({ target: { value: previousValue, name } });
      setCanUndo(false);
    }
  };

  // Common AI action logic
  const performAiAction = async (systemPromptOverride) => {
    if (disabled || aiActionDisabled || isAiLoading || !inputRef.current) {
      return;
    }

    const inputElement = inputRef.current;
    const currentSelectionStart = inputElement.selectionStart;
    const currentSelectionEnd = inputElement.selectionEnd;
    let textToSend = value;
    let localSelectionRange = null;

    // Check if there is a selection
    if (currentSelectionEnd > currentSelectionStart) {
      textToSend = value.substring(currentSelectionStart, currentSelectionEnd);
      localSelectionRange = { start: currentSelectionStart, end: currentSelectionEnd };
      setSelectionRange(localSelectionRange); // Store selection range
    } else {
      setSelectionRange(null); // No selection
    }

    if (!textToSend || !textToSend.trim()) {
      setAiValidationError("Please enter or select some text before using the AI assistant.");
      return;
    }

    try {
      setIsAiLoading(true);
      setAiValidationError(null);
      
      // Store the current value for undo functionality
      setPreviousValue(value);

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      const onData = (responseData) => {
        if (responseData.error) {
          console.error('Error in generation stream:', responseData.error);
          setAiValidationError(`Error during generation: ${responseData.error}`);
          return;
        }

        if (responseData.output) {
          let newValue;
          const currentVal = value; // Use state value at the time of call
          const range = selectionRange || localSelectionRange; // Use stored or local range
          let newSelectionRange = null;

          if (range) {
            // Replace only the selected text
            newValue = 
              currentVal.substring(0, range.start) + 
              responseData.output + 
              currentVal.substring(range.end);
              
            // Calculate the new selection range based on the generated text
            const newEnd = range.start + responseData.output.length;
            newSelectionRange = { start: range.start, end: newEnd };
            
            // Update the selection range to match the generated text
            setSelectionRange(newSelectionRange);
          } else {
            // Replace the entire text
            newValue = responseData.output;
            // Create a selection range for the entire output
            newSelectionRange = { start: 0, end: responseData.output.length };
            setSelectionRange(newSelectionRange);
          }
          
          // Call onChange to update the value in the parent
          onChange({ target: { value: newValue, name } });
          
          // Call onAiAction to notify the parent component
          onAiAction(newValue, name);
          
          // Enable undo functionality
          setCanUndo(true);
          
          // Bump the key to trigger the animation
          setGenerationKey(k => k + 1);
        }
      };

      const finalSystemPrompt = systemPromptOverride || systemPrompt || "Please concisely and diligently follow the following request. Provide the output only. Do not add any extra information or comments.";

      await api.generateSimple(textToSend, name, onData, signal, finalSystemPrompt);
    } catch (error) {
      if (error.name !== 'AbortError') { // Don't show error if aborted by user/unmount
        console.error('Error during AI generation:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        setAiValidationError(`Generation failed: ${errorMessage}`);
        onAiAction({ error: errorMessage }, name);
      }
    } finally {
      setIsAiLoading(false);
      // We don't clear selection range here, as we want to preserve it after loading
    }
  };

  // Handle AI action with API call
  const handleAiAction = async () => {
    await performAiAction();
  };

  // Define AI menu options
  const aiMenuItems = [
    {
      label: "Correct Grammar",
      value: "grammar",
      icon: "bookOpen"
    },
    {
      label: "Paraphrase",
      value: "paraphrase",
      icon: "language"
    },
    {
      label: "Generate",
      value: "generate",
      icon: "sparkles"
    },
    {
      type: "divider"
    },
    {
      label: "Make Concise",
      value: "concise",
      icon: "minimize"
    },
    {
      label: "Make Longer",
      value: "longer",
      icon: "maximize"
    }
  ];
  
  // Toggle AI menu
  const handleAiButtonClick = (e) => {
    e.preventDefault();
    
    if (disabled || aiActionDisabled || isAiLoading || !inputRef.current) {
      return; // Don't proceed if disabled or already loading
    }
    
    const inputElement = inputRef.current;
    const currentSelectionStart = inputElement.selectionStart;
    const currentSelectionEnd = inputElement.selectionEnd;
    const hasSelection = currentSelectionEnd > currentSelectionStart;
    const currentText = hasSelection ? value.substring(currentSelectionStart, currentSelectionEnd) : value;

    if (!currentText || !currentText.trim()) {
      setAiValidationError("Please enter or select some text before using the AI assistant.");
      return;
    }
    
    // Store the selection range immediately when opening the menu
    if (hasSelection) {
      setSelectionRange({ start: currentSelectionStart, end: currentSelectionEnd });
    }
    
    // Position the menu below the AI button
    if (aiButtonRef.current) {
      const rect = aiButtonRef.current.getBoundingClientRect();
      setAiMenuPosition({ 
        x: rect.left, 
        y: rect.bottom + 5 
      });
    }
    
    // Toggle the menu
    setShowAiMenu(!showAiMenu);
  };
  
  // Handle AI menu item selection
  const handleAiMenuSelect = async (option) => {
    setShowAiMenu(false); // Close menu immediately
    let systemPromptToUse = "";
      
    // Select the appropriate system prompt based on the option
    switch (option) {
      case "grammar":
        systemPromptToUse = "Correct grammar and spelling mistakes in the following text. Provide only the corrected text. Never return comments or explanations.";
        break;
      case "paraphrase":
        systemPromptToUse = "Paraphrase the following text. Provide only the paraphrased text. Never return comments or explanations.";
        break;
      case "generate":
        // For generate, we might use the component's systemPrompt or a default
        systemPromptToUse = systemPrompt || "Follow this instruction precisely. Provide only the output. Do not add any extra information or comments.";
        break;
      case "concise":
        systemPromptToUse = "Make the following text more concise and to the point while preserving the key information. Provide only the rewritten text. Never return comments or explanations.";
        break;
      case "longer":
        systemPromptToUse = "Expand on the following text to make it more detailed and comprehensive. Provide only the expanded text. Never return comments or explanations.";
        break;
      default:
        systemPromptToUse = systemPrompt || "Please concisely and diligently follow the following request. Provide only the output. Do not add any extra information or comments.";
    }
    
    await performAiAction(systemPromptToUse);
  };

  // Generate unique IDs for accessibility
  const inputId = id || `input-${name || Math.random().toString(36).substring(2, 9)}`;
  const helpTextId = helpText ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const aiErrorId = aiValidationError ? `${inputId}-ai-error` : undefined;
  const describedBy = [helpTextId, errorId, aiErrorId].filter(Boolean).join(' ') || undefined;

  // Base input classes
  const baseInputClasses = `
    w-full p-2 border transition-colors duration-200
    ${error ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-700 focus:ring-red-500 focus:border-red-500' 
            : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'}
    ${disabled || isAiLoading ? 'bg-gray-100 cursor-not-allowed opacity-70' : ''} // Disable input when loading
    ${(actionButtons || showAiActionButton || canUndo) && !isMultiline ? 'rounded-r-none' : ''}
    ${isMultiline ? 'rounded-t-none rounded-b-md text-sm overflow-y-hidden' : 'rounded-md'} // Add overflow-y-hidden initially
    ${isMultiline && isExpanded ? 'max-h-[70vh] overflow-y-auto' : ''} // Add max-height and overflow-y-auto when expanded
    ${className}
  `;
  
  // Action buttons container classes
  const actionButtonsContainerClasses = `
    flex items-center 
    ${isMultiline 
      ? 'w-full justify-end border-l border-t border-r border-gray-300 rounded-t-md bg-gray-50' 
      : 'border-t border-r border-b rounded-r-md bg-gray-50'}
    ${error ? 'border-red-300' : ''}
  `;
  
  // Undo button
  const undoButton = canUndo ? (
    <button
      onClick={handleUndo}
      className="p-2 m-1 text-primary-700 bg-primary-100 hover:bg-primary-200 hover:text-primary-800 transition-colors rounded-full" // Updated classes for filled background
      title="Undo AI generation"
      disabled={disabled || isAiLoading}
      type="button"
      aria-label="Undo AI generation"
    >
      <Icon name="undo" className="h-4 w-4" />
    </button>
  ) : null;

  // Prepare AI action button if enabled
  const aiButton = showAiActionButton ? (
    <button
      ref={aiButtonRef}
      onClick={handleAiButtonClick}
      className={`p-2 m-1 text-primary-500 hover:text-primary-700 hover:bg-gray-100 transition-colors rounded-full ${(!value.trim() && (!inputRef.current || inputRef.current.selectionEnd <= inputRef.current.selectionStart)) || isAiLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={isAiLoading ? "Generating..." : "Use AI assistant"}
      disabled={disabled || aiActionDisabled || isAiLoading || (!value.trim() && (!inputRef.current || inputRef.current.selectionEnd <= inputRef.current.selectionStart))}
      type="button"
      aria-label={isAiLoading ? "Generating content" : "Use AI assistant"}
    >
      {isAiLoading ? (
        <Icon name="spinner" className="h-4 w-4 animate-spin" />
      ) : (
        <Icon name="sparkles" className="h-4 w-4" />
      )}
    </button>
  ) : null;

  // Function to ensure any child action buttons have consistent styling
  const wrapActionButton = (actionButton) => {
    // If the action button is already a React element, wrap it with our styling
    if (React.isValidElement(actionButton)) {
      // Clone with proper button styling
      const wrappedButton = React.cloneElement(actionButton, {
        className: `p-2 m-1 transition-colors rounded-full ${actionButton.props.className || ''}`,
      });
      
      // Find and process any SVG/icon children to ensure consistent sizing
      if (React.Children.count(wrappedButton.props.children) > 0) {
        const processedChildren = React.Children.map(wrappedButton.props.children, child => {
          // Apply consistent sizing to SVG or Icon components
          if (React.isValidElement(child) && 
              (child.type === 'svg' || 
               (typeof child.type === 'function' && child.type.name === 'Icon'))) {
            return React.cloneElement(child, {
              className: `h-4 w-4 ${child.props.className || ''}`,
            });
          }
          return child;
        });
        
        // Return button with processed children
        return React.cloneElement(wrappedButton, {}, processedChildren);
      }
      
      return wrappedButton;
    }
    return actionButton;
  };

  // Combine custom action buttons with AI button and undo button if needed
  const combinedActionButtons = (
    <>
      {undoButton}
      {aiButton}
      {actionButtons && (
        typeof actionButtons === 'object' && React.Children.map(actionButtons, wrapActionButton) || actionButtons
      )}
    </>
  );

  return (
    <motion.div
      key={generationKey}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`space-y-1 ${containerClassName}`}
    >
      {/* Label with toggle button if allowed */}
      {label && (
        <div className="flex justify-between items-center">
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
          
          {allowToggle && (
            <button
              type="button"
              onClick={handleToggle}
              className="text-xs text-primary-600 hover:text-primary-800 flex items-center"
              disabled={disabled}
              aria-label={isMultiline ? 'Switch to single line' : 'Switch to multi-line'}
            >
              {isMultiline ? (
                <>
                  <Icon name="minimize-2" className="h-3 w-3 mr-1" />
                  Single Line
                </>
              ) : (
                <>
                  <Icon name="maximize-2" className="h-3 w-3 mr-1" />
                  Multi-line
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Input container with flex for action buttons */}
      {isMultiline ? (
        <div className="flex flex-col">
          {/* Multiline mode: Actions on top */}
          {(combinedActionButtons) && (
            <div 
              className={actionButtonsContainerClasses}
              onDoubleClick={handleActionBarDoubleClick} // Add double-click handler
              title={isExpanded ? "Double-click to collapse" : "Double-click to expand"} // Add tooltip
            >
              {combinedActionButtons}
            </div>
          )}
          <textarea
            ref={inputRef}
            id={inputId}
            name={name}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            placeholder={placeholder}
            disabled={disabled || isAiLoading} // Disable textarea when loading
            rows={isExpanded ? undefined : rows} // Conditionally apply rows
            className={baseInputClasses}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            // Remove inline style for height, managed by useEffect now
          />
        </div>
      ) : (
        // Single line mode: Actions on the right
        <div className="flex items-stretch">
          <input
            ref={inputRef}
            id={inputId}
            name={name}
            type="text"
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            placeholder={placeholder}
            disabled={disabled || isAiLoading} // Disable input when loading
            className={baseInputClasses}
            aria-invalid={!!error}
            aria-describedby={describedBy}
          />
          
          {/* Action buttons */}
          {(combinedActionButtons) && (
            <div className={actionButtonsContainerClasses}>
              {combinedActionButtons}
            </div>
          )}
        </div>
      )}

      {/* Help text */}
      {helpText && !error && (
        <p id={helpTextId} className="text-xs text-gray-500">
          {helpText}
        </p>
      )}

      {/* Error message */}
      {error && (
        <p id={errorId} className="text-xs text-red-600 font-medium">
          {error}
        </p>
      )}

      {/* AI validation error message */}
      {aiValidationError && (
        <p id={aiErrorId} className="text-xs text-red-600 font-medium">
          {aiValidationError}
        </p>
      )}

      {/* AI menu */}
      {showAiMenu && (
        <ContextMenu
          title="AI Actions"
          items={aiMenuItems}
          position={aiMenuPosition}
          onSelect={handleAiMenuSelect}
          onClose={() => setShowAiMenu(false)}
        />
      )}
    </motion.div>
  );
});

export default CustomTextInput;