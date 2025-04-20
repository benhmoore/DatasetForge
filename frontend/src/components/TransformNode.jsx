import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Handle, Position } from '@xyflow/react'; // Import Position
import CustomSelect from './CustomSelect';
// Removed withNodeWrapper import

/**
 * TransformNode component for configuring a text transformation node in a workflow
 */
const TransformNode = ({ 
  data, // Data object from React Flow, contains config and onConfigChange
  id,   // Node ID from React Flow
  disabled = false,
  isConnectable = true
}) => {
  // Destructure config and callback from data
  const { 
    onConfigChange, 
    pattern = '', 
    replacement = '', 
    is_regex = false, 
    apply_to_field = 'output',
    name, // Get name/label from data
    label
  } = data;

  // State only for regex validation and preview
  const [regexStatus, setRegexStatus] = useState({ isValid: true, error: null });
  const [previewInput, setPreviewInput] = useState('Hello world! This is a test input.');
  const [previewOutput, setPreviewOutput] = useState('');

  // Update preview output when input or transform configs change
  useEffect(() => {
    try {
      // Use values directly from data prop
      if (!pattern) {
        setPreviewOutput(previewInput);
        return;
      }
      
      if (is_regex) {
        try {
          // Validate regex on the fly
          new RegExp(pattern); // Throws error if invalid
          const regex = new RegExp(pattern, 'g'); // Add 'g' flag for global replace in preview
          const transformed = previewInput.replace(regex, replacement);
          setPreviewOutput(transformed);
          setRegexStatus({ isValid: true, error: null });
        } catch (error) {
          setPreviewOutput(previewInput); // Show original input on error
          setRegexStatus({ isValid: false, error: error.message });
        }
      } else {
        // Simple string replacement (only replaces first instance by default)
        // For a global replace preview:
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special chars
        const regex = new RegExp(escapedPattern, 'g');
        const transformed = previewInput.replace(regex, replacement);
        // Or keep simple replace: const transformed = previewInput.replace(pattern, replacement);
        setPreviewOutput(transformed);
        setRegexStatus({ isValid: true, error: null }); // Reset status for non-regex
      }
    } catch (error) {
      console.error('Error in transform preview:', error);
      setPreviewOutput(previewInput); // Fallback to original input
      setRegexStatus({ isValid: false, error: 'Preview error' }); // Indicate a general preview error
    }
  // Depend on previewInput and relevant config fields from data
  }, [previewInput, pattern, replacement, is_regex]);
  
  // Generic handler to update specific config fields
  const handleConfigUpdate = (field, value) => {
    if (onConfigChange) {
      console.log(`TransformNode (${id}): handleConfigUpdate -> ${field}: ${value}`);
      onConfigChange(id, { [field]: value });
    }
  };

  // Handle preview input change
  const handlePreviewInputChange = (e) => {
    setPreviewInput(e.target.value);
  };
  
  // Field options for dropdown
  const fieldOptions = [
    { value: 'output', label: 'Output Text' },
    { value: 'system_prompt', label: 'System Prompt' },
    { value: 'user_prompt', label: 'User Prompt' }
  ];
  
  return (
    <div className="p-4 space-y-4 bg-white rounded border border-gray-200 relative shadow-sm min-w-[300px]">
      {/* Input handle */}
      <Handle 
        type="target" 
        position={Position.Left} // Use Position enum
        id="input" 
        isConnectable={isConnectable} 
        className="!w-3 !h-3 !bg-orange-500"
      />
      
      {/* Output handle */}
      <Handle 
        type="source" 
        position={Position.Right} // Use Position enum
        id="output" 
        isConnectable={isConnectable} 
        className="!w-3 !h-3 !bg-orange-500"
      />
      
      {/* Use name or label from data, fallback */}
      <h3 className="font-medium text-lg">{name || label || 'Transform Node'}</h3>
      
      {/* Apply to field selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Apply To Field
        </label>
        <CustomSelect
          options={fieldOptions}
          value={apply_to_field} // Use value from data
          onChange={(value) => handleConfigUpdate('apply_to_field', value)}
          disabled={disabled}
        />
      </div>
      
      {/* Regex mode toggle */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id={`regex-toggle-${id}`} // Use unique ID
          checked={is_regex} // Use value from data
          onChange={() => handleConfigUpdate('is_regex', !is_regex)}
          disabled={disabled}
          className="rounded text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor={`regex-toggle-${id}`} className="text-sm font-medium text-gray-700">
          Use Regular Expression
        </label>
      </div>
      
      {/* Pattern input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {is_regex ? 'Regex Pattern' : 'Search Text'}
        </label>
        <input
          type="text"
          className={`w-full p-2 border rounded ${!regexStatus.isValid ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'focus:border-blue-500 focus:ring-blue-500'}`}
          value={pattern} // Use value from data
          onChange={(e) => handleConfigUpdate('pattern', e.target.value)}
          placeholder={is_regex ? 'e.g., \\b(hello|hi)\\b' : 'Text to find...'}
          disabled={disabled}
        />
        {!regexStatus.isValid && (
          <p className="text-xs text-red-500">{regexStatus.error}</p>
        )}
      </div>
      
      {/* Replacement input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {is_regex ? 'Replacement (use $1, $&)' : 'Replace With'}
        </label>
        <input
          type="text"
          className="w-full p-2 border rounded focus:border-blue-500 focus:ring-blue-500"
          value={replacement} // Use value from data
          onChange={(e) => handleConfigUpdate('replacement', e.target.value)}
          placeholder="Replacement text..."
          disabled={disabled}
        />
      </div>
      
      {/* Preview section */}
      <div className="pt-4 space-y-3 border-t border-gray-200 mt-4">
        <h4 className="font-medium text-sm">Transform Preview</h4>
        
        {/* Preview input */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Sample Input
          </label>
          <textarea
            className="w-full h-16 p-2 border rounded text-sm focus:ring-blue-500 focus:border-blue-500"
            value={previewInput}
            onChange={handlePreviewInputChange}
            placeholder="Enter text to preview transformation..."
            disabled={disabled}
          />
        </div>
        
        {/* Preview output */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Output Result
          </label>
          <div className="w-full h-16 p-2 border rounded bg-gray-50 text-sm overflow-auto">
            {previewOutput}
          </div>
        </div>
      </div>
    </div>
  );
};

// Export the direct component
export default TransformNode;