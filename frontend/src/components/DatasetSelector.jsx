import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import Icon from './Icons';
import ToggleSwitch from './ToggleSwitch';

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
        <Icon name="chevronDown" className="h-5 w-5 text-gray-500" aria-hidden="true" />
        
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
          <Icon name="plus" className="h-5 w-5" aria-hidden="true" />
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
                <Icon name="close" className="h-6 w-6" aria-hidden="true" />
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
                    <Icon name="search" className="h-5 w-5 text-gray-400" aria-hidden="true" />
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
                      <Icon name="spinner" className="animate-spin h-4 w-4 mr-2" aria-hidden="true" />
                      Creating...
                      </>
                    ) : (
                      <>
                      <Icon name="plus" className="h-4 w-4 mr-2" aria-hidden="true" />
                      Create
                      </>
                    )}
                    </button>
                  </div>
                  
                  {/* Show Archived Toggle Switch */}
                <div className="flex items-center">
                  <ToggleSwitch
                    label="Show Archived Datasets"
                    checked={showArchived}
                    onChange={() => setShowArchived(!showArchived)}
                  />
                </div>
              </div>
            </div>
            
            {/* Dataset List */}
            <div className="flex-grow overflow-y-auto p-6">
              {isLoading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
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
                <ul className="space-y-4">
                  {filteredDatasets.map(dataset => (
                    <li 
                      key={dataset.id}
                      onClick={() => handleSelectDataset(dataset)}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        selectedDataset?.id === dataset.id 
                          ? 'border-primary-500 bg-primary-50 shadow-md' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-800 flex items-center">
                            {dataset.name}
                            {dataset.archived && (
                              <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-800 text-xs rounded-full">
                                Archived
                              </span>
                            )}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Dataset
                            </span>
                            {dataset.archived ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                Inactive
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center ml-4 space-x-2">
                          <button
                            className={`p-1.5 rounded-full ${dataset.archived ? 
                              'text-green-600 hover:bg-green-50' : 
                              'text-gray-600 hover:bg-gray-50'
                            }`}
                            onClick={(e) => handleArchiveToggle(dataset, e)}
                            title={dataset.archived ? 'Unarchive dataset' : 'Archive dataset'}
                          >
                            {dataset.archived ? (
                             <Icon name="unarchive" className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <Icon name="archive" className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                          <input
                            type="radio"
                            checked={selectedDataset?.id === dataset.id}
                            onChange={() => handleSelectDataset(dataset)}
                            className="h-5 w-5 text-primary-600 focus:ring-primary-500 border-gray-300"
                          />
                        </div>
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