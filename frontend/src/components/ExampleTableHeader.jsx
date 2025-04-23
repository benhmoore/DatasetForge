import { useState, useEffect, useRef, memo } from 'react';
import Icon from './Icons';

// Create search box component that's only memoized for performance reasons
// but will still update properly when search value changes
const SearchBox = memo(({
  searchValue,
  onSearchChange,
  isSearching,
  onClearSearch,
  searchInputRef
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const localSearchInputRef = useRef(null);
  const effectiveSearchInputRef = searchInputRef || localSearchInputRef;

  // Focus the search input via custom event
  useEffect(() => {
    const handleFocusSearch = () => {
      effectiveSearchInputRef.current?.focus();
    };
    
    // Listen for the custom event
    window.addEventListener('focusSearchInput', handleFocusSearch);
    return () => window.removeEventListener('focusSearchInput', handleFocusSearch);
  }, [effectiveSearchInputRef]);

  return (
    <div className={`relative w-full md:w-64 transition-all duration-200 ${isFocused ? 'md:w-96' : ''}`}>
      <div className={`flex items-center border rounded-md overflow-hidden shadow-sm transition-all ${
        isFocused || isSearching
          ? 'ring-1 ring-primary-500 border-primary-500' 
          : 'border-gray-300 hover:border-gray-400'
      }`}>
        <div className="pl-3 py-2 flex items-center pointer-events-none">
          {isSearching ? (
            <Icon name="spinner" className="animate-spin h-4 w-4 text-primary-500" aria-hidden="true" />
          ) : (
            <Icon name="search" className={`h-4 w-4 ${isFocused || isSearching ? 'text-primary-500' : 'text-gray-400'}`} aria-hidden="true" />
          )}
        </div>
        
        <input
          type="text"
          className="w-full pl-2 pr-8 py-2 text-sm focus:outline-none bg-transparent"
          placeholder="Type and press Enter to search"
          value={searchValue}
          onChange={(e) => {
            // Ensure the change handler gets called
            console.log('Input change:', e.target.value);
            onSearchChange(e.target.value);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // Immediately trigger search without needing event dispatch
              window.dispatchEvent(new CustomEvent('triggerSearch', { detail: searchValue }));
            } else if (e.key === 'Escape') {
              e.preventDefault();
              if (searchValue) {
                onClearSearch();
              } else {
                e.target.blur(); // Blur the field if empty
              }
            }
          }}
          ref={effectiveSearchInputRef}
          aria-label="Search examples"
        />
        
        {searchValue && (
          <button 
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClearSearch();
              // Focus immediately without timeout
              effectiveSearchInputRef.current?.focus();
            }}
            title="Clear search (Esc)"
            aria-label="Clear search"
          >
            <Icon 
              name="close" 
              className="h-4 w-4 text-gray-400 hover:text-gray-600" 
              aria-hidden="true" 
            />
          </button>
        )}
      </div>
      
      {isFocused && !isSearching && (
        <div className="absolute right-0 -bottom-5 text-xs text-gray-500 bg-white px-1 rounded">
          <kbd className="px-1 py-0.5 text-xs border border-gray-300 rounded">⌘F</kbd> to focus
          {searchValue && <> • <kbd className="px-1 py-0.5 text-xs border border-gray-300 rounded">Enter</kbd> to search</>}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only prevent re-render if these specific props didn't change
  // This ensures the search input will always update when value changes
  return (
    prevProps.searchValue === nextProps.searchValue &&
    prevProps.isSearching === nextProps.isSearching
  );
});

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
  onClearSearch,
  searchInputRef  // Accept the ref from parent
}) => {
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
      
      {/* Memoized search component that won't re-render with table data changes */}
      <SearchBox 
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        isSearching={isSearching}
        onClearSearch={onClearSearch}
        searchInputRef={searchInputRef}
      />
      
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

// Implement custom comparison for the ExampleTableHeader component
// This prevents unnecessary re-renders when only the table data changes
const MemoizedExampleTableHeader = memo(ExampleTableHeader, (prevProps, nextProps) => {
  // Return true if props are equal (meaning we should NOT re-render)
  return (
    // Always re-render if search value changes
    prevProps.searchValue === nextProps.searchValue &&
    prevProps.isSearching === nextProps.isSearching &&
    // Only check these other props for equality 
    prevProps.selectedExamples.size === nextProps.selectedExamples.size &&
    prevProps.isProcessing === nextProps.isProcessing &&
    prevProps.hasExamples === nextProps.hasExamples
  );
});

export default MemoizedExampleTableHeader;