/**
 * Utility functions for transforming workflow data between
 * React Flow format (nodes array, edges array) and
 * API/Backend format (nodes object map, connections array)
 */

/**
 * Converts workflow data from API format to React Flow format
 * 
 * @param {Object} apiData - The workflow data in API format { nodes: {}, connections: [] }
 * @param {Object} nodeComponentMap - Mapping of internal node types to React Flow component types
 * @param {Function} handleNodeConfigChange - Callback function for node config changes
 * @returns {Object} - React Flow compatible data { nodes: [], edges: [] }
 */
export const apiToReactFlow = (apiData, nodeComponentMap, handleNodeConfigChange) => {
  if (!apiData) {
    return { nodes: [], edges: [] };
  }

  const rfNodes = Object.entries(apiData?.nodes || {}).map(([id, nodeConfig]) => {
    // Get the appropriate React Flow component type based on the node's internal type
    const nodeComponentType = nodeComponentMap[nodeConfig.type] || 'modelNode'; // Default fallback
    
    // Use the configured position or provide a default
    const position = nodeConfig.position || { x: 100, y: 100 };
    
    // Set the label to the node's name or a default based on type
    const label = nodeConfig.name || nodeConfig.type || 'Node';
    
    return {
      id,
      type: nodeComponentType,
      position,
      data: {
        ...nodeConfig, // Include all original config data
        label,
        onConfigChange: handleNodeConfigChange // Add the config change callback
      }
    };
  });

  const rfEdges = (apiData?.connections || []).map((conn, index) => ({
    id: `edge-${conn.source_node_id}-${conn.source_handle || 'default'}-${conn.target_node_id}-${conn.target_handle || 'default'}`,
    source: conn.source_node_id,
    target: conn.target_node_id,
    sourceHandle: conn.source_handle || null,
    targetHandle: conn.target_handle || null,
    type: 'smoothstep', // Default edge type
    animated: true,
    style: { stroke: '#3b82f6' },
    markerEnd: {
      type: 'arrowclosed',
      width: 15,
      height: 15,
      color: '#3b82f6'
    }
  }));

  return { nodes: rfNodes, edges: rfEdges };
};

/**
 * Converts workflow data from React Flow format to API format
 * 
 * @param {Array} nodes - Array of React Flow nodes
 * @param {Array} edges - Array of React Flow edges
 * @param {Object} nodeComponentMap - Optional inverse mapping of React Flow component types to internal types
 * @returns {Object} - API compatible data { nodes: {}, connections: [] }
 */
export const reactFlowToApi = (nodes, edges, nodeComponentMap = null) => {
  // Create inverse mapping if not provided
  const inverseTypeMap = nodeComponentMap ? 
    Object.entries(nodeComponentMap).reduce((acc, [internalType, rfType]) => {
      acc[rfType] = internalType;
      return acc;
    }, {}) : null;

  // Convert nodes array to nodes object map
  const apiNodes = {};
  nodes.forEach(node => {
    // Extract the config data excluding React Flow specific properties
    const { label, onConfigChange, ...configData } = node.data;
    
    // Determine the internal node type based on the React Flow component type
    let internalType = configData.type; // Use existing type if available
    if (!internalType && inverseTypeMap) {
      internalType = inverseTypeMap[node.type] || 'model'; // Default to 'model' if not found
    }
    
    apiNodes[node.id] = {
      ...configData,
      type: internalType, // Ensure type is set
      name: label || configData.name || node.id, // Prioritize label, fallback to existing name or ID
      position: node.position // Store node position
    };
  });

  // Convert edges array to connections array
  const apiConnections = edges.map(edge => ({
    source_node_id: edge.source,
    source_handle: edge.sourceHandle || null,
    target_node_id: edge.target,
    target_handle: edge.targetHandle || null
  }));

  return { nodes: apiNodes, connections: apiConnections };
};