import { useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import Icon from './Icons'; // Assuming you have an Icon component

/**
 * NodeBase component providing common structure for custom nodes.
 * Handles rendering, editable name header, and collapsing.
 * Reads and updates collapsed state from node data.
 * Dynamically renders input/output handles based on props.
 */
const NodeBase = ({ 
  id, 
  data, 
  isConnectable = true, 
  disabled = false, 
  children, // Node-specific content
  nodeType = 'default', // e.g., 'model', 'transform' for styling handles
  iconName = 'box', // Default icon
  // Define input handles as an array of objects { id: string, position: Position, label?: string, style?: object, onConnect?: function }
  inputHandles = [{ id: 'input', position: Position.Left }],
  // Define output handles similarly
  outputHandles = [{ id: 'output', position: Position.Right }]
}) => {
  // Read isCollapsed from data, default to false if not present
  const { name, label, onConfigChange, isCollapsed = false } = data;
  
  // Local state only for editing name
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentName, setCurrentName] = useState(name || label || 'Node');

  // Determine handle colors based on type
  const handleColorClass =  nodeType === 'model' ? '!bg-blue-500' : 
                            nodeType === 'transform' ? '!bg-orange-500' :
                            nodeType === 'input' ? '!bg-green-500' :
                            nodeType === 'output' ? '!bg-purple-500' :
                            nodeType === 'prompt' ? '!bg-yellow-500' :
                            nodeType === 'filter' ? '!bg-red-500' :
                           '!bg-gray-500'; // Default

  // Determine background color based on type
  const backgroundColorClass = nodeType === 'model' ? 'bg-blue-50' : 
                               nodeType === 'transform' ? 'bg-orange-50' :
                               nodeType === 'input' ? 'bg-green-50' :
                               nodeType === 'output' ? 'bg-purple-50' :
                               nodeType === 'prompt' ? 'bg-yellow-50' :
                                nodeType === 'filter' ? 'bg-red-50' :
                               'bg-white'; // Default background

  const toggleCollapse = () => {
    if (!isEditingName && onConfigChange) { // Don't collapse/expand when editing name, ensure callback exists
      console.log(`NodeBase (${id}): toggleCollapse -> ${!isCollapsed}`);
      onConfigChange(id, { isCollapsed: !isCollapsed }); // Update state via callback
    }
  };

  const handleNameChange = (e) => {
    setCurrentName(e.target.value);
  };

  const handleNameBlur = () => {
    setIsEditingName(false);
    const originalName = name || label || 'Node'; // Get original name from props
    if (currentName.trim() && onConfigChange && currentName !== originalName) {
      console.log(`NodeBase (${id}): handleNameBlur -> ${currentName}`);
      onConfigChange(id, { name: currentName }); 
    } else {
      // Reset if name is empty or unchanged
      setCurrentName(originalName);
    }
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleNameBlur(); // Save on Enter
    } else if (e.key === 'Escape') {
      setIsEditingName(false); // Cancel on Escape
      setCurrentName(name || label || 'Node'); // Reset using name from props
    }
  };

  const startEditingName = (e) => {
    e.stopPropagation(); 
    if (!disabled) {
      setCurrentName(name || label || 'Node'); // Ensure current value from props before editing
      setIsEditingName(true);
    }
  };

  // Filter handles to separate visible and invisible ones
  const visibleInputHandles = inputHandles.filter(h => !h.style || h.style.opacity !== 0);
  const invisibleInputHandles = inputHandles.filter(h => h.style && h.style.opacity === 0);
  
  const visibleOutputHandles = outputHandles.filter(h => !h.style || h.style.opacity !== 0);
  const invisibleOutputHandles = outputHandles.filter(h => h.style && h.style.opacity === 0);

  return (
    <div className={`${backgroundColorClass} rounded border border-gray-200 shadow-sm min-w-[250px] ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}>
      {/* Visible Input Handles */}
      {visibleInputHandles.map((handle, index) => (
        <Handle
          key={`visible-input-${handle.id}`}
          type="target"
          position={handle.position}
          id={handle.id}
          isConnectable={isConnectable && !disabled}
          className={`!w-3 !h-3 ${handleColorClass}`}
          // Add vertical offset for multiple handles - space them evenly
          style={{
            ...handle.style,
            top: `${(index + 1) * (100 / (visibleInputHandles.length + 1))}%`
          }}
          title={handle.label || handle.id} // Add tooltip for handle ID/label
          onConnect={handle.onConnect} // Pass the onConnect callback from the handle definition
        />
      ))}
      
      {/* Invisible Input Handles (for compatibility) */}
      {invisibleInputHandles.map((handle, index) => (
        <Handle
          key={`invisible-input-${handle.id}`}
          type="target"
          position={handle.position}
          id={handle.id}
          isConnectable={isConnectable && !disabled}
          style={{
            ...handle.style,
            // Place invisible handles in a non-interfering position
            top: '5px',
            left: '5px',
            width: '1px',
            height: '1px'
          }}
        />
      ))}
      
      {/* Visible Output Handles */}
      {visibleOutputHandles.map((handle, index) => (
        <Handle
          key={`visible-output-${handle.id}`}
          type="source"
          position={handle.position}
          id={handle.id}
          isConnectable={isConnectable && !disabled}
          className={`!w-3 !h-3 ${handleColorClass}`}
          // Add vertical offset for multiple handles - space them evenly
          style={{
            ...handle.style,
            top: `${(index + 1) * (100 / (visibleOutputHandles.length + 1))}%`
          }}
          title={handle.label || handle.id} // Add tooltip for handle ID/label
          onConnect={handle.onConnect} // Pass the onConnect callback from the handle definition
        />
      ))}
      
      {/* Invisible Output Handles (for compatibility) */}
      {invisibleOutputHandles.map((handle, index) => (
        <Handle
          key={`invisible-output-${handle.id}`}
          type="source"
          position={handle.position}
          id={handle.id}
          isConnectable={isConnectable && !disabled}
          style={{
            ...handle.style,
            // Place invisible handles in a non-interfering position
            top: '5px',
            right: '5px',
            width: '1px',
            height: '1px'
          }}
        />
      ))}
      
      {/* Header */}
      <div 
        className={`p-2 flex items-center justify-between border-b border-gray-200 ${!disabled ? 'cursor-pointer hover:bg-gray-100' : ''}`} // Adjusted hover for better contrast on colored backgrounds
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
              {name || label || 'Node'} {/* Display name from props */}
            </span>
          )}
        </div>
        {!disabled && ( // Only show collapse icon if not disabled
          <Icon 
            name={isCollapsed ? 'chevronDown' : 'chevronUp'} // Use isCollapsed from props
            className="w-4 h-4 text-gray-400 ml-2" 
          />
        )}
      </div>
      
      {/* Node-specific Content (collapsible) */}
      {!isCollapsed && ( // Use isCollapsed from props
        <div className="p-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
};

export default NodeBase;
