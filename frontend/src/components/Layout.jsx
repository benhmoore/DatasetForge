import { useState, useEffect } from 'react'; // Add useEffect
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import DatasetSelector from './DatasetSelector';
import SettingsModal from './SettingsModal';
import Icon from './Icons';
import LogoutButton from './LogoutButton';
import TemplateBuilder from './TemplateBuilder';
import Generate from './Generate';
import api from '../api/apiClient'; // Import api

const Layout = () => {
  // Initialize state from localStorage or null
  const [selectedDataset, setSelectedDataset] = useState(() => {
    const savedDatasetId = localStorage.getItem('datasetforge_selectedDatasetId');
    // We only store the ID, need to fetch the full object later
    return savedDatasetId ? { id: parseInt(savedDatasetId, 10), name: 'Loading...' } : null;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const location = useLocation();
  
  // Determine active tab based on current path
  const activeTab = location.pathname === '/generate' ? 'generate' : 'templates';

  // Fetch full dataset details if only ID was loaded from localStorage
  useEffect(() => {
    const loadInitialDataset = async () => {
      const savedDatasetId = localStorage.getItem('datasetforge_selectedDatasetId');
      // Only attempt load if the placeholder is set
      if (savedDatasetId && selectedDataset?.name === 'Loading...') {
        try {
          // Fetch the specific dataset by ID for persistence
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
  }, []); // Run only once on mount

  // Save selected dataset ID to localStorage when it changes
  useEffect(() => {
    if (selectedDataset && selectedDataset.id) {
      localStorage.setItem('datasetforge_selectedDatasetId', selectedDataset.id.toString());
    } else {
      // Clear from localStorage if no dataset is selected
      localStorage.removeItem('datasetforge_selectedDatasetId');
    }
  }, [selectedDataset]);

  // Create context object to pass down
  const outletContext = { selectedDataset, setSelectedDataset };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        {/* Reintroduce max-width, but use screen-xl for wider layout */}
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-primary-800">DatasetForge</h1>
              <DatasetSelector
                selectedDataset={selectedDataset}
                onSelectDataset={setSelectedDataset}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="text-gray-500 hover:text-gray-700 px-3 py-2"
                title="Settings"
              >
                <Icon name="cog" className="h-5 w-5" aria-hidden="true" />
              </button>
              <LogoutButton />
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <div className="mt-4 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <Link
                to="/"
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'templates'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
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
                  Generate & Audition
                </Link>
              ) : (
                <button
                  className="py-2 px-1 border-b-2 border-transparent text-gray-400 font-medium text-sm cursor-not-allowed"
                  onClick={() => toast.warning('Please select a dataset first')}
                  disabled
                >
                  Generate & Audition
                </button>
              )}
            </nav>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      {/* Make main flex column and flex-grow to push content down */}
      <main className="flex-grow flex flex-col">
        {/* Remove max-width, add flex-grow to this container */}
        <div className="flex-grow mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full"> {/* Removed max-w-screen-xl, added flex-grow and w-full */}
          {/* Conditionally render TemplateBuilder, ensure it fills height */}
          <div className={`${activeTab === 'templates' ? 'h-full' : 'hidden'}`}> {/* Added h-full */}
            <TemplateBuilder context={outletContext} />
          </div>

          {/* Conditionally render Generate or placeholder, ensure it fills height */}
          <div className={`${activeTab === 'generate' ? 'h-full' : 'hidden'}`}> {/* Added h-full */}
            {selectedDataset ? (
              <Generate context={outletContext} />
            ) : (
              <div className="p-8 bg-gray-50 rounded-lg border border-gray-200 text-center">
                <h2 className="text-xl font-medium text-gray-700 mb-4">No Dataset Selected</h2>
                <p className="text-gray-500 mb-4">
                  Please create and select a dataset using the dropdown at the top of the page to use the Generate & Audition feature.
                </p>
                <DatasetSelector
                  selectedDataset={selectedDataset}
                  onSelectDataset={setSelectedDataset}
                />
              </div>
            )}
          </div>
        </div>
      </main>
      
      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default Layout;