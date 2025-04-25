import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import DatasetSelector from './DatasetSelector';
import Icon from './Icons';
import TemplateBuilder from './TemplateBuilder';
import Generate from './Generate';
import api from '../api/apiClient';

const Layout = () => {
  // Initialize state from localStorage or null
  const [selectedDataset, setSelectedDataset] = useState(() => {
    const savedDatasetId = localStorage.getItem('datasetforge_selectedDatasetId');
    return savedDatasetId ? { id: parseInt(savedDatasetId, 10), name: 'Loading...' } : null;
  });
  const location = useLocation();

  // Determine active tab based on current path
  const activeTab = location.pathname === '/generate' ? 'generate' : 'templates';

  // Fetch full dataset details if only ID was loaded from localStorage
  useEffect(() => {
    const loadInitialDataset = async () => {
      const savedDatasetId = localStorage.getItem('datasetforge_selectedDatasetId');
      if (savedDatasetId && selectedDataset?.name === 'Loading...') {
        try {
          const dataset = await api.getDatasetById(parseInt(savedDatasetId, 10));
          if (dataset && !dataset.archived) {
            setSelectedDataset(dataset);
          } else {
            localStorage.removeItem('datasetforge_selectedDatasetId');
            setSelectedDataset(null);
          }
        } catch (error) {
          console.error("Failed to load initial dataset from list:", error);
          localStorage.removeItem('datasetforge_selectedDatasetId');
          setSelectedDataset(null);
        }
      }
    };
    loadInitialDataset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save selected dataset ID to localStorage when it changes
  useEffect(() => {
    if (selectedDataset && selectedDataset.id) {
      localStorage.setItem('datasetforge_selectedDatasetId', selectedDataset.id.toString());
    } else {
      localStorage.removeItem('datasetforge_selectedDatasetId');
    }
  }, [selectedDataset]);

  const outletContext = { selectedDataset, setSelectedDataset };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        {/* Top bar full width */}
        <div className="w-full px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-primary-800">DatasetForge</h1>
              <DatasetSelector
                selectedDataset={selectedDataset}
                onSelectDataset={setSelectedDataset}
              />
            </div>
            <div className="flex items-center space-x-2">
            </div>
          </div>
        </div>

        {/* Navigation Tabs (full width) */}
        <div className="w-full border-b border-gray-200">
          <nav className="flex space-x-8 px-4 sm:px-6 lg:px-8 -mb-px">
            <Link
              to="/"
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'templates'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon name="document" className="h-5 w-5 inline-block mr-2" aria-hidden="true" />
              Template Builder
            </Link>

            {selectedDataset ? (
              <Link
                to="/generate"
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'generate'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon name="sparkles" className="h-5 w-5 inline-block mr-2" aria-hidden="true" />
                Generate & Audition
              </Link>
            ) : (
              <button
                className="py-2 px-1 border-b-2 border-transparent text-gray-400 font-medium text-sm cursor-not-allowed"
                onClick={() => toast.warning('Please select a dataset first')}
                disabled
              >
                <Icon name="sparkles" className="h-5 w-5 inline-block mr-2" aria-hidden="true" />
                Generate & Audition
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content */}
        <main className="flex-grow flex flex-col w-full">
          <div className="flex-grow w-full">
            <div className={`${activeTab === 'templates' ? 'h-full' : 'hidden'}`}>
          <TemplateBuilder context={outletContext} />
            </div>

            <div className={`${activeTab === 'generate' ? 'h-full' : 'hidden'}`}>
          {selectedDataset ? (
            <Generate context={outletContext} />
          ) : (
            <div className="p-8 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <h2 className="text-xl font-medium text-gray-700 mb-4">No Dataset Selected</h2>
              <p className="text-gray-500 mb-4">
            Please create and select a dataset to use the Generate & Audition feature.
              </p>
              <div className="flex justify-center">
            <DatasetSelector
              selectedDataset={selectedDataset}
              onSelectDataset={setSelectedDataset}
            />
              </div>
            </div>
          )}
            </div>
          </div>
        </main>
    </div>
  );
};

export default Layout;
