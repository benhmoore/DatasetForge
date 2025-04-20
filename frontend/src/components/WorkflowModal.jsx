import React from 'react';
import Icon from './Icons';
import WorkflowManager from './WorkflowManager';

const WorkflowModal = ({ 
  isOpen, 
  onClose, 
  workflow, 
  setWorkflow, 
  saveRequest,
  isGenerating,
  isParaphrasing,
  isExecutingWorkflow
}) => {
  if (!isOpen) return null;

  const handleImport = (importedWorkflow) => {
    setWorkflow(importedWorkflow);
  };

  const handleExport = () => {
    // You can add any export-specific logic here
    console.log('Workflow exported');
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[600] overflow-y-auto p-12 h-full w-full"
      onClick={onClose} // Close on backdrop click
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-manager-title"
    >
      <div 
        className="bg-white rounded-lg w-full h-full shadow-xl flex flex-col animate-fadeIn"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        {/* Modal Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-200 flex-shrink-0">
          <h2 id="workflow-manager-title" className="text-xl font-semibold flex items-center">
            <Icon name="workflow" className="h-5 w-5 mr-2 text-blue-600" />
            Workflow Manager
          </h2>
          <button
            className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition-colors"
            onClick={onClose}
            aria-label="Close workflow manager"
            title="Close"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        
        {/* Modal Body - WorkflowManager component */}
        <div className="flex-grow overflow-y-auto p-1"> {/* Reduced padding for more space */}
          <WorkflowManager
            visible={isOpen}
            workflow={workflow}
            setWorkflow={setWorkflow}
            onImport={handleImport}
            onExport={handleExport}
            disabled={isGenerating || isParaphrasing || isExecutingWorkflow}
            saveRequest={saveRequest}
          />
        </div>
      </div>
    </div>
  );
};

export default WorkflowModal;