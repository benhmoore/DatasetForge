import { useState, useEffect, useMemo } from 'react';
import api from '../api/apiClient';
import CustomSelect from './CustomSelect';

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

  // Memoize the options array for stable identity
  const options = useMemo(() => {
    const modelOpts = models.map(model => ({ value: model, label: model }));
    if (allowNone) {
      return [{ value: '', label: 'Default (User Setting)' }, ...modelOpts];
    }
    return modelOpts;
  }, [models, allowNone]);

  // Handle selection from CustomSelect
  const handleChange = (selectedValue) => {
    onModelChange(selectedValue);
  };

  if (error) {
    return <div className="text-red-500 text-sm">{error}</div>;
  }

  return (
    <CustomSelect
      label={label}
      options={options}
      value={selectedModel} // Pass the raw value directly, not the option object
      onChange={handleChange}
      isLoading={isLoading}
      placeholder={isLoading ? "Loading models..." : "Select a model..."}
      isClearable={allowNone}
    />
  );
};

export default ModelSelector;
