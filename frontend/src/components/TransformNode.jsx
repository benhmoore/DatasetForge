import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Handle } from '@xyflow/react';
import CustomSelect from './CustomSelect';
import withNodeWrapper from './withNodeWrapper';

/**
 * TransformNode component for configuring a text transformation node in a workflow
 */
const TransformNode = ({ 
  nodeConfig,
  localConfig,
  updateConfig,
  disabled = false,
  isConnectable = true
}) => {
  // Regex test status and error
  const [regexStatus, setRegexStatus] = useState({
    isValid: true,
    error: null
  });
  
  // Preview states
  const [previewInput, setPreviewInput] = useState('Hello world! This is a test input.');
  const [previewOutput, setPreviewOutput] = useState('');
  
  // Update preview output when input or transform configs change
  useEffect(() => {
    try {
      const { pattern, replacement, is_regex } = localConfig;
      
      if (!pattern) {
        setPreviewOutput(previewInput);
        return;
      }
      
      if (is_regex) {
        try {
          const regex = new RegExp(pattern);
          const transformed = previewInput.replace(regex, replacement);
          setPreviewOutput(transformed);
          
          setRegexStatus({
            isValid: true,
            error: null
          });
        } catch (error) {
          setPreviewOutput(previewInput);
          setRegexStatus({
            isValid: false,
            error: error.message
          });
        }
      } else {
        // Simple string replacement
        const transformed = previewInput.replace(pattern, replacement);
        setPreviewOutput(transformed);
      }
    } catch (error) {
      console.error('Error in transform preview:', error);
      setPreviewOutput(previewInput);
    }
  }, [previewInput, localConfig]);
  
  // Handle field selection
  const handleFieldChange = (fieldName) => {
    updateConfig({ apply_to_field: fieldName });
  };
  
  // Handle pattern change
  const handlePatternChange = (e) => {
    updateConfig({ pattern: e.target.value });
  };
  
  // Handle replacement change
  const handleReplacementChange = (e) => {
    updateConfig({ replacement: e.target.value });
  };
  
  // Toggle regex mode
  const handleRegexToggle = () => {
    updateConfig({ is_regex: !localConfig.is_regex });
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
    <div className="p-4 space-y-4 bg-white rounded border border-gray-200 relative">
      {/* Input handle */}
      <Handle 
        type="target" 
        position="left" 
        id="input" 
        isConnectable={isConnectable} 
        className="w-3 h-3 bg-orange-500"
      />
      
      {/* Output handle */}
      <Handle 
        type="source" 
        position="right" 
        id="output" 
        isConnectable={isConnectable} 
        className="w-3 h-3 bg-orange-500"
      />
      
      <h3 className="font-medium text-lg">{nodeConfig?.name || 'Transform Node'}</h3>
      
      {/* Apply to field selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Apply To Field
        </label>
        <CustomSelect
          options={fieldOptions}
          value={localConfig.apply_to_field}
          onChange={handleFieldChange}
          disabled={disabled}
        />
      </div>
      
      {/* Regex mode toggle */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="regex-toggle"
          checked={localConfig.is_regex}
          onChange={handleRegexToggle}
          disabled={disabled}
          className="rounded text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="regex-toggle" className="text-sm font-medium text-gray-700">
          Use Regular Expression
        </label>
      </div>
      
      {/* Pattern input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {localConfig.is_regex ? 'Regex Pattern' : 'Search Text'}
        </label>
        <input
          type="text"
          className={`w-full p-2 border rounded ${!regexStatus.isValid ? 'border-red-500' : ''}`}
          value={localConfig.pattern}
          onChange={handlePatternChange}
          placeholder={localConfig.is_regex ? 'e.g., \\b(hello|hi)\\b' : 'Text to find...'}
          disabled={disabled}
        />
        {!regexStatus.isValid && (
          <p className="text-xs text-red-500">{regexStatus.error}</p>
        )}
      </div>
      
      {/* Replacement input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {localConfig.is_regex ? 'Replacement (can use $1, $2 for capture groups)' : 'Replace With'}
        </label>
        <input
          type="text"
          className="w-full p-2 border rounded"
          value={localConfig.replacement}
          onChange={handleReplacementChange}
          placeholder="Replacement text..."
          disabled={disabled}
        />
      </div>
      
      {/* Preview section */}
      <div className="pt-2 space-y-3 border-t border-gray-200">
        <h4 className="font-medium text-sm">Transform Preview</h4>
        
        {/* Preview input */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Sample Input
          </label>
          <textarea
            className="w-full h-16 p-2 border rounded text-sm"
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

// Define default config for TransformNode
const getDefaultTransformConfig = () => ({
  pattern: '',
  replacement: '',
  is_regex: false,
  apply_to_field: 'output'
});

// Wrap with HOC
export default withNodeWrapper(TransformNode, getDefaultTransformConfig);