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
const ModelNodeInner = ({ 
  data, // Pass raw data from ReactFlow
  disabled = false,
  availableTemplates = [],
  isConnectable = true
}) => {
  // Destructure the necessary values directly from data prop
  const { onConfigChange } = data;
  // Create local state for our models fetch
  const [models, setModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  // Create local state for handling our configuration
  const [localConfig, setLocalConfig] = useState({
    model: data.model || '',
    system_instruction: data.system_instruction || '',
    model_parameters: data.model_parameters || {
      temperature: 0.7,
      top_p: 1.0,
      max_tokens: 1000
    }
  });
  
  // Debug output to see what we're working with
  useEffect(() => {
    console.log("ModelNode data from ReactFlow:", data);
    console.log("ModelNode localConfig:", localConfig);
  }, [data, localConfig]);
  
  // Update our parent when local config changes
  const updateParent = (updatedConfig) => {
    // Only update if we have the callback
    if (onConfigChange) {
      // Create complete updated config
      const completeConfig = {
        ...data,
        ...updatedConfig
      };
      console.log("ModelNode: Sending update to parent:", completeConfig);
      onConfigChange(completeConfig);
    }
  };
  
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
    // Update our local state
    setLocalConfig(prev => ({
      ...prev,
      model: modelName
    }));
    
    // Send update to parent
    updateParent({ model: modelName });
  };
  
  // Handle system instruction change
  const handleInstructionChange = (e) => {
    const newValue = e.target.value;
    console.log('ModelNode: handleInstructionChange', newValue);
    
    // Update our local state
    setLocalConfig(prev => ({
      ...prev,
      system_instruction: newValue
    }));
    
    // Send update to parent
    updateParent({ system_instruction: newValue });
    
    // Debug output on blur
    e.target.onblur = () => {
      console.log("CURRENT SYSTEM INSTRUCTION:", localConfig.system_instruction);
      console.log("DATA SYSTEM INSTRUCTION:", data.system_instruction);
    };
  };
  
  // Handle parameter changes
  const handleParameterChange = (param, value) => {
    // Update our local state
    setLocalConfig(prev => {
      const updatedParams = {
        ...prev.model_parameters,
        [param]: value
      };
      
      // Update local state
      const newConfig = {
        ...prev,
        model_parameters: updatedParams
      };
      
      // Send update to parent
      updateParent({ 
        model_parameters: updatedParams
      });
      
      return newConfig;
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
      
      <h3 className="font-medium text-lg">{data?.name || data?.label || 'Model Node'}</h3>
      
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
        {/* Debug */}
        <div className="text-xs mt-1 text-gray-400">Data Model: {data.model || 'none'}</div>
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
          onBlur={() => console.log("CURRENT DATA:", data)}
          placeholder="Enter system instructions for the model..."
          disabled={disabled}
        />
        {/* Debug */}
        <div className="text-xs mt-1 text-gray-400">Data instruction: {(data.system_instruction || '').substring(0, 20)}...</div>
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

// Export the direct component
const ModelNode = ModelNodeInner;
export default ModelNode;