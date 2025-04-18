import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import Icon from './Icons'; // Assuming Icon component is available

// Initial empty schema structure
const initialSchema = {
  type: 'object',
  properties: {},
  required: [],
};

// Component to edit a single parameter property
const ParameterPropertyEditor = ({ property, onChange, onRemove }) => {
  // No internal state needed - component is fully controlled by the 'property' prop

  const handleNameChange = (e) => {
    const validName = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
    onChange({ ...property, name: validName });
  };

  const handleTypeChange = (e) => {
    onChange({ ...property, type: e.target.value });
  };

  const handleDescriptionChange = (e) => {
    onChange({ ...property, description: e.target.value });
  };

  const handleRequiredChange = (e) => {
    onChange({ ...property, isRequired: e.target.checked });
  };

  return (
    <div className="p-3 border border-gray-200 rounded-md bg-gray-50 space-y-2 relative mb-2">
       <button
          onClick={onRemove}
          className="absolute top-1 right-1 text-red-400 hover:text-red-600 p-1"
          title="Remove Parameter"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <input
            type="text"
            placeholder="parameter_name"
            value={property.name || ''} // Use prop directly
            onChange={handleNameChange}
            className="w-full p-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            required
          />
           {!property.name && <p className="text-xs text-red-500 mt-1">Name is required.</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select
            value={property.type || 'string'} // Use prop directly
            onChange={handleTypeChange}
            className="w-full p-1.5 border border-gray-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="string">String</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <input
          type="text"
          placeholder="Describe the parameter"
          value={property.description || ''} // Use prop directly
          onChange={handleDescriptionChange}
          className="w-full p-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>
      <div className="flex items-center">
        <input
          type="checkbox"
          id={`required-${property.id}`}
          checked={property.isRequired || false} // Use prop directly
          onChange={handleRequiredChange}
          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
        />
        <label htmlFor={`required-${property.id}`} className="ml-2 block text-sm text-gray-700">
          Required
        </label>
      </div>
    </div>
  );
};

ParameterPropertyEditor.propTypes = {
  property: PropTypes.shape({
    id: PropTypes.string.isRequired, // ID is now required for keys and unique IDs
    name: PropTypes.string,
    type: PropTypes.string,
    description: PropTypes.string,
    isRequired: PropTypes.bool,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};


// Main component for the schema editor
// Add default values directly in the function signature
const ToolParameterSchemaEditor = ({ value = initialSchema, onChange, disabled = false }) => {
  const [properties, setProperties] = useState([]); // Array of {id, name, type, description, isRequired}
  // Ref to store the last schema emitted via onChange
  const lastEmittedSchemaRef = useRef(null);

  // Helper function to derive and normalize schema from properties state
  const deriveAndNormalizeSchema = (props) => {
    const schema = { type: 'object', properties: {}, required: [] };
    props.forEach(prop => {
      if (prop.name) {
        schema.properties[prop.name] = { type: prop.type, description: prop.description };
        if (prop.isRequired) schema.required.push(prop.name);
      }
    });
    // Normalize
    if (schema.properties) {
      schema.properties = Object.keys(schema.properties).sort().reduce((obj, key) => {
        obj[key] = schema.properties[key]; return obj;
      }, {});
    }
    if (schema.required) schema.required.sort();
    return schema;
  };

  // Helper function to normalize an incoming schema value
  const normalizeSchemaValue = (schemaValue) => {
    const normalized = { ...(schemaValue || initialSchema) };
    if (normalized.properties) {
      normalized.properties = Object.keys(normalized.properties).sort().reduce((obj, key) => {
        obj[key] = normalized.properties[key]; return obj;
      }, {});
    }
    if (normalized.required) {
      normalized.required = [...normalized.required].sort();
    }
    return normalized;
  };

  // Effect 1: Sync internal 'properties' state from external 'value' prop
  useEffect(() => {
    const currentDerivedSchema = deriveAndNormalizeSchema(properties);
    const normalizedIncomingValue = normalizeSchemaValue(value);

    // Only update internal state if the external value is structurally different
    if (JSON.stringify(normalizedIncomingValue) !== JSON.stringify(currentDerivedSchema)) {
      const initialProperties = normalizedIncomingValue.properties
        ? Object.entries(normalizedIncomingValue.properties).map(([name, prop], index) => ({
            id: `prop-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`,
            name,
            type: prop.type || 'string',
            description: prop.description || '',
            isRequired: !!(normalizedIncomingValue.required && normalizedIncomingValue.required.includes(name)),
          }))
        : [];
      setProperties(initialProperties);
      // Also update the ref to prevent Effect 2 from firing unnecessarily
      lastEmittedSchemaRef.current = normalizedIncomingValue;
    }
  }, [value]); // Only depends on external value

  // Effect 2: Call 'onChange' prop when 'properties' state changes and results in a valid, different schema
  useEffect(() => {
    const newSchema = deriveAndNormalizeSchema(properties);
    // Check validity: all properties must have a name
    let isValid = properties.every(prop => !!prop.name);

    // Compare with the last *emitted* schema
    const lastEmitted = lastEmittedSchemaRef.current || initialSchema; // Use initialSchema if ref is null

    if (isValid && !disabled) {
      // Only call onChange if the new schema is different from the last one emitted
      if (JSON.stringify(newSchema) !== JSON.stringify(lastEmitted)) {
        onChange(newSchema);
        lastEmittedSchemaRef.current = newSchema; // Update the ref with the newly emitted schema
      }
    }
    // This effect runs when internal properties change or the callback/disabled status changes.
  }, [properties, onChange, disabled]);


  // --- Memoized Handlers ---
  const handleAddProperty = useCallback(() => {
    setProperties(currentProperties => [
        ...currentProperties,
        { id: `prop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, name: '', type: 'string', description: '', isRequired: false }
    ]);
  }, []);

  const handlePropertyChange = useCallback((index, updatedProperty) => {
    setProperties(currentProperties => {
      const newProperties = [...currentProperties];
      if (index < 0 || index >= newProperties.length) {
        console.warn(`handlePropertyChange called with invalid index: ${index}`);
        return currentProperties;
      }
      newProperties[index] = { ...updatedProperty, id: newProperties[index].id };
      return newProperties;
    });
  }, []);

  const handleRemoveProperty = useCallback((index) => {
    setProperties(currentProperties => currentProperties.filter((_, i) => i !== index));
  }, []);

  const propertyChangeHandlers = useMemo(() => {
    return properties.map((prop, index) =>
      (updatedProp) => handlePropertyChange(index, updatedProp)
    );
  }, [properties, handlePropertyChange]);

  const propertyRemoveHandlers = useMemo(() => {
    return properties.map((prop, index) =>
      () => handleRemoveProperty(index)
    );
  }, [properties, handleRemoveProperty]);
  // --- End Memoized Handlers ---

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {properties.length === 0 && (
        <p className="text-sm text-gray-500 italic">No parameters defined. Add one below.</p>
      )}
      {properties.map((prop, index) => (
        <ParameterPropertyEditor
          key={prop.id} // Use the guaranteed unique ID for the key
          property={prop}
          onChange={propertyChangeHandlers[index]}
          onRemove={propertyRemoveHandlers[index]}
        />
      ))}
      <button
        type="button" // Prevent form submission if inside a form
        onClick={handleAddProperty}
        className="px-3 py-1.5 border border-primary-300 text-primary-700 rounded-md hover:bg-primary-50 text-sm flex items-center"
        disabled={disabled}
      >
        <Icon name="plus" className="h-4 w-4 mr-1" />
        Add Parameter
      </button>
       {properties.some(p => !p.name) && (
         <p className="text-xs text-red-600 mt-1">All parameters must have a name.</p>
       )}
    </div>
  );
};

ToolParameterSchemaEditor.propTypes = {
  // The JSON schema object (or null/undefined)
  value: PropTypes.shape({
    type: PropTypes.string,
    properties: PropTypes.object,
    required: PropTypes.arrayOf(PropTypes.string),
  }),
  // Callback function when the schema changes
  onChange: PropTypes.func.isRequired,
  // Optional flag to disable the editor
  disabled: PropTypes.bool,
};

export default ToolParameterSchemaEditor;

