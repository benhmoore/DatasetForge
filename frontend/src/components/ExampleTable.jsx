import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';

const ExampleTable = ({ datasetId, refreshTrigger = 0 }) => {
  const [examples, setExamples] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;
  
  // Function to fetch examples that can be called programmatically 
  const fetchExamples = async () => {
    if (!datasetId) return;
    
    setIsLoading(true);
    
    try {
      const response = await api.getExamples(datasetId, page, pageSize);
      setExamples(response.items);
      
      // Calculate total pages
      const total = response.total;
      setTotalPages(Math.ceil(total / pageSize));
      console.log(`Fetched ${response.items.length} examples, total: ${total}`);
    } catch (error) {
      console.error('Failed to fetch examples:', error);
      toast.error('Failed to load examples');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch examples when datasetId, page, or refreshTrigger changes
  useEffect(() => {
    fetchExamples();
  }, [datasetId, page, refreshTrigger]);
  
  // Handle pagination
  const handlePageChange = (newPage) => {
    setPage(newPage);
  };
  
  // Handle export to JSONL
  const handleExport = async () => {
    if (!datasetId) return;
    
    try {
      const data = await api.exportDataset(datasetId);
      
      // Create a blob and download link
      const blob = new Blob([data], { type: 'application/jsonl' });
      const url = URL.createObjectURL(blob);
      
      // Create a temporary download link
      const a = document.createElement('a');
      a.href = url;
      a.download = `dataset-${datasetId}.jsonl`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Dataset exported successfully');
    } catch (error) {
      console.error('Failed to export dataset:', error);
      toast.error('Failed to export dataset');
    }
  };
  
  // Extract unique slot keys from all examples
  const slotKeys = examples.length > 0 
    ? [...new Set(examples.flatMap(ex => Object.keys(ex.slots)))]
    : [];
  
  // If no dataset is selected
  if (!datasetId) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500">Please select a dataset to view examples.</p>
      </div>
    );
  }
  
  // Loading state
  if (isLoading && page === 1) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          <div className="flex justify-between items-center mb-4">
            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
            <div className="h-8 bg-gray-200 rounded w-24"></div>
          </div>
          
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-10 bg-gray-100 px-4 flex items-center">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-4 bg-gray-200 rounded w-24 ml-6"></div>
              <div className="h-4 bg-gray-200 rounded w-24 ml-6"></div>
            </div>
            
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-14 border-t border-gray-200 px-4 py-4 flex items-center animate-fadeIn" style={{ animationDelay: `${i * 150}ms` }}>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                <div className="h-4 bg-gray-200 rounded w-1/5 ml-6"></div>
                <div className="h-4 bg-gray-200 rounded w-1/3 ml-6"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header with export button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Examples</h3>
        
        <button
          onClick={handleExport}
          className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm transition-all duration-200 transform hover:shadow active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed"
          disabled={examples.length === 0}
        >
          <span className="flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export JSONL
          </span>
        </button>
      </div>
      
      {examples.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-500">No examples found in this dataset.</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm hover:shadow transition-shadow duration-300">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    System Prompt
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Variation
                  </th>
                  
                  {/* Render a column for each slot */}
                  {slotKeys.map(slot => (
                    <th 
                      key={slot} 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {slot}
                    </th>
                  ))}
                  
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Output
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {examples.map((example, index) => (
                  <tr 
                    key={example.id} 
                    className="hover:bg-gray-50 transition-colors duration-150 animate-fadeIn"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate">
                      <div className="tooltip" onMouseEnter={(e) => {
                        const tooltip = e.currentTarget.querySelector('.tooltip-text');
                        if (tooltip) {
                          // Position the tooltip near the cursor but not directly under it
                          tooltip.style.top = `${e.clientY - 20}px`;
                          tooltip.style.left = `${e.clientX + 20}px`;
                        }
                      }}>
                        <span>{example.system_prompt.substring(0, 50)}{example.system_prompt.length > 50 ? '...' : ''}</span>
                        <span className="tooltip-text">{example.system_prompt}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate">
                      <div className="tooltip" onMouseEnter={(e) => {
                        const tooltip = e.currentTarget.querySelector('.tooltip-text');
                        if (tooltip) {
                          tooltip.style.top = `${e.clientY - 20}px`;
                          tooltip.style.left = `${e.clientX + 20}px`;
                        }
                      }}>
                        <span>{example.variation_prompt.substring(0, 50)}{example.variation_prompt.length > 50 ? '...' : ''}</span>
                        <span className="tooltip-text">{example.variation_prompt}</span>
                      </div>
                    </td>
                    
                    {/* Render slot values */}
                    {slotKeys.map(slot => (
                      <td 
                        key={slot} 
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate"
                      >
                        <div className="tooltip" onMouseEnter={(e) => {
                          const tooltip = e.currentTarget.querySelector('.tooltip-text');
                          if (tooltip) {
                            tooltip.style.top = `${e.clientY - 20}px`;
                            tooltip.style.left = `${e.clientX + 20}px`;
                          }
                        }}>
                          <span>{(example.slots[slot] || '').substring(0, 30)}{(example.slots[slot] || '').length > 30 ? '...' : ''}</span>
                          {example.slots[slot] && example.slots[slot].length > 30 && (
                            <span className="tooltip-text">{example.slots[slot]}</span>
                          )}
                        </div>
                      </td>
                    ))}
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate">
                      <div className="tooltip" onMouseEnter={(e) => {
                        const tooltip = e.currentTarget.querySelector('.tooltip-text');
                        if (tooltip) {
                          tooltip.style.top = `${e.clientY - 20}px`;
                          tooltip.style.left = `${e.clientX + 20}px`;
                        }
                      }}>
                        <span>{example.output.substring(0, 50)}{example.output.length > 50 ? '...' : ''}</span>
                        <span className="tooltip-text">{example.output}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-4">
              <nav className="inline-flex rounded-md shadow">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1 || isLoading}
                  className="px-3 py-1 rounded-l-md bg-white border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
                >
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Previous
                  </span>
                </button>
                <div className="px-3 py-1 bg-white border-t border-b border-gray-300 flex items-center">
                  <span className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md text-sm font-medium">
                    Page {page} of {totalPages}
                  </span>
                </div>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages || isLoading}
                  className="px-3 py-1 rounded-r-md bg-white border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
                >
                  <span className="flex items-center">
                    Next
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </button>
              </nav>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ExampleTable;