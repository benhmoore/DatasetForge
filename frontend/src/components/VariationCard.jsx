import { useState } from 'react';
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
    onRegenerate();
  };
  
  // Handle output text change
  const handleOutputChange = (e) => {
    setEditedOutput(e.target.value);
  };
  
  // Render loading state
  if (isGenerating) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-medium text-gray-900">{variation}</h4>
          <div className="flex space-x-1 text-sm">
            <span className="text-gray-500">Generating...</span>
          </div>
        </div>
        <div className="w-full h-32 bg-gray-100 rounded animate-pulse"></div>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="p-4 bg-white rounded-lg border border-red-200 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-medium text-gray-900">{variation}</h4>
          <div className="flex space-x-1">
            <button
              onClick={handleRegenerate}
              className="text-primary-600 hover:text-primary-800 p-1"
              title="Regenerate"
            >
              🔄
            </button>
          </div>
        </div>
        <div className="p-3 bg-red-50 text-red-700 rounded border border-red-100 text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-white rounded-lg border ${isStarred ? 'border-primary-200 ring-1 ring-primary-500' : 'border-gray-200'} shadow-sm`}>
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-medium text-gray-900">{variation}</h4>
        <div className="flex space-x-1">
          <button
            onClick={handleStar}
            className={`p-1 ${isStarred ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
            title={isStarred ? 'Starred' : 'Star'}
          >
            ⭐
          </button>
          <button
            onClick={handleEditToggle}
            className="text-primary-600 hover:text-primary-800 p-1"
            title={isEditing ? 'Save' : 'Edit'}
          >
            {isEditing ? '💾' : '✎'}
          </button>
          <button
            onClick={handleRegenerate}
            className="text-primary-600 hover:text-primary-800 p-1"
            title="Regenerate"
          >
            🔄
          </button>
        </div>
      </div>
      
      {isEditing ? (
        <textarea
          value={editedOutput}
          onChange={handleOutputChange}
          className="w-full p-2 border border-gray-300 rounded-md h-32"
          placeholder="Output"
          autoFocus
        />
      ) : (
        <div className="p-3 bg-gray-50 rounded border border-gray-100 text-sm whitespace-pre-wrap">
          {output}
        </div>
      )}
    </div>
  );
};

export default VariationCard;