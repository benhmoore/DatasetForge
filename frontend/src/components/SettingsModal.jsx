import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';

const SettingsModal = ({ isOpen, onClose, onSave }) => {
  const [models, setModels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultGenModel, setDefaultGenModel] = useState('');
  const [defaultParaModel, setDefaultParaModel] = useState('');
  const [error, setError] = useState(null);

  // Fetch available models and user preferences
  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
          // Fetch models and user preferences in parallel
          const [modelsResponse, preferencesResponse] = await Promise.all([
            api.getModels(),
            api.getUserPreferences()
          ]);
          
          setModels(modelsResponse);
          setDefaultGenModel(preferencesResponse.default_gen_model);
          setDefaultParaModel(preferencesResponse.default_para_model);
        } catch (err) {
          console.error('Failed to fetch data:', err);
          setError('Failed to load settings. Please try again.');
          toast.error('Failed to load settings');
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchData();
    }
  }, [isOpen]);

  // Handle save
  const handleSave = async () => {
    try {
      await api.updateUserPreferences({
        default_gen_model: defaultGenModel,
        default_para_model: defaultParaModel
      });
      
      toast.success('Settings saved successfully');
      
      if (onSave) {
        onSave({
          default_gen_model: defaultGenModel,
          default_para_model: defaultParaModel
        });
      }
      
      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings');
    }
  };

  // If modal is not open, don't render anything
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button
            className="text-gray-500 hover:text-gray-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div className="py-4 text-center">Loading...</div>
        ) : error ? (
          <div className="py-4 text-red-500 text-center">{error}</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Generation Model
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md"
                value={defaultGenModel}
                onChange={(e) => setDefaultGenModel(e.target.value)}
              >
                {models.length === 0 ? (
                  <option value="">No models available</option>
                ) : (
                  models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Paraphrase Model
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md"
                value={defaultParaModel}
                onChange={(e) => setDefaultParaModel(e.target.value)}
              >
                {models.length === 0 ? (
                  <option value="">No models available</option>
                ) : (
                  models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                onClick={handleSave}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsModal;