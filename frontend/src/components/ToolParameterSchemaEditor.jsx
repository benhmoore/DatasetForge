import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import Icon from './Icons'; 
import CustomSelect from './CustomSelect'; // Import CustomSelect
import CustomTextInput from './CustomTextInput'; // Import CustomTextInput
import _ from 'lodash'; // Import lodash for deep comparison

// Initial empty schema structure with memo to prevent recreation
const initialSchema = Object.freeze({
  type: 'object',
  properties: {},
  required: [],
});

// Parameter type options with better labeling
const PARAMETER_TYPES = [
  { value: 'string', label: 'String (text)' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean (true/false)' },
  { value: 'array', label: 'Array (list)' },
  { value: 'object', label: 'Object' },
];

// Create a unique ID for properties
const createPropertyId = () => `prop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// Component to edit a single parameter property - extracted as pure component
const ParameterPropertyEditor = React.memo(({ property, onChange, onRemove, disabled, index }) => {
  // Memoize handlers to prevent unnecessary renders
  const handleNameChange = useCallback((e) => {
    const validName = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
    onChange({ ...property, name: validName });
  }, [property, onChange]);

  const handleTypeChange = useCallback((selectedValue) => { // Changed to accept value directly
    onChange({ ...property, type: selectedValue });
  }, [property, onChange]);

  const handleDescriptionChange = useCallback((e) => {
    onChange({ ...property, description: e.target.value });
  }, [property, onChange]);

  const handleRequiredChange = useCallback((e) => {
    onChange({ ...property, isRequired: e.target.checked });
  }, [property, onChange]);

  // Accessibility enhancements with unique IDs based on property ID
  const nameId = `param-name-${property.id}`;
  const typeId = `param-type-${property.id}`;
  const descId = `param-desc-${property.id}`;
  const requiredId = `param-required-${property.id}`;

  return (
    <div 
      className={`p-4 border ${!property.name ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'} 
                 rounded-md space-y-3 relative mb-3 transition-colors duration-200 
                 hover:border-primary-200 focus-within:border-primary-300 focus-within:ring-1 focus-within:ring-primary-300`}
      aria-label={`Parameter ${index + 1}${property.name ? `: ${property.name}` : ''}`}
    >
      <button
        onClick={onRemove}
        disabled={disabled}
        className="absolute top-1 right-2 text-gray-400 hover:text-red-600 p-1.5 rounded-full hover:bg-gray-200 transition-colors duration-150"
        title="Remove Parameter"
        aria-label={`Remove parameter ${property.name || index + 1}`}
      >
        <Icon name="trash" className="h-4 w-4" />
      </button>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <CustomTextInput
            id={nameId}
            label={<>Name <span className="text-red-500">*</span></>}
            mode="single"
            placeholder="parameter_name"
            value={property.name || ''}
            onChange={handleNameChange}
            required
            disabled={disabled}
            error={!property.name ? "Parameter name is required" : null}
            className="text-sm h-10"
            showAiActionButton={false}
          />
        </div>
        
        <div>
          <label htmlFor={typeId} className="block text-xs font-medium text-gray-700 mb-1">
            Type
          </label>
          {/* Replace select with CustomSelect */}
          <CustomSelect
            id={typeId} // Pass id for label association
            options={PARAMETER_TYPES}
            value={property.type || 'string'}
            onChange={handleTypeChange} // Pass the updated handler
            disabled={disabled}
            placeholder="Select type"
            className="h-10"
          />
        </div>
      </div>
      
      <div>
        <CustomTextInput
          id={descId}
          label="Description"
          mode="multi"
          placeholder="Describe what this parameter is used for"
          value={property.description || ''}
          onChange={handleDescriptionChange}
          rows={2}
          className="text-sm resize-y"
          disabled={disabled}
          aiContext="You are helping document a tool parameter for an API. This description will help users understand what the parameter is for and how to use it properly."
          systemPrompt="Write a clear, concise description for this parameter. Explain its purpose, any valid values, and when it should be used."
        />
      </div>
      
      <div className="flex items-center">
        <input
          id={requiredId}
          type="checkbox"
          checked={property.isRequired || false}
          onChange={handleRequiredChange}
          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 transition-colors duration-150"
          disabled={disabled}
        />
        <label htmlFor={requiredId} className="ml-2 block text-sm text-gray-700 select-none">
          Required parameter
        </label>
      </div>
    </div>
  );
});

ParameterPropertyEditor.propTypes = {
  property: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    type: PropTypes.string,
    description: PropTypes.string,
    isRequired: PropTypes.bool,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  index: PropTypes.number.isRequired,
};

ParameterPropertyEditor.displayName = 'ParameterPropertyEditor';

// Main component for the schema editor
const ToolParameterSchemaEditor = ({ value = initialSchema, onChange, disabled = false }) => {
  const [properties, setProperties] = useState([]);
  const [hasFocus, setHasFocus] = useState(false);
  // Initialize ref to null. It will be populated on first sync or emission.
  const lastEmittedSchemaRef = useRef(null);
  const containerRef = useRef(null);

  // Helper function to derive and normalize schema from properties state - memoized
  const deriveAndNormalizeSchema = useCallback((props) => {
    const schema = { type: 'object', properties: {}, required: [] };
    
    props.forEach(prop => {
      if (prop.name) {
        schema.properties[prop.name] = { 
          type: prop.type || 'string',
          description: prop.description || '' 
        };
        
        if (prop.isRequired) {
          schema.required.push(prop.name);
        }
      }
    });
    
    // Sort properties and required array for consistent comparison
    const sortedProperties = {};
    Object.keys(schema.properties).sort().forEach(key => {
      sortedProperties[key] = schema.properties[key];
    });
    
    schema.properties = sortedProperties;
    schema.required.sort();
    
    return schema;
  }, []);

  // Helper function to normalize an incoming schema value - memoized
  const normalizeSchemaValue = useCallback((schemaValue) => {
    const normalized = { 
      type: 'object',
      properties: {},
      required: [],
      ...(schemaValue || {})
    };
    
    const sortedProperties = {};
    Object.keys(normalized.properties || {}).sort().forEach(key => {
      sortedProperties[key] = normalized.properties[key];
    });
    
    normalized.properties = sortedProperties;
    normalized.required = [...(normalized.required || [])].sort();
    
    return normalized;
  }, []);

  // Convert schema to properties array
  const schemaToProperties = useCallback((schema) => {
    const normalizedSchema = normalizeSchemaValue(schema);
    
    return Object.entries(normalizedSchema.properties || {}).map(([name, prop], index) => ({
      id: `prop-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`,
      name,
      type: prop.type || 'string',
      description: prop.description || '',
      isRequired: !!(normalizedSchema.required && normalizedSchema.required.includes(name)),
    }));
  }, [normalizeSchemaValue]);

  // Effect 1: Sync internal 'properties' state ONLY from external 'value' prop changes
  useEffect(() => {
    const normalizedIncomingValue = normalizeSchemaValue(value);

    // Only update internal state if the incoming value prop is different from the last value
    // this component knew about (either initially or what it last emitted/received).
    // _.isEqual handles comparison with null correctly.
    if (!_.isEqual(normalizedIncomingValue, lastEmittedSchemaRef.current)) {
      const newProperties = schemaToProperties(normalizedIncomingValue);
      setProperties(newProperties);
      // Update the ref to acknowledge this new external value has been processed.
      lastEmittedSchemaRef.current = normalizedIncomingValue;
    }
  }, [value, normalizeSchemaValue, schemaToProperties]);

  // Effect 2: Call 'onChange' prop when 'properties' state changes internally
  useEffect(() => {
    // Don't emit if disabled
    if (disabled) return;

    const newSchema = deriveAndNormalizeSchema(properties);
    const isValid = properties.every(prop => !!prop.name); // Basic validation

    // Only emit if:
    // 1. The new schema derived from internal state is valid.
    // 2. It's different from the last schema this component processed (lastEmittedSchemaRef).
    // This prevents emitting the same value received from the parent immediately back,
    // and also prevents emitting invalid schemas.
    // _.isEqual handles comparison with null correctly.
    if (isValid && !_.isEqual(newSchema, lastEmittedSchemaRef.current)) {
      onChange(newSchema);
      lastEmittedSchemaRef.current = newSchema; // Update ref after emitting internal change
    }
  }, [properties, onChange, disabled, deriveAndNormalizeSchema]);

  // Add new property handler
  const handleAddProperty = useCallback(() => {
    setProperties(currentProperties => [
      ...currentProperties,
      { 
        id: createPropertyId(),
        name: '',
        type: 'string',
        description: '',
        isRequired: false 
      }
    ]);
    
    // Focus on the new property after it's added
    setTimeout(() => {
      if (containerRef.current) {
        const lastProperty = containerRef.current.querySelector('.parameter-editor:last-child input[id^="param-name"]');
        if (lastProperty) {
          lastProperty.focus();
        }
      }
    }, 50);
  }, []);

  // Handle property change
  const handlePropertyChange = useCallback((index, updatedProperty) => {
    setProperties(currentProperties => {
      if (index < 0 || index >= currentProperties.length) {
        console.warn(`Invalid property index: ${index}`);
        return currentProperties;
      }
      
      const newProperties = [...currentProperties];
      newProperties[index] = { 
        ...updatedProperty,
        id: currentProperties[index].id // Preserve the original ID
      };
      
      return newProperties;
    });
  }, []);

  // Handle property removal
  const handleRemoveProperty = useCallback((index) => {
    setProperties(currentProperties => 
      currentProperties.filter((_, i) => i !== index)
    );
  }, []);

  // Memoize property handlers to prevent unnecessary rerenders
  const propertyChangeHandlers = useMemo(() => 
    properties.map((_, index) => 
      (updatedProp) => handlePropertyChange(index, updatedProp)
    ),
    [properties, handlePropertyChange]
  );

  const propertyRemoveHandlers = useMemo(() => 
    properties.map((_, index) => 
      () => handleRemoveProperty(index)
    ),
    [properties, handleRemoveProperty]
  );

  // Count how many parameters have errors
  const errorCount = useMemo(() => 
    properties.filter(p => !p.name).length,
    [properties]
  );

  // Handle container focus for better keyboard navigation
  const handleContainerFocus = useCallback(() => {
    setHasFocus(true);
  }, []);

  const handleContainerBlur = useCallback((e) => {
    // Only blur if focus is leaving the container
    if (!containerRef.current?.contains(e.relatedTarget)) {
      setHasFocus(false);
    }
  }, []);

  return (
    <div 
      className={`space-y-4 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      ref={containerRef}
      onFocus={handleContainerFocus}
      onBlur={handleContainerBlur}
      tabIndex="-1" // Makes the div focusable for focus tracking but not tabbing
    >
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-700">
          Parameters ({properties.length})
        </h3>
        
        {errorCount > 0 && (
          <div className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-md">
            {errorCount} {errorCount === 1 ? 'error' : 'errors'} to fix
          </div>
        )}
      </div>
      
      <div className="space-y-2" aria-live="polite">
        {properties.length === 0 && (
          <div className="text-sm mb-2 text-gray-500 italic p-4 border border-dashed border-gray-300 rounded-md bg-gray-50 text-center">
            No parameters defined yet. Add parameters to customize your tool's inputs.
          </div>
        )}
        
        {properties.map((prop, index) => (
          <div key={prop.id} className="parameter-editor">
            <ParameterPropertyEditor
              property={prop}
              onChange={propertyChangeHandlers[index]}
              onRemove={propertyRemoveHandlers[index]}
              disabled={disabled}
              index={index}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={handleAddProperty}
          className="text-primary-700 hover:underline text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          disabled={disabled}
          aria-label="Add new parameter"
        >
          <Icon name="plus" className="h-4 w-4 inline-block mr-1" />
          Add New Parameter
        </button>
      </div>
      
      {properties.length > 0 && (
        <div className="text-xs text-gray-500">
          {properties.length} {properties.length === 1 ? 'parameter' : 'parameters'} defined
        </div>
      )}
      
      {errorCount > 0 && (
        <div className="text-xs bg-red-50 border border-red-200 text-red-700 p-2 rounded-md">
          All parameters must have a name. Please fix highlighted fields before saving.
        </div>
      )}
    </div>
  );
};

ToolParameterSchemaEditor.propTypes = {
  value: PropTypes.shape({
    type: PropTypes.string,
    properties: PropTypes.object,
    required: PropTypes.arrayOf(PropTypes.string),
  }),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default ToolParameterSchemaEditor;