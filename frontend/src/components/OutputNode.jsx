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
      // Input handles will use the default from NodeBase
      outputHandles={[]} // No output handles for the Output node
    >
      {/* No specific content needed for Output node, but could add info */}
      <div className="text-xs text-gray-500">
        Represents the final output of the workflow.
      </div>
      <div className="space-y-2">
        <textarea
          value={data.output_text || ''} // Display output text
          readOnly // Make it read-only
          className="w-full p-2 border rounded text-sm bg-gray-100 nodrag" // Style as read-only
          rows={4}
          placeholder="Output will appear here..."
          disabled={disabled}
        />
      </div>
    </NodeBase>
  );
};

export default OutputNode;
