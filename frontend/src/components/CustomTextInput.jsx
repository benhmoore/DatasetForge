import { motion } from "motion/react"
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'; // Add useLayoutEffect
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
  
  // Auto-expand threshold
  autoExpandThreshold = 100, // New prop - threshold character count to trigger auto-expansion
  
  // Action buttons
  actionButtons = null,
  
  // AI action button
  showAiActionButton = true,
  onAiAction = () => {},
  aiActionDisabled = false,
  systemPrompt = null,
  aiContext = null, // Add new aiContext prop

  // Additional styling
  className = '',
  containerClassName = '',
  
  // Collapsible functionality
  collapsible = false,  // New prop to enable collapsible behavior
  defaultCollapsed = false, // New prop to set initial collapsed state
  collapsedHeight = '100px', // New prop to set collapsed height
  previewLines = 3, // New prop to set number of lines to show in preview
}, ref) => {
  const allowToggle = mode === 'both';
  
  // State for toggling between input types if allowToggle is true
  const [isMultiline, setIsMultiline] = useState(mode === 'multi');
  
  // State for multi-line expansion
  const [isExpanded, setIsExpanded] = useState(false);
  
  // State for collapsible functionality
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  
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
  // Add state to track user edits after AI generation
  const [userEditedAfterAi, setUserEditedAfterAi] = useState(false);
  
  // State for animation triggering
  const [generationKey, setGenerationKey] = useState(0);
  
  // State for AI button pulse animation
  const [isAiPulseActive, setIsAiPulseActive] = useState(false);
  
  // References
  const internalInputRef = useRef(null);
  // Use forwarded ref or internal ref
  const inputRef = ref || internalInputRef;
  const aiButtonRef = useRef(null);
  const contentRef = useRef(null); // New ref for content element
  
  // References for abort controller to cancel API requests
  const abortControllerRef = useRef(null);
  
  // Generate unique IDs for accessibility, memoized for stability
  const inputId = useMemo(() => {
    return id || `input-${name || Math.random().toString(36).substring(2, 9)}`;
  }, [id, name]); // Recalculate only if id or name props change

  // State for mode switching cursor position tracking
  const [pendingCursorPosition, setPendingCursorPosition] = useState(null);

  // Add a ref to track if user has explicitly toggled the input type
  const userToggledRef = useRef(false);

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

  // Trigger pulse animation when AI loading finishes
  useEffect(() => {
    // Check if isAiLoading was previously true and is now false
    const prevIsAiLoading = sessionStorage.getItem(`prevIsAiLoading_${inputId}`); // Use unique key per instance
    if (prevIsAiLoading === 'true' && !isAiLoading) {
      setIsAiPulseActive(true);
    }
    // Store current loading state for next render
    sessionStorage.setItem(`prevIsAiLoading_${inputId}`, isAiLoading.toString());

    // Cleanup session storage on unmount
    return () => {
      sessionStorage.removeItem(`prevIsAiLoading_${inputId}`);
    };
  }, [isAiLoading, inputId]); // Depend on isAiLoading and inputId

  // Automatically disable pulse after a short duration
  useEffect(() => {
    let timer;
    if (isAiPulseActive) {
      timer = setTimeout(() => {
        setIsAiPulseActive(false);
      }, 1500); // Pulse duration: 1.5 seconds
    }
    return () => clearTimeout(timer); // Cleanup timer on unmount or if pulse restarts
  }, [isAiPulseActive]);

  // Auto-expand to multi-line when text exceeds threshold
  useEffect(() => {
    if (
      allowToggle && 
      !isMultiline && 
      value && 
      value.length > autoExpandThreshold &&
      !userToggledRef.current // Only auto-expand if user hasn't manually toggled
    ) {
      // Capture current cursor position before switching modes
      if (inputRef.current) {
        setPendingCursorPosition({
          start: inputRef.current.selectionStart,
          end: inputRef.current.selectionEnd
        });
      }

      // Auto switch to multi-line mode when text exceeds threshold
      setIsMultiline(true);
      
      // Reset expansion state when auto-switching
      setIsExpanded(false);
      
      // Set a flag to prevent this effect from re-triggering when the input gets focus
      sessionStorage.setItem(`autoExpanded_${inputId}`, 'true');
      
      // Clean up height styles
      if (inputRef.current) {
        inputRef.current.style.height = '';
      }
      
      // Focus will be restored by the useLayoutEffect
    }
  }, [value, allowToggle, isMultiline, autoExpandThreshold, inputId]);

  // Cleanup auto-expand flag on unmount
  useEffect(() => {
    return () => {
      sessionStorage.removeItem(`autoExpanded_${inputId}`);
    };
  }, [inputId]);

  // Reset the user toggle flag when the value significantly changes or empties
  useEffect(() => {
    // If text becomes significantly shorter, reset the user toggle flag
    if (value && value.length < autoExpandThreshold / 2) {
      userToggledRef.current = false;
    }
  }, [value, autoExpandThreshold]);

  // Handle focus and cursor restoration after mode changes
  useLayoutEffect(() => {
    if (inputRef.current && pendingCursorPosition) {
      // Apply focus and restore cursor position synchronously after DOM updates
      inputRef.current.focus();
      inputRef.current.setSelectionRange(
        pendingCursorPosition.start, 
        pendingCursorPosition.end
      );
      // Clear the pending position
      setPendingCursorPosition(null);
    }
  }, [isMultiline, pendingCursorPosition]); // Runs after mode changes or when cursor position updates

  // Toggle between input types
  const handleToggle = () => {
    if (allowToggle) {
      // Mark that the user has explicitly toggled
      userToggledRef.current = true;
      
      // Capture current selection before toggle
      if (inputRef.current) {
        setPendingCursorPosition({
          start: inputRef.current.selectionStart,
          end: inputRef.current.selectionEnd
        });
      }
      
      setIsMultiline(prev => !prev);
      // Reset expansion state and clear inline height style
      setIsExpanded(false); 
      if (inputRef.current) {
        inputRef.current.style.height = '';
      }
      
      // Focus will be restored by the useLayoutEffect
    }
  };

  // Toggle collapsed state
  const toggleCollapsed = () => {
    setIsCollapsed(prev => !prev);
  };

  // Generate preview text for collapsed view
  const generatePreview = () => {
    if (!value) return '';
    const lines = value.split('\n');
    if (lines.length <= previewLines) return value;
    
    return lines.slice(0, previewLines).join('\n') + '...';
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

    // Reset selection state at the start of the action
    setSelectionRange(null); 
    // Reset user edit tracking for new AI generation
    setUserEditedAfterAi(false);

    const inputElement = inputRef.current;
    const currentSelectionStart = inputElement.selectionStart;
    const currentSelectionEnd = inputElement.selectionEnd;
    let textToSend = value;
    let currentActionSelectionRange = null; // Use a temporary variable for this specific action

    // Check if there is a selection
    if (currentSelectionEnd > currentSelectionStart) {
      textToSend = value.substring(currentSelectionStart, currentSelectionEnd);
      currentActionSelectionRange = { start: currentSelectionStart, end: currentSelectionEnd };
      setSelectionRange(currentActionSelectionRange); // Store selection range in state for potential restoration
    } 
    // No need for an else block to set state to null, it was reset above

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
          // Use the selection range captured specifically for this action
          const range = currentActionSelectionRange; 
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
            
            // Update the selection range state to match the generated text
            setSelectionRange(newSelectionRange); 
          } else {
            // Replace the entire text
            newValue = responseData.output;
            // Create a selection range for the entire output
            newSelectionRange = { start: 0, end: responseData.output.length };
            setSelectionRange(newSelectionRange); // Update state for restoration
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

      // Construct the final system prompt, incorporating aiContext if provided
      const baseSystemPrompt = systemPromptOverride || systemPrompt || "Please concisely and diligently follow the following request. Provide the output only. Do not add any extra information or comments.";
      const finalSystemPrompt = aiContext ? `${aiContext}\n\n${baseSystemPrompt}` : baseSystemPrompt;

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
      // Clear the selection range state after the action is fully complete,
      // but allow the useEffect hook to potentially restore focus/selection first.
      // Use a small timeout to ensure state updates related to loading=false have propagated.
      setTimeout(() => {
        setSelectionRange(null);
      }, 0);
    }
  };

  // Wrap onChange to track user edits after AI generation
  const handleChange = (e) => {
    // If we can undo (meaning AI generation was done) and user is making changes
    if (canUndo && !isAiLoading) {
      setUserEditedAfterAi(true);
    }
    
    // Call the original onChange handler
    onChange(e);
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
      label: "Polish",
      value: "polish",
      icon: "edit"
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
    
    // Reset selection state before checking for a new one
    setSelectionRange(null); 
    
    const inputElement = inputRef.current;
    const currentSelectionStart = inputElement.selectionStart;
    const currentSelectionEnd = inputElement.selectionEnd;
    const hasSelection = currentSelectionEnd > currentSelectionStart;
    const currentText = hasSelection ? value.substring(currentSelectionStart, currentSelectionEnd) : value;

    if (!currentText || !currentText.trim()) {
      setAiValidationError("Please enter or select some text before using the AI assistant.");
      return;
    }
    
    // Store the selection range immediately when opening the menu if there is one
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
      case "polish":
        systemPromptToUse = "Polish and refine the following text to make it well-written. Improve word choice, flow, and clarity while preserving the original meaning. Maintain level of conciseness. Provide only the polished text. Never return comments or explanations.";
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

  // Generate unique IDs for accessibility - MOVED EARLIER
  // const inputId = id || `input-${name || Math.random().toString(36).substring(2, 9)}`; 
  const helpTextId = helpText ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const aiErrorId = aiValidationError ? `${inputId}-ai-error` : undefined;
  const describedBy = [helpTextId, errorId, aiErrorId].filter(Boolean).join(' ') || undefined;

  // Base input classes
  const baseInputClasses = `
    w-full p-2 border transition-colors duration-200
    ${error ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-700 focus:ring-red-500 focus:border-red-500' 
            : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'}
    ${disabled || isAiLoading ? 'bg-gray-100 cursor-not-allowed opacity-70' : ''}
    ${(!isMultiline && (
        (actionButtons) || 
        (showAiActionButton && !(disabled || aiActionDisabled)) || 
        (canUndo && !userEditedAfterAi)
      )) ? 'rounded-r-none' : ''}
    ${isMultiline ? 'rounded-t-none rounded-b-md text-sm overflow-y-hidden' : 'rounded-md'}
    ${isMultiline && isExpanded ? 'max-h-[70vh] overflow-y-auto' : ''}
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
  
  // Undo button - only show if user hasn't made edits after AI generation
  const undoButton = canUndo && !userEditedAfterAi ? (
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

  // Collapse/Expand button (only for collapsible inputs)
  const collapseButton = collapsible ? (
    <button
      onClick={toggleCollapsed}
      className="p-2 m-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors rounded-full"
      title={isCollapsed ? "Expand" : "Collapse"}
      disabled={disabled || isAiLoading}
      type="button"
      aria-label={isCollapsed ? "Expand content" : "Collapse content"}
    >
      <Icon name={isCollapsed ? "maximize-2" : "minimize-2"} className="h-4 w-4" />
    </button>
  ) : null;

  // Prepare AI action button if enabled
  const aiButton = showAiActionButton ? (
    <motion.button
      ref={aiButtonRef}
      onClick={handleAiButtonClick}
      className={`p-2 m-1 text-primary-500 hover:text-primary-700 hover:bg-gray-100 transition-colors rounded-full ${(!value.trim() && (!inputRef.current || inputRef.current.selectionEnd <= inputRef.current.selectionStart)) || isAiLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={isAiLoading ? "Generating..." : "Use AI assistant"}
      disabled={disabled || aiActionDisabled || isAiLoading || (!value.trim() && (!inputRef.current || inputRef.current.selectionEnd <= inputRef.current.selectionStart))}
      type="button"
      aria-label={isAiLoading ? "Generating content" : "Use AI assistant"}
      // Pulse animation
      animate={isAiPulseActive ? { scale: [1, 1.2, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
      transition={isAiPulseActive ? { duration: 0.5, repeat: 2, ease: "easeInOut" } : { duration: 0.2 }} // Repeat pulse twice
    >
      {isAiLoading ? (
        <Icon name="spinner" className="h-4 w-4 animate-spin" />
      ) : (
        <Icon name="sparkles" className="h-4 w-4" />
      )}
    </motion.button>
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
      {collapseButton}
      {undoButton}
      {aiButton}
      {actionButtons && (
        typeof actionButtons === 'object' && React.Children.map(actionButtons, wrapActionButton) || actionButtons
      )}
    </>
  );

  // Collapsed view styles and content
  const collapsedViewClasses = `
    overflow-hidden transition-all duration-300 ease-in-out
    ${isCollapsed ? `max-h-[${collapsedHeight}]` : 'max-h-[1000px]'}
  `;

  // Function to render the collapsed preview
  const renderCollapsedPreview = () => {
    return (
      <div 
        className="w-full p-3 bg-gray-50 border border-gray-200 text-gray-600 text-sm rounded-md cursor-pointer relative"
        onClick={toggleCollapsed}
        aria-label="Click to edit content"
      >
        <div className="whitespace-pre-wrap mb-2">{generatePreview()}</div>
        <div className="text-xs text-primary-600 text-center absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-50 to-transparent pt-6 pb-1">
          Click to expand
          <Icon name="chevron-down" className="h-4 w-4 mx-auto mt-1" />
        </div>
      </div>
    );
  };

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
          
          <div className="flex items-center space-x-2">
            {/* Show toggle for input types if allowed */}
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
            
            {/* Show collapse toggle if collapsible */}
            {collapsible && !isCollapsed && (
              <button
                type="button"
                onClick={toggleCollapsed}
                className="text-xs text-primary-600 hover:text-primary-800 flex items-center"
                disabled={disabled}
                aria-label="Collapse content"
              >
                <Icon name="minimize-2" className="h-3 w-3 mr-1" />
                Collapse
              </button>
            )}
          </div>
        </div>
      )}

      {/* Either show collapsed preview OR input field */}
      {collapsible && isCollapsed ? (
        renderCollapsedPreview()
      ) : (
        <>
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
                onChange={handleChange} // Use our wrapped onChange
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
                onChange={handleChange} // Use our wrapped onChange
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
        </>
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