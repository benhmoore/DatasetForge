import { useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import Icon from './Icons';

const ExampleTableHeader = forwardRef(({ 
  selectedExamples,
  handleDeleteSelected,
  handleParaphraseSelected,
  handleExport,
  getSearchTerm,
  setSearchTerm,
  getIsSearching,
  isProcessing,
  hasExamples,
  searchInputRef
}, ref) => {
  // Local state counter used to force re-renders
  const [updateCounter, setUpdateCounter] = useState(0);
  
  // Expose a forceUpdate method to the parent component
  useImperativeHandle(ref, () => ({
    forceUpdate: () => {
      setUpdateCounter(prev => prev + 1);
    }
  }));
  
  // Get current values from the parent getters
  const searchTerm = getSearchTerm();
  const isSearching = getIsSearching();

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 px-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-medium">Examples</h3>
        
        {selectedExamples.size > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
            {selectedExamples.size} selected
          </span>
        )}
      </div>
      
      {/* Search */}
      <div className="relative w-full md:w-auto">
        <input
          type="text"
          className="w-full md:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          placeholder="Search examples..."
          value={searchTerm}
          onChange={(e) => {
            // Just set the value and the debounce is handled by the native event listener
            setSearchTerm(e.target.value);
          }}
          ref={searchInputRef}
        />
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {isSearching ? (
            <Icon name="spinner" className="animate-spin h-5 w-5 text-gray-400" />
          ) : (
            <Icon name="search" className="h-5 w-5 text-gray-400" />
          )}
        </div>
        {searchTerm && (
          <button 
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
            onClick={() => setSearchTerm('')}
            title="Clear search"
          >
            <Icon name="close" className="h-5 w-5 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>
      
      <div className="flex space-x-2">
        {selectedExamples.size > 0 && (
          <>
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm transition-all duration-200 transform hover:shadow active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Icon name="spinner" className="animate-spin h-4 w-4 mr-1" />
                  Processing...
                </>
              ) : (
                <>
                  <Icon name="trash" className="w-4 h-4 mr-1" />
                  Delete Selected
                </>
              )}
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (handleParaphraseSelected) {
                  handleParaphraseSelected();
                }
              }}
              className="px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm transition-all duration-200 transform hover:shadow active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
              disabled={isProcessing}
              title="Create paraphrased versions of selected examples"
            >
              {isProcessing ? (
                <>
                  <Icon name="spinner" className="animate-spin h-4 w-4 mr-1" />
                  Processing...
                </>
              ) : (
                <>
                  <Icon name="language" className="w-4 h-4 mr-1" />
                  Paraphrase Selected
                </>
              )}
            </button>
          </>
        )}
        
        <button
          onClick={handleExport}
          className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm transition-all duration-200 transform hover:shadow active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed"
          disabled={!hasExamples}
        >
          <span className="flex items-center">
            <Icon name="download" className="w-4 h-4 mr-1" />
            Export JSONL
          </span>
        </button>
      </div>
    </div>
  );
});

export default ExampleTableHeader;