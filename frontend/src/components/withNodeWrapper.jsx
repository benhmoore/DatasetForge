import React, { useState, useEffect, useRef } from 'react';
import isEqual from 'lodash/isEqual';

/**
 * Higher-Order Component that handles common node logic
 * - Manages syncing between nodeConfig props and local state
 * - Prevents infinite update loops
 * - Handles user updates vs. prop updates 
 */
const withNodeWrapper = (WrappedComponent, getDefaultConfig = () => ({})) => {
  return function WithNodeWrapper(props) {
    const { nodeConfig = {}, onConfigChange = () => {}, ...restProps } = props;
    
    // Create local state from the initial nodeConfig
    const [localConfig, setLocalConfig] = useState(() => {
      return { ...getDefaultConfig(), ...nodeConfig };
    });
    
    // Refs to track update source
    const isSyncingFromProps = useRef(false);
    const wasInitialized = useRef(false);
    const prevNodeConfigRef = useRef(nodeConfig);
    
    // Initial setup - only runs once
    useEffect(() => {
      wasInitialized.current = true;
    }, []);
    
    // Sync from props when nodeConfig changes (for JSON editor updates)
    useEffect(() => {
      // Skip during initial render since we already initialized from props
      if (!wasInitialized.current) return;
      
      // Skip if nothing has actually changed (deep comparison)
      if (isEqual(nodeConfig, prevNodeConfigRef.current)) return;
      
      // For debugging only
      console.log('Node receiving new props:', nodeConfig);
      
      // Update the ref to current nodeConfig
      prevNodeConfigRef.current = nodeConfig;
      
      // Mark that we're updating from props, not user input
      isSyncingFromProps.current = true;
      
      // Update local state from props - start with defaults, then apply incoming config
      const defaults = getDefaultConfig();
      setLocalConfig(prev => {
        // Ensure we maintain structure of nested objects like model_parameters
        // by doing a deep merge from defaults to nodeConfig
        const result = { ...defaults };
        
        // Merge each top-level property individually to handle nested objects correctly
        Object.keys({ ...defaults, ...nodeConfig }).forEach(key => {
          if (typeof defaults[key] === 'object' && defaults[key] !== null &&
              typeof nodeConfig[key] === 'object' && nodeConfig[key] !== null) {
            // For objects, merge them
            result[key] = { ...defaults[key], ...nodeConfig[key] };
          } else if (key in nodeConfig) {
            // For primitives or if only in nodeConfig, use nodeConfig value
            result[key] = nodeConfig[key];
          }
          // If only in defaults, it's already in result
        });
        
        console.log('Updated local config:', result);
        return result;
      });
      
      // Reset the flag after update
      const timerId = setTimeout(() => {
        isSyncingFromProps.current = false;
      }, 0);
      
      return () => clearTimeout(timerId);
    }, [nodeConfig, getDefaultConfig]);
    
    // Function to update both local state and parent
    const updateConfig = (updates) => {
      console.log('withNodeWrapper: updateConfig called with:', updates);
      
      // If we're currently syncing from props, don't trigger updates back to parent
      if (isSyncingFromProps.current) {
        console.log('withNodeWrapper: skipping parent update (syncing from props)');
        return setLocalConfig(prev => ({ ...prev, ...updates }));
      }
      
      // Update local state first
      setLocalConfig(prev => {
        console.log('withNodeWrapper: previous localConfig:', prev);
        
        // Create a new config by merging existing local config with updates
        let newConfig;
        
        // Special handling for nested object updates
        if (updates && typeof updates === 'object') {
          newConfig = { ...prev };
          
          // Process each update property
          Object.entries(updates).forEach(([key, value]) => {
            if (value && typeof value === 'object' && !Array.isArray(value) && 
                prev[key] && typeof prev[key] === 'object') {
              // For objects, merge them
              newConfig[key] = { ...prev[key], ...value };
            } else {
              // For primitives, arrays, or new properties
              newConfig[key] = value;
            }
          });
        } else {
          newConfig = { ...prev, ...updates };
        }
        
        console.log('withNodeWrapper: new localConfig will be:', newConfig);
        
        // IMPORTANT: Create a complete config to send to parent, including ALL properties
        const completeConfig = { 
          ...nodeConfig,  // Base properties from parent
          ...newConfig    // Updated properties
        };
        
        // Ensure name and other critical fields are preserved
        if (nodeConfig.name && !completeConfig.name) {
          completeConfig.name = nodeConfig.name;
        }
        
        console.log('withNodeWrapper: sending to parent:', completeConfig);
        
        // Notify parent of changes immediately (important!)
        if (onConfigChange) {
          onConfigChange(completeConfig);
        }
        
        return newConfig;
      });
    };
    
    // Pass both the original props and our enhanced props to the wrapped component
    return (
      <WrappedComponent
        {...restProps}
        nodeConfig={nodeConfig}
        localConfig={localConfig}
        updateConfig={updateConfig}
      />
    );
  };
};

export default withNodeWrapper;