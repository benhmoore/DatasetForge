import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
// Removed Handle and Position imports as they are handled by NodeBase
import CustomSelect from './CustomSelect';
import CustomSlider from './CustomSlider';
import api from '../api/apiClient';
import NodeBase from './NodeBase'; // Import the base component

/**
 * ModelNode component for configuring a model node in a workflow
 */
const ModelNode = ({ 
  data, // Data object from React Flow, contains config and onConfigChange
  id,   // Node ID from React Flow
  disabled = false,
  isConnectable = true
}) => {
  // Destructure config and callback from data
  const { 
    onConfigChange, 
    model = '', 
    system_instruction = '', 
    model_parameters = { temperature: 0.7, top_p: 1.0, max_tokens: 1000 },
    // name and label are handled by NodeBase
  } = data;

  // State only for fetched models and loading status
  const [models, setModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Fetch available models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      setIsLoadingModels(true);
      try {
        const modelList = await api.getModels();
        setModels(modelList);
      } catch (error) {
        console.error('Failed to fetch models:', error);
        toast.error('Failed to load model list');
      } finally {
        setIsLoadingModels(false);
      }
    };
    fetchModels();
  }, []); // Run only once on mount

  // Handle model selection
  const handleModelChange = (selectedModelName) => {
    if (onConfigChange) {
      console.log(`ModelNode (${id}): handleModelChange -> ${selectedModelName}`);
      onConfigChange(id, { model: selectedModelName });
    }
  };

  // Handle system instruction change
  const handleInstructionChange = (e) => {
    const newValue = e.target.value;
    if (onConfigChange) {
      console.log(`ModelNode (${id}): handleInstructionChange -> ${newValue.substring(0, 20)}...`);
      onConfigChange(id, { system_instruction: newValue });
    }
  };

  // Handle parameter changes
  const handleParameterChange = (param, value) => {
    if (onConfigChange) {
      const updatedParams = {
        ...model_parameters, // Use current parameters from props
        [param]: value
      };
      console.log(`ModelNode (${id}): handleParameterChange -> ${param}: ${value}`);
      onConfigChange(id, { model_parameters: updatedParams });
    }
  };

  // Model options for dropdown
  const modelOptions = models.map(m => ({
    value: m,
    label: m
  }));

  return (
    // Use NodeBase to wrap the specific content
    <NodeBase 
      id={id} 
      data={data} 
      isConnectable={isConnectable} 
      disabled={disabled} 
      nodeType="model" // Specify type for styling
      iconName="cpu" // Specify icon
    >
      {/* Model selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Select Model
        </label>
        <CustomSelect
          options={modelOptions}
          value={model || ''} // Use model directly from data
          onChange={handleModelChange}
          placeholder="Select a model..."
          isLoading={isLoadingModels}
          disabled={disabled}
        />
      </div>
      
      {/* System instruction */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          System Instruction
        </label>
        <textarea
          className="w-full h-24 p-2 border rounded text-sm focus:ring-blue-500 focus:border-blue-500"
          value={system_instruction || ''} // Use system_instruction directly from data
          onChange={handleInstructionChange}
          placeholder="Enter system instructions for the model..."
          disabled={disabled}
        />
      </div>
      
      {/* Model parameters */}
      <div className="space-y-4 pt-2">
        <h4 className="font-medium text-sm">Model Parameters</h4>
        
        {/* Temperature slider */}
        <div>
          <CustomSlider
            label="Temperature"
            value={model_parameters?.temperature ?? 0.7} // Use ?? for default
            onChange={(value) => handleParameterChange('temperature', value)}
            min={0}
            max={2}
            step={0.05}
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 mt-1">
            Controls randomness. Lower = predictable, Higher = creative.
          </p>
        </div>
        
        {/* Top-p slider */}
        <div>
          <CustomSlider
            label="Top-p"
            value={model_parameters?.top_p ?? 1.0} // Use ?? for default
            onChange={(value) => handleParameterChange('top_p', value)}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 mt-1">
            Nucleus sampling. Considers tokens with top p probability mass.
          </p>
        </div>
        
        {/* Max tokens slider */}
        <div>
          <CustomSlider
            label="Max Tokens"
            value={model_parameters?.max_tokens ?? 1000} // Use ?? for default
            onChange={(value) => handleParameterChange('max_tokens', Math.round(value))}
            min={100}
            max={4000} // Consider adjusting max based on models
            step={100}
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 mt-1">
            Maximum tokens to generate in the response.
          </p>
        </div>
      </div>
    </NodeBase> // Close NodeBase
  );
};

// Export the direct component
export default ModelNode;