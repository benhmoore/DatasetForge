import { useState, useRef, useEffect } from 'react';
import { toast } from 'react-toastify';

const VariationCard = ({ 
  variation, 
  output, 
  onStar, 
  onEdit, 
  onRegenerate, 
  isStarred = false,
  isGenerating = false,
  error = null
}) => {
  const [editedOutput, setEditedOutput] = useState(output);
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [regenerateInstruction, setRegenerateInstruction] = useState('');
  const regenerateInputRef = useRef(null);
  
  // Focus the instruction input when the modal opens
  useEffect(() => {
    if (isRegenerateModalOpen && regenerateInputRef.current) {
      regenerateInputRef.current.focus();
    }
  }, [isRegenerateModalOpen]);
  
  // Handle star button click
  const handleStar = () => {
    if (isGenerating) return;
    onStar(isEditing ? editedOutput : output);
  };
  
  // Handle edit button click
  const handleEditToggle = () => {
    if (isGenerating) return;
    
    if (isEditing) {
      // Save the edit
      if (editedOutput.trim() === '') {
        toast.error('Output cannot be empty');
        return;
      }
      
      onEdit(editedOutput);
      setIsEditing(false);
    } else {
      // Start editing
      setIsEditing(true);
    }
  };
  
  // Handle regenerate button click
  const handleRegenerate = () => {
    if (isGenerating) return;
    setIsRegenerateModalOpen(true);
  };
  
  // Handle regenerate with instruction
  const handleRegenerateWithInstruction = () => {
    onRegenerate(regenerateInstruction);
    setIsRegenerateModalOpen(false);
    setRegenerateInstruction('');
  };
  
  // Handle regenerate modal key press
  const handleRegenerateKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleRegenerateWithInstruction();
    } else if (e.key === 'Escape') {
      setIsRegenerateModalOpen(false);
      setRegenerateInstruction('');
    }
  };
  
  // Handle output text change
  const handleOutputChange = (e) => {
    setEditedOutput(e.target.value);
  };
  
  // Render loading state
  if (isGenerating) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm transition-all duration-300 hover:shadow-md">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-medium text-gray-900">{variation}</h4>
          <div className="flex items-center space-x-1 text-sm">
            <svg className="animate-spin h-4 w-4 text-primary-500 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-gray-500">Generating...</span>
          </div>
        </div>
        <div className="w-full h-32 bg-gray-100 rounded">
          <div className="h-full w-full overflow-hidden relative">
            <div className="animate-pulse absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:400%_100%]"></div>
          </div>
        </div>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="p-4 bg-white rounded-lg border border-red-200 shadow-sm transform transition-all duration-300 hover:shadow-md">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-medium text-gray-900">{variation}</h4>
          <div className="flex space-x-1">
            <button
              onClick={handleRegenerate}
              className="text-primary-600 hover:text-primary-800 p-1 transition-colors"
              title="Regenerate"
            >
              <span className="inline-block hover:rotate-180 transition-transform duration-500">🔄</span>
            </button>
          </div>
        </div>
        <div className="p-3 bg-red-50 text-red-700 rounded border border-red-100 text-sm animate-fadeIn">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`p-4 bg-white rounded-lg border ${
        isStarred 
          ? 'border-primary-200 ring-1 ring-primary-500' 
          : 'border-gray-200'
      } shadow-sm transform transition-all duration-200 hover:shadow-md ${
        isStarred ? 'scale-[1.01]' : 'hover:scale-[1.01]'
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-medium text-gray-900">{variation}</h4>
        <div className="flex space-x-1">
          <button
            onClick={handleStar}
            className={`p-1 transition-all duration-200 transform ${
              isStarred 
                ? 'text-yellow-500 scale-110 bg-yellow-50 rounded-full shadow-inner' 
                : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100 hover:rounded-full'
            }`}
            title={isStarred ? 'Unstar' : 'Star'}
          >
            <span className={`inline-block ${isStarred ? 'text-xl' : 'text-lg'}`}>
              {isStarred ? '⭐' : '☆'}
            </span>
          </button>
          <button
            onClick={handleEditToggle}
            className="text-primary-600 hover:text-primary-800 p-1 transition-colors"
            title={isEditing ? 'Save' : 'Edit'}
          >
            {isEditing ? '💾' : '✎'}
          </button>
          <button
            onClick={handleRegenerate}
            className="text-primary-600 hover:text-primary-800 p-1 transition-colors"
            title="Regenerate"
          >
            <span className="inline-block hover:rotate-180 transition-transform duration-500">🔄</span>
          </button>
        </div>
      </div>
      
      {isEditing ? (
        <textarea
          value={editedOutput}
          onChange={handleOutputChange}
          className="w-full p-2 border border-gray-300 rounded-md h-32 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200"
          placeholder="Output"
          autoFocus
        />
      ) : (
        <div className="p-3 bg-gray-50 rounded border border-gray-100 text-sm whitespace-pre-wrap transition-all duration-200 hover:border-gray-200">
          {output}
        </div>
      )}
      
      {/* Regenerate Modal */}
      {isRegenerateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl animate-fadeIn">
            <h3 className="text-lg font-medium mb-4">Regenerate with Instructions</h3>
            <div className="mb-4">
              <input
                ref={regenerateInputRef}
                type="text"
                value={regenerateInstruction}
                onChange={(e) => setRegenerateInstruction(e.target.value)}
                onKeyDown={handleRegenerateKeyPress}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Provide additional instructions for the model (e.g., 'Make it more concise' or 'Add more detail')"
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
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
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
    </div>
  );
};

export default VariationCard;