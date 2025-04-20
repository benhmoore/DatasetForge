import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Handle } from '@xyflow/react';
import CustomSelect from './CustomSelect';
import CustomSlider from './CustomSlider';
import api from '../api/apiClient';
import withNodeWrapper from './withNodeWrapper';

/**
 * ModelNode component for configuring a model node in a workflow
 */
const ModelNode = ({ 
  nodeConfig, 
  localConfig, 
  updateConfig,
  disabled = false,
  availableTemplates = [],
  isConnectable = true
}) => {
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
  }, []);
  
  // Handle model selection
  const handleModelChange = (modelName) => {
    updateConfig({ model: modelName });
  };
  
  // Handle system instruction change
  const handleInstructionChange = (e) => {
    console.log('ModelNode: handleInstructionChange', e.target.value);
    updateConfig({ system_instruction: e.target.value });
  };
  
  // Handle parameter changes
  const handleParameterChange = (param, value) => {
    updateConfig({ 
      model_parameters: {
        ...localConfig.model_parameters,
        [param]: value
      }
    });
  };
  
  // Model options for dropdown
  const modelOptions = models.map(model => ({
    value: model,
    label: model
  }));
  
  // No longer needed - template handling is now in TemplateNode component
  
  return (
    <div className="p-4 space-y-4 bg-white rounded border border-gray-200 relative">
      {/* Input handle */}
      <Handle 
        type="target" 
        position="left" 
        id="input" 
        isConnectable={isConnectable} 
        className="w-3 h-3 bg-blue-500"
      />
      
      {/* Output handle */}
      <Handle 
        type="source" 
        position="right" 
        id="output" 
        isConnectable={isConnectable} 
        className="w-3 h-3 bg-blue-500"
      />
      
      <h3 className="font-medium text-lg">{nodeConfig?.name || 'Model Node'}</h3>
      
      {/* Model selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Select Model
        </label>
        <CustomSelect
          options={modelOptions}
          value={localConfig.model || ''}
          onChange={handleModelChange}
          placeholder="Select a model..."
          isLoading={isLoadingModels}
          disabled={disabled}
        />
      </div>
      
      {/* Template selection removed - now handled by separate TemplateNode */}
      
      {/* System instruction */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          System Instruction
        </label>
        <textarea
          className="w-full h-24 p-2 border rounded text-sm"
          value={localConfig.system_instruction || ''}
          onChange={handleInstructionChange}
          onBlur={() => console.log("CURRENT NODE CONFIG:", nodeConfig)}
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
            value={localConfig.model_parameters?.temperature || 0.7}
            onChange={(value) => handleParameterChange('temperature', value)}
            min={0}
            max={2}
            step={0.05}
            disabled={disabled}
          />
          <p className="text-xs text-gray-500">
            Controls randomness: Lower values for more predictable outputs, higher for more creative ones.
          </p>
        </div>
        
        {/* Top-p slider */}
        <div>
          <CustomSlider
            label="Top-p"
            value={localConfig.model_parameters?.top_p || 1.0}
            onChange={(value) => handleParameterChange('top_p', value)}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
          />
          <p className="text-xs text-gray-500">
            Nucleus sampling: Controls diversity by considering only tokens with the top p probability mass.
          </p>
        </div>
        
        {/* Max tokens slider */}
        <div>
          <CustomSlider
            label="Max Tokens"
            value={localConfig.model_parameters?.max_tokens || 1000}
            onChange={(value) => handleParameterChange('max_tokens', Math.round(value))}
            min={100}
            max={4000}
            step={100}
            disabled={disabled}
          />
          <p className="text-xs text-gray-500">
            Maximum number of tokens to generate in the response.
          </p>
        </div>
      </div>
    </div>
  );
};

// Define default config for ModelNode
const getDefaultModelConfig = () => ({
  model: '',
  system_instruction: '',
  model_parameters: {
    temperature: 0.7,
    top_p: 1.0,
    max_tokens: 1000
  }
});

// Wrap with HOC
export default withNodeWrapper(ModelNode, getDefaultModelConfig);