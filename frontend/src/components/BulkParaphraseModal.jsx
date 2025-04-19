import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import Icon from './Icons';

const BulkParaphraseModal = ({ 
  isOpen, 
  onClose, 
  examples, 
  datasetId, 
  onSuccess 
}) => {
  // State
  const [paraphraseCount, setParaphraseCount] = useState(3);
  const [paraphraseInstruction, setParaphraseInstruction] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Refs
  const modalRef = useRef(null);
  const instructionInputRef = useRef(null);
  
  // Focus input on open
  useEffect(() => {
    if (isOpen && instructionInputRef.current) {
      instructionInputRef.current.focus();
    }
  }, [isOpen]);
  
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen && !isProcessing) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, isProcessing]);
  
  // Process paraphrasing of examples
  const handleProcess = useCallback(async () => {
    if (!examples || examples.length === 0 || !datasetId) {
      toast.error('No examples selected for paraphrasing');
      return;
    }
    
    setIsProcessing(true);
    setProgress({ current: 0, total: examples.length });
    
    const paraphrasedExamples = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < examples.length; i++) {
      const example = examples[i];
      setProgress({ current: i + 1, total: examples.length });
      
      try {
        // Get the paraphrases for the example's output
        const response = await api.paraphraseText({
          text: example.output,
          count: paraphraseCount,
          instructions: paraphraseInstruction || undefined
        });
        
        if (response && response.paraphrases && response.paraphrases.length > 0) {
          // For each paraphrase, create a new example
          for (const paraphrasedText of response.paraphrases) {
            // Create a new example with the paraphrased output
            const newExample = {
              ...example,
              output: paraphrasedText,
              // Don't include id as this will be a new example
              id: undefined
            };
            
            paraphrasedExamples.push(newExample);
          }
          successCount++;
        } else {
          console.warn(`No paraphrases generated for example ${example.id}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`Error paraphrasing example ${example.id}:`, error);
        errorCount++;
      }
    }
    
    // Save all the new examples to the dataset
    if (paraphrasedExamples.length > 0) {
      try {
        await api.saveExamples(datasetId, paraphrasedExamples);
        toast.success(`Added ${paraphrasedExamples.length} paraphrased examples to the dataset`);
        
        // Callback for parent to refresh data
        if (onSuccess) {
          onSuccess();
        }
      } catch (error) {
        console.error('Failed to save paraphrased examples:', error);
        toast.error('Failed to save paraphrased examples');
      }
    } else {
      toast.warning('No paraphrases were generated');
    }
    
    setIsProcessing(false);
    onClose();
  }, [examples, datasetId, paraphraseCount, paraphraseInstruction, onSuccess, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-paraphrase-title"
    >
      <div 
        ref={modalRef}
        className="bg-white rounded-lg p-6 max-w-2xl w-full mx-auto shadow-xl animate-fadeIn" 
        onClick={e => e.stopPropagation()}
      >
        <h3 id="bulk-paraphrase-title" className="text-lg font-medium mb-4">
          Paraphrase {examples?.length} Selected Example{examples?.length !== 1 ? 's' : ''}
        </h3>
        
        <div className="mb-4">
          <div className="text-sm text-gray-600 mb-3">
            This will create {examples?.length * paraphraseCount} new examples in your dataset by generating {paraphraseCount} paraphrases for each selected example.
          </div>
          
          <div className="flex flex-col space-y-4">
            <div>
              <label htmlFor="paraphrase-instruction" className="block text-sm font-medium text-gray-700 mb-1">
                Paraphrasing Instructions (Optional)
              </label>
              <input
                id="paraphrase-instruction"
                ref={instructionInputRef}
                type="text"
                value={paraphraseInstruction}
                onChange={(e) => setParaphraseInstruction(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="E.g., 'Make it more formal' or 'Change character names'"
                disabled={isProcessing}
              />
            </div>
            
            <div>
              <label htmlFor="paraphrase-count" className="block text-sm font-medium text-gray-700 mb-1">
                Number of Paraphrases per Example
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="paraphrase-count"
                  type="range"
                  min="1"
                  max="10"
                  value={paraphraseCount}
                  onChange={(e) => setParaphraseCount(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                  disabled={isProcessing}
                />
                <span className="text-sm font-medium text-gray-700 min-w-[2rem] text-center">
                  {paraphraseCount}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {isProcessing && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Processing...</span>
              <span className="text-sm text-gray-500">
                {progress.current} of {progress.total}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            onClick={handleProcess}
            disabled={isProcessing || !examples || examples.length === 0}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2 disabled:bg-indigo-300 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <span className="flex items-center">
                <Icon name="spinner" className="animate-spin h-4 w-4 mr-2" aria-hidden="true" />
                Processing...
              </span>
            ) : (
              `Create ${examples?.length * paraphraseCount} Paraphrases`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkParaphraseModal;