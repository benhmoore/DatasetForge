import React from 'react';
import Icon from '../../Icons';
import ToggleSwitch from '../../ToggleSwitch';

const WorkflowControls = ({ 
  workflowEnabled, 
  onToggle, 
  onManage, 
  disabled 
}) => {
  return (
    <div className="mt-3 flex items-center justify-between">
      <label className="text-sm font-medium text-gray-700 flex items-center">
        <Icon name="workflow" className="h-4 w-4 mr-1.5 text-gray-500" />
        Workflow Mode
      </label>
      <div className="flex items-center space-x-2">
        {workflowEnabled && (
          <button
            onClick={onManage}
            className="text-sm text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={disabled}
            title="Open Workflow Editor"
          >
            Manage Workflow
          </button>
        )}
        <ToggleSwitch
          checked={workflowEnabled}
          onChange={onToggle}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default WorkflowControls;