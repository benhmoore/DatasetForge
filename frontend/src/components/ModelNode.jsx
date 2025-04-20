import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Position, useUpdateNodeInternals } from '@xyflow/react';
import CustomSelect from './CustomSelect';
import CustomSlider from './CustomSlider';
import api from '../api/apiClient';
import NodeBase from './NodeBase';

/**
 * ModelNode component for configuring a model node in a workflow
 * Uses indexed inputs (input_0, input_1, etc.) instead of named inputs
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
    model_parameters = { temperature: 0.7, top_p: 1.0, max_tokens: 1000 }
  } = data;

  // State for models and loading status
  const [models, setModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  // Track input connections - always start with one visible handle
  const [visibleHandleCount, setVisibleHandleCount] = useState(1);
  
  // This hook forces React Flow to update handles when they change
  const updateNodeInternals = useUpdateNodeInternals();

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

  // Add a new input handle when a connection is made
  const handleConnect = useCallback((inputIndex) => {
    console.log(`ModelNode (${id}): Input ${inputIndex} connected`);
    
    // When an input is connected, make sure we have one more for future connections
    setVisibleHandleCount(prev => {
      // Always provide one more than the highest connected index
      const nextCount = Math.max(prev, inputIndex + 2);
      // Cap at a reasonable maximum (5 handles)
      return Math.min(nextCount, 5);
    });

    // Force React Flow to update the node with new handles
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  // Create only the visible input handles we need
  const inputHandles = [];
  
  // Create the visible handles (always show at least 1)
  for (let i = 0; i < visibleHandleCount; i++) {
    inputHandles.push({
      id: `input_${i}`,
      type: 'target',
      position: Position.Left,
      label: `Input ${i}`,
      onConnect: () => handleConnect(i)
    });
  }

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
          placeholder="Enter system instructions for the model. Use {input_0}, {input_1}, etc. to reference inputs."
          disabled={disabled}
        />
        
        <div className="text-xs text-gray-500 mt-1">
          <p>Reference inputs using <code>{'{input_0}'}</code>, <code>{'{input_1}'}</code>, etc.</p>
          <p>The first input is always used as the user prompt if not referenced in system instruction.</p>
        </div>
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