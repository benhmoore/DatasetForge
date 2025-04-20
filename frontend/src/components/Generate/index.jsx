import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ParaphraseModal from '../ParaphraseModal';
import SettingsModal from '../SettingsModal';
import WorkflowModal from '../WorkflowModal';
import SeedForm from '../SeedForm';

// Import custom hooks
import useTemplates from './hooks/useTemplates';
import useWorkflow from './hooks/useWorkflow';
import useVariations from './hooks/useVariations';
import useGeneration from './hooks/useGeneration';
import useDatasetSave from './hooks/useDatasetSave';

// Import components
import TemplateSelector from './components/TemplateSelector';
import WorkflowControls from './components/WorkflowControls';
import VariationActions from './components/VariationActions';
import VariationList from './components/VariationList';
import DatasetExampleTable from './components/DatasetExampleTable';

const Generate = ({ context }) => {
  const { selectedDataset } = context;
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Use custom hooks to manage state and logic
  const {
    templates,
    selectedTemplateId,
    selectedTemplate,
    isLoading,
    handleTemplateChange,
    templateOptions
  } = useTemplates(location);

  const {
    workflowEnabled,
    currentWorkflow,
    isExecutingWorkflow,
    setIsExecutingWorkflow,
    isWorkflowModalOpen,
    workflowSaveRequest,
    handleToggleWorkflow,
    handleWorkflowImport,
    handleOpenWorkflowModal,
    handleCloseWorkflowModal
  } = useWorkflow();

  const {
    variations,
    setVariations,
    variationsRef,
    selectedVariations,
    setSelectedVariations,
    isParaphrasing,
    setIsParaphrasing,
    isParaphraseModalOpen,
    paraphraseSourceText,
    paraphraseSourceId,
    selectedCount,
    validVariationsCount,
    totalVariationsCount,
    handleSelect,
    handleEdit,
    handleAddVariations,
    handleDismiss,
    handleToolCallsChange,
    handleClear,
    handleOpenParaphraseModal,
    handleCloseParaphraseModal,
    saveButtonText,
    isSaveButtonDisabled,
    clearButtonText,
    isClearButtonDisabled
  } = useVariations(selectedTemplate, selectedDataset);

  const {
    isGenerating,
    handleGenerate,
    handleCancelGeneration,
    handleRegenerate
  } = useGeneration(
    selectedDataset,
    selectedTemplate,
    variationsRef,
    setVariations,
    setSelectedVariations,
    workflowEnabled,
    currentWorkflow,
    setIsExecutingWorkflow
  );

  const {
    refreshExamplesTrigger,
    handleSaveSelectedToDataset,
    handleSaveAllValidToDataset
  } = useDatasetSave(
    selectedDataset,
    selectedTemplate,
    templates,
    variationsRef,
    setVariations,
    setSelectedVariations
  );

  // Determine save handler based on selection state
  const handleSaveClick = () => {
    if (selectedCount > 0) {
      handleSaveSelectedToDataset(selectedVariations);
    } else {
      handleSaveAllValidToDataset(variations);
    }
  };

  return (
    <div className="space-y-8 w-full">
      {/* Paraphrase Modal */}
      <ParaphraseModal
        isOpen={isParaphraseModalOpen}
        onClose={handleCloseParaphraseModal}
        sourceText={paraphraseSourceText}
        variationId={paraphraseSourceId}
        onEdit={handleEdit}
        onAddVariations={handleAddVariations}
      />
      
      {/* Workflow Modal */}
      <WorkflowModal
        isOpen={isWorkflowModalOpen}
        onClose={handleCloseWorkflowModal}
        workflow={currentWorkflow}
        setWorkflow={workflow => {
          handleWorkflowImport(workflow);
        }}
        saveRequest={workflowSaveRequest}
        isGenerating={isGenerating}
        isParaphrasing={isParaphrasing}
        isExecutingWorkflow={isExecutingWorkflow}
      />
      
      <div className="grid grid-cols-1 md:grid-cols-[500px_1fr] gap-6">
        <div className="space-y-4">
          <div className="pl-4 pt-4">
            {/* Template Selector */}
            <TemplateSelector
              options={templateOptions}
              value={selectedTemplateId}
              onChange={handleTemplateChange}
              isLoading={isLoading}
              isDisabled={isLoading || isGenerating || templates.length === 0 || selectedDataset?.archived}
            />
            
            {/* Workflow Controls */}
            <WorkflowControls
              workflowEnabled={workflowEnabled}
              onToggle={handleToggleWorkflow}
              onManage={handleOpenWorkflowModal}
              disabled={isGenerating || isParaphrasing}
            />
          </div>

          <div className="pl-4">
            {/* Seed Form */}
            <SeedForm
              template={selectedTemplate}
              selectedDataset={selectedDataset}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              onCancel={handleCancelGeneration}
              isParaphrasing={isParaphrasing}
              setIsParaphrasing={setIsParaphrasing}
            />

            {/* Variation Actions */}
            {(selectedCount > 0 || validVariationsCount > 0) && (
              <div className="mt-4">
                <VariationActions
                  saveButtonText={saveButtonText}
                  isSaveButtonDisabled={isSaveButtonDisabled || isGenerating || isParaphrasing}
                  onSave={handleSaveClick}
                  clearButtonText={clearButtonText}
                  isClearButtonDisabled={isClearButtonDisabled || isGenerating || isParaphrasing}
                  onClear={handleClear}
                />
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pt-4">
          <h3 className="text-lg font-medium mb-3">Generated Variations</h3>
          
          {/* Variation List */}
          {variations.length === 0 && !isGenerating ? (
            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <p className="text-gray-500">
                {selectedDataset?.archived
                  ? 'Generation is disabled for archived datasets.'
                  : 'Fill in the form and click "Generate" to create variations.'}
              </p>
            </div>
          ) : (
            <VariationList
              variations={variations}
              selectedVariations={selectedVariations}
              isParaphrasing={isParaphrasing}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onRegenerate={handleRegenerate}
              onDismiss={handleDismiss}
              onToolCallsChange={handleToolCallsChange}
              onOpenParaphraseModal={handleOpenParaphraseModal}
            />
          )}
        </div>
      </div>

      {/* Dataset Example Table */}
      {selectedDataset && (
        <DatasetExampleTable
          datasetId={selectedDataset.id}
          datasetName={selectedDataset.name}
          refreshTrigger={refreshExamplesTrigger}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

export default Generate;