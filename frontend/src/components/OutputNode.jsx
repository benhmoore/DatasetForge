import NodeBase from './NodeBase';
import Icon from './Icons'; // Assuming Icon component is available

/**
 * OutputNode component for representing the workflow output.
 * Uses NodeBase for structure and header.
 */
const OutputNode = ({ 
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
      nodeType="output" // Specify type for styling and handle logic
      iconName="arrow-left-circle" // Specify icon
    >
      {/* No specific content needed for Output node, but could add info */}
      <div className="text-xs text-gray-500">
        Represents the final output of the workflow.
      </div>
    </NodeBase>
  );
};

export default OutputNode;
