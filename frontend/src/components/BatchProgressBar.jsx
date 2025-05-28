import { useState, useEffect } from 'react';
import Icon from './Icons';

/**
 * BatchProgressBar - Component to display batch generation progress
 * Shows overall progress percentage, current batch, and batch count
 */
const BatchProgressBar = ({ 
  progress, 
  onCancel,
  showCancelButton = true,
  className = "" 
}) => {
  const [isIndeterminate, setIsIndeterminate] = useState(progress?.percentComplete === 0);
  
  // If progress is undefined, show indeterminate progress
  useEffect(() => {
    if (!progress) {
      setIsIndeterminate(true);
      return;
    }
    
    if (progress.percentComplete === 0) {
      setIsIndeterminate(true);
    } else {
      setIsIndeterminate(false);
    }
  }, [progress]);
  
  if (!progress) {
    // Show indeterminate progress bar while waiting for progress data
    return (
      <div className={`flex flex-col bg-gray-50 rounded-lg p-4 border shadow-sm ${className}`}>
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-medium text-gray-700">Preparing generation...</h4>
          {showCancelButton && (
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700 bg-white rounded-full p-1"
              title="Cancel generation"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="h-2 bg-blue-500 animate-pulse-width"></div>
        </div>
      </div>
    );
  }
  
  const { percentComplete, currentBatch, totalBatches, status, error } = progress;
  
  // Format the percentage with no decimal places
  const formattedPercent = Math.round(percentComplete);
  
  // Determine status color
  const getStatusColor = () => {
    switch (status) {
      case 'complete': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'aborted': return 'text-amber-600';
      default: return 'text-blue-600';
    }
  };
  
  return (
    <div className={`flex flex-col bg-gray-50 rounded-lg p-4 border shadow-sm ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-medium text-gray-700 flex items-center">
          {status === 'complete' ? (
            <>
              <Icon name="check-circle" className="h-4 w-4 text-green-500 mr-1" />
              Generation complete
            </>
          ) : status === 'error' ? (
            <>
              <Icon name="warning" className="h-4 w-4 text-red-500 mr-1" />
              Error: {error || 'Generation failed'}
            </>
          ) : status === 'aborted' ? (
            <>
              <Icon name="close-circle" className="h-4 w-4 text-amber-500 mr-1" />
              Generation canceled
            </>
          ) : (
            <>
              <span className="inline-block h-3 w-3 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
              Generating variations ({formattedPercent}%)
            </>
          )}
        </h4>
        {showCancelButton && status === 'processing' && (
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 bg-white rounded-full p-1"
            title="Cancel generation"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2 overflow-hidden">
        <div 
          className={`h-2 ${isIndeterminate ? 'animate-pulse-width' : ''} ${
            status === 'complete' ? 'bg-green-500' : 
            status === 'error' ? 'bg-red-500' : 
            status === 'aborted' ? 'bg-amber-500' : 
            'bg-blue-500'
          }`}
          style={{ width: `${isIndeterminate ? 100 : formattedPercent}%` }}
        ></div>
      </div>
      
      {totalBatches > 1 && (
        <div className="text-xs text-gray-500 flex items-center justify-between">
          <span className={getStatusColor()}>
            Batch {currentBatch} of {totalBatches}
          </span>
          <span>
            {formattedPercent}% complete
          </span>
        </div>
      )}
    </div>
  );
};

export default BatchProgressBar;