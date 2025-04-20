import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Position } from '@xyflow/react';
import CustomSelect from './CustomSelect';
import CustomSlider from './CustomSlider';
import api from '../api/apiClient';
import NodeBase from './NodeBase';

/**
 * ModelNode component for configuring a model node in a workflow
 * Supports multiple inputs that are referenced in the system prompt
 */
const ModelNode = ({ 
  data,
  id,
  disabled = false,
  isConnectable = true
}) => {
  // Destructure config and callback from data
  const { 
    onConfigChange, 
    model = '', 
    system_instruction = '',
    model_parameters = { temperature: 0.7, top_p: 1.0, max_tokens: 1000 },
    // Get named inputs array with default empty array
    inputs = [],
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
  }, []); // Run only once on mount

  // Handle model selection
  const handleModelChange = (selectedModelName) => {
    if (onConfigChange) {
      console.log(`ModelNode (${id}): handleModelChange -> ${selectedModelName}`);
      onConfigChange(id, { model: selectedModelName });
    }
  };

  // Handle system instruction change
  const handleSystemInstructionChange = (e) => {
    if (onConfigChange) {
      console.log(`ModelNode (${id}): handleSystemInstructionChange`);
      onConfigChange(id, { system_instruction: e.target.value });
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

  // Model options for dropdown
  const modelOptions = models.map(m => ({
    value: m,
    label: m
  }));

  // Ensure we always have at least one empty input for connection
  const ensureEmptyInput = useCallback(() => {
    // If we have no inputs or the last input has a connection, add an empty one
    if (!inputs.length || inputs[inputs.length - 1].connected) {
      const newInputName = `input${inputs.length + 1}`;
      const updatedInputs = [...inputs, { id: newInputName, connected: false }];
      
      if (onConfigChange) {
        console.log(`ModelNode (${id}): Adding empty input ${newInputName}`);
        onConfigChange(id, { inputs: updatedInputs });
      }
    }
  }, [inputs, onConfigChange, id]);

  // Check on mount and when inputs change
  useEffect(() => {
    ensureEmptyInput();
  }, [ensureEmptyInput]);

  // Mark an input as connected
  const markInputConnected = useCallback((inputId) => {
    if (!onConfigChange) return;
    
    const inputIndex = inputs.findIndex(input => input.id === inputId);
    if (inputIndex === -1) return;
    
    const updatedInputs = [...inputs];
    updatedInputs[inputIndex] = { ...updatedInputs[inputIndex], connected: true };
    
    console.log(`ModelNode (${id}): Marking input ${inputId} as connected`);
    onConfigChange(id, { inputs: updatedInputs });
    
    // Ensure we still have an empty input
    setTimeout(ensureEmptyInput, 0);
  }, [inputs, onConfigChange, id, ensureEmptyInput]);

  // Define input handles for NodeBase dynamically
  const inputHandles = inputs.map(input => ({
    id: input.id,
    position: Position.Left,
    label: input.connected ? `Input: ${input.id}` : `Connect to ${input.id}`,
    onConnect: () => markInputConnected(input.id)
  }));

  return (
    <NodeBase 
      id={id} 
      data={data} 
      isConnectable={isConnectable} 
      disabled={disabled} 
      nodeType="model"
      iconName="cpu"
      inputHandles={inputHandles}
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
      
      {/* System instruction */}
      <div className="mt-4 space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          System Instruction
        </label>
        <textarea
          value={system_instruction}
          onChange={handleSystemInstructionChange}
          className="w-full p-2 border rounded text-sm"
          rows={4}
          placeholder="Enter system instructions for the model. Use {inputName} to reference specific inputs."
          disabled={disabled}
        />
        
        {inputs.length > 1 && (
          <div className="text-xs text-gray-500 mt-1">
            <p>Reference your inputs using <code>{'{inputName}'}</code> syntax.</p>
            <p>Available inputs: {inputs.filter(i => i.connected).map(i => i.id).join(', ')}</p>
          </div>
        )}
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