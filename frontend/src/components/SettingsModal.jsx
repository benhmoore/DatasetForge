import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import ModelSelector from './ModelSelector';
import CustomSlider from './CustomSlider';
import Icon from './Icons';

const SettingsModal = ({ isOpen, onClose, onSave }) => {
  const [defaultGenModel, setDefaultGenModel] = useState('');
  const [defaultParaModel, setDefaultParaModel] = useState('');
  const [genContextSize, setGenContextSize] = useState(4096);
  const [paraContextSize, setParaContextSize] = useState(4096);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Load application settings when modal opens
  useEffect(() => {
    if (isOpen) {
      const loadAppSettings = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
          const appSettings = await api.getAppSettings();
          setDefaultGenModel(appSettings.default_gen_model);
          setDefaultParaModel(appSettings.default_para_model);
          setGenContextSize(appSettings.gen_model_context_size || 4096);
          setParaContextSize(appSettings.para_model_context_size || 4096);
        } catch (err) {
          console.error('Failed to load app settings:', err);
          setError('Failed to load settings');
        } finally {
          setIsLoading(false);
        }
      };
      
      loadAppSettings();
    }
  }, [isOpen]);

  // No data fetching needed as we're using environment variables

  // Handle save
  const handleSave = async () => {
    try {
      // Since we don't have API to save preferences now, just notify the parent component
      toast.success('Settings applied for this session');
      
      if (onSave) {
        onSave({
          default_gen_model: defaultGenModel,
          default_para_model: defaultParaModel,
          gen_model_context_size: genContextSize,
          para_model_context_size: paraContextSize
        });
      }
      
      onClose();
    } catch (err) {
      console.error('Failed to apply settings:', err);
      toast.error('Failed to apply settings');
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
            <Icon name="close" className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {error ? (
          <div className="py-4 text-red-500 text-center">{error}</div>
        ) : (
          <div className="space-y-6">
            {/* Default Models Section */}
            <div className="space-y-4">
              <h3 className="text-md font-medium">Application Models</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Generation Model
                </label>
                <p className="text-sm text-gray-500 mb-2">
                  Used for generating the actual fine-tuning examples. Can be overridden by templates.
                </p>
                <ModelSelector
                  selectedModel={defaultGenModel}
                  onModelChange={setDefaultGenModel}
                  label="Select generation model for this session..."
                />
                <p className="text-xs text-gray-400 mt-1">
                  Default from .env: {DEFAULT_GEN_MODEL}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Paraphrase Model
                </label>
                <p className="text-sm text-gray-500 mb-2">
                  Used for augmenting and generating seeds.
                </p>
                <ModelSelector
                  selectedModel={defaultParaModel}
                  onModelChange={setDefaultParaModel}
                  label="Select paraphrase model for this session..."
                />
                <p className="text-xs text-gray-400 mt-1">
                  Default from .env: {DEFAULT_PARA_MODEL}
                </p>
              </div>
            </div>

            {/* Context Size Section */}
            <div className="space-y-4">
              <h3 className="text-md font-medium">Context Sizes</h3>
              <p className="text-sm text-gray-500 mb-3">
                Set the context window size for your models (in tokens).
              </p>
              
              <div className="mb-5">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-medium text-gray-700">Generation Model Context</label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      className="w-24 h-8 px-2 text-sm border rounded-md"
                      min="1024"
                      max="128000"
                      step="1024"
                      value={genContextSize || ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : Number(e.target.value);
                        setGenContextSize(val);
                      }}
                      placeholder="Default"
                    />
                    <button 
                      className="ml-2 text-sm text-primary-600 hover:text-primary-700"
                      onClick={() => setGenContextSize(GEN_MODEL_CONTEXT_SIZE)}
                    >
                      Reset
                    </button>
                  </div>
                </div>
                
                {genContextSize && (
                  <CustomSlider
                    min={1024}
                    max={128000}
                    step={1024}
                    value={genContextSize}
                    onChange={setGenContextSize}
                  />
                )}
                
                <p className="text-xs text-gray-400 mt-1">
                  Default from .env: {GEN_MODEL_CONTEXT_SIZE} tokens
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-medium text-gray-700">Paraphrase Model Context</label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      className="w-24 h-8 px-2 text-sm border rounded-md"
                      min="1024"
                      max="128000"
                      step="1024"
                      value={paraContextSize || ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : Number(e.target.value);
                        setParaContextSize(val);
                      }}
                      placeholder="Default"
                    />
                    <button 
                      className="ml-2 text-sm text-primary-600 hover:text-primary-700"
                      onClick={() => setParaContextSize(PARA_MODEL_CONTEXT_SIZE)}
                    >
                      Reset
                    </button>
                  </div>
                </div>
                
                {paraContextSize && (
                  <CustomSlider
                    min={1024}
                    max={128000}
                    step={1024}
                    value={paraContextSize}
                    onChange={setParaContextSize}
                  />
                )}
                
                <p className="text-xs text-gray-400 mt-1">
                  Default from .env: {PARA_MODEL_CONTEXT_SIZE} tokens
                </p>
              </div>
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