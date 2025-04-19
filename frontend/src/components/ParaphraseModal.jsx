import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import Icon from './Icons';
import api from '../api/apiClient';

const ParaphraseModal = ({ 
  isOpen, 
  onClose, 
  sourceText = '', 
  variationId = null,
  onEdit, 
  onAddVariations 
}) => {
  // State management
  const [paraphraseInstruction, setParaphraseInstruction] = useState('');
  const [paraphraseCount, setParaphraseCount] = useState(3);
  const [isParaphrasing, setIsParaphrasing] = useState(false);
  const [paraphrasedOutputs, setParaphrasedOutputs] = useState([]);
  const [selectedParaphrases, setSelectedParaphrases] = useState([]);
  
  // Refs
  const paraphraseInputRef = useRef(null);

  // Focus the input when modal opens
  useEffect(() => {
    if (isOpen && paraphraseInputRef.current) {
      paraphraseInputRef.current.focus();
    }
    
    // Clear state when modal opens with new content
    if (isOpen) {
      setParaphrasedOutputs([]);
      setSelectedParaphrases([]);
    }
  }, [isOpen]);
  
  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);
  
  // Clear all state when closing modal
  const handleClose = useCallback(() => {
    setParaphraseInstruction('');
    setParaphrasedOutputs([]);
    setSelectedParaphrases([]);
    onClose();
  }, [onClose]);
  
  // Generate paraphrases
  const handleParaphraseWithInstruction = useCallback(async () => {
    try {
      setIsParaphrasing(true);
      setParaphrasedOutputs([]);
      setSelectedParaphrases([]);
      
      const response = await api.paraphraseText({
        text: sourceText,
        count: paraphraseCount,
        instructions: paraphraseInstruction || undefined
      });
      
      if (response && response.paraphrases && response.paraphrases.length > 0) {
        setParaphrasedOutputs(response.paraphrases);
      } else {
        toast.warning('No paraphrases were generated.');
      }
    } catch (error) {
      console.error('Paraphrase error:', error);
      toast.error(`Failed to generate paraphrases: ${error.message || 'Unknown error'}`);
    } finally {
      setIsParaphrasing(false);
    }
  }, [sourceText, paraphraseCount, paraphraseInstruction]);
  
  // Toggle selection of a paraphrased output
  const toggleParaphraseSelection = useCallback((text) => {
    setSelectedParaphrases(prev => {
      // If already selected, remove it
      if (prev.includes(text)) {
        return prev.filter(t => t !== text);
      } 
      // Otherwise add it
      return [...prev, text];
    });
  }, []);
  
  // Handle saving the selected paraphrases
  const handleSaveParaphrases = useCallback(() => {
    // If none selected, show a warning
    if (selectedParaphrases.length === 0) {
      toast.warning("Please select at least one paraphrase to save.");
      return;
    }
    
    // Create new variations for all selected paraphrases
    // Don't replace the existing variation
    if (onAddVariations) {
      onAddVariations(variationId, selectedParaphrases);
      toast.success(`Added ${selectedParaphrases.length} new variation${selectedParaphrases.length > 1 ? 's' : ''} from paraphrases.`);
    } else {
      // Fallback if onAddVariations not provided
      toast.error("Unable to add variations. The callback is not provided.");
    }
    
    // Close the modal and reset states
    handleClose();
  }, [selectedParaphrases, variationId, onAddVariations, handleClose]);
  
  // Handle key press
  const handleParaphraseKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleParaphraseWithInstruction();
    }
  }, [handleParaphraseWithInstruction]);
  
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paraphrase-modal-title"
    >
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-auto shadow-xl animate-fadeIn" onClick={e => e.stopPropagation()}>
        <h3 id="paraphrase-modal-title" className="text-lg font-medium mb-4">Paraphrase Text</h3>
        
        <div className="mb-4">
          <div className="flex flex-col space-y-2">
            <label htmlFor="paraphrase-instruction" className="text-sm font-medium text-gray-700">
              Additional Instructions (Optional)
            </label>
            <input
              id="paraphrase-instruction"
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
            <label htmlFor="paraphrase-count" className="text-sm font-medium text-gray-700">
              Number of Paraphrases to Generate
            </label>
            <div className="flex items-center space-x-2">
              <input
                id="paraphrase-count"
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
        
        {/* Preview of original text */}
        <div className="mb-6 rounded border border-gray-200 bg-gray-50 p-3">
          <h4 className="text-xs font-medium text-gray-500 mb-1">Original Text</h4>
          <div className="text-sm whitespace-pre-wrap text-gray-700">{sourceText}</div>
        </div>
        
        {paraphrasedOutputs.length > 0 && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-md font-medium">Select Paraphrases</h4>
              <span className="text-xs text-gray-500">
                {selectedParaphrases.length} selected
              </span>
            </div>
            
            <div className="text-xs text-gray-600 mb-2">
              Select one or more paraphrases. You can create multiple variations at once.
            </div>
            
            <div className="max-h-72 overflow-y-auto space-y-3 pr-2">
              {paraphrasedOutputs.map((text, index) => {
                const isSelected = selectedParaphrases.includes(text);
                return (
                  <div 
                    key={index} 
                    className={`p-3 rounded border transition-all duration-200 cursor-pointer ${
                      isSelected 
                        ? 'bg-primary-50 border-primary-300 ring-1 ring-primary-200' 
                        : 'bg-gray-50 border-gray-200 hover:border-primary-200 hover:bg-gray-100'
                    }`}
                    onClick={() => toggleParaphraseSelection(text)}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center">
                        <div className={`flex-shrink-0 h-4 w-4 rounded border mr-2 flex items-center justify-center ${
                          isSelected 
                            ? 'bg-primary-500 border-primary-600' 
                            : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && <Icon name="check" className="h-3 w-3 text-white" />}
                        </div>
                        <span className="text-xs font-medium text-gray-700">Paraphrase {index + 1}</span>
                      </div>
                    </div>
                    <div className="text-sm whitespace-pre-wrap pl-6">{text}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {paraphrasedOutputs.length > 0 ? (
              <p>Select multiple paraphrases to add as new variations.</p>
            ) : (
              <p>Press Ctrl+Enter to generate paraphrases.</p>
            )}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            
            {paraphrasedOutputs.length > 0 ? (
              <button
                onClick={handleSaveParaphrases}
                disabled={selectedParaphrases.length === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors focus:ring-2 focus:ring-green-300 focus:ring-offset-2 disabled:bg-green-300 disabled:cursor-not-allowed"
              >
                Add Selected ({selectedParaphrases.length})
              </button>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParaphraseModal;