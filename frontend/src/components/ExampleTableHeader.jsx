import { useState, useEffect, useRef } from 'react';
import Icon from './Icons';

const ExampleTableHeader = ({ 
  selectedExamples,
  handleDeleteSelected,
  handleParaphraseSelected,
  handleExport,
  searchValue,
  onSearchChange,
  isSearching,
  isProcessing,
  hasExamples,
  onClearSearch
}) => {
  const searchInputRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  // Focus the search input when pressing Ctrl+F or Command+F
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-medium">Examples</h3>
        
        {selectedExamples.size > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
            {selectedExamples.size} selected
          </span>
        )}
      </div>
      
      {/* Search with enhanced UI */}
      <div className={`relative w-full md:w-64 transition-all duration-200 ${isFocused ? 'md:w-80' : ''}`}>
        <div className={`flex items-center border rounded-md overflow-hidden transition-all ${
          isFocused 
            ? 'ring-2 ring-primary-500 border-primary-500' 
            : 'border-gray-300 hover:border-gray-400'
        }`}>
          <div className="pl-3 py-2 flex items-center pointer-events-none">
            {isSearching ? (
              <Icon name="spinner" className="animate-spin h-5 w-5 text-primary-500" aria-hidden="true" />
            ) : (
              <Icon name="search" className={`h-5 w-5 ${isFocused ? 'text-primary-500' : 'text-gray-400'}`} aria-hidden="true" />
            )}
          </div>
          
          <input
            type="text"
            className="w-full pl-2 pr-8 py-2 focus:outline-none bg-transparent"
            placeholder="Search examples..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            ref={searchInputRef}
            aria-label="Search examples"
          />
          
          {searchValue && (
            <button 
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => {
                onClearSearch();
                searchInputRef.current?.focus();
              }}
              title="Clear search"
              aria-label="Clear search"
            >
              <Icon 
                name="close" 
                className="h-5 w-5 text-gray-400 hover:text-gray-600" 
                aria-hidden="true" 
              />
            </button>
          )}
        </div>
        
        {searchValue && !isSearching && (
          <div className="absolute right-0 -bottom-6 text-xs text-gray-500">
            Press Enter to search
          </div>
        )}
      </div>
      
      <div className="flex space-x-2">
        {selectedExamples.size > 0 && (
          <>
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm transition-all duration-200 transform hover:shadow active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
              disabled={isProcessing}
              aria-label={`Delete ${selectedExamples.size} selected examples`}
            >
              {isProcessing ? (
                <>
                  <Icon name="spinner" className="animate-spin h-4 w-4 mr-1" aria-hidden="true" />
                  Processing...
                </>
              ) : (
                <>
                  <Icon name="trash" className="w-4 h-4 mr-1" aria-hidden="true" />
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
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm transition-all duration-200 transform hover:shadow active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
              disabled={isProcessing}
              title="Create paraphrased versions of selected examples"
              aria-label={`Paraphrase ${selectedExamples.size} selected examples`}
            >
              {isProcessing ? (
                <>
                  <Icon name="spinner" className="animate-spin h-4 w-4 mr-1" aria-hidden="true" />
                  Processing...
                </>
              ) : (
                <>
                  <Icon name="language" className="w-4 h-4 mr-1" aria-hidden="true" />
                  Paraphrase Selected
                </>
              )}
            </button>
          </>
        )}
        
        <button
          onClick={handleExport}
          className="px-3 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm transition-all duration-200 transform hover:shadow active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
          disabled={!hasExamples}
          aria-label="Export examples as JSONL"
        >
          <Icon name="download" className="w-4 h-4 mr-1" aria-hidden="true" />
          Export JSONL
        </button>
      </div>
    </div>
  );
};

export default ExampleTableHeader;