import { useState, useEffect, useCallback, useMemo } from 'react';
import { Position, useUpdateNodeInternals } from '@xyflow/react';
import NodeBase from './NodeBase';
import CustomTextInput from './CustomTextInput';

/**
 * Extract slot names from prompt text
 * Matches patterns like {slotName}
 */
const extractSlots = (promptText) => {
  if (!promptText) return [];
  
  // Match patterns like {slotName}
  const slotRegex = /{([^{}]+)}/g;
  const matches = [...(promptText.matchAll(slotRegex) || [])];
  
  // Extract slot names and remove duplicates
  const slots = [...new Set(matches.map(match => match[1]))];
  
  return slots;
};

/**
 * PromptNode component for defining prompt templates with variable slots
 * Creates input handles for each variable slot found in the prompt text
 */
const PromptNode = ({ 
  data,
  id,
  disabled = false,
  isConnectable = true
}) => {
  // Destructure config, callback from data
  const { 
    onConfigChange, 
    prompt_text = '', 
    name = 'Prompt'
  } = data;

  // Hook to notify React Flow about internal changes (like adding/removing handles)
  const updateNodeInternals = useUpdateNodeInternals();

  // Extract slots from the prompt text (memoized to prevent re-renders)
  const slots = useMemo(() => 
    extractSlots(prompt_text),
    [prompt_text]
  );
  
  // Store previous slots to compare
  const [prevSlots, setPrevSlots] = useState([]);

  // Effect to update React Flow internals ONLY when slots actually change
  useEffect(() => {
    // Check if slots array has actually changed
    const slotsChanged = 
      prevSlots.length !== slots.length || 
      slots.some((slot, index) => slot !== prevSlots[index]);
    
    if (slotsChanged) {
      console.log(`PromptNode (${id}): Slots changed to [${slots.join(', ')}]. Updating internals.`);
      updateNodeInternals(id);
      setPrevSlots(slots);
    }
  }, [slots, id, updateNodeInternals, prevSlots]);

  // Handle prompt text change
  const handlePromptTextChange = (e) => {
    if (onConfigChange) {
      console.log(`PromptNode (${id}): handlePromptTextChange`);
      onConfigChange(id, { prompt_text: e.target.value });
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
    
    console.log(`PromptNode (${id}): Rendering ${handles.length} handles: [${handles.map(h => h.label).join(', ')}]`);
    return handles;
  }, [slots, id]);

  // Add a single output handle
  const outputHandles = useMemo(() => {
    return [{
      id: 'output',
      type: 'source',
      position: Position.Right,
      label: 'Prompt',
    }];
  }, []);

  return (
    <NodeBase 
      id={id} 
      data={data} 
      isConnectable={isConnectable} 
      disabled={disabled} 
      nodeType="prompt"
      iconName="chat"
      inputHandles={inputHandles}
      outputHandles={outputHandles}
    >
      {/* Prompt text editor */}
      <div className="space-y-2">
        <CustomTextInput
          label="Prompt Template"
          value={prompt_text}
          onChange={handlePromptTextChange}
          mode="multi"
          rows={6}
          placeholder="Enter your prompt template here. Use {slot_name} syntax to create placeholders for dynamic content."
          disabled={disabled}
          aiContext="You are helping to write a prompt template for an AI system. This template may include variables in {curly_braces} that will be filled in dynamically."
          systemPrompt="Improve this prompt template to be more effective while maintaining all the existing slot variables such as {variable_name}. DO NOT change or remove any variables inside curly braces. DO NOT add new variables."
          helpText={
            <>
              <p>Use <code>{'{slot_name}'}</code> syntax to create labeled input slots.</p>
              <p>Example: "Process this story by {'{author}'}: {'{story}'}" creates 'author' and 'story' inputs.</p>
            </>
          }
        />
      </div>

      {/* Display detected slots for convenience */}
      {slots.length > 0 && (
        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Detected Input Slots:
          </label>
          <div className="flex flex-wrap gap-1">
            {slots.map(slot => (
              <span key={slot} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                {slot}
              </span>
            ))}
          </div>
        </div>
      )}
    </NodeBase>
  );
};

export default PromptNode;