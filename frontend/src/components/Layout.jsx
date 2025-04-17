import { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import DatasetSelector from './DatasetSelector';
import SettingsModal from './SettingsModal';
import LogoutButton from './LogoutButton';

const Layout = () => {
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine active tab based on current path
  const activeTab = location.pathname === '/generate' ? 'generate' : 'templates';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-primary-800">DatasetForge</h1>
              <div className="w-64">
                <DatasetSelector
                  selectedDataset={selectedDataset}
                  onSelectDataset={setSelectedDataset}
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="text-gray-500 hover:text-gray-700 px-3 py-2"
                title="Settings"
              >
                ⚙️
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
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet context={{ selectedDataset, setSelectedDataset }} />
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