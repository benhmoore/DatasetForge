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
 * Reads the required handle count from data._visibleHandleCount
 */
const ModelNode = ({ 
  data,
  id,
  disabled = false,
  isConnectable = true
}) => {
  // Destructure config, callback, and the handle count from data
  const { 
    onConfigChange, 
    model = '', 
    model_instruction = '', // Renamed from system_instruction
    model_parameters = { temperature: 0.7, top_p: 1.0, max_tokens: 1000 },
    _visibleHandleCount = 1 // Read count from data, default to 1
  } = data;

  // State for models and loading status
  const [models, setModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  // Hook to notify React Flow about internal changes (like adding/removing handles)
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
  }, []);

  // Effect to update React Flow internals when the handle count prop changes
  useEffect(() => {
    // Call this whenever the number of handles derived from props changes
    console.log(`ModelNode (${id}): data._visibleHandleCount changed to ${_visibleHandleCount}. Updating internals.`);
    updateNodeInternals(id);
  }, [_visibleHandleCount, id, updateNodeInternals]); // Depend on the prop value

  // Handle model selection
  const handleModelChange = (selectedModelName) => {
    if (onConfigChange) {
      console.log(`ModelNode (${id}): handleModelChange -> ${selectedModelName}`);
      onConfigChange(id, { model: selectedModelName });
    }
  };

  // Handle model instruction change
  const handleModelInstructionChange = (e) => {
    if (onConfigChange) {
      console.log(`ModelNode (${id}): handleModelInstructionChange`);
      onConfigChange(id, { model_instruction: e.target.value });
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

  // --- Generate Input Handles --- 
  const inputHandles = [];
  // Create only the visible handles based on the prop value
  // Ensure count is at least 1
  const handleCountToRender = Math.max(1, _visibleHandleCount);
  console.log(`ModelNode (${id}): Rendering ${handleCountToRender} handles.`);
  
  for (let i = 0; i < handleCountToRender; i++) {
    inputHandles.push({
      id: `input_${i}`, // Use the standardized ID format
      type: 'target',
      position: Position.Left,
      label: `Input ${i}`,
      // No onConnect needed here anymore
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
      // Pass the dynamically generated handles based on the prop
      inputHandles={inputHandles} 
    >
      {/* Model selection */}
      <div 
        className="space-y-2" 
        // Stop propagation for clicks/touches within the select area
        onMouseDown={(e) => e.stopPropagation()} 
        onTouchStart={(e) => e.stopPropagation()}
      >
        <label className="block text-sm font-medium text-gray-700">
          Select Model
        </label>
        <div className="nodrag">
          <CustomSelect
            options={modelOptions}
            value={model || ''}
            onChange={handleModelChange}
            placeholder="Select a model..."
            isLoading={isLoadingModels}
            disabled={disabled}
          />
        </div>
      </div>
      
      {/* Model instruction */}
      <div className="mt-4 space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Model Instruction
        </label>
        <textarea
          value={model_instruction}
          onChange={handleModelInstructionChange}
          className="w-full p-2 border rounded text-sm nodrag"
          rows={4}
          placeholder="Enter instructions for the model. Use {input_0}, {input_1}, etc. to reference inputs."
          disabled={disabled}
          // Stop propagation to prevent node drag when clicking/touching textarea
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        />
        
        <div className="text-xs text-gray-500 mt-1">
          <p>Reference inputs using <code>{'{input_0}'}</code>, <code>{'{input_1}'}</code>, etc.</p>
          <p>The first input is always used as the user prompt if not referenced in model instruction.</p>
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