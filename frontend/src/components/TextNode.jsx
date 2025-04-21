import { useCallback } from 'react';
import { Position } from '@xyflow/react';
import NodeBase from './NodeBase';

/**
 * TextNode component for displaying and editing static text in a workflow.
 * It outputs the text content directly.
 */
const TextNode = ({
  data,
  id,
  disabled = false,
  isConnectable = true
}) => {
  // Destructure config and callback from data
  const {
    onConfigChange,
    text_content = '', // Default to empty string
  } = data;

  // Handler for text area changes
  const handleTextChange = useCallback((event) => {
    if (onConfigChange) {
      // Update the node's data in the parent component's state
      onConfigChange(id, { text_content: event.target.value });
    }
  }, [onConfigChange, id]);

  // Define the output handle
  const outputHandles = [
    {
      id: 'output', // Standard output handle ID
      type: 'source',
      position: Position.Right,
      label: 'Output',
    },
  ];

  return (
    <NodeBase
      id={id}
      data={data}
      isConnectable={isConnectable}
      disabled={disabled}
      nodeType="text" // Set the node type identifier
      iconName="file-text" // Choose an appropriate icon
      // No input handles needed for this node
      inputHandles={[]}
      // Provide the output handle definition
      outputHandles={outputHandles}
    >
      {/* Text area for input */}
      <div className="space-y-2">
        <label htmlFor={`text-input-${id}`} className="block text-sm font-medium text-gray-700">
          Text Content
        </label>
        <textarea
          id={`text-input-${id}`}
          value={text_content}
          onChange={handleTextChange}
          className="w-full p-2 border rounded text-sm nodrag" // Add nodrag to allow text selection/editing
          rows={4}
          placeholder="Enter text here..."
          disabled={disabled}
        />
        <p className="text-xs text-gray-500 mt-1">
          The text entered here will be passed to the next node.
        </p>
      </div>
    </NodeBase>
  );
};

export default TextNode;
