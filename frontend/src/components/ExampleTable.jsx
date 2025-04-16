import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';

const ExampleTable = ({ datasetId }) => {
  const [examples, setExamples] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;
  
  // Fetch examples when datasetId or page changes
  useEffect(() => {
    if (!datasetId) return;
    
    const fetchExamples = async () => {
      setIsLoading(true);
      
      try {
        const response = await api.getExamples(datasetId, page, pageSize);
        setExamples(response.items);
        
        // Calculate total pages
        const total = response.total;
        setTotalPages(Math.ceil(total / pageSize));
      } catch (error) {
        console.error('Failed to fetch examples:', error);
        toast.error('Failed to load examples');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchExamples();
  }, [datasetId, page]);
  
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
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-10 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-10 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-10 bg-gray-200 rounded w-full mb-2"></div>
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
          className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm"
          disabled={examples.length === 0}
        >
          Export JSONL
        </button>
      </div>
      
      {examples.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-500">No examples found in this dataset.</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
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
                {examples.map((example) => (
                  <tr key={example.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate">
                      {example.system_prompt.substring(0, 50)}
                      {example.system_prompt.length > 50 ? '...' : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate">
                      {example.variation_prompt}
                    </td>
                    
                    {/* Render slot values */}
                    {slotKeys.map(slot => (
                      <td 
                        key={slot} 
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate"
                      >
                        {example.slots[slot] || ''}
                      </td>
                    ))}
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate">
                      {example.output.substring(0, 50)}
                      {example.output.length > 50 ? '...' : ''}
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
                  className="px-3 py-1 rounded-l-md bg-white border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  Previous
                </button>
                <div className="px-3 py-1 bg-white border-t border-b border-gray-300">
                  Page {page} of {totalPages}
                </div>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages || isLoading}
                  className="px-3 py-1 rounded-r-md bg-white border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  Next
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