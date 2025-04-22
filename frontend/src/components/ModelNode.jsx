import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { Position, useUpdateNodeInternals } from '@xyflow/react';
import CustomSelect from './CustomSelect';
import CustomSlider from './CustomSlider';
import api from '../api/apiClient';
import NodeBase from './NodeBase';

/**
 * Extract slot names from instruction text
 * Matches patterns like {slotName}
 */
const extractSlots = (instructionText) => {
  if (!instructionText) return [];
  
  // Match patterns like {slotName}
  const slotRegex = /{([^{}]+)}/g;
  const matches = [...(instructionText.matchAll(slotRegex) || [])];
  
  // Extract slot names and remove duplicates
  const slots = [...new Set(matches.map(match => match[1]))];
  
  return slots;
};

/**
 * ModelNode component for configuring a model node in a workflow
 * Dynamically creates input handles based on slots in the model instruction
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
    model_instruction = '', 
    model_parameters = { temperature: 0.7, top_p: 1.0, max_tokens: 1000 }
  } = data;

  // State for models and loading status
  const [models, setModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  // Hook to notify React Flow about internal changes (like adding/removing handles)
  const updateNodeInternals = useUpdateNodeInternals();

  // Extract slots from the model instruction (memoized to prevent re-renders)
  const slots = useMemo(() => 
    extractSlots(model_instruction),
    [model_instruction]
  );
  
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

  // Store previous slots to compare
  const [prevSlots, setPrevSlots] = useState([]);

  // Effect to update React Flow internals ONLY when slots actually change
  useEffect(() => {
    // Check if slots array has actually changed
    const slotsChanged = 
      prevSlots.length !== slots.length || 
      slots.some((slot, index) => slot !== prevSlots[index]);
    
    if (slotsChanged) {
      console.log(`ModelNode (${id}): Slots changed to [${slots.join(', ')}]. Updating internals.`);
      updateNodeInternals(id);
      setPrevSlots(slots);
    }
  }, [slots, id, updateNodeInternals, prevSlots]);

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
  // Memoize the input handles to prevent unnecessary re-renders
  const inputHandles = useMemo(() => {
    const handles = [];
    
    // Add slot-based handles - always use the slot name directly in the ID
    if (slots.length > 0) {
      slots.forEach(slot => {
        handles.push({
          id: `input_${slot}`,  // Use the slot name directly in the ID
          type: 'target',
          position: Position.Left,
          label: slot,
          slotName: slot, // Store slot name for clarity
        });
      });
    } else {
      // Ensure there's at least one default input if no slots
      handles.push({
        id: `input_default`,
        type: 'target',
        position: Position.Left,
        label: 'Input',
      });
    }
    
    console.log(`ModelNode (${id}): Rendering ${handles.length} handles: [${handles.map(h => h.label).join(', ')}]`);
    return handles;
  }, [slots, id]);

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
      
      {/* Model instruction */}
      <div className="mt-4 space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Model Instruction
        </label>
        <textarea
          value={model_instruction}
          onChange={handleModelInstructionChange}
          className="w-full p-2 border rounded text-sm"
          rows={4}
          placeholder="Enter instructions for the model. Use {slot_name} to create input slots."
          disabled={disabled}
        />
        
        <div className="text-xs text-gray-500 mt-1">
          <p>Use <code>{'{slot_name}'}</code> syntax to create labeled input slots.</p>
          <p>Example: "Process this story by {'{author}'}: {'{story}'}" creates 'author' and 'story' inputs.</p>
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