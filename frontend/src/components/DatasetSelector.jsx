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
  const handleArchiveToggle = async (dataset) => {
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

  return (
    <div className="relative">
      <div className="flex items-center space-x-2">
        <div className="relative flex-grow">
          <select
            className="w-full pl-3 pr-10 py-2 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            value={selectedDataset?.id || ''}
            onChange={(e) => {
              const id = e.target.value;
              if (id === 'new') {
                setIsModalOpen(true);
              } else {
                const dataset = datasets.find(d => d.id.toString() === id);
                onSelectDataset(dataset || null);
              }
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <option value="">Loading datasets...</option>
            ) : datasets.length === 0 ? (
              <option value="">No datasets available</option>
            ) : (
              <>
                <option value="">Select a dataset</option>
                {datasets
                  .filter(d => showArchived || !d.archived)
                  .map(dataset => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name} {dataset.archived ? '(Archived)' : ''}
                    </option>
                  ))
                }
                <option value="new">➕ New Dataset</option>
              </>
            )}
          </select>
        </div>
        
        {selectedDataset && (
          <button
            className="p-2 text-gray-500 hover:text-gray-700"
            onClick={() => handleArchiveToggle(selectedDataset)}
            title={selectedDataset.archived ? 'Unarchive dataset' : 'Archive dataset'}
          >
            {selectedDataset.archived ? '📦' : '🗑️'}
          </button>
        )}
        
        <div className="flex items-center">
          <input
            type="checkbox"
            id="show-archived"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            checked={showArchived}
            onChange={() => setShowArchived(!showArchived)}
          />
          <label htmlFor="show-archived" className="ml-2 text-sm text-gray-700">
            Show Archived
          </label>
        </div>
      </div>

      {/* New Dataset Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Create New Dataset</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dataset Name
              </label>
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded-md"
                value={newDatasetName}
                onChange={(e) => setNewDatasetName(e.target.value)}
                placeholder="Enter dataset name"
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                onClick={handleCreateDataset}
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatasetSelector;