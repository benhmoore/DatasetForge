import { useState, useEffect } from 'react';
import CustomSelect from './CustomSelect';
import NodeBase from './NodeBase';
import Icon from './Icons';

/**
 * Enhanced TransformNode component for configuring text transformations in a workflow
 * Adds more transformation types, presets, and improved preview
 * Simplified to only operate on direct input
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
    transform_type = 'replace', // New field for transformation type
    preset = 'custom',           // New field for presets
    case_sensitive = true,       // New field for case sensitivity
    // name and label are handled by NodeBase
  } = data;

  // State for validation and preview
  const [regexStatus, setRegexStatus] = useState({ isValid: true, error: null });
  const [previewInput, setPreviewInput] = useState('Hello world! This is a test input with MIXED case text.');
  const [previewOutput, setPreviewOutput] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Define transformation types
  const transformTypes = [
    { value: 'replace', label: 'Find & Replace' },
    { value: 'regex', label: 'Regular Expression' },
    { value: 'trim', label: 'Trim Whitespace' },
    { value: 'case', label: 'Change Case' },
    { value: 'extract', label: 'Extract Text' },
    { value: 'template', label: 'Template Format' }
  ];

  // Define case transformation options for when transform_type === 'case'
  const caseOptions = [
    { value: 'lowercase', label: 'lowercase' },
    { value: 'UPPERCASE', label: 'UPPERCASE' },
    { value: 'Title Case', label: 'Title Case' },
    { value: 'Sentence case', label: 'Sentence case' }
  ];

  // Define preset templates for common transformations
  const presets = [
    { value: 'custom', label: 'Custom Transformation' },
    { value: 'remove_html', label: 'Remove HTML Tags', type: 'regex', pattern: '<[^>]*>', replacement: '' },
    { value: 'extract_emails', label: 'Extract Email Addresses', type: 'regex', pattern: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b', replacement: '$&\n' },
    { value: 'remove_urls', label: 'Remove URLs', type: 'regex', pattern: 'https?:\\/\\/[\\w\\d.-]+\\.[\\w\\d.-]+[\\w\\d\\/.?=#%&:;_-]*', replacement: '' },
    { value: 'remove_extra_spaces', label: 'Remove Extra Spaces', type: 'regex', pattern: '\\s{2,}', replacement: ' ' },
    { value: 'extract_json', label: 'Extract JSON Objects', type: 'regex', pattern: '\\{(?:[^{}]|\\{[^{}]*\\})*\\}', replacement: '$&\n' },
    { value: 'remove_brackets', label: 'Remove Content in Brackets', type: 'regex', pattern: '\\[[^\\]]*\\]|\\([^\\)]*\\)', replacement: '' },
    { value: 'keywords_to_list', label: 'Keywords to Bulleted List', type: 'regex', pattern: '([^,;\\n]+)[,;]\\s*', replacement: '• $1\n' },
    { value: 'numbers_only', label: 'Extract Numbers Only', type: 'regex', pattern: '[^0-9\\.-]', replacement: '' }
  ];

  // Update preview output when input or transform configs change
  useEffect(() => {
    updatePreview();
  }, [
    previewInput, 
    pattern, 
    replacement, 
    is_regex, 
    transform_type, 
    case_sensitive
  ]);
  
  // Initialize with default preview text
  useEffect(() => {
    // Set initial preview text if empty
    if (!previewInput) {
      setPreviewInput('Hello world! This is a test input with MIXED case text.');
    }
  }, []);

  // Function to handle preset selection
  const handlePresetChange = (presetValue) => {
    // Find the selected preset
    const selectedPreset = presets.find(p => p.value === presetValue);
    if (!selectedPreset || presetValue === 'custom') {
      // Just update the preset value for custom
      handleConfigUpdate('preset', presetValue);
      return;
    }

    // Update multiple config values based on the preset
    if (onConfigChange) {
      const updates = {
        preset: presetValue,
        transform_type: selectedPreset.type === 'regex' ? 'regex' : 'replace',
        is_regex: selectedPreset.type === 'regex',
        pattern: selectedPreset.pattern,
        replacement: selectedPreset.replacement
      };
      
      // Update all fields at once
      Object.entries(updates).forEach(([field, value]) => {
        handleConfigUpdate(field, value);
      });
    }
  };

  // Function to update the preview based on current settings
  const updatePreview = () => {
    try {
      // Ensure input is always a string (handle non-string inputs gracefully)
      let inputText = previewInput;
      if (typeof inputText !== 'string') {
        // Convert non-string inputs to string representation
        inputText = inputText === null ? '' : 
                   (typeof inputText === 'object' ? JSON.stringify(inputText) : String(inputText));
      }
      
      let result = inputText;
      
      // Skip if input is empty
      if (!inputText) {
        setPreviewOutput('');
        setRegexStatus({ isValid: true, error: null });
        return;
      }

      // Apply the appropriate transformation based on type
      switch (transform_type) {
        case 'replace':
          // Simple string replacement (use case sensitivity setting)
          if (pattern) {
            // Create a global case-(in)sensitive replace function
            const flags = case_sensitive ? 'g' : 'gi';
            const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedPattern, flags);
            result = inputText.replace(regex, replacement);
          }
          setRegexStatus({ isValid: true, error: null });
          break;

        case 'regex':
          // Regular expression replacement
          if (pattern) {
            try {
              // Validate the regex
              const flags = case_sensitive ? 'g' : 'gi';
              const regex = new RegExp(pattern, flags);
              result = inputText.replace(regex, replacement);
              setRegexStatus({ isValid: true, error: null });
            } catch (error) {
              setRegexStatus({ isValid: false, error: error.message });
              result = inputText; // Keep the input on error
            }
          }
          break;

        case 'trim':
          // Trim whitespace (no pattern needed)
          result = inputText.trim();
          setRegexStatus({ isValid: true, error: null });
          break;

        case 'case':
          // Handle case transformations based on the replacement field (used for case type)
          switch (replacement) {
            case 'lowercase':
              result = inputText.toLowerCase();
              break;
            case 'UPPERCASE':
              result = inputText.toUpperCase();
              break;
            case 'Title Case':
              result = inputText
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
              break;
            case 'Sentence case':
              result = inputText.toLowerCase()
                .replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase());
              break;
            default:
              // No case transformation selected
              result = inputText;
          }
          setRegexStatus({ isValid: true, error: null });
          break;

        case 'extract':
          // Extract text matching a pattern
          if (pattern) {
            try {
              const flags = case_sensitive ? 'g' : 'gi';
              const regex = new RegExp(pattern, flags);
              const matches = [...inputText.matchAll(regex)];
              
              if (matches.length > 0) {
                result = matches.map(match => match[0]).join('\n');
              } else {
                result = '[No matches found]';
              }
              setRegexStatus({ isValid: true, error: null });
            } catch (error) {
              setRegexStatus({ isValid: false, error: error.message });
              result = '[Invalid extraction pattern]'; 
            }
          } else {
            result = '[No extraction pattern specified]';
          }
          break;

        case 'template':
          // Template formatting with ${variable} style placeholders
          if (pattern) {
            // For template mode, pattern is the template format string
            try {
              // Replace ${name} with corresponding value from input
              // This is simplified - for a real implementation you'd need proper context
              result = pattern.replace(/\${([^}]+)}/g, (match, name) => {
                // In a real implementation, you would look up 'name' in the context
                // For preview, just show what it's trying to extract
                return `[Value of ${name}]`;
              });
              setRegexStatus({ isValid: true, error: null });
            } catch (error) {
              setRegexStatus({ isValid: false, error: error.message });
              result = '[Invalid template pattern]';
            }
          } else {
            result = '[No template specified]';
          }
          break;

        default:
          // Unknown transformation type
          result = previewInput;
          setRegexStatus({ isValid: true, error: null });
      }

      setPreviewOutput(result);
    } catch (error) {
      console.error('Error in transform preview:', error);
      setPreviewOutput('[Preview error]');
      setRegexStatus({ isValid: false, error: 'Preview error: ' + error.message });
    }
  };
  
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

  // Handle transform type change
  const handleTransformTypeChange = (value) => {
    // Update transform_type
    handleConfigUpdate('transform_type', value);
    
    // Reset preset to custom when changing type
    handleConfigUpdate('preset', 'custom');
    
    // Set is_regex flag based on type
    if (value === 'regex') {
      handleConfigUpdate('is_regex', true);
    } else if (value === 'replace') {
      handleConfigUpdate('is_regex', false);
    }
    
    // Set appropriate defaults for each type
    switch (value) {
      case 'case':
        // Default to lowercase for case transformation
        handleConfigUpdate('replacement', 'lowercase');
        handleConfigUpdate('pattern', '');
        break;
      case 'trim':
        // No pattern/replacement needed for trim
        handleConfigUpdate('pattern', '');
        handleConfigUpdate('replacement', '');
        break;
      case 'extract':
        // Default extraction is word boundaries
        handleConfigUpdate('pattern', '\\b\\w+\\b');
        handleConfigUpdate('replacement', '');
        break;
      case 'template':
        // Default template with placeholder example
        handleConfigUpdate('pattern', 'Hello, ${name}!');
        handleConfigUpdate('replacement', '');
        break;
    }
  };
  
  // Generate field labels based on transform type
  const getPatternLabel = () => {
    switch (transform_type) {
      case 'replace': return 'Find Text';
      case 'regex': return 'Regex Pattern';
      case 'extract': return 'Extract Pattern';
      case 'template': return 'Template Format';
      default: return 'Pattern';
    }
  };
  
  const getReplacementLabel = () => {
    switch (transform_type) {
      case 'replace': return 'Replace With';
      case 'regex': return 'Replacement ($1, $&)';
      case 'case': return 'Case Type';
      default: return 'Replacement';
    }
  };
  
  // Determine if pattern field should be shown
  const showPatternField = transform_type !== 'trim';
  
  // Determine if replacement field should be shown
  const showReplacementField = transform_type !== 'trim' && transform_type !== 'extract';
  
  // Determine if case sensitivity toggle should be shown
  const showCaseSensitivity = transform_type === 'replace' || 
                              transform_type === 'regex' || 
                              transform_type === 'extract';

  return (
    <NodeBase 
      id={id} 
      data={data} 
      isConnectable={isConnectable} 
      disabled={disabled} 
      nodeType="transform"
      iconName="wand"
    >
      {/* Transformation type selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Transformation Type
          </label>
          <button 
            type="button" 
            onClick={() => setShowHelp(!showHelp)}
            className="text-xs text-blue-600 hover:text-blue-800"
            title="Show/hide help"
          >
            <Icon name={showHelp ? "eye-off" : "help-circle"} className="w-4 h-4" />
          </button>
        </div>
        <CustomSelect
          options={transformTypes}
          value={transform_type}
          onChange={handleTransformTypeChange}
          disabled={disabled}
        />
        
        {/* Help text */}
        {showHelp && (
          <div className="mt-1 p-2 bg-blue-50 rounded-md text-xs text-gray-700">
            <p className="font-medium mb-1">Transformation Types:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><span className="font-medium">Find & Replace:</span> Simple text replacement</li>
              <li><span className="font-medium">Regular Expression:</span> Pattern-based replacement</li>
              <li><span className="font-medium">Trim Whitespace:</span> Remove spaces from start/end</li>
              <li><span className="font-medium">Change Case:</span> Convert text to specified case</li>
              <li><span className="font-medium">Extract Text:</span> Pull out matching text</li>
              <li><span className="font-medium">Template Format:</span> Format with variables</li>
            </ul>
          </div>
        )}
      </div>
      
      {/* Preset selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Preset Transformations
        </label>
        <CustomSelect
          options={presets}
          value={preset}
          onChange={handlePresetChange}
          disabled={disabled}
        />
      </div>
      
      {/* Information note about input */}
      <div className="p-2 bg-blue-50 rounded-md text-xs text-gray-700 mt-2">
        <p className="flex items-center">
          <Icon name="info" className="w-4 h-4 mr-1 text-blue-500" />
          <span>This node transforms its <strong>direct input</strong> from connected nodes.</span>
        </p>
      </div>
      
      {/* Case sensitivity toggle (only for relevant transform types) */}
      {showCaseSensitivity && (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={`case-sensitive-${id}`}
            checked={case_sensitive}
            onChange={() => handleConfigUpdate('case_sensitive', !case_sensitive)}
            disabled={disabled}
            className="rounded text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor={`case-sensitive-${id}`} className="text-sm font-medium text-gray-700">
            Case Sensitive
          </label>
        </div>
      )}
      
      {/* Pattern input (hidden for trim) */}
      {showPatternField && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {getPatternLabel()}
          </label>
          <div className="relative">
            <input
              type="text"
              className={`w-full p-2 border rounded pr-8 ${!regexStatus.isValid ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'focus:border-blue-500 focus:ring-blue-500'}`}
              value={pattern}
              onChange={(e) => handleConfigUpdate('pattern', e.target.value)}
              placeholder={transform_type === 'regex' ? 'e.g., \\b(hello|hi)\\b' : 
                          transform_type === 'template' ? 'Hello, ${name}!' :
                          transform_type === 'extract' ? '\\b\\w+\\b' : 
                          'Text to find...'}
              disabled={disabled}
            />
            {transform_type === 'regex' && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                <Icon 
                  name={regexStatus.isValid ? "check-circle" : "alert-circle"} 
                  className={`w-4 h-4 ${regexStatus.isValid ? 'text-green-500' : 'text-red-500'}`} 
                />
              </div>
            )}
          </div>
          {!regexStatus.isValid && (
            <p className="text-xs text-red-500">{regexStatus.error}</p>
          )}
        </div>
      )}
      
      {/* Replacement input or case options */}
      {showReplacementField && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {getReplacementLabel()}
          </label>
          
          {transform_type === 'case' ? (
            <CustomSelect
              options={caseOptions}
              value={replacement}
              onChange={(value) => handleConfigUpdate('replacement', value)}
              disabled={disabled}
            />
          ) : (
            <input
              type="text"
              className="w-full p-2 border rounded focus:border-blue-500 focus:ring-blue-500"
              value={replacement}
              onChange={(e) => handleConfigUpdate('replacement', e.target.value)}
              placeholder={transform_type === 'regex' ? 'Use $1, $& for captures' : 'Replacement text...'}
              disabled={disabled}
            />
          )}
        </div>
      )}
      
      {/* Preview section */}
      <div className="pt-4 space-y-3 border-t border-gray-200 mt-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">Transform Preview</h4>
          <button
            type="button"
            onClick={updatePreview}
            className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
            title="Update preview"
          >
            <Icon name="refresh-cw" className="w-3 h-3" />
          </button>
        </div>
        
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
            Output Result {regexStatus.isValid ? '' : '(Invalid configuration)'}
          </label>
          <div className="relative w-full">
            <div className={`w-full h-16 p-2 border rounded text-sm overflow-auto ${regexStatus.isValid ? 'bg-gray-50' : 'bg-red-50 border-red-200'}`}>
              {previewOutput}
            </div>
            {!regexStatus.isValid && (
              <div className="absolute top-2 right-2">
                <Icon name="alert-triangle" className="w-4 h-4 text-red-500" />
              </div>
            )}
          </div>
        </div>
        
        {/* Word/character count comparison */}
        {regexStatus.isValid && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Input: {(typeof previewInput === 'string' ? previewInput : String(previewInput)).length} chars, {(typeof previewInput === 'string' ? previewInput : String(previewInput)).split(/\s+/).filter(Boolean).length} words</span>
            <span>Output: {previewOutput.length} chars, {previewOutput.split(/\s+/).filter(Boolean).length} words</span>
          </div>
        )}
      </div>
    </NodeBase>
  );
};

export default TransformNode;