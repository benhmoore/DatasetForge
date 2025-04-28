import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import Icon from './Icons';

/**
 * VariationManager - A component for efficiently managing large numbers of variations
 * Uses virtualization and pagination to reduce memory usage
 */
const VariationManager = ({ 
  variations, 
  onSaveToDataset,
  onDeleteVariation,
  onRegenerateVariation,
  isGenerating,
  selectedTemplate,
  onViewDetails
}) => {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedVariations, setSelectedVariations] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });
  const [filteredVariations, setFilteredVariations] = useState([]);
  
  // Calculate the total number of pages
  const totalPages = Math.ceil(filteredVariations.length / itemsPerPage);
  
  // Reference to the container for scrolling
  const containerRef = useRef(null);
  
  // Filter and sort variations whenever the inputs change
  useEffect(() => {
    let result = [...variations];
    
    // Apply search filter if searchTerm exists
    if (searchTerm.trim()) {
      const lowercaseSearchTerm = searchTerm.toLowerCase();
      result = result.filter(variation => {
        // Search in output
        if (variation.output && variation.output.toLowerCase().includes(lowercaseSearchTerm)) {
          return true;
        }
        
        // Search in slots
        if (variation.slots) {
          return Object.values(variation.slots).some(
            value => value && value.toString().toLowerCase().includes(lowercaseSearchTerm)
          );
        }
        
        return false;
      });
    }
    
    // Apply sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        // Handle nested properties (e.g., slots.prompt)
        if (sortConfig.key.startsWith('slot:')) {
          const slotName = sortConfig.key.split(':')[1];
          const aValue = a.slots?.[slotName] || '';
          const bValue = b.slots?.[slotName] || '';
          
          if (sortConfig.direction === 'asc') {
            return aValue.localeCompare(bValue);
          } else {
            return bValue.localeCompare(aValue);
          }
        }
        
        // Handle regular properties
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';
        
        if (sortConfig.direction === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
    }
    
    setFilteredVariations(result);
    
    // Reset to first page if the filtered results change significantly
    if (Math.ceil(result.length / itemsPerPage) < currentPage) {
      setCurrentPage(1);
    }
  }, [variations, searchTerm, sortConfig, itemsPerPage]);
  
  // Get the variations for the current page
  const currentVariations = filteredVariations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  // Select/deselect a single variation
  const toggleSelectVariation = useCallback((variationId) => {
    setSelectedVariations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(variationId)) {
        newSet.delete(variationId);
      } else {
        newSet.add(variationId);
      }
      return newSet;
    });
  }, []);
  
  // Select/deselect all variations on the current page
  const toggleSelectAllOnPage = useCallback(() => {
    const allSelected = currentVariations.every(v => selectedVariations.has(v.id));
    
    if (allSelected) {
      // Deselect all on current page
      setSelectedVariations(prev => {
        const newSet = new Set(prev);
        currentVariations.forEach(v => {
          newSet.delete(v.id);
        });
        return newSet;
      });
    } else {
      // Select all on current page
      setSelectedVariations(prev => {
        const newSet = new Set(prev);
        currentVariations.forEach(v => {
          newSet.add(v.id);
        });
        return newSet;
      });
    }
  }, [currentVariations, selectedVariations]);
  
  // Save selected variations to dataset
  const handleSaveSelected = useCallback(() => {
    if (selectedVariations.size === 0) {
      toast.warning('Please select at least one variation to save');
      return;
    }
    
    const selectedItems = variations.filter(v => selectedVariations.has(v.id));
    onSaveToDataset(selectedItems);
  }, [selectedVariations, variations, onSaveToDataset]);
  
  // Delete selected variations
  const handleDeleteSelected = useCallback(() => {
    if (selectedVariations.size === 0) {
      toast.warning('Please select at least one variation to delete');
      return;
    }
    
    const selectedIds = Array.from(selectedVariations);
    onDeleteVariation(selectedIds);
    setSelectedVariations(new Set());
  }, [selectedVariations, onDeleteVariation]);
  
  // Function to request pagination change
  const goToPage = useCallback((page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      // Scroll to top when page changes
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    }
  }, [totalPages]);
  
  // Function to change sort configuration
  const requestSort = useCallback((key) => {
    setSortConfig(prevConfig => {
      if (prevConfig.key === key) {
        // Toggle direction if same key
        return { 
          key, 
          direction: prevConfig.direction === 'asc' ? 'desc' : 'asc' 
        };
      } else {
        // New key, default to ascending
        return { key, direction: 'asc' };
      }
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3 p-2 bg-gray-50 rounded-lg">
        {/* Search */}
        <div className="relative flex-grow max-w-md">
          <input
            type="text"
            placeholder="Search variations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 w-full rounded border focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon name="search" className="h-5 w-5 text-gray-400" />
          </div>
          {searchTerm && (
            <button
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setSearchTerm('')}
              title="Clear search"
            >
              <Icon name="close" className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
        
        {/* Items per page */}
        <div className="flex items-center">
          <label className="text-sm mr-2">Show:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 border border-blue-300 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            onClick={handleSaveSelected}
            disabled={selectedVariations.size === 0 || isGenerating}
            title="Save selected variations to dataset"
          >
            <Icon name="save" className="w-4 h-4 mr-1" />
            Save Selected
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            onClick={handleDeleteSelected}
            disabled={selectedVariations.size === 0 || isGenerating}
            title="Delete selected variations"
          >
            <Icon name="trash" className="w-4 h-4 mr-1" />
            Delete Selected
          </button>
        </div>
      </div>
      
      {/* Variations Table */}
      <div 
        ref={containerRef} 
        className="flex-grow overflow-y-auto border rounded-lg"
      >
        {filteredVariations.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="document" className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No variations to display</p>
            {searchTerm && (
              <p className="text-gray-400 mt-2">Try adjusting your search term</p>
            )}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="w-10 px-2 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={currentVariations.length > 0 && currentVariations.every(v => selectedVariations.has(v.id))}
                    onChange={toggleSelectAllOnPage}
                    disabled={isGenerating}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => requestSort('variation')}
                >
                  <div className="flex items-center">
                    <span>Variation</span>
                    {sortConfig.key === 'variation' && (
                      <Icon 
                        name={sortConfig.direction === 'asc' ? 'chevron-up' : 'chevron-down'} 
                        className="h-4 w-4 ml-1" 
                      />
                    )}
                  </div>
                </th>
                {selectedTemplate?.slots?.map(slot => (
                  <th 
                    key={slot}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hidden md:table-cell"
                    onClick={() => requestSort(`slot:${slot}`)}
                  >
                    <div className="flex items-center">
                      <span>{slot}</span>
                      {sortConfig.key === `slot:${slot}` && (
                        <Icon 
                          name={sortConfig.direction === 'asc' ? 'chevron-up' : 'chevron-down'} 
                          className="h-4 w-4 ml-1" 
                        />
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Output
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentVariations.map(variation => (
                <tr 
                  key={variation.id} 
                  className={`hover:bg-gray-50 ${selectedVariations.has(variation.id) ? 'bg-blue-50' : ''} ${variation.isGenerating ? 'animate-pulse' : ''}`}
                >
                  <td className="px-2 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedVariations.has(variation.id)}
                      onChange={() => toggleSelectVariation(variation.id)}
                      disabled={isGenerating || variation.isGenerating}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {variation.variation}
                  </td>
                  {/* Slot values - Only shown on larger screens */}
                  {selectedTemplate?.slots?.map(slot => (
                    <td key={slot} className="px-4 py-4 text-sm text-gray-500 hidden md:table-cell">
                      <div className="max-w-xs truncate" title={variation.slots?.[slot] || ''}>
                        {variation.slots?.[slot] || ''}
                      </div>
                    </td>
                  ))}
                  <td className="px-4 py-4 text-sm text-gray-900">
                    <div 
                      className="relative max-h-32 overflow-y-auto"
                      onClick={() => onViewDetails(variation)}
                    >
                      {variation.isGenerating ? (
                        <div className="flex items-center space-x-2">
                          <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                          <span>Generating...</span>
                        </div>
                      ) : variation.error ? (
                        <div className="text-red-500">{variation.error}</div>
                      ) : (
                        <div className="whitespace-pre-wrap">{variation.output}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center space-x-2">
                      <button
                        className="p-1 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-100"
                        onClick={() => onViewDetails(variation)}
                        title="View details"
                      >
                        <Icon name="eye" className="h-5 w-5" />
                      </button>
                      <button
                        className="p-1 text-green-600 hover:text-green-800 rounded-full hover:bg-green-100"
                        onClick={() => onRegenerateVariation(variation)}
                        disabled={isGenerating || variation.isGenerating}
                        title="Regenerate variation"
                      >
                        <Icon name="refresh" className="h-5 w-5" />
                      </button>
                      <button
                        className="p-1 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100"
                        onClick={() => onDeleteVariation([variation.id])}
                        disabled={isGenerating || variation.isGenerating}
                        title="Delete variation"
                      >
                        <Icon name="trash" className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center py-3 bg-gray-50 rounded-lg mt-3 px-4">
          <div className="text-sm text-gray-500">
            {filteredVariations.length > 0 ? (
              <>
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredVariations.length)} of {filteredVariations.length} variations
              </>
            ) : (
              <>No variations to display</>
            )}
          </div>
          
          <div className="flex space-x-2">
            <button
              className="px-3 py-1 text-sm border rounded bg-white disabled:opacity-50"
              onClick={() => goToPage(1)}
              disabled={currentPage === 1 || isGenerating}
              title="First page"
            >
              <Icon name="chevron-double-left" className="h-4 w-4" />
            </button>
            <button
              className="px-3 py-1 text-sm border rounded bg-white disabled:opacity-50"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1 || isGenerating}
              title="Previous page"
            >
              <Icon name="chevron-left" className="h-4 w-4" />
            </button>
            
            <div className="flex items-center px-2">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = Math.max(1, Math.min(totalPages, Number(e.target.value)));
                  goToPage(page);
                }}
                className="w-12 text-center border rounded py-1"
              />
              <span className="mx-1">of</span>
              <span>{totalPages}</span>
            </div>
            
            <button
              className="px-3 py-1 text-sm border rounded bg-white disabled:opacity-50"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || isGenerating}
              title="Next page"
            >
              <Icon name="chevron-right" className="h-4 w-4" />
            </button>
            <button
              className="px-3 py-1 text-sm border rounded bg-white disabled:opacity-50"
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages || isGenerating}
              title="Last page"
            >
              <Icon name="chevron-double-right" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariationManager;