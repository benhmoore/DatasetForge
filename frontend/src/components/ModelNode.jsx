import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { Position } from '@xyflow/react';
import CustomSelect from './CustomSelect';
import CustomSlider from './CustomSlider';
import api from '../api/apiClient';
import NodeBase from './NodeBase';

/**
 * ModelNode component for configuring a model node in a workflow
 * Takes system prompt and user prompt as inputs
 * Outputs the model's generated text
 */
const ModelNode = ({ 
  data,
  id,
  disabled = false,
  isConnectable = true
}) => {
  // Destructure config, callback from data
  const { 
    onConfigChange, 
    model = '', 
    model_parameters = { temperature: 0.7, top_p: 1.0, max_tokens: 1000 }
  } = data;

  // State for models and loading status
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
  const handleModelChange = (selectedModelName) => {
    if (onConfigChange) {
      console.log(`ModelNode (${id}): handleModelChange -> ${selectedModelName}`);
      onConfigChange(id, { model: selectedModelName });
    }
  };

  // Handle parameter changes
  const handleParameterChange = (param, value) => {
    if (onConfigChange) {
      const updatedParams = {
        ...model_parameters,
        [param]: value
      };
      console.log(`ModelNode (${id}): handleParameterChange -> ${param}: ${value}`);
      onConfigChange(id, { model_parameters: updatedParams });
    }
  };

  // Define input handles for system prompt and user prompt
  const inputHandles = useMemo(() => [
    {
      id: 'input_system_prompt',
      type: 'target',
      position: Position.Left,
      label: 'System Prompt',
      style: { top: '30%' }
    },
    {
      id: 'input_user_prompt',
      type: 'target',
      position: Position.Left,
      label: 'User Prompt',
      style: { top: '70%' }
    }
  ], []);

  // Define output handle
  const outputHandles = useMemo(() => [
    {
      id: 'output',
      type: 'source',
      position: Position.Right,
      label: 'Output'
    }
  ], []);

  // Model options for dropdown
  const modelOptions = models.map(m => ({
    value: m,
    label: m
  }));

  return (
    <NodeBase 
      id={id} 
      data={data} 
      isConnectable={isConnectable} 
      disabled={disabled} 
      nodeType="model"
      iconName="workflow"
      inputHandles={inputHandles}
      outputHandles={outputHandles}
    >
      {/* Model selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Select Model
        </label>
        <CustomSelect
          options={modelOptions}
          value={model || ''}
          onChange={handleModelChange}
          placeholder="Select a model..."
          isLoading={isLoadingModels}
          disabled={disabled}
        />
      </div>
      
      {/* Input reminders (to guide workflow connections) */}
      <div className="mt-4 p-2 bg-blue-50 border border-blue-100 rounded">
        <p className="text-xs text-blue-600">
          Connect <strong>System Prompt</strong> and <strong>User Prompt</strong> inputs from PromptNode components.
        </p>
      </div>
      
      {/* Model parameters */}
      <div className="space-y-4 mt-6">
        <h4 className="font-medium text-sm">Model Parameters</h4>
        
        {/* Temperature slider */}
        <div>
          <CustomSlider
            label="Temperature"
            value={model_parameters?.temperature ?? 0.7}
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
            value={model_parameters?.top_p ?? 1.0}
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
            value={model_parameters?.max_tokens ?? 1000}
            onChange={(value) => handleParameterChange('max_tokens', Math.round(value))}
            min={100}
            max={4000}
            step={100}
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 mt-1">
            Maximum tokens to generate in the response.
          </p>
        </div>
      </div>
    </NodeBase>
  );
};

export default ModelNode;