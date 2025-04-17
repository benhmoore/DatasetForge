import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import ExampleDetailModal from './ExampleDetailModal';

const ExampleTable = ({ datasetId, refreshTrigger = 0 }) => {
  const [examples, setExamples] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;
  
  // For editing
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // For bulk operations
  const [selectedExamples, setSelectedExamples] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  
  // For detail modal
  const [selectedExample, setSelectedExample] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
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
    // Clear selections when changing pages or refreshing
    setSelectedExamples(new Set());
  }, [datasetId, page, refreshTrigger]);
  
  // Handle pagination
  const handlePageChange = (newPage) => {
    // Clear any editing state when changing pages
    setEditingCell(null);
    setPage(newPage);
  };
  
  // Start editing a cell
  const handleStartEdit = (example, field, fieldType = 'text') => {
    // Get the current value based on the field
    let currentValue;
    if (field === 'system_prompt') {
      currentValue = example.system_prompt;
    } else if (field === 'output') {
      currentValue = example.output;
    } else if (field.startsWith('slot:')) {
      const slotName = field.split(':')[1];
      currentValue = example.slots[slotName] || '';
    } else {
      return; // Unknown field
    }
    
    setEditingCell({ exampleId: example.id, field });
    setEditValue(currentValue);
  };
  
  // Cancel editing
  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };
  
  // Save edited value
  const handleSaveEdit = async () => {
    if (!editingCell) return;
    
    const { exampleId, field } = editingCell;
    const example = examples.find(ex => ex.id === exampleId);
    if (!example) return;
    
    setIsSaving(true);
    
    try {
      // Create updated example data
      let updateData;
      
      if (field === 'system_prompt') {
        updateData = { ...example, system_prompt: editValue };
      } else if (field === 'output') {
        updateData = { ...example, output: editValue };
      } else if (field.startsWith('slot:')) {
        const slotName = field.split(':')[1];
        const updatedSlots = { ...example.slots, [slotName]: editValue };
        updateData = { ...example, slots: updatedSlots };
      } else {
        return; // Unknown field
      }
      
      // Send update to API
      await api.updateExample(datasetId, exampleId, updateData);
      
      // Update local state
      const exampleIndex = examples.findIndex(ex => ex.id === exampleId);
      if (exampleIndex !== -1) {
        const updatedExamples = [...examples];
        updatedExamples[exampleIndex] = updateData;
        setExamples(updatedExamples);
      }
      
      toast.success('Example updated successfully');
    } catch (error) {
      console.error('Failed to update example:', error);
      toast.error('Failed to update example');
    } finally {
      setIsSaving(false);
      setEditingCell(null);
      setEditValue('');
    }
  };
  
  // Toggle selection of an example
  const handleToggleSelect = (exampleId) => {
    const newSelected = new Set(selectedExamples);
    if (newSelected.has(exampleId)) {
      newSelected.delete(exampleId);
    } else {
      newSelected.add(exampleId);
    }
    setSelectedExamples(newSelected);
  };
  
  // Toggle selection of all examples on current page
  const handleToggleSelectAll = () => {
    if (selectedExamples.size === examples.length) {
      // Deselect all
      setSelectedExamples(new Set());
    } else {
      // Select all
      const allIds = examples.map(ex => ex.id);
      setSelectedExamples(new Set(allIds));
    }
  };
  
  // Delete selected examples
  const handleDeleteSelected = async () => {
    if (selectedExamples.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedExamples.size} example(s)?`)) {
      return;
    }
    
    setIsProcessing(true);
    
    try {
      await api.deleteExamples(datasetId, Array.from(selectedExamples));
      toast.success(`${selectedExamples.size} example(s) deleted successfully`);
      setSelectedExamples(new Set());
      fetchExamples(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete examples:', error);
      toast.error('Failed to delete examples');
    } finally {
      setIsProcessing(false);
    }
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
  
  // Handle row click to open detail modal
  const handleRowClick = (example) => {
    // Don't open modal if user is selecting examples or editing a cell
    if (editingCell || isProcessing) return;
    
    setSelectedExample(example);
    setIsDetailModalOpen(true);
  };
  
  // Handle example update from the modal
  const handleExampleUpdated = (updatedExample) => {
    // Update the example in the local state
    const exampleIndex = examples.findIndex(ex => ex.id === updatedExample.id);
    if (exampleIndex !== -1) {
      const updatedExamples = [...examples];
      updatedExamples[exampleIndex] = updatedExample;
      setExamples(updatedExamples);
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
      {/* Header with actions */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">Examples</h3>
          
          {selectedExamples.size > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
              {selectedExamples.size} selected
            </span>
          )}
        </div>
        
        <div className="flex space-x-2">
          {selectedExamples.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm transition-all duration-200 transform hover:shadow active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Selected
                </>
              )}
            </button>
          )}
          
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
                  {/* Selection checkbox */}
                  <th className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      checked={examples.length > 0 && selectedExamples.size === examples.length}
                      onChange={handleToggleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    System Prompt
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
                    className={`transition-colors duration-150 animate-fadeIn ${
                      selectedExamples.has(example.id) ? 'bg-primary-50 hover:bg-primary-100' : 'hover:bg-gray-50'
                    } cursor-pointer`}
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => handleRowClick(example)}
                  >
                    {/* Selection checkbox */}
                    <td className="px-3 py-4 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={selectedExamples.has(example.id)}
                        onChange={() => handleToggleSelect(example.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    
                    {/* System Prompt */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs">
                      {editingCell && editingCell.exampleId === example.id && editingCell.field === 'system_prompt' ? (
                        <div className="flex items-center">
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full p-1 border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex flex-col ml-2">
                            <button 
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="p-1 text-green-600 hover:text-green-800 disabled:text-gray-400"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button 
                              onClick={handleCancelEdit}
                              disabled={isSaving}
                              className="p-1 text-red-600 hover:text-red-800 disabled:text-gray-400"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="tooltip group relative cursor-pointer"
                          onMouseEnter={(e) => {
                            const tooltip = e.currentTarget.querySelector('.tooltip-text');
                            if (tooltip) {
                              tooltip.style.top = `${e.clientY - 20}px`;
                              tooltip.style.left = `${e.clientX + 20}px`;
                            }
                          }}
                          onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit(example, 'system_prompt'); }}
                        >
                          <div className="flex items-center">
                            <span className="truncate flex-grow">{example.system_prompt.substring(0, 50)}{example.system_prompt.length > 50 ? '...' : ''}</span>
                            <button 
                              className="opacity-0 group-hover:opacity-100 text-primary-600 hover:text-primary-800 p-1 ml-1 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleStartEdit(example, 'system_prompt'); }}
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                          <span className="tooltip-text">{example.system_prompt}</span>
                        </div>
                      )}
                    </td>
                    
                    {/* Slot values will appear here */}
                        <div className="flex items-center">
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full p-1 border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex flex-col ml-2">
                            <button 
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="p-1 text-green-600 hover:text-green-800 disabled:text-gray-400"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button 
                              onClick={handleCancelEdit}
                              disabled={isSaving}
                              className="p-1 text-red-600 hover:text-red-800 disabled:text-gray-400"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="tooltip group relative cursor-pointer"
                          onMouseEnter={(e) => {
                            const tooltip = e.currentTarget.querySelector('.tooltip-text');
                            if (tooltip) {
                              tooltip.style.top = `${e.clientY - 20}px`;
                              tooltip.style.left = `${e.clientX + 20}px`;
                            }
                          }}
                          onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit(example, 'variation_prompt'); }}
                        >
                          <div className="flex items-center">
                            <span className="truncate flex-grow">{example.variation_prompt.substring(0, 50)}{example.variation_prompt.length > 50 ? '...' : ''}</span>
                            <button 
                              className="opacity-0 group-hover:opacity-100 text-primary-600 hover:text-primary-800 p-1 ml-1 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleStartEdit(example, 'variation_prompt'); }}
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                          <span className="tooltip-text">{example.variation_prompt}</span>
                        </div>
                      )}
                    </td>
                    
                    {/* Render slot values */}
                    {slotKeys.map(slot => (
                      <td 
                        key={slot} 
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs"
                      >
                        {editingCell && editingCell.exampleId === example.id && editingCell.field === `slot:${slot}` ? (
                          <div className="flex items-center">
                            <input
                              type="text" 
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full p-1 border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              autoFocus
                            />
                            <div className="flex flex-col ml-2">
                              <button 
                                onClick={handleSaveEdit}
                                disabled={isSaving}
                                className="p-1 text-green-600 hover:text-green-800 disabled:text-gray-400"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button 
                                onClick={handleCancelEdit}
                                disabled={isSaving}
                                className="p-1 text-red-600 hover:text-red-800 disabled:text-gray-400"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="tooltip group relative cursor-pointer"
                            onMouseEnter={(e) => {
                              const tooltip = e.currentTarget.querySelector('.tooltip-text');
                              if (tooltip) {
                                tooltip.style.top = `${e.clientY - 20}px`;
                                tooltip.style.left = `${e.clientX + 20}px`;
                              }
                            }}
                            onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit(example, `slot:${slot}`); }}
                          >
                            <div className="flex items-center">
                              <span className="truncate flex-grow">{(example.slots[slot] || '').substring(0, 30)}{(example.slots[slot] || '').length > 30 ? '...' : ''}</span>
                              <button 
                                className="opacity-0 group-hover:opacity-100 text-primary-600 hover:text-primary-800 p-1 ml-1 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); handleStartEdit(example, `slot:${slot}`); }}
                                title="Edit"
                              >
                                ✎
                              </button>
                            </div>
                            {example.slots[slot] && example.slots[slot].length > 30 && (
                              <span className="tooltip-text">{example.slots[slot]}</span>
                            )}
                          </div>
                        )}
                      </td>
                    ))}
                    
                    {/* Output */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs">
                      {editingCell && editingCell.exampleId === example.id && editingCell.field === 'output' ? (
                        <div className="flex items-center">
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full p-1 border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex flex-col ml-2">
                            <button 
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="p-1 text-green-600 hover:text-green-800 disabled:text-gray-400"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button 
                              onClick={handleCancelEdit}
                              disabled={isSaving}
                              className="p-1 text-red-600 hover:text-red-800 disabled:text-gray-400"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="tooltip group relative cursor-pointer"
                          onMouseEnter={(e) => {
                            const tooltip = e.currentTarget.querySelector('.tooltip-text');
                            if (tooltip) {
                              tooltip.style.top = `${e.clientY - 20}px`;
                              tooltip.style.left = `${e.clientX + 20}px`;
                            }
                          }}
                          onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit(example, 'output'); }}
                        >
                          <div className="flex items-center">
                            <span className="truncate flex-grow">{example.output.substring(0, 50)}{example.output.length > 50 ? '...' : ''}</span>
                            <button 
                              className="opacity-0 group-hover:opacity-100 text-primary-600 hover:text-primary-800 p-1 ml-1 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleStartEdit(example, 'output'); }}
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                          <span className="tooltip-text">{example.output}</span>
                        </div>
                      )}
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
      
      {/* Detail Modal */}
      <ExampleDetailModal
        isOpen={isDetailModalOpen}
        example={selectedExample}
        datasetId={datasetId}
        onClose={() => setIsDetailModalOpen(false)}
        onExampleUpdated={handleExampleUpdated}
      />
    </div>
  );
};

export default ExampleTable;