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
    >
      {/* No specific content needed for Input node, but could add info */}
      <div className="text-xs text-gray-500">
        Represents the starting input for the workflow.
      </div>
    </NodeBase>
  );
};

export default InputNode;
