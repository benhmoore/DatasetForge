import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icons';

/**
 * A custom text input component that can toggle between single-line input and textarea,
 * and supports action buttons on the right side.
 */
const CustomTextInput = ({ 
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
  multiline = false,
  rows = 3,
  allowToggle = false,
  
  // Action buttons
  actionButtons = null,
  
  // AI action button
  showAiActionButton = true,
  onAiAction = () => {},
  aiActionDisabled = false,

  // Additional styling
  className = '',
  containerClassName = ''
}) => {
  // State for toggling between input types if allowToggle is true
  const [isMultiline, setIsMultiline] = useState(multiline);
  
  // References
  const inputRef = useRef(null);
  
  // Auto-focus handling
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus, isMultiline]);

  // Toggle between input types
  const handleToggle = () => {
    if (allowToggle) {
      setIsMultiline(prev => !prev);
    }
  };

  // Generate unique IDs for accessibility
  const inputId = id || `input-${name || Math.random().toString(36).substring(2, 9)}`;
  const helpTextId = helpText ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [helpTextId, errorId].filter(Boolean).join(' ') || undefined;

  // Base input classes
  const baseInputClasses = `
    w-full p-2 border rounded-md transition-colors duration-200
    ${error ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-700 focus:ring-red-500 focus:border-red-500' 
            : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'}
    ${disabled ? 'bg-gray-100 cursor-not-allowed opacity-70' : ''}
    ${(actionButtons || showAiActionButton) ? 'rounded-r-none' : ''}
    ${className}
  `;

  // Prepare AI action button if enabled
  const aiButton = showAiActionButton ? (
    <button
      onClick={() => onAiAction(value, name)}
      className="p-2 m-1 text-primary-500 hover:text-primary-700 hover:bg-gray-100 transition-colors rounded-full"
      title="Use AI assistant"
      disabled={disabled || aiActionDisabled}
      type="button"
      aria-label="Use AI assistant"
    >
      <Icon name="sparkles" className="h-4 w-4" />
    </button>
  ) : null;

  // Function to ensure any child action buttons have consistent styling
  const wrapActionButton = (actionButton) => {
    // If the action button is already a React element, wrap it with our styling
    if (React.isValidElement(actionButton)) {
      // Apply our custom rounded styling by cloning the element
      return React.cloneElement(actionButton, {
        className: `p-2 m-1 transition-colors rounded-full ${actionButton.props.className || ''}`,
      });
    }
    return actionButton;
  };

  // Combine custom action buttons with AI button if needed
  const combinedActionButtons = showAiActionButton ? (
    <>
      {aiButton}
      {actionButtons && (
        typeof actionButtons === 'object' && React.Children.map(actionButtons, wrapActionButton) || actionButtons
      )}
    </>
  ) : actionButtons && (
    typeof actionButtons === 'object' && React.Children.map(actionButtons, wrapActionButton) || actionButtons
  );

  return (
    <div className={`space-y-1 ${containerClassName}`}>
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
      <div className="flex items-stretch">
        {/* Dynamic input based on type */}
        {isMultiline ? (
          <textarea
            ref={inputRef}
            id={inputId}
            name={name}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            className={baseInputClasses}
            aria-invalid={!!error}
            aria-describedby={describedBy}
          />
        ) : (
          <input
            ref={inputRef}
            id={inputId}
            name={name}
            type="text"
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            placeholder={placeholder}
            disabled={disabled}
            className={baseInputClasses}
            aria-invalid={!!error}
            aria-describedby={describedBy}
          />
        )}

        {/* Action buttons */}
        {combinedActionButtons && (
          <div className={`flex items-center border-t border-r border-b ${
            error ? 'border-red-300' : 'border-gray-300'
          } rounded-r-md bg-gray-50`}>
            {combinedActionButtons}
          </div>
        )}
      </div>

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
    </div>
  );
};

export default CustomTextInput;