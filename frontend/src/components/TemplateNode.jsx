import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import CustomSelect from './CustomSelect';

/**
 * TemplateNode component for configuring a template node in a workflow
 */
const TemplateNode = ({ 
  nodeConfig, 
  onConfigChange,
  disabled = false,
  availableTemplates = []
}) => {
  const [localConfig, setLocalConfig] = useState({
    template_id: nodeConfig.template_id || null,
    instruction: nodeConfig.instruction || '',
  });
  
  // Update parent when local config changes
  useEffect(() => {
    onConfigChange({
      ...nodeConfig,
      template_id: localConfig.template_id,
      instruction: localConfig.instruction
    });
  }, [localConfig, nodeConfig, onConfigChange]);
  
  // Handle template selection
  const handleTemplateChange = (templateId) => {
    // Convert template ID to number if it exists
    const numTemplateId = templateId ? Number(templateId) : null;
    
    setLocalConfig(prev => ({
      ...prev,
      template_id: numTemplateId
    }));
  };
  
  // Handle instruction change
  const handleInstructionChange = (e) => {
    setLocalConfig(prev => ({
      ...prev,
      instruction: e.target.value
    }));
  };
  
  // Template options for dropdown
  const templateOptions = [
    { value: '', label: 'Select a template...' },
    ...availableTemplates.map(template => ({
      value: template.id,
      label: template.name
    }))
  ];
  
  return (
    <div className="p-4 space-y-4 bg-white rounded border border-gray-200">
      <h3 className="font-medium text-lg">{nodeConfig.name || 'Template Node'}</h3>
      
      {/* Template selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Template
        </label>
        <CustomSelect
          options={templateOptions}
          value={localConfig.template_id || ''}
          onChange={handleTemplateChange}
          placeholder="Select a template..."
          disabled={disabled}
        />
        {!localConfig.template_id && (
          <p className="text-xs text-red-500 mt-1">
            A template must be selected for this node to work.
          </p>
        )}
      </div>
      
      {/* Additional instruction */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Additional Instruction (Optional)
        </label>
        <textarea
          className="w-full h-24 p-2 border rounded text-sm"
          value={localConfig.instruction || ''}
          onChange={handleInstructionChange}
          placeholder="Enter additional instructions to add to the template's system prompt..."
          disabled={disabled}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        />
        <p className="text-xs text-gray-500">
          This will be appended to the template's system prompt.
        </p>
      </div>
    </div>
  );
};

export default TemplateNode;