import React from 'react';
import CustomSelect from '../../CustomSelect';

const TemplateSelector = ({ 
  options, 
  value, 
  onChange, 
  isLoading, 
  isDisabled 
}) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Select Template
      </label>
      <CustomSelect
        options={options}
        value={value || ''}
        onChange={onChange}
        placeholder="Select a template..."
        isLoading={isLoading}
        disabled={isDisabled}
      />
    </div>
  );
};

export default TemplateSelector;