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
    console.log("workflowTransform: apiToReactFlow - No input data, returning empty result");
    return { nodes: [], edges: [] };
  }
  
  // Normalize the data structure - handle both direct nodes and data.nodes formats
  let normalizedData = { ...apiData };
  
  // Check if nodes are stored inside a 'data' property (the API format)
  if (apiData.data && apiData.data.nodes && !apiData.nodes) {
    console.log("workflowTransform: Found nodes in data.nodes - normalizing structure");
    normalizedData.nodes = apiData.data.nodes;
    normalizedData.connections = apiData.data.connections || [];
  }
  
  console.log("workflowTransform: apiToReactFlow normalized input data:", {
    hasNodes: !!normalizedData.nodes,
    nodesType: typeof normalizedData.nodes,
    nodeCount: normalizedData.nodes ? Object.keys(normalizedData.nodes).length : 0,
    hasConnections: !!normalizedData.connections,
    connectionsType: typeof normalizedData.connections,
    connectionsCount: normalizedData.connections?.length || 0,
    firstNodeId: normalizedData.nodes ? Object.keys(normalizedData.nodes)[0] : null,
    isUsingDataProperty: normalizedData.nodes !== apiData.nodes
  });

  // Deep debug the first node if exists
  if (normalizedData.nodes && Object.keys(normalizedData.nodes).length > 0) {
    const firstNodeId = Object.keys(normalizedData.nodes)[0];
    const firstNode = normalizedData.nodes[firstNodeId];
    console.log("workflowTransform: First node data:", {
      id: firstNodeId,
      type: firstNode.type,
      name: firstNode.name,
      hasPosition: !!firstNode.position,
      position: firstNode.position,
      otherKeys: Object.keys(firstNode).filter(k => !['id', 'type', 'name', 'position'].includes(k))
    });
  }

  const rfNodes = Object.entries(normalizedData?.nodes || {}).map(([id, nodeConfig]) => {
    // Get the appropriate React Flow component type based on the node's internal type
    const nodeType = nodeConfig.type || 'model';
    const nodeComponentType = nodeComponentMap[nodeType] || 'modelNode'; // Default fallback
    
    // Use the configured position or provide a default
    const position = nodeConfig.position || { x: 100, y: 100 };
    
    // Set the label to the node's name or a default based on type
    const label = nodeConfig.name || nodeConfig.type || 'Node';
    
    console.log(`workflowTransform: Creating React Flow node for ${id}:`, {
      originalType: nodeType,
      mappedType: nodeComponentType,
      position,
      label
    });
    
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

  const rfEdges = (normalizedData?.connections || []).map((conn, index) => {
    console.log(`workflowTransform: Creating React Flow edge ${index}:`, conn);
    
    return {
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
    };
  });

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
  console.log("workflowTransform: reactFlowToApi input:", {
    nodesCount: nodes.length,
    edgesCount: edges.length,
    hasNodeComponentMap: !!nodeComponentMap
  });

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
    
    console.log(`workflowTransform: Converting node ${node.id} to API format:`, {
      reactFlowType: node.type,
      internalType: internalType,
      label: label,
      position: node.position
    });
    
    apiNodes[node.id] = {
      ...configData,
      type: internalType, // Ensure type is set
      name: label || configData.name || node.id, // Prioritize label, fallback to existing name or ID
      position: node.position // Store node position
    };
  });

  // Convert edges array to connections array
  const apiConnections = edges.map(edge => {
    console.log(`workflowTransform: Converting edge to API format:`, {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle
    });
    
    return {
      source_node_id: edge.source,
      source_handle: edge.sourceHandle || null,
      target_node_id: edge.target,
      target_handle: edge.targetHandle || null
    };
  });

  const result = { nodes: apiNodes, connections: apiConnections };
  console.log("workflowTransform: API result structure:", {
    nodeCount: Object.keys(result.nodes).length,
    connectionCount: result.connections.length,
    firstNodeId: Object.keys(result.nodes)[0] || null
  });

  return result;
};