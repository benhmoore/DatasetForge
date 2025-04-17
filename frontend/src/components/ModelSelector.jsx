import { useState, useEffect } from 'react';
import api from '../api/apiClient';
import CustomSelect from './CustomSelect'; // Assuming CustomSelect handles the UI

const ModelSelector = ({ selectedModel, onModelChange, allowNone = false, label = "Select Model" }) => {
  const [models, setModels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchModels = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedModels = await api.getModels();
        setModels(fetchedModels);
      } catch (err) {
        console.error("Failed to fetch models:", err);
        setError("Failed to load models");
        setModels([]); // Clear models on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, []);

  const options = models.map(model => ({ value: model, label: model }));

  if (allowNone) {
    options.unshift({ value: '', label: 'Default (User Setting)' }); // Add option for no override
  }

  const handleChange = (selectedOption) => {
    onModelChange(selectedOption ? selectedOption.value : ''); // Pass the value or empty string
  };

  // Find the currently selected option object for the CustomSelect component
  const currentOption = options.find(option => option.value === selectedModel) || null;

  if (error) {
    return <div className="text-red-500 text-sm">{error}</div>;
  }

  return (
    <CustomSelect
      label={label}
      options={options}
      value={currentOption}
      onChange={handleChange}
      isLoading={isLoading}
      placeholder={isLoading ? "Loading models..." : "Select a model..."}
      isClearable={allowNone} // Allow clearing only if allowNone is true
    />
  );
};

export default ModelSelector;
