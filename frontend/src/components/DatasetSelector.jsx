import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';

const DatasetSelector = ({ selectedDataset, onSelectDataset }) => {
  const [datasets, setDatasets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch datasets from API
  const fetchDatasets = async () => {
    setIsLoading(true);
    
    try {
      const response = await api.getDatasets(1, 100, showArchived);
      setDatasets(response.items);
      
      // Auto-select the first non-archived dataset if none is selected
      if (!selectedDataset && response.items.length > 0) {
        const activeDatasets = response.items.filter(d => !d.archived);
        if (activeDatasets.length > 0) {
          onSelectDataset(activeDatasets[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch datasets:', error);
      toast.error('Failed to load datasets');
    } finally {
      setIsLoading(false);
    }
  };

  // Load datasets on initial render and when showArchived changes
  useEffect(() => {
    fetchDatasets();
  }, [showArchived, selectedDataset]);

  // Handle dataset archive toggle
  const handleArchiveToggle = async (dataset, event) => {
    // Stop event propagation to prevent selection
    if (event) {
      event.stopPropagation();
    }
    
    try {
      await api.archiveDataset(dataset.id);
      
      // If the archived dataset was selected, unselect it
      if (selectedDataset && selectedDataset.id === dataset.id) {
        onSelectDataset(null);
      }
      
      // Refresh the dataset list
      fetchDatasets();
      
      toast.success(`Dataset ${dataset.archived ? 'unarchived' : 'archived'} successfully`);
    } catch (error) {
      console.error('Failed to archive/unarchive dataset:', error);
      toast.error('Failed to update dataset');
    }
  };

  // Handle new dataset creation
  const handleCreateDataset = async () => {
    if (!newDatasetName.trim()) {
      toast.error('Please enter a dataset name');
      return;
    }
    
    setIsCreating(true);
    
    try {
      const newDataset = await api.createDataset(newDatasetName);
      
      // Select the new dataset
      onSelectDataset(newDataset);
      
      // Refresh the dataset list
      fetchDatasets();
      
      toast.success('Dataset created successfully');
      setNewDatasetName('');
      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to create dataset:', error);
      toast.error('Failed to create dataset');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle dataset selection
  const handleSelectDataset = (dataset) => {
    onSelectDataset(dataset);
    setIsModalOpen(false);
  };

  // Filter datasets based on search term
  const filteredDatasets = datasets.filter(d => {
    // Check if we should include archived datasets
    const archivedCheck = showArchived || !d.archived;
    
    // Check if name matches search term (case insensitive)
    const searchCheck = !searchTerm || 
      d.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    return archivedCheck && searchCheck;
  });

  return (
    <div className="relative">
      {/* Dataset button with selected dataset name or placeholder */}
      <button
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[180px]"
        onClick={() => setIsModalOpen(true)}
      >
        <span className="truncate max-w-xs">
          {selectedDataset ? (
            <>
              <span className="font-medium">{selectedDataset.name}</span>
              {selectedDataset.archived && <span className="ml-1 text-gray-500">(Archived)</span>}
            </>
          ) : (
            <span className="text-gray-500">Select Dataset</span>
          )}
        </span>
        <svg 
          className="h-5 w-5 text-gray-400" 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 20 20" 
          fill="currentColor"
        >
          <path 
            fillRule="evenodd" 
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" 
            clipRule="evenodd" 
          />
        </svg>
        
        {/* New Dataset Button */}
        <button
          className="ml-2 p-1 rounded-full bg-primary-50 text-primary-700 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          onClick={(e) => {
            e.stopPropagation();
            setNewDatasetName('');
            setIsModalOpen(true);
          }}
          title="Create new dataset"
        >
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </button>
      </button>

      {/* Dataset Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">Datasets</h3>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setIsModalOpen(false)}
              >
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            {/* Search and Filter Controls */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex flex-col space-y-3">
                {/* Search Input */}
                <div className="relative">
                  <input
                    type="text"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Search datasets..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                
                {/* New Dataset Form */}
                <div className="flex space-x-2">
                  <input
                    type="text"
                    className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    placeholder="New dataset name..."
                    value={newDatasetName}
                    onChange={(e) => setNewDatasetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDatasetName.trim()) {
                        handleCreateDataset();
                      }
                    }}
                  />
                  <button
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors duration-150 flex items-center"
                    onClick={handleCreateDataset}
                    disabled={isCreating || !newDatasetName.trim()}
                  >
                    {isCreating ? (
                      <>
                        <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        Create
                      </>
                    )}
                  </button>
                </div>
                
                {/* Show Archived Checkbox */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="show-archived"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    checked={showArchived}
                    onChange={() => setShowArchived(!showArchived)}
                  />
                  <label htmlFor="show-archived" className="ml-2 text-sm text-gray-700">
                    Show Archived Datasets
                  </label>
                </div>
              </div>
            </div>
            
            {/* Dataset List */}
            <div className="flex-grow overflow-y-auto p-2">
              {isLoading ? (
                <div className="p-4 text-center text-gray-500">
                  <svg className="animate-spin h-6 w-6 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading datasets...
                </div>
              ) : filteredDatasets.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  {searchTerm ? (
                    <p>No datasets match your search</p>
                  ) : (
                    <p>No datasets available. Create one to get started!</p>
                  )}
                </div>
              ) : (
                <ul className="space-y-1">
                  {filteredDatasets.map(dataset => (
                    <li 
                      key={dataset.id}
                      onClick={() => handleSelectDataset(dataset)}
                      className={`p-3 rounded-md cursor-pointer flex items-center justify-between group transition-colors duration-150 
                        ${selectedDataset?.id === dataset.id ? 
                          'bg-primary-100 hover:bg-primary-200' : 
                          'hover:bg-gray-100'
                        }
                        ${dataset.archived ? 'text-gray-500' : 'text-gray-800'}
                      `}
                    >
                      <div className="flex items-center">
                        <div className="text-lg font-medium">{dataset.name}</div>
                        {dataset.archived && (
                          <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
                            Archived
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <button
                          className={`p-1.5 rounded-full ${dataset.archived ? 
                            'text-green-600 hover:bg-green-50' : 
                            'text-gray-600 hover:bg-gray-50'
                          }`}
                          onClick={(e) => handleArchiveToggle(dataset, e)}
                          title={dataset.archived ? 'Unarchive dataset' : 'Archive dataset'}
                        >
                          {dataset.archived ? (
                            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatasetSelector;