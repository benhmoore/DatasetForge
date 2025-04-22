import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import ExampleDetailModalWithParaphrase from './ExampleDetailModalWithParaphrase';
import ExportDialog from './ExportDialog';
import ConfirmationModal from './ConfirmationModal'; // Import ConfirmationModal
import BulkParaphraseModal from './BulkParaphraseModal'; // Import BulkParaphraseModal
import Icon from './Icons';
import ExampleTableHeader from './ExampleTableHeader';
import ContextMenu from './ContextMenu'; // Import ContextMenu

const ExampleTable = ({ datasetId, datasetName, refreshTrigger = 0, onVariationSaved }) => {
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
  
  // For export dialog
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  
  // For bulk paraphrase modal
  const [isParaphraseModalOpen, setIsParaphraseModalOpen] = useState(false);
  
  // Modern search implementation with state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // For context menu
  const [contextMenu, setContextMenu] = useState(null); // { x, y, exampleId }

  // For drag and drop functionality
  const [isDragOver, setIsDragOver] = useState(false);
  const tableRef = useRef(null);
  
  // Use useEffect for debouncing search
  useEffect(() => {
    // Skip initial render
    if (searchTerm === debouncedSearchTerm) return;
    
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      if (searchTerm) {
        setPage(1); // Reset to first page when search changes
      }
    }, 500); // 500ms debounce delay
    
    // Cleanup timer on every searchTerm change
    return () => clearTimeout(timerId);
  }, [searchTerm]);
  
  // Handle clearing search
  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    // Only trigger a search fetch if we actually had a previous search term
    if (debouncedSearchTerm) {
      setPage(1);
    }
  }, [debouncedSearchTerm]);
  
  // For sorting
  const [sortField, setSortField] = useState('id'); // Default sort by ID
  const [sortDirection, setSortDirection] = useState('desc'); // Default sort descending
  
  // For pagination loading state
  const [isPaginationLoading, setIsPaginationLoading] = useState(false);

  // For archive confirmation modal
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [examplesToDelete, setExamplesToDelete] = useState(new Set());

  // Define context menu items
  const contextMenuItems = [
    { label: 'Delete Example', value: 'delete', icon: 'trash' },
    // { label: 'Duplicate Example', value: 'duplicate', icon: 'copy' }, // Add later
  ];

  // Function to fetch examples that can be called programmatically 
  const fetchExamples = async () => {
    if (!datasetId) return;
    
    // Show appropriate loading states
    if (page !== 1) {
      setIsPaginationLoading(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const searchParam = debouncedSearchTerm.trim() || null;
      
      if (searchParam) {
        setIsSearching(true);
      }
      
      const response = await api.getExamples(datasetId, page, pageSize, searchParam, sortField, sortDirection);
      setExamples(response.items);
      
      // Calculate total pages
      const total = response.total;
      setTotalPages(Math.ceil(total / pageSize));
      
      if (searchParam) {
        setIsSearching(false);
      }
    } catch (error) {
      console.error('Failed to fetch examples:', error);
      toast.error('Failed to load examples');
      setIsSearching(false);
    } finally {
      setIsLoading(false);
      setIsPaginationLoading(false);
    }
  };
  
  // Listen for search trigger events from ExampleTableHeader
  useEffect(() => {
    const handleTriggerSearch = (e) => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1);
    };
    
    window.addEventListener('triggerSearch', handleTriggerSearch);
    return () => window.removeEventListener('triggerSearch', handleTriggerSearch);
  }, [searchTerm]);
  
  // Fetch examples when these dependencies change
  useEffect(() => {
    fetchExamples();
    // Clear selections when changing pages or refreshing
    setSelectedExamples(new Set());
  }, [datasetId, page, refreshTrigger, sortField, sortDirection, debouncedSearchTerm]);
  
  // Handle pagination
  const handlePageChange = (newPage) => {
    // Clear any editing state when changing pages
    setEditingCell(null);
    setPage(newPage);
  };

  // Handle sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
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
      } else if (field === 'user_prompt') {
        updateData = { ...example, user_prompt: editValue };
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
  
  // Delete selected examples - Opens confirmation modal
  const handleDeleteSelected = () => {
    if (selectedExamples.size === 0) return;
    
    setExamplesToDelete(new Set(selectedExamples)); // Store IDs to delete
    setIsArchiveConfirmOpen(true); // Open the modal
  };

  // Confirm deletion after modal confirmation
  const confirmDeleteExamples = async () => {
    if (examplesToDelete.size === 0) return;
    
    setIsProcessing(true);
    setIsArchiveConfirmOpen(false); // Close modal immediately
    
    try {
      await api.deleteExamples(datasetId, Array.from(examplesToDelete));
      toast.success(`${examplesToDelete.size} example(s) deleted successfully`);
      setSelectedExamples(new Set()); // Clear selection in the table
      setExamplesToDelete(new Set()); // Clear the stored IDs
      fetchExamples(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete examples:', error);
      toast.error('Failed to delete examples');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Handle export to JSONL
  const handleExport = () => {
    if (!datasetId) return;
    setIsExportDialogOpen(true);
  };
  
  // Handle paraphrasing selected examples
  const handleParaphraseSelected = () => {
    if (selectedExamples.size === 0) return;
    
    // Get the selected examples
    const selectedExamplesList = examples.filter(ex => selectedExamples.has(ex.id));
    
    if (selectedExamplesList.length === 0) {
      toast.warning('No valid examples selected for paraphrasing');
      return;
    }
    
    // Open the paraphrase modal
    setIsParaphraseModalOpen(true);
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
    // Update the example in the local state if it exists
    const exampleIndex = examples.findIndex(ex => ex.id === updatedExample.id);
    if (exampleIndex !== -1) {
      const updatedExamples = [...examples];
      updatedExamples[exampleIndex] = updatedExample;
      setExamples(updatedExamples);
      
      // Also update the selected example to ensure the modal displays the latest data
      setSelectedExample(updatedExample);
    }
    
    // Trigger a full refresh to show newly added examples (like paraphrases)
    fetchExamples();
  };
  
  // Render tool calls
  const renderToolCalls = (toolCalls) => {
    if (!toolCalls || toolCalls.length === 0) return null;
    
    return (
      <div className="space-y-1 max-w-xs">
        {toolCalls.map((call, idx) => {
          // Extract function name and arguments based on the structure
          let name = "Unknown Tool";
          let args = {};
          
          if (call.function) {
            // Standard OpenAI format
            name = call.function.name || "Unknown Tool";
            try {
              args = typeof call.function.arguments === 'string' 
                ? JSON.parse(call.function.arguments) 
                : call.function.arguments || {};
            } catch (e) {
              console.error("Error parsing tool call arguments:", e);
              args = { error: "Failed to parse", raw: call.function.arguments };
            }
          } else if (call.name) {
            // Simple format with name and parameters directly
            name = call.name;
            args = call.parameters || {};
          }
          
          return (
            <div key={idx} className="text-xs bg-blue-50 border border-blue-100 p-2 rounded">
              <div className="font-medium text-blue-700">{name}</div>
              <div className="truncate mt-1 text-gray-700">
                {JSON.stringify(args).substring(0, 50)}
                {JSON.stringify(args).length > 50 ? '...' : ''}
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  
  // Extract unique slot keys from all examples
  const slotKeys = examples.length > 0 
    ? [...new Set(examples.flatMap(ex => Object.keys(ex.slots)))]
    : [];
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e, example, field) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Save changes on Enter
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      // Cancel editing on Escape
      e.preventDefault();
      handleCancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      
      // Find the next editable cell
      const currentExample = examples.findIndex(ex => ex.id === example.id);
      const fields = ['system_prompt', ...slotKeys.map(slot => `slot:${slot}`), 'user_prompt', 'output'];
      const currentFieldIndex = fields.indexOf(field);
      
      if (e.shiftKey) {
        // Move to previous field or previous row's last field
        if (currentFieldIndex > 0) {
          const prevField = fields[currentFieldIndex - 1];
          handleSaveEdit();
          handleStartEdit(example, prevField);
        } else if (currentExample > 0) {
          const prevExample = examples[currentExample - 1];
          const lastField = fields[fields.length - 1];
          handleSaveEdit();
          handleStartEdit(prevExample, lastField);
        }
      } else {
        // Move to next field or next row's first field
        if (currentFieldIndex < fields.length - 1) {
          const nextField = fields[currentFieldIndex + 1];
          handleSaveEdit();
          handleStartEdit(example, nextField);
        } else if (currentExample < examples.length - 1) {
          const nextExample = examples[currentExample + 1];
          handleSaveEdit();
          handleStartEdit(nextExample, fields[0]);
        }
      }
    }
  }, [examples, slotKeys, handleSaveEdit, handleCancelEdit, handleStartEdit]);
  
  // Enhanced search function that's memoized and doesn't trigger re-renders
  const optimizedSearchDebounce = useCallback((searchValue) => {
    setSearchTerm(searchValue);
    // Visual feedback that search is happening
    setIsSearching(true);
  }, [setSearchTerm, setIsSearching]);
  
  // Keyboard shortcut for search focus managed in ExampleTableHeader component
  // Using a custom event to communicate with the header component
  const triggerSearchFocus = useCallback(() => {
    window.dispatchEvent(new CustomEvent('focusSearchInput'));
  }, []);
  
  useEffect(() => {
    const handleSearchShortcut = (e) => {
      // Ctrl+F or Cmd+F to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        triggerSearchFocus();
      }
    };
    
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, [triggerSearchFocus]);

  // Handle drag over event
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  // Handle drag leave event
  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // Handle drop event
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);

    if (!datasetId) {
      toast.warning('Please select a dataset first');
      return;
    }

    const data = e.dataTransfer.getData('application/json');
    if (!data) return;

    try {
      const variation = JSON.parse(data);
      
      // Create a properly formatted example from the variation
      const example = {
        system_prompt: variation.system_prompt || '',
        user_prompt: variation.processed_prompt || '',
        slots: variation.slots || {},
        output: variation.output || '',
        tool_calls: variation.tool_calls || null
      };
      
      setIsProcessing(true);

      // Save the example to the dataset using the API
      await api.saveExamples(datasetId, [example]);
      
      toast.success(`Variation "${variation.variation}" saved to ${datasetName}`);
      
      // Refresh the examples list
      fetchExamples();

      // Notify parent component about the saved variation
      if (onVariationSaved) {
        onVariationSaved(variation);
      }
    } catch (error) {
      console.error('Failed to save dragged variation:', error);
      toast.error(`Failed to save variation: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle context menu opening
  const handleContextMenu = (event, example) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      exampleId: example.id,
    });
  };

  // Handle context menu closing
  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // Handle context menu item selection
  const handleContextMenuSelect = (action) => {
    if (!contextMenu) return;
    const { exampleId } = contextMenu;

    if (action === 'delete') {
      // Trigger deletion confirmation for the single example
      setExamplesToDelete(new Set([exampleId]));
      setIsArchiveConfirmOpen(true);
    }
    // Add 'duplicate' handling later
    handleCloseContextMenu();
  };

  // If no dataset is selected
  if (!datasetId) {
    return (
      <div className="text-center p-8 bg-gray-50 border border-gray-200 w-full">
        <p className="text-gray-500">Please select a dataset to view examples.</p>
      </div>
    );
  }
  
  // Loading state
  if (isLoading && page === 1) {
    return (
      <div className="p-4 w-full mx-4 sm:mx-6 lg:mx-8">
        <div className="animate-pulse w-full">
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
    <div 
      className={`space-y-4 w-full relative ${isDragOver ? 'bg-blue-50 border border-blue-200' : ''}`}
      ref={tableRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Overlay for drag-over state */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-50 border-2 border-blue-400 rounded-md z-50 pointer-events-none flex items-center justify-center">
          <div className="bg-white p-4 rounded-md shadow-lg border border-blue-300">
            <p className="text-blue-600 font-medium flex items-center">
              <Icon name="plus" className="w-5 h-5 mr-2" />
              Drop to add to dataset
            </p>
          </div>
        </div>
      )}
      
      {/* Header with actions */}
      <ExampleTableHeader 
        selectedExamples={selectedExamples}
        handleDeleteSelected={handleDeleteSelected}
        handleParaphraseSelected={handleParaphraseSelected}
        handleExport={handleExport}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        isSearching={isSearching}
        isProcessing={isProcessing}
        hasExamples={examples.length > 0}
        onClearSearch={handleClearSearch}
      />
      
      {examples.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 border border-gray-200 w-full">
          {debouncedSearchTerm ? (
            <div className="py-8">
              <Icon name="search" className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-4 text-gray-500 text-lg">
                No examples found matching "<span className="font-medium text-primary-600">{debouncedSearchTerm}</span>"
              </p>
              <button 
                className="mt-4 px-4 py-2 text-sm font-medium bg-primary-50 text-primary-600 rounded-md hover:bg-primary-100 hover:text-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                onClick={handleClearSearch}
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="py-8">
              <Icon name="document" className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-4 text-gray-500 text-lg">No examples found in this dataset</p>
              <p className="mt-2 text-gray-400">Create examples by using the generation feature</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto border border-gray-200 shadow-sm hover:shadow transition-shadow duration-300 w-full max-w-full">
            <table className="w-full table-fixed divide-y divide-gray-200 border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  {/* Selection checkbox */}
                  <th className="px-2 py-2 text-center w-10"> {/* Fixed width */}
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      checked={examples.length > 0 && selectedExamples.size === examples.length}
                      onChange={handleToggleSelectAll}
                    />
                  </th>
                  {/* Add Example ID Header */}
                  <th 
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer w-20" /* Fixed width */
                    onClick={() => handleSort('id')}
                  >
                    ID
                    {sortField === 'id' && (
                      <span className="ml-1">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  <th 
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer w-1/6" /* Proportional width */
                    onClick={() => handleSort('system_prompt')}
                  >
                    System Prompt
                    {sortField === 'system_prompt' && (
                      <span className="ml-1">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  
                  {/* Render a column for each slot */}
                  {slotKeys.map(slot => (
                    <th 
                      key={slot} 
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer w-1/12" /* Fixed proportion */
                      onClick={() => handleSort(`slot:${slot}`)}
                    >
                      {slot}
                      {sortField === `slot:${slot}` && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  ))}
                  
                  <th 
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer w-1/4" /* Proportional width */
                    onClick={() => handleSort('user_prompt')}
                  >
                    User Prompt
                    {sortField === 'user_prompt' && (
                      <span className="ml-1">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>

                  <th 
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer w-1/4" /* Proportional width */
                    onClick={() => handleSort('output')}
                  >
                    Output
                    {sortField === 'output' && (
                      <span className="ml-1">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  
                  {/* Add Tool Calls column if any examples have tool calls */}
                  {examples.some(ex => ex.tool_calls && ex.tool_calls.length > 0) && (
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6"> {/* Fixed proportion */}
                      Tool Calls
                    </th>
                  )}
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
                    onContextMenu={(event) => handleContextMenu(event, example)}
                  >
                    {/* Selection checkbox */}
                    <td className="px-2 py-2 text-center"> {/* Reduced padding */}
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={selectedExamples.has(example.id)}
                        onChange={() => handleToggleSelect(example.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    {/* Add Example ID Cell */}
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 font-mono"> {/* Reduced padding */}
                      {example.id}
                    </td>
                    
                    {/* System Prompt (showing masked version if available) */}
                    <td className="px-3 py-2 text-sm text-gray-900 truncate"> {/* Allow text to wrap */}
                      {editingCell && editingCell.exampleId === example.id && editingCell.field === 'system_prompt' ? (
                        <div className="flex items-center">
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full p-1 border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            rows={3}
                            autoFocus
                            onKeyDown={(e) => handleKeyDown(e, example, 'system_prompt')}
                          />
                          <div className="flex flex-col ml-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                              disabled={isSaving}
                              className="p-1 text-green-600 hover:text-green-800 disabled:text-gray-400"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
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
                            {/* Show masked prompt if available, otherwise show actual */}
                            <span className="truncate flex-grow">
                              {example.system_prompt_mask ? (
                                <>
                                  <span className="mr-1 text-xs bg-indigo-100 text-indigo-800 px-1 rounded">MASKED</span>
                                  {example.system_prompt_mask.substring(0, 40)}{example.system_prompt_mask.length > 40 ? '...' : ''}
                                </>
                              ) : (
                                example.system_prompt?.substring(0, 50) + (example.system_prompt?.length > 50 ? '...' : '')
                              )}
                            </span>
                            <button 
                              className="opacity-0 group-hover:opacity-100 text-primary-600 hover:text-primary-800 p-1 ml-1 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleStartEdit(example, 'system_prompt'); }}
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                          {/* Conditionally render tooltip with appropriate content */}
                          {((example.system_prompt_mask && example.system_prompt_mask.length > 40) || 
                            (!example.system_prompt_mask && example.system_prompt && example.system_prompt.length > 50)) && (
                            <span className="tooltip-text">
                              {example.system_prompt_mask || example.system_prompt}
                              {example.system_prompt_mask && (
                                <div className="mt-2 text-xs text-indigo-500">
                                  <em>This is a masked prompt that will be used for exports.</em>
                                </div>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    
                    {/* Render slot values */}
                    {slotKeys.map(slot => (
                      <td 
                        key={slot} 
                        className="px-3 py-2 text-sm text-gray-900 truncate" /* Allow text to wrap */
                      >
                        {editingCell && editingCell.exampleId === example.id && editingCell.field === `slot:${slot}` ? (
                          <div className="flex items-center">
                            <input
                              type="text" 
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full p-1 border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              autoFocus
                              onKeyDown={(e) => handleKeyDown(e, example, `slot:${slot}`)}
                            />
                            <div className="flex flex-col ml-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                                disabled={isSaving}
                                className="p-1 text-green-600 hover:text-green-800 disabled:text-gray-400"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
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
                            {/* Conditionally render tooltip only if text is long */}
                            {example.slots[slot] && example.slots[slot].length > 30 && (
                              <span className="tooltip-text">{example.slots[slot]}</span>
                            )}
                          </div>
                        )}
                      </td>
                    ))}
                    
                    {/* User Prompt (showing masked version if available) */}
                    <td className="px-3 py-2 text-sm text-gray-900 truncate"> {/* Allow text to wrap */}
                      {editingCell && editingCell.exampleId === example.id && editingCell.field === 'user_prompt' ? (
                        <div className="flex items-center">
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full p-1 border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            rows={3}
                            autoFocus
                            onKeyDown={(e) => handleKeyDown(e, example, 'user_prompt')}
                          />
                          <div className="flex flex-col ml-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                              disabled={isSaving}
                              className="p-1 text-green-600 hover:text-green-800 disabled:text-gray-400"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
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
                          onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit(example, 'user_prompt'); }}
                        >
                          <div className="flex items-center">
                            {/* Show masked prompt if available, otherwise show actual */}
                            <span className="truncate flex-grow">
                              {example.user_prompt_mask ? (
                                <>
                                  <span className="mr-1 text-xs bg-indigo-100 text-indigo-800 px-1 rounded">MASKED</span>
                                  {example.user_prompt_mask.substring(0, 40)}{example.user_prompt_mask.length > 40 ? '...' : ''}
                                </>
                              ) : (
                                example.user_prompt?.substring(0, 50) + (example.user_prompt?.length > 50 ? '...' : '')
                              )}
                            </span>
                            <button 
                              className="opacity-0 group-hover:opacity-100 text-primary-600 hover:text-primary-800 p-1 ml-1 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleStartEdit(example, 'user_prompt'); }}
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                          {/* Conditionally render tooltip with appropriate content */}
                          {((example.user_prompt_mask && example.user_prompt_mask.length > 40) || 
                            (!example.user_prompt_mask && example.user_prompt && example.user_prompt.length > 50)) && (
                            <span className="tooltip-text">
                              {example.user_prompt_mask || example.user_prompt}
                              {example.user_prompt_mask && (
                                <div className="mt-2 text-xs text-indigo-500">
                                  <em>This is a masked prompt that will be used for exports.</em>
                                </div>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    
                    {/* Output */}
                    <td className="px-3 py-2 text-sm text-gray-900 truncate"> {/* Allow text to wrap */}
                      {editingCell && editingCell.exampleId === example.id && editingCell.field === 'output' ? (
                        <div className="flex items-center">
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full p-1 border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            rows={3}
                            autoFocus
                            onKeyDown={(e) => handleKeyDown(e, example, 'output')}
                          />
                          <div className="flex flex-col ml-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                              disabled={isSaving}
                              className="p-1 text-green-600 hover:text-green-800 disabled:text-gray-400"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
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
                            <span className="truncate flex-grow">{example.output?.substring(0, 50)}{example.output?.length > 50 ? '...' : ''}</span>
                            <button 
                              className="opacity-0 group-hover:opacity-100 text-primary-600 hover:text-primary-800 p-1 ml-1 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleStartEdit(example, 'output'); }}
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                          {/* Conditionally render tooltip only if text is long */}
                          {example.output && example.output.length > 50 && (
                            <span className="tooltip-text">{example.output}</span>
                          )}
                        </div>
                      )}
                    </td>
                    
                    {/* Tool Calls column */}
                    {examples.some(ex => ex.tool_calls && ex.tool_calls.length > 0) && (
                      <td className="px-3 py-2 text-sm text-gray-900"> {/* Allow text to wrap */}
                        {renderToolCalls(example.tool_calls)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-4 px-4">
              <nav className="inline-flex rounded-md shadow">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1 || isLoading || isPaginationLoading} // Added isPaginationLoading
                  className="px-3 py-1 rounded-l-md bg-white border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
                >
                  <span className="flex items-center">
                    {isPaginationLoading && page === page - 1 ? <Icon name="spinner" className="animate-spin h-4 w-4 mr-1" /> : <Icon name="chevronLeft" className="w-4 h-4 mr-1" />}
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
                  disabled={page === totalPages || isLoading || isPaginationLoading} // Added isPaginationLoading
                  className="px-3 py-1 rounded-r-md bg-white border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
                >
                  <span className="flex items-center">
                    Next
                    {isPaginationLoading && page === page + 1 ? <Icon name="spinner" className="animate-spin h-4 w-4 ml-1" /> : <Icon name="chevronRight" className="w-4 h-4 ml-1" />}
                  </span>
                </button>
              </nav>
            </div>
          )}
        </>
      )}
      
      {/* Detail Modal with Paraphrase */}
      <ExampleDetailModalWithParaphrase
        isOpen={isDetailModalOpen}
        example={selectedExample}
        datasetId={datasetId}
        onClose={() => setIsDetailModalOpen(false)}
        onExampleUpdated={handleExampleUpdated}
      />
      
      {/* Export Dialog */}
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        datasetId={datasetId}
        datasetName={datasetName}
      />

      {/* Archive Confirmation Modal */}
      <ConfirmationModal
        isOpen={isArchiveConfirmOpen}
        onClose={() => {
          setIsArchiveConfirmOpen(false);
          setExamplesToDelete(new Set()); // Clear IDs if cancelled
        }}
        onConfirm={confirmDeleteExamples}
        title="Confirm Delete"
        message={
          <>
            Are you sure you want to delete <strong>{examplesToDelete.size}</strong> selected example(s)?
            This action cannot be undone.
          </>
        }
        confirmButtonText="Confirm Delete"
        confirmButtonVariant="danger"
      />
      
      {/* Bulk Paraphrase Modal */}
      <BulkParaphraseModal
        isOpen={isParaphraseModalOpen}
        onClose={() => setIsParaphraseModalOpen(false)}
        examples={examples.filter(ex => selectedExamples.has(ex.id))}
        datasetId={datasetId}
        onSuccess={() => {
          setSelectedExamples(new Set()); // Clear selection
          fetchExamples(); // Refresh the list
        }}
      />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          items={contextMenuItems} // Pass items
          position={{ x: contextMenu.x, y: contextMenu.y }} // Pass position object
          onSelect={handleContextMenuSelect}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};

export default ExampleTable;