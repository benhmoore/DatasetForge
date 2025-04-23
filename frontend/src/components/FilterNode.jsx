import { useState, useEffect, useMemo } from 'react';
import { Position } from '@xyflow/react';
import NodeBase from './NodeBase';
import CustomSelect from './CustomSelect';
import CustomTextInput from './CustomTextInput';
import Icon from './Icons';

/**
 * FilterNode component for evaluating and filtering content based on configurable rules
 * Provides rule-based filtering with pass/fail routing
 */
const FilterNode = ({ 
  data,
  id,
  disabled = false,
  isConnectable = true
}) => {
  // Destructure config, callback from data
  const { 
    onConfigChange, 
    rules = [],
    combination_mode = 'AND' // 'AND' or 'OR'
  } = data;

  // State for preview
  const [previewInput, setPreviewInput] = useState('Sample input to test your filter rules');
  const [previewResults, setPreviewResults] = useState({ passed: true, ruleResults: [] });
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Rule types - categorized for better organization
  const ruleCategories = [
    { value: 'basic', label: 'Basic Rules' },
    { value: 'grammar', label: 'Grammar Rules' },
    { value: 'style', label: 'Style Rules' }
  ];

  // All available rule types across categories
  const ruleTypes = [
    // Basic rules 
    { value: 'min_length', label: 'Minimum Length', category: 'basic', 
      description: 'Requires text to have at least a specified number of characters' },
    { value: 'max_length', label: 'Maximum Length', category: 'basic',
      description: 'Limits text to no more than a specified number of characters' },
    { value: 'contains', label: 'Contains Text', category: 'basic',
      description: 'Requires text to contain a specific phrase or pattern' },
    { value: 'not_contains', label: 'Does Not Contain', category: 'basic',
      description: 'Requires text to not contain a specific phrase or pattern' },
    { value: 'regex_match', label: 'Regex Match', category: 'basic',
      description: 'Applies a custom regular expression pattern' },
    
    // Grammar rules
    { value: 'no_passive_voice', label: 'No Passive Voice', category: 'grammar',
      description: 'Enforces active voice writing by detecting passive constructions' },
    { value: 'sentence_structure', label: 'Sentence Structure', category: 'grammar',
      description: 'Checks for well-formed sentences with proper structure' },
    
    // Style rules
    { value: 'readability_score', label: 'Readability Score', category: 'style',
      description: 'Ensures text meets readability standards (e.g., Flesch-Kincaid)' },
    { value: 'sentence_length', label: 'Sentence Length', category: 'style',
      description: 'Controls average or maximum sentence length' }
  ];

  // Current category for rule selection UI
  const [activeCategory, setActiveCategory] = useState('basic');
  // Current rule type for adding new rules
  const [selectedRuleType, setSelectedRuleType] = useState('min_length');

  // Filter rule types by current category
  const filteredRuleTypes = useMemo(() => 
    ruleTypes.filter(rule => rule.category === activeCategory),
    [activeCategory]
  );

  // Function to get default parameters for a rule type
  const getDefaultParametersForType = (type) => {
    switch (type) {
      case 'min_length': return { value: 100, unit: 'characters' };
      case 'max_length': return { value: 1000, unit: 'characters' };
      case 'contains': return { text: '', case_sensitive: false };
      case 'not_contains': return { text: '', case_sensitive: false };
      case 'regex_match': return { pattern: '', description: 'Custom pattern' };
      case 'no_passive_voice': return { max_occurrences: 0, sensitivity: 'high' };
      case 'sentence_structure': return { strictness: 'medium' };
      case 'readability_score': return { min_score: 60, method: 'flesch_kincaid' };
      case 'sentence_length': return { max_length: 30, unit: 'words' };
      default: return {};
    }
  };

  // Handle adding a new rule
  const handleAddRule = () => {
    if (disabled) return;
    
    const newRule = {
      id: `rule_${Date.now()}`,
      type: selectedRuleType,
      parameters: getDefaultParametersForType(selectedRuleType),
      enabled: true
    };
    
    onConfigChange(id, { rules: [...rules, newRule] });
  };

  // Handle rule change (enable/disable, parameter changes)
  const handleRuleChange = (ruleId, updates) => {
    if (disabled) return;
    
    onConfigChange(id, {
      rules: rules.map(rule => 
        rule.id === ruleId ? { ...rule, ...updates } : rule
      )
    });
  };

  // Handle rule parameter change
  const handleRuleParameterChange = (ruleId, paramName, value) => {
    if (disabled) return;
    
    onConfigChange(id, {
      rules: rules.map(rule => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            parameters: {
              ...rule.parameters,
              [paramName]: value
            }
          };
        }
        return rule;
      })
    });
  };

  // Handle rule deletion
  const handleDeleteRule = (ruleId) => {
    if (disabled) return;
    
    onConfigChange(id, {
      rules: rules.filter(rule => rule.id !== ruleId)
    });
  };

  // Handle combination mode change
  const handleCombinationModeChange = (newMode) => {
    if (disabled) return;
    
    onConfigChange(id, { combination_mode: newMode });
  };

  // Preview rule evaluation
  const previewRuleEvaluation = async () => {
    if (disabled || !rules.length) return;
    
    setIsPreviewLoading(true);
    
    try {
      // Call backend API to evaluate rules against the preview text
      const response = await fetch('/api/filter/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${sessionStorage.getItem('auth')}`,
        },
        body: JSON.stringify({
          text: previewInput,
          rules: rules.filter(r => r.enabled),
          combination_mode
        })
      });
      
      if (!response.ok) {
        throw new Error(`Preview failed: ${response.status}`);
      }
      
      const results = await response.json();
      setPreviewResults(results);
    } catch (error) {
      console.error('Error previewing filter rules:', error);
      // Show error in UI
      setPreviewResults({
        passed: false,
        error: error.message,
        ruleResults: []
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Update preview when input or rules change
  useEffect(() => {
    if (rules.length > 0 && previewInput) {
      // Use a debounce to prevent too frequent API calls
      const timer = setTimeout(() => {
        previewRuleEvaluation();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [previewInput, rules, combination_mode]);

  // Output handles for "pass" and "fail" paths
  const outputHandles = useMemo(() => [
    {
      id: 'pass',
      type: 'source',
      position: Position.Right,
      label: 'Pass',
      style: { top: '35%' }
    },
    {
      id: 'fail',
      type: 'source',
      position: Position.Right,
      label: 'Fail',
      style: { top: '65%' }
    }
  ], []);

  // Render a rule configuration UI based on type
  const renderRuleConfig = (rule) => {
    const { type, parameters } = rule;
    
    switch (type) {
      case 'min_length':
      case 'max_length':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm">Minimum {parameters.unit}</label>
              <input 
                type="number" 
                className="w-20 px-2 py-1 text-sm border rounded"
                value={parameters.value}
                onChange={(e) => handleRuleParameterChange(rule.id, 'value', parseInt(e.target.value))}
                min={1}
                max={10000}
                disabled={disabled}
              />
            </div>
            <CustomSelect
              options={[
                { value: 'characters', label: 'Characters' },
                { value: 'words', label: 'Words' },
                { value: 'sentences', label: 'Sentences' }
              ]}
              value={parameters.unit}
              onChange={(value) => handleRuleParameterChange(rule.id, 'unit', value)}
              disabled={disabled}
            />
          </div>
        );
        
      case 'contains':
      case 'not_contains':
        return (
          <div className="space-y-2">
            <CustomTextInput
              label={type === 'contains' ? 'Text to find' : 'Text to exclude'}
              value={parameters.text}
              onChange={(e) => handleRuleParameterChange(rule.id, 'text', e.target.value)}
              mode="single"
              disabled={disabled}
            />
            <div className="flex items-center space-x-2">
              <input 
                type="checkbox" 
                id={`case-sensitive-${rule.id}`}
                checked={parameters.case_sensitive}
                onChange={() => handleRuleParameterChange(rule.id, 'case_sensitive', !parameters.case_sensitive)}
                disabled={disabled}
              />
              <label htmlFor={`case-sensitive-${rule.id}`} className="text-sm">
                Case sensitive
              </label>
            </div>
          </div>
        );
        
      case 'regex_match':
        return (
          <div className="space-y-2">
            <CustomTextInput
              label="Regular Expression"
              value={parameters.pattern}
              onChange={(e) => handleRuleParameterChange(rule.id, 'pattern', e.target.value)}
              mode="single"
              disabled={disabled}
            />
            <p className="text-xs text-gray-500">
              Pattern format: <code>{parameters.pattern || '\\b\\w{3,}\\b'}</code>
            </p>
          </div>
        );
        
      case 'no_passive_voice':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm">Max occurrences allowed</label>
              <input 
                type="number" 
                className="w-20 px-2 py-1 text-sm border rounded"
                value={parameters.max_occurrences}
                onChange={(e) => handleRuleParameterChange(rule.id, 'max_occurrences', parseInt(e.target.value))}
                min={0}
                max={100}
                disabled={disabled}
              />
            </div>
            <CustomSelect
              options={[
                { value: 'high', label: 'High sensitivity' },
                { value: 'medium', label: 'Medium sensitivity' },
                { value: 'low', label: 'Low sensitivity' }
              ]}
              value={parameters.sensitivity}
              onChange={(value) => handleRuleParameterChange(rule.id, 'sensitivity', value)}
              disabled={disabled}
            />
          </div>
        );
        
      case 'sentence_structure':
        return (
          <div className="space-y-2">
            <CustomSelect
              options={[
                { value: 'high', label: 'Strict checking' },
                { value: 'medium', label: 'Standard checking' },
                { value: 'low', label: 'Basic checking' }
              ]}
              value={parameters.strictness}
              onChange={(value) => handleRuleParameterChange(rule.id, 'strictness', value)}
              disabled={disabled}
            />
          </div>
        );
        
      case 'readability_score':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm">Minimum score</label>
              <input 
                type="number" 
                className="w-20 px-2 py-1 text-sm border rounded"
                value={parameters.min_score}
                onChange={(e) => handleRuleParameterChange(rule.id, 'min_score', parseInt(e.target.value))}
                min={0}
                max={100}
                disabled={disabled}
              />
            </div>
            <CustomSelect
              options={[
                { value: 'flesch_kincaid', label: 'Flesch-Kincaid' },
                { value: 'coleman_liau', label: 'Coleman-Liau' },
                { value: 'gunning_fog', label: 'Gunning Fog' }
              ]}
              value={parameters.method}
              onChange={(value) => handleRuleParameterChange(rule.id, 'method', value)}
              disabled={disabled}
            />
          </div>
        );
        
      case 'sentence_length':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm">Maximum length</label>
              <input 
                type="number" 
                className="w-20 px-2 py-1 text-sm border rounded"
                value={parameters.max_length}
                onChange={(e) => handleRuleParameterChange(rule.id, 'max_length', parseInt(e.target.value))}
                min={1}
                max={200}
                disabled={disabled}
              />
            </div>
            <CustomSelect
              options={[
                { value: 'words', label: 'Words' },
                { value: 'characters', label: 'Characters' }
              ]}
              value={parameters.unit}
              onChange={(value) => handleRuleParameterChange(rule.id, 'unit', value)}
              disabled={disabled}
            />
          </div>
        );
        
      default:
        return (
          <div className="text-sm text-gray-500">
            Configuration options for {type}
          </div>
        );
    }
  };

  return (
    <NodeBase 
      id={id} 
      data={data} 
      isConnectable={isConnectable} 
      disabled={disabled} 
      nodeType="filter"
      iconName="filter"
      outputHandles={outputHandles}
    >
      {/* Mode selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Filter Mode
        </label>
        <CustomSelect
          options={[
            { value: 'AND', label: 'All rules must pass (AND)' },
            { value: 'OR', label: 'Any rule can pass (OR)' }
          ]}
          value={combination_mode}
          onChange={handleCombinationModeChange}
          disabled={disabled}
        />
      </div>
      
      {/* Rule Categories Tabs */}
      <div className="mt-4 border-b border-gray-200">
        <div className="flex">
          {ruleCategories.map(category => (
            <button
              key={category.value}
              className={`py-2 px-4 text-sm font-medium ${
                activeCategory === category.value
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => {
                setActiveCategory(category.value);
                // Set the first rule type from this category as selected
                const firstRuleInCategory = ruleTypes.find(r => r.category === category.value);
                if (firstRuleInCategory) {
                  setSelectedRuleType(firstRuleInCategory.value);
                }
              }}
              disabled={disabled}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Rule Type Selector */}
      <div className="mt-4 flex space-x-2">
        <div className="flex-grow">
          <CustomSelect
            options={filteredRuleTypes}
            value={selectedRuleType}
            onChange={setSelectedRuleType}
            disabled={disabled}
          />
        </div>
        <button
          onClick={handleAddRule}
          className={`p-2 rounded-md ${
            disabled
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
          disabled={disabled}
          title="Add Rule"
        >
          <Icon name="plus" className="w-5 h-5" />
        </button>
      </div>
      
      {/* Rule Help Text */}
      {selectedRuleType && (
        <div className="mt-2 p-2 bg-blue-50 rounded-md">
          <p className="text-xs text-blue-800">
            {ruleTypes.find(r => r.value === selectedRuleType)?.description || 
             `Configure rules for ${selectedRuleType}`}
          </p>
        </div>
      )}
      
      {/* Active Rules List */}
      <div className="mt-4 space-y-4">
        <h4 className="font-medium text-sm">Active Rules</h4>
        
        {rules.length === 0 ? (
          <div className="p-4 border border-dashed border-gray-300 rounded-md text-center text-sm text-gray-500">
            No rules added yet. Add rules above to start filtering.
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div 
                key={rule.id} 
                className={`p-3 rounded-md border ${
                  rule.enabled 
                    ? 'border-l-4 border-l-green-500 bg-white'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => handleRuleChange(rule.id, { enabled: !rule.enabled })}
                      disabled={disabled}
                    />
                    <h5 className="font-medium">
                      {ruleTypes.find(r => r.value === rule.type)?.label || rule.type}
                    </h5>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className={`p-1 rounded-full ${
                      disabled
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-gray-500 hover:text-red-500 hover:bg-red-50'
                    }`}
                    disabled={disabled}
                    title="Delete Rule"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Rule-specific configuration */}
                <div className={rule.enabled ? '' : 'opacity-50'}>
                  {renderRuleConfig(rule)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Preview Section */}
      {rules.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm">Preview</h4>
            <button
              onClick={previewRuleEvaluation}
              className={`p-1 rounded ${
                disabled || isPreviewLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}
              disabled={disabled || isPreviewLoading}
              title="Update Preview"
            >
              <Icon 
                name={isPreviewLoading ? "loader" : "refresh-cw"} 
                className={`w-4 h-4 ${isPreviewLoading ? 'animate-spin' : ''}`} 
              />
            </button>
          </div>
          
          <CustomTextInput
            label="Sample text to test rules"
            value={previewInput}
            onChange={(e) => setPreviewInput(e.target.value)}
            mode="multi"
            rows={3}
            disabled={disabled}
          />
          
          {/* Preview Results */}
          {previewResults && (
            <div className="mt-4">
              <div className={`p-3 rounded-md ${
                previewResults.passed
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <Icon 
                    name={previewResults.passed ? "check-circle" : "alert-circle"} 
                    className={`w-5 h-5 ${
                      previewResults.passed ? 'text-green-500' : 'text-red-500'
                    }`} 
                  />
                  <span className="font-medium">
                    {previewResults.passed 
                      ? 'Content passes all rules' 
                      : previewResults.error 
                        ? `Error: ${previewResults.error}` 
                        : 'Content fails one or more rules'}
                  </span>
                </div>
                
                {/* Rule Results Details */}
                {previewResults.ruleResults && previewResults.ruleResults.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {previewResults.ruleResults.map((result, index) => (
                      <div 
                        key={index}
                        className={`p-2 text-xs rounded ${
                          result.passed 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        <div className="flex items-center space-x-1">
                          <Icon 
                            name={result.passed ? "check" : "x"} 
                            className="w-3 h-3" 
                          />
                          <span>{result.ruleName}: {result.passed ? 'Passed' : 'Failed'}</span>
                        </div>
                        {!result.passed && result.message && (
                          <p className="mt-1 ml-4">{result.message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </NodeBase>
  );
};

export default FilterNode;