import { useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import Icon from './Icons'; // Assuming you have an Icon component

/**
 * NodeBase component providing common structure for custom nodes.
 * Handles rendering, editable name header, and collapsing.
 */
const NodeBase = ({ 
  id, 
  data, 
  isConnectable = true, 
  disabled = false, 
  children, // Node-specific content
  nodeType = 'default', // e.g., 'model', 'transform' for styling handles
  iconName = 'box' // Default icon
}) => {
  const { name, label, onConfigChange } = data;
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentName, setCurrentName] = useState(name || label || 'Node');

  // Determine handle colors based on type
  const handleColorClass = nodeType === 'model' ? '!bg-blue-500' : 
                           nodeType === 'transform' ? '!bg-orange-500' :
                           nodeType === 'input' ? '!bg-green-500' :
                           nodeType === 'output' ? '!bg-purple-500' :
                           '!bg-gray-500'; // Default

  const toggleCollapse = () => {
    if (!isEditingName) { // Don't collapse/expand when editing name
      setIsCollapsed(!isCollapsed);
    }
  };

  const handleNameChange = (e) => {
    setCurrentName(e.target.value);
  };

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (currentName.trim() && onConfigChange && currentName !== (name || label)) {
      console.log(`NodeBase (${id}): handleNameBlur -> ${currentName}`);
      onConfigChange(id, { name: currentName }); 
      // The WorkflowEditor's handleNodeConfigChange should update the label in the node data
    } else {
      // Reset if name is empty or unchanged
      setCurrentName(name || label || 'Node');
    }
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleNameBlur(); // Save on Enter
    } else if (e.key === 'Escape') {
      setIsEditingName(false); // Cancel on Escape
      setCurrentName(name || label || 'Node'); // Reset
    }
  };

  const startEditingName = (e) => {
    // Prevent collapsing when clicking to edit
    e.stopPropagation(); 
    if (!disabled) {
      setCurrentName(name || label || 'Node'); // Ensure current value before editing
      setIsEditingName(true);
    }
  };

  return (
    <div className={`bg-white rounded border border-gray-200 shadow-sm min-w-[250px] ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}>
      {/* Input handle (always visible) */}
      {nodeType !== 'input' && ( // Don't show input handle for Input nodes
        <Handle 
          type="target" 
          position={Position.Left}
          id="input" 
          isConnectable={isConnectable && !disabled} 
          className={`!w-3 !h-3 ${handleColorClass}`}
        />
      )}
      
      {/* Output handle (always visible) */}
      {nodeType !== 'output' && ( // Don't show output handle for Output nodes
        <Handle 
          type="source" 
          position={Position.Right}
          id="output" 
          isConnectable={isConnectable && !disabled} 
          className={`!w-3 !h-3 ${handleColorClass}`}
        />
      )}
      
      {/* Header */}
      <div 
        className={`p-2 flex items-center justify-between border-b border-gray-200 ${!disabled ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        onClick={toggleCollapse}
      >
        <div className="flex items-center space-x-2 flex-grow min-w-0">
          <Icon name={iconName} className={`w-4 h-4 ${handleColorClass.replace('!bg-', 'text-')}`} />
          {isEditingName ? (
            <input
              type="text"
              value={currentName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              className="px-1 py-0 border border-blue-300 rounded text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none flex-grow min-w-0"
              autoFocus
              onClick={(e) => e.stopPropagation()} // Prevent collapse when clicking input
              disabled={disabled}
            />
          ) : (
            <span 
              className="font-medium text-sm truncate" 
              onClick={startEditingName}
              title={`Click to edit name: ${name || label || 'Node'}`} // Tooltip
            >
              {name || label || 'Node'}
            </span>
          )}
        </div>
        {!disabled && ( // Only show collapse icon if not disabled
          <Icon 
            name={isCollapsed ? 'chevron-down' : 'chevron-up'} 
            className="w-4 h-4 text-gray-400 ml-2" 
          />
        )}
      </div>
      
      {/* Node-specific Content (collapsible) */}
      {!isCollapsed && (
        <div className="p-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
};

export default NodeBase;
