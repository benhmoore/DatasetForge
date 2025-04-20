import NodeBase from './NodeBase';
import Icon from './Icons'; // Assuming Icon component is available

/**
 * InputNode component for representing the workflow input.
 * Uses NodeBase for structure and header.
 */
const InputNode = ({ 
  id, 
  data, 
  isConnectable = true, 
  disabled = false 
}) => {
  return (
    <NodeBase 
      id={id} 
      data={data} 
      isConnectable={isConnectable} 
      disabled={disabled} 
      nodeType="input" // Specify type for styling and handle logic
      iconName="arrow-right-circle" // Specify icon
      inputHandles={[]} // No input handles for the Input node
      // Output handles will use the default from NodeBase
    >
      {/* No specific content needed for Input node, but could add info */}
      <div className="text-xs text-gray-500">
        Represents the starting input for the workflow.
      </div>
      <div className="space-y-2">
        <textarea
          value={data.text || ''}
          onChange={(e) => data.onConfigChange && data.onConfigChange(id, { text: e.target.value })}
          className="w-full p-2 border rounded text-sm nodrag"
          rows={4}
          placeholder="Enter input text here..."
          disabled={disabled}
        />
      </div>
    </NodeBase>
  );
};

export default InputNode;
