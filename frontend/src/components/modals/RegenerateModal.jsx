import { useState, useRef, useCallback, useEffect } from 'react';

const RegenerateModal = ({ 
  isOpen, 
  onClose, 
  sourceText = '', 
  onRegenerate
}) => {
  // State management
  const [instruction, setInstruction] = useState('');
  
  // Refs
  const instructionInputRef = useRef(null);
  const modalRef = useRef(null);

  // Clear state when closing modal
  const handleClose = useCallback((e) => {
    // Make sure event doesn't bubble up to parent elements
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    
    setInstruction('');
    
    // Call the parent's onClose callback
    if (onClose) onClose(e);
  }, [onClose]);

  // Focus the input when modal opens
  useEffect(() => {
    if (isOpen && instructionInputRef.current) {
      instructionInputRef.current.focus();
    }
    
    // Clear state when modal opens with new content
    if (isOpen) {
      setInstruction('');
    }
  }, [isOpen]);
  
  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        // Stop propagation to prevent parent modals from also closing
        e.stopPropagation();
        if (e.preventDefault) e.preventDefault();
        
        // Close this modal
        handleClose();
        
        // Don't let this event reach parent modals
        return false;
      }
    };

    // Use capture phase to intercept events before they reach other handlers
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [isOpen, handleClose]);
  
  // Handle regenerating with instruction
  const handleRegenerateWithInstruction = useCallback(() => {
    onRegenerate(instruction);
    handleClose();
  }, [instruction, onRegenerate, handleClose]);
  
  // Handle key press
  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleRegenerateWithInstruction();
    }
  }, [handleRegenerateWithInstruction]);
  
  if (!isOpen) return null;

  // Use a very high z-index to ensure this is above all other modals
  return (
    <div 
      ref={modalRef}
      className="fixed inset-0 bg-black bg-opacity-50 z-[1000] flex items-center justify-center"
      onClick={(e) => {
        // It's very important to stop propagation here to prevent bubbling to parent modals
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          handleClose(e);
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="regenerate-modal-title"
    >
      <div 
        className="bg-white rounded-lg p-6 max-w-3xl w-full mx-auto shadow-2xl animate-fadeIn relative z-[1001]" 
        onClick={(e) => {
          // Make absolutely sure the click doesn't propagate up
          e.stopPropagation();
          if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation();
        }}
      >
        <h3 id="regenerate-modal-title" className="text-lg font-medium mb-4">Regenerate with Instructions</h3>
        
        <div className="mb-4">
          <div className="flex flex-col space-y-2">
            <label htmlFor="regenerate-instruction" className="text-sm font-medium text-gray-700">
              Additional Instructions (Optional)
            </label>
            <input
              id="regenerate-instruction"
              ref={instructionInputRef}
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleKeyPress}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="E.g., 'Make it more concise' or 'Add more details'"
              aria-label="Regeneration instructions"
            />
          </div>
        </div>
        
        {/* Preview of original text */}
        <div className="mb-6 rounded border border-gray-200 bg-gray-50 p-3">
          <h4 className="text-xs font-medium text-gray-500 mb-1">Original Text</h4>
          <div className="text-sm whitespace-pre-wrap text-gray-700">{sourceText}</div>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            <p>Press Enter to regenerate or Escape to cancel.</p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClose(e);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRegenerateWithInstruction();
              }}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors focus:ring-2 focus:ring-primary-300 focus:ring-offset-2"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegenerateModal;