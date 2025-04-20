import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import SystemPromptEditor from './SystemPromptEditor';
import ModelSelector from './ModelSelector';
import ToggleSwitch from './ToggleSwitch';
import ConfirmationModal from './ConfirmationModal';
import Icon from './Icons';
import ToolParameterSchemaEditor from './ToolParameterSchemaEditor';
import _ from 'lodash';

// Default model parameters
const defaultModelParameters = {
  temperature: 1.0,
  top_p: 1.0,
  max_tokens: null,
};

// Template Sidebar Component
const TemplateSidebar = ({ templates, isLoading, selectedTemplate, onSelectTemplate, onCreateNew }) => {
  return (
    <div className="col-span-1 bg-gray-50 p-4 rounded-lg border border-gray-200">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Templates</h2>
        <button
          className="text-primary-600 hover:text-primary-800"
          onClick={onCreateNew}
          title="Create new template"
        >
          <Icon name="plus" className="h-5 w-5" />
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-4">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-4 text-gray-500">
          No templates available
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map(template => (
            <li
              key={template.id}
              className={`p-2 rounded-md cursor-pointer transition-all duration-200 ${
                selectedTemplate?.id === template.id
                  ? 'bg-primary-100 border-l-4 border-primary-500 translate-x-1 shadow-sm'
                  : 'hover:bg-gray-100 hover:translate-x-1 border-l-4 border-transparent'
              }`}
              onClick={() => onSelectTemplate(template)}
            >
              {typeof template.id === 'string' && template.id.startsWith('temp-') ? (
                <span className="flex items-center">
                  <Icon name="spinner" className="animate-spin h-5 w-5 mr-2" />
                  {template.name}
                </span>
              ) : (
                template.name
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Template Header Component
const TemplateHeader = ({ selectedTemplate, hasUnsavedChanges, isSaving, onSave, onArchive }) => {
  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 pt-4 pb-3 mb-4 -mx-4 px-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">
          {selectedTemplate ? 'Edit Template' : 'New Template'}
        </h2>

        <div className="space-x-2 flex items-center">
          {hasUnsavedChanges && (
            <>
              <span className="text-sm text-yellow-600 italic mr-2">Unsaved changes</span>
              <button
                className={`px-3 py-1 text-white rounded-md transition-colors duration-200 ${
                  'bg-primary-600 hover:bg-primary-700 animate-pulse'
                } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={onSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Template'}
              </button>
            </>
          )}
          {selectedTemplate && (
            <button
              className="px-3 py-1 text-red-600 hover:text-red-800 border border-red-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onArchive}
              disabled={isSaving}
            >
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Template Name Field Component
const TemplateNameField = ({ name, setName, nameError, isLoading, isSaving }) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Template Name <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (e.target.value.trim()) setNameError(false);
        }}
        className={`w-full p-2 border rounded-md disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 ${
          nameError ? 'border-red-300 bg-red-50' : 'border-gray-300'
        }`}
        placeholder="Enter template name"
        disabled={isLoading || isSaving}
        required
        aria-invalid={nameError}
        aria-describedby={nameError ? 'template-name-error' : undefined}
      />
      {nameError && (
        <p id="template-name-error" className="text-xs text-red-500 mt-1 font-medium">
          Template name is required.
        </p>
      )}
    </div>
  );
};

// Model Parameters Component
const ModelParametersSection = ({ modelParameters, handleParameterChange, isLoading, isSaving }) => {
  return (
    <div className="p-4 border border-gray-200 rounded-md space-y-3">
      <h3 className="text-md font-semibold text-gray-800 mb-2">Model Parameters</h3>
      <p className="text-xs text-gray-500 -mt-2 mb-3">Fine-tune model behavior. These override dataset defaults if set.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Temperature */}
        <div>
          <label htmlFor="temperature" className="block text-sm font-medium text-gray-700 mb-1">
            Temperature
          </label>
          <input
            type="number"
            id="temperature"
            value={modelParameters.temperature ?? ''}
            onChange={(e) => handleParameterChange('temperature', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
            placeholder="e.g., 0.7"
            min="0"
            max="2"
            step="0.1"
            disabled={isLoading || isSaving}
          />
          <p className="text-xs text-gray-500 mt-1">Controls randomness (0=deterministic, 2=max random). Default: 1.0</p>
        </div>

        {/* Top P */}
        <div>
          <label htmlFor="top_p" className="block text-sm font-medium text-gray-700 mb-1">
            Top P
          </label>
          <input
            type="number"
            id="top_p"
            value={modelParameters.top_p ?? ''}
            onChange={(e) => handleParameterChange('top_p', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
            placeholder="e.g., 0.9"
            min="0"
            max="1"
            step="0.05"
            disabled={isLoading || isSaving}
          />
          <p className="text-xs text-gray-500 mt-1">Nucleus sampling threshold. Default: 1.0</p>
        </div>

        {/* Max Tokens */}
        <div>
          <label htmlFor="max_tokens" className="block text-sm font-medium text-gray-700 mb-1">
            Max Tokens (Optional)
          </label>
          <input
            type="number"
            id="max_tokens"
            value={modelParameters.max_tokens ?? ''}
            onChange={(e) => handleParameterChange('max_tokens', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
            placeholder="e.g., 1024"
            min="1"
            step="1"
            disabled={isLoading || isSaving}
          />
          <p className="text-xs text-gray-500 mt-1">Max generation length. Leave blank for model default.</p>
        </div>
      </div>
    </div>
  );
};

// Prompt Masking Toggle Component
const PromptMaskingToggle = ({ showMasks, hasMasks, toggleMasks, isLoading, isSaving }) => {
  return (
    <div className="flex items-center justify-between mt-4 mb-2">
      <div>
        <span className="text-sm font-medium text-gray-700">Prompt Masking</span>
        <p className="text-xs text-gray-500">Enable mask fields to create alternate prompts for exports</p>
      </div>
      <div className="flex flex-col items-end">
        <button 
          className={`flex items-center px-3 py-1 rounded-md transition-colors duration-200 ${
            showMasks ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          } ${!hasMasks && !showMasks ? 'opacity-75' : 'opacity-100'}`}
          onClick={toggleMasks}
          title={showMasks ? "Turn off masking (will clear masks when saved)" : "Turn on masking"}
          disabled={isLoading || isSaving}
        >
          <Icon name={showMasks ? "check" : "sparkles"} className="h-4 w-4 mr-1" />
          {showMasks ? "Masking On" : (hasMasks ? "Masking Off" : "No Masks")}
        </button>
        {showMasks !== Boolean(hasMasks) && (
          <span className="text-xs text-amber-600 mt-1">Save template to {showMasks ? "keep" : "clear"} masks</span>
        )}
      </div>
    </div>
  );
};

// System Prompt Section Component
const SystemPromptSection = ({ systemPrompt, setSystemPrompt, systemPromptMask, setSystemPromptMask, showMasks, selectedTemplate, isLoading, isSaving }) => {
  return (
    <div className="space-y-2">
      <SystemPromptEditor
        value={systemPrompt}
        onChange={setSystemPrompt}
        templateId={selectedTemplate?.id}
        disabled={isLoading || isSaving}
        label={showMasks ? "System Prompt (Actual)" : "System Prompt"}
      />

      {showMasks && (
        <div className="mt-3">
          <div className="flex items-center">
            <label className="block text-sm font-medium text-indigo-600 mb-1">
              System Prompt Mask <span className="text-xs font-normal text-gray-500">(for exports)</span>
            </label>
            <button 
              className="ml-2 text-xs px-2 py-0.5 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"
              onClick={() => setSystemPromptMask(systemPrompt)}
              disabled={isLoading || isSaving}
            >
              Copy from actual
            </button>
          </div>
          <textarea
            value={systemPromptMask}
            onChange={(e) => setSystemPromptMask(e.target.value)}
            className="w-full p-2 border border-indigo-300 rounded-md h-32 disabled:bg-gray-100 bg-indigo-50"
            placeholder="Enter masked system prompt for exports (leave empty to use actual prompt)"
            disabled={isLoading || isSaving}
          />
          <p className="text-xs text-indigo-500 italic">This is what will appear in exported data instead of the actual system prompt.</p>
        </div>
      )}
    </div>
  );
};

// User Prompt Section Component
const UserPromptSection = ({ userPrompt, setUserPrompt, userPromptMask, setUserPromptMask, showMasks, isLoading, isSaving }) => {
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {showMasks ? "User Prompt Template (Actual)" : "User Prompt Template"}
        </label>
        <textarea
          id="user-prompt"
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md h-32 disabled:bg-gray-100"
          placeholder="Enter user prompt with {slot} placeholders"
          disabled={isLoading || isSaving}
        />
      </div>

      {showMasks && (
        <div className="mt-3">
          <div className="flex items-center">
            <label className="block text-sm font-medium text-indigo-600 mb-1">
              User Prompt Mask <span className="text-xs font-normal text-gray-500">(for exports)</span>
            </label>
            <button 
              className="ml-2 text-xs px-2 py-0.5 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"
              onClick={() => setUserPromptMask(userPrompt)}
              disabled={isLoading || isSaving}
            >
              Copy from actual
            </button>
          </div>
          <textarea
            id="user-prompt-mask"
            value={userPromptMask}
            onChange={(e) => setUserPromptMask(e.target.value)}
            className="w-full p-2 border border-indigo-300 rounded-md h-32 disabled:bg-gray-100 bg-indigo-50"
            placeholder="Enter masked user prompt for exports (leave empty to use actual prompt)"
            disabled={isLoading || isSaving}
          />
          <p className="text-xs text-indigo-500 italic">This is what will appear in exported data instead of the actual user prompt.</p>
        </div>
      )}
    </div>
  );
};

// Slots Management Component
const SlotManager = ({ slots, setSlots, newSlot, setNewSlot, handleAddSlot, handleRemoveSlot, handleInsertSlot, handleInsertSlotIntoMask, showMasks, isLoading, isSaving }) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Slots
      </label>
      <div className="flex space-x-2">
        <input
          type="text"
          value={newSlot}
          onChange={(e) => setNewSlot(e.target.value)}
          className="flex-grow p-2 border border-gray-300 rounded-md disabled:bg-gray-100"
          placeholder="New slot name"
          disabled={isLoading || isSaving}
        />
        <button
          className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
          onClick={handleAddSlot}
          disabled={isLoading || isSaving}
        >
          Add
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {slots.map(slot => (
          <div
            key={slot}
            className="flex items-center bg-gray-100 px-2 py-1 rounded-md"
          >
            <span className="mr-2">{slot}</span>
            <button
              className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
              onClick={() => handleRemoveSlot(slot)}
              title="Remove slot"
              disabled={isLoading || isSaving}
            >
              ✕
            </button>
            <button
              className="ml-1 text-primary-600 hover:text-primary-800 disabled:opacity-50"
              onClick={() => handleInsertSlot(slot)}
              title="Insert slot in template"
              disabled={isLoading || isSaving}
            >
              ↩
            </button>
            {showMasks && (
              <button
                className="ml-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                onClick={() => handleInsertSlotIntoMask(slot)}
                title="Insert slot in mask template"
                disabled={isLoading || isSaving}
              >
                ↩ to mask
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Tool Definition Component
const ToolDefinition = ({ tool, index, onRemove, isToolCallingTemplate, isLoading, isSaving }) => {
  return (
    <div className="p-3 bg-gray-50 rounded border border-gray-200 flex justify-between items-start shadow-sm">
      <div className="flex-1 mr-2">
        <div className="font-medium text-gray-800">{tool.name}</div>
        <div className="text-sm text-gray-600 mt-1">{tool.description}</div>
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Parameters Schema</summary>
          <pre className="mt-1 p-2 bg-gray-100 rounded text-gray-700 overflow-x-auto">
            {JSON.stringify(tool.parameters || {}, null, 2)}
          </pre>
        </details>
      </div>
      <button
        onClick={() => onRemove(index)}
        className="text-red-500 hover:text-red-700 text-xl font-light p-1 disabled:opacity-50"
        title="Remove tool"
        disabled={!isToolCallingTemplate || isLoading || isSaving}
      >
        &times;
      </button>
    </div>
  );
};

// Add Tool Form Component
const AddToolForm = ({ 
  newToolName, 
  setNewToolName, 
  newToolDescription, 
  setNewToolDescription, 
  newToolSchema, 
  setNewToolSchema, 
  newToolNameError,
  setNewToolNameError, 
  newToolDescriptionError,
  setNewToolDescriptionError, 
  handleAddToolDefinition, 
  isToolCallingTemplate, 
  isLoading, 
  isSaving 
}) => {
  return (
    <div className="p-4 border border-gray-200 rounded-md bg-white shadow-sm">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Add New Tool</h4>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tool Name <span className="text-red-500">*</span></label>
          <input
            type="text"
            placeholder="e.g., getWeather"
            value={newToolName}
            onChange={(e) => {
              setNewToolName(e.target.value);
              if (e.target.value.trim()) setNewToolNameError(false);
            }}
            className={`w-full p-2 border rounded-md text-sm disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 ${
              newToolNameError ? 'border-red-300 bg-red-50' : 'border-gray-300'
            }`}
            disabled={!isToolCallingTemplate || isLoading || isSaving}
            required
            aria-invalid={newToolNameError}
            aria-describedby={newToolNameError ? 'new-tool-name-error' : undefined}
          />
          {newToolNameError && (
            <p id="new-tool-name-error" className="text-xs text-red-500 mt-1 font-medium">
              Tool name is required.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tool Description <span className="text-red-500">*</span></label>
          <input
            type="text"
            placeholder="e.g., Gets the current weather for a location"
            value={newToolDescription}
            onChange={(e) => {
              setNewToolDescription(e.target.value);
              if (e.target.value.trim()) setNewToolDescriptionError(false);
            }}
            className={`w-full p-2 border rounded-md text-sm disabled:bg-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 ${
              newToolDescriptionError ? 'border-red-300 bg-red-50' : 'border-gray-300'
            }`}
            disabled={!isToolCallingTemplate || isLoading || isSaving}
            required
            aria-invalid={newToolDescriptionError}
            aria-describedby={newToolDescriptionError ? 'new-tool-desc-error' : undefined}
          />
          {newToolDescriptionError && (
            <p id="new-tool-desc-error" className="text-xs text-red-500 mt-1 font-medium">
              Tool description is required.
            </p>
          )}
        </div>
        <ToolParameterSchemaEditor
          value={newToolSchema}
          onChange={setNewToolSchema}
          disabled={!isToolCallingTemplate || isLoading || isSaving}
        />
      </div>
      <div className="border-t border-gray-200 mt-4 pt-3"></div>
      <button
        onClick={handleAddToolDefinition}
        className="px-4 mt-1 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm disabled:opacity-50"
        disabled={!isToolCallingTemplate || isLoading || isSaving}
      >
        Save Tool Definition
      </button>
    </div>
  );
};

// Tool Calling Section Component
const ToolCallingSection = ({ 
  isToolCallingTemplate, 
  setIsToolCallingTemplate, 
  toolDefinitions, 
  handleRemoveToolDefinition, 
  newToolName,
  setNewToolName,
  newToolDescription,
  setNewToolDescription,
  newToolSchema,
  setNewToolSchema,
  newToolNameError,
  setNewToolNameError,
  newToolDescriptionError,
  setNewToolDescriptionError,
  handleAddToolDefinition,
  isLoading, 
  isSaving 
}) => {
  return (
    <div className="space-y-4 p-4 border border-gray-200 rounded-md">
      <div className="flex items-center justify-between">
        <div>
          <label htmlFor="toolCallingToggle" className="text-md font-semibold text-gray-800">
            Enable Tool Calling
          </label>
          <p className="text-sm text-gray-500">Allow the model to call predefined functions during generation.</p>
        </div>
        <ToggleSwitch
          id="toolCallingToggle"
          checked={isToolCallingTemplate}
          onChange={setIsToolCallingTemplate}
          disabled={isLoading || isSaving}
        />
      </div>

      <div
        className={`overflow-hidden transition-all duration-500 ease-in-out ${
          isToolCallingTemplate ? 'max-h-[1000px] opacity-100 pt-4' : 'max-h-0 opacity-0 pt-0'
        }`}
        style={{ borderTop: isToolCallingTemplate ? '1px solid #e5e7eb' : 'none' }}
      >
        <div className={`space-y-4 ${isLoading || isSaving ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <h3 className="text-md font-semibold text-gray-700">Tool Definitions</h3>

          {toolDefinitions.length === 0 && isToolCallingTemplate && (
            <p className="text-sm text-gray-500 italic">No tools defined yet. Add one below.</p>
          )}
          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            {toolDefinitions.map((tool, index) => (
              <ToolDefinition 
                key={tool.id || index} 
                tool={tool} 
                index={index} 
                onRemove={handleRemoveToolDefinition} 
                isToolCallingTemplate={isToolCallingTemplate}
                isLoading={isLoading}
                isSaving={isSaving}
              />
            ))}
          </div>

          <div className="pt-4 border-t border-gray-200">
            <AddToolForm 
              newToolName={newToolName}
              setNewToolName={setNewToolName}
              newToolDescription={newToolDescription}
              setNewToolDescription={setNewToolDescription}
              newToolSchema={newToolSchema}
              setNewToolSchema={setNewToolSchema}
              newToolNameError={newToolNameError}
              setNewToolNameError={setNewToolNameError}
              newToolDescriptionError={newToolDescriptionError}
              setNewToolDescriptionError={setNewToolDescriptionError}
              handleAddToolDefinition={handleAddToolDefinition}
              isToolCallingTemplate={isToolCallingTemplate}
              isLoading={isLoading}
              isSaving={isSaving}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Template Preview Component
const TemplatePreview = ({ showMasks, hasMasks, generatePreview, generateMaskPreview, setShowMasks }) => {
  return (
    <div>
      <div className="flex items-center border-b border-gray-200 mb-2">
        <div 
          className={`px-4 py-2 font-medium text-sm border-b-2 cursor-pointer ${!showMasks ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setShowMasks(false)}
        >
          Actual Preview
        </div>
        {hasMasks && (
          <div 
            className={`px-4 py-2 font-medium text-sm border-b-2 cursor-pointer ${showMasks ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setShowMasks(true)}
          >
            Masked Preview
          </div>
        )}
      </div>
      
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-md min-h-[100px]">
        <h4 className="text-xs font-semibold mb-1">{!showMasks ? 'Actual User Prompt Preview' : 'Masked User Prompt Preview'}</h4>
        <div className="text-sm">
          {!showMasks ? generatePreview() : generateMaskPreview()}
        </div>
        {showMasks && hasMasks && (
          <p className="text-xs text-indigo-500 italic mt-2">This is how the prompts will appear in exported data.</p>
        )}
      </div>
    </div>
  );
};

// New Template Modal Component
const NewTemplateModal = ({ isOpen, newTemplateName, setNewTemplateName, onClose, onCreate }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 className="text-lg font-medium mb-4">Create New Template</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template Name
          </label>
          <input
            type="text"
            className="w-full p-2 border border-gray-300 rounded-md"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="Enter template name"
          />
        </div>

        <div className="flex justify-end space-x-2">
          <button
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            onClick={onCreate}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

const TemplateBuilder = ({ context }) => {
  const { selectedDataset } = context;
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Validation state
  const [nameError, setNameError] = useState(false);
  const [newToolNameError, setNewToolNameError] = useState(false);
  const [newToolDescriptionError, setNewToolDescriptionError] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [systemPromptMask, setSystemPromptMask] = useState('');
  const [userPromptMask, setUserPromptMask] = useState('');
  const [showMasks, setShowMasks] = useState(false);
  
  const [slots, setSlots] = useState([]);
  const [newSlot, setNewSlot] = useState('');
  const [isToolCallingTemplate, setIsToolCallingTemplate] = useState(false);
  const [toolDefinitions, setToolDefinitions] = useState([]);
  const [newToolName, setNewToolName] = useState('');
  const [newToolDescription, setNewToolDescription] = useState('');
  const [newToolSchema, setNewToolSchema] = useState({ type: 'object', properties: {}, required: [] });
  const [modelOverride, setModelOverride] = useState('');
  const [modelParameters, setModelParameters] = useState(_.cloneDeep(defaultModelParameters));

  // Helper function to get current form state as an object
  const getCurrentFormData = useCallback(() => {
    const parseNullableInt = (value) => {
      const num = parseInt(value, 10);
      return isNaN(num) ? null : num;
    };
    const parseNullableFloat = (value) => {
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    };

    return {
      name,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      system_prompt_mask: systemPromptMask || null,
      user_prompt_mask: userPromptMask || null,
      slots: [...slots].sort(),
      is_tool_calling_template: isToolCallingTemplate,
      tool_definitions: isToolCallingTemplate
        ? _.cloneDeep(toolDefinitions).map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: 'object', properties: {}, required: [] }
          })).sort((a, b) => a.name.localeCompare(b.name))
        : null,
      model_override: modelOverride || null,
      model_parameters: {
        temperature: parseNullableFloat(modelParameters.temperature) ?? defaultModelParameters.temperature,
        top_p: parseNullableFloat(modelParameters.top_p) ?? defaultModelParameters.top_p,
        max_tokens: parseNullableInt(modelParameters.max_tokens),
      }
    };
  }, [name, systemPrompt, userPrompt, systemPromptMask, userPromptMask, slots, isToolCallingTemplate, toolDefinitions, modelOverride, modelParameters]);

  // Fetch templates from API
  const fetchTemplates = async () => {
    setIsLoading(true);

    try {
      const data = await api.getTemplates();
      setTemplates(data);

      // Select the first template if none is selected
      if (!selectedTemplate && data.length > 0) {
        setSelectedTemplate(data[0]);
        populateForm(data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  // Load templates on initial render
  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Populate form with selected template
  const populateForm = (template) => {
    if (template) {
      setName(template.name);
      setSystemPrompt(template.system_prompt);
      setUserPrompt(template.user_prompt);
      setSystemPromptMask(template.system_prompt_mask || '');
      setUserPromptMask(template.user_prompt_mask || '');
      setShowMasks(Boolean(template.system_prompt_mask || template.user_prompt_mask));
      setSlots(template.slots || []);
      setIsToolCallingTemplate(template.is_tool_calling_template || false);
      setToolDefinitions(_.cloneDeep(template.tool_definitions || []));
      setModelOverride(template.model_override || '');
      setModelParameters({
        ..._.cloneDeep(defaultModelParameters),
        ...(template.model_parameters || {})
      });
      setHasUnsavedChanges(false);
      setNameError(false);
      setNewToolNameError(false);
      setNewToolDescriptionError(false);
    } else {
      // Clear form
      setName('');
      setSystemPrompt('');
      setUserPrompt('');
      setSystemPromptMask('');
      setUserPromptMask('');
      setShowMasks(false);
      setSlots([]);
      setIsToolCallingTemplate(false);
      setToolDefinitions([]);
      setModelOverride('');
      setModelParameters(_.cloneDeep(defaultModelParameters));
      setHasUnsavedChanges(false);
      setNameError(false);
      setNewToolNameError(false);
      setNewToolDescriptionError(false);
    }
  };

  // Check for unsaved changes whenever form fields change
  useEffect(() => {
    if (isLoading) return;

    const currentData = getCurrentFormData();
    let originalData;

    if (selectedTemplate) {
      // Normalize the selected template data for comparison
      originalData = {
        name: selectedTemplate.name,
        system_prompt: selectedTemplate.system_prompt,
        user_prompt: selectedTemplate.user_prompt,
        system_prompt_mask: selectedTemplate.system_prompt_mask || null,
        user_prompt_mask: selectedTemplate.user_prompt_mask || null,
        slots: [...(selectedTemplate.slots || [])].sort(),
        is_tool_calling_template: selectedTemplate.is_tool_calling_template || false,
        tool_definitions: selectedTemplate.is_tool_calling_template
          ? _.cloneDeep(selectedTemplate.tool_definitions || []).map(tool => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters || { type: 'object', properties: {}, required: [] }
            })).sort((a, b) => a.name.localeCompare(b.name))
          : null,
        model_override: selectedTemplate.model_override || null,
        model_parameters: {
          ..._.cloneDeep(defaultModelParameters),
          ...(selectedTemplate.model_parameters || {})
        }
      };
      // Ensure numeric types match for comparison
      originalData.model_parameters.temperature = parseFloat(originalData.model_parameters.temperature);
      originalData.model_parameters.top_p = parseFloat(originalData.model_parameters.top_p);
      originalData.model_parameters.max_tokens = originalData.model_parameters.max_tokens === null ? null : parseInt(originalData.model_parameters.max_tokens, 10);

    } else {
      // If no template is selected, compare against empty state
      originalData = {
        name: '',
        system_prompt: '',
        user_prompt: '',
        system_prompt_mask: null,
        user_prompt_mask: null,
        slots: [],
        is_tool_calling_template: false,
        tool_definitions: null,
        model_override: null,
        model_parameters: _.cloneDeep(defaultModelParameters)
      };
    }

    // Use lodash's isEqual for deep comparison
    const changed = !_.isEqual(currentData, originalData);

    // Special case: if no template is selected but a name exists, it's unsaved
    if (!selectedTemplate && name.trim()) {
      setHasUnsavedChanges(true);
    } else {
      setHasUnsavedChanges(changed);
    }

  }, [name, systemPrompt, userPrompt, systemPromptMask, userPromptMask, slots, isToolCallingTemplate, toolDefinitions, modelOverride, modelParameters, selectedTemplate, isLoading, getCurrentFormData]);

  // Handle template selection
  const handleSelectTemplate = (template) => {
    // Check for unsaved changes before switching
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to switch templates? Your changes will be lost.')) {
        return;
      }
    }
    setSelectedTemplate(template);
    populateForm(template);
    setNameError(false);
    setNewToolNameError(false);
    setNewToolDescriptionError(false);
  };

  // Handle template save
  const handleSaveTemplate = async () => {
    // Validate name
    if (!name.trim()) {
      toast.error('Template Name cannot be empty.');
      setNameError(true);
      return;
    }
    setNameError(false);

    // Add validation for tool definitions
    if (isToolCallingTemplate) {
      for (const tool of toolDefinitions) {
        if (!tool.name || !tool.description) {
          toast.error(`A tool definition is missing a name or description. Please fix it before saving.`);
          return;
        }
      }
    }

    setIsSaving(true);
    setHasUnsavedChanges(false);

    try {
      const templateData = getCurrentFormData();

      if (selectedTemplate) {
        // Update existing template
        const updatedTemplate = await api.updateTemplate(selectedTemplate.id, templateData);

        // Update local state
        setTemplates(templates.map(t =>
          t.id === selectedTemplate.id ? updatedTemplate : t
        ));
        setSelectedTemplate(updatedTemplate);
        toast.success('Template updated successfully');
        populateForm(updatedTemplate);
        setHasUnsavedChanges(false);

      } else {
        // Create new template
        const newTemplate = await api.createTemplate(templateData);
        setTemplates([newTemplate, ...templates]);
        setSelectedTemplate(newTemplate);
        toast.success('Template created successfully');
        populateForm(newTemplate);
        setHasUnsavedChanges(false);
      }
      // Reset validation errors
      setNameError(false);
      setNewToolNameError(false);
      setNewToolDescriptionError(false);

    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error(`Failed to save template: ${error.message || 'Unknown error'}`);
      setHasUnsavedChanges(true);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle template archive
  const confirmArchiveTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      await api.archiveTemplate(selectedTemplate.id);

      // Clear selection
      setSelectedTemplate(null);
      populateForm(null);

      // Refresh templates
      fetchTemplates();

      toast.success('Template archived successfully');
    } catch (error) {
      console.error('Failed to archive template:', error);
      toast.error('Failed to archive template');
    } finally {
      setIsArchiveConfirmOpen(false);
    }
  };

  // Open archive confirmation modal
  const handleArchiveClick = () => {
    if (selectedTemplate) {
      setIsArchiveConfirmOpen(true);
    }
  };

  // Add a new slot
  const handleAddSlot = () => {
    if (!newSlot.trim()) {
      toast.error('Please enter a slot name');
      return;
    }

    // Check for duplicates
    if (slots.includes(newSlot)) {
      toast.error('Slot already exists');
      return;
    }

    setSlots([...slots, newSlot]);
    setNewSlot('');
  };

  // Remove a slot
  const handleRemoveSlot = (slotToRemove) => {
    setSlots(slots.filter(slot => slot !== slotToRemove));
  };

  // Insert a slot into the userPrompt
  const handleInsertSlot = (slot) => {
    const cursorPos = document.getElementById('user-prompt').selectionStart;
    const textBefore = userPrompt.substring(0, cursorPos);
    const textAfter = userPrompt.substring(cursorPos);
    setUserPrompt(`${textBefore}{${slot}}${textAfter}`);
  };

  // Insert a slot into the userPromptMask
  const handleInsertSlotIntoMask = (slot) => {
    const cursorPos = document.getElementById('user-prompt-mask').selectionStart;
    const textBefore = userPromptMask.substring(0, cursorPos);
    const textAfter = userPromptMask.substring(cursorPos);
    setUserPromptMask(`${textBefore}{${slot}}${textAfter}`);
  };

  // Create a new template
  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    // Check for unsaved changes
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to create a new template? Your current changes will be lost.')) {
        return;
      }
    }

    // Clear selection and set form with new name
    setSelectedTemplate(null);
    setName(newTemplateName);
    setSystemPrompt('');
    setUserPrompt('');
    setSystemPromptMask('');
    setUserPromptMask('');
    setSlots([]);
    setIsToolCallingTemplate(false);
    setToolDefinitions([]);
    setModelOverride('');
    setModelParameters(_.cloneDeep(defaultModelParameters));
    setHasUnsavedChanges(true);
    setNameError(false);
    setNewToolNameError(false);
    setNewToolDescriptionError(false);
    
    // Reset tool form fields
    setNewToolName('');
    setNewToolDescription('');
    setNewToolSchema({ type: 'object', properties: {}, required: [] });

    // Close modal
    setIsModalOpen(false);
    setNewTemplateName('');
  };

  // Add tool definition
  const handleAddToolDefinition = () => {
    let isValid = true;
    
    // Validate tool name
    if (!newToolName.trim()) {
      toast.error('Tool Name cannot be empty.');
      setNewToolNameError(true);
      isValid = false;
    } else {
      setNewToolNameError(false);
    }

    // Validate tool description
    if (!newToolDescription.trim()) {
      toast.error('Tool Description cannot be empty.');
      setNewToolDescriptionError(true);
      isValid = false;
    } else {
      setNewToolDescriptionError(false);
    }

    if (!isValid) {
      return;
    }

    const newTool = {
      id: `tool-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: newToolName,
      description: newToolDescription,
      parameters: newToolSchema
    };

    setToolDefinitions([...toolDefinitions, newTool]);
    setNewToolName('');
    setNewToolDescription('');
    setNewToolSchema({ type: 'object', properties: {}, required: [] });
    setNewToolNameError(false);
    setNewToolDescriptionError(false);
  };

  // Remove tool definition
  const handleRemoveToolDefinition = (index) => {
    const newTools = [...toolDefinitions];
    newTools.splice(index, 1);
    setToolDefinitions(newTools);
  };

  // Generate a preview with sample values for slots
  const generatePreview = () => {
    let preview = userPrompt;

    slots.forEach(slot => {
      const placeholder = `Sample ${slot}`;
      preview = preview.replace(new RegExp(`{${slot}}`, 'g'), placeholder);
    });

    return preview;
  };

  // Generate a preview for mask field
  const generateMaskPreview = () => {
    let preview = userPromptMask || userPrompt;

    slots.forEach(slot => {
      const placeholder = `Sample ${slot}`;
      preview = preview.replace(new RegExp(`{${slot}}`, 'g'), placeholder);
    });

    return preview;
  };

  // Handle toggle masks visibility
  const toggleMasks = () => {
    const newMasksState = !showMasks;
    setShowMasks(newMasksState);
    
    // Initialize with actual prompts if turning on masks
    if (newMasksState) {
      if (!systemPromptMask) {
        setSystemPromptMask(systemPrompt);
      }
      if (!userPromptMask) {
        setUserPromptMask(userPrompt);
      }
    }
  };
  
  // Check if masks have been defined
  const hasMasks = Boolean(systemPromptMask || userPromptMask);

  // Handle model parameter changes
  const handleParameterChange = (param, value) => {
    setModelParameters(prev => ({ ...prev, [param]: value }));
  };

  return (
    <div className="grid grid-cols-4 gap-4 h-full m-4">
      {/* Template Sidebar */}
      <TemplateSidebar 
        templates={templates}
        isLoading={isLoading}
        selectedTemplate={selectedTemplate}
        onSelectTemplate={handleSelectTemplate}
        onCreateNew={() => setIsModalOpen(true)}
      />

      {/* Template Editor */}
      <div className="col-span-3 p-4 pt-0 rounded-lg border border-gray-200 relative overflow-y-auto h-full">
        {/* Sticky Header */}
        <TemplateHeader 
          selectedTemplate={selectedTemplate}
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={isSaving}
          onSave={handleSaveTemplate}
          onArchive={handleArchiveClick}
        />

        {/* Template Form */}
        <div className="space-y-4">
          <TemplateNameField 
            name={name}
            setName={setName}
            nameError={nameError}
            isLoading={isLoading}
            isSaving={isSaving}
          />

          {/* Model Override Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model Override (Optional)
            </label>
            <ModelSelector
              selectedModel={modelOverride}
              onModelChange={setModelOverride}
              allowNone={true}
              disabled={isLoading || isSaving}
            />
            <p className="text-xs text-gray-500 mt-1">If set, this model will be used instead of your default generation model.</p>
          </div>

          {/* Model Parameters Section */}
          <ModelParametersSection 
            modelParameters={modelParameters}
            handleParameterChange={handleParameterChange}
            isLoading={isLoading}
            isSaving={isSaving}
          />

          {/* Prompt Masking Toggle */}
          <PromptMaskingToggle 
            showMasks={showMasks}
            hasMasks={hasMasks}
            toggleMasks={toggleMasks}
            isLoading={isLoading}
            isSaving={isSaving}
          />

          {/* System Prompt Section */}
          <SystemPromptSection 
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            systemPromptMask={systemPromptMask}
            setSystemPromptMask={setSystemPromptMask}
            showMasks={showMasks}
            selectedTemplate={selectedTemplate}
            isLoading={isLoading}
            isSaving={isSaving}
          />

          {/* User Prompt Section */}
          <UserPromptSection 
            userPrompt={userPrompt}
            setUserPrompt={setUserPrompt}
            userPromptMask={userPromptMask}
            setUserPromptMask={setUserPromptMask}
            showMasks={showMasks}
            isLoading={isLoading}
            isSaving={isSaving}
          />

          {/* Slots Management */}
          <SlotManager 
            slots={slots}
            setSlots={setSlots}
            newSlot={newSlot}
            setNewSlot={setNewSlot}
            handleAddSlot={handleAddSlot}
            handleRemoveSlot={handleRemoveSlot}
            handleInsertSlot={handleInsertSlot}
            handleInsertSlotIntoMask={handleInsertSlotIntoMask}
            showMasks={showMasks}
            isLoading={isLoading}
            isSaving={isSaving}
          />

          {/* Tool Calling Section */}
          <ToolCallingSection 
            isToolCallingTemplate={isToolCallingTemplate}
            setIsToolCallingTemplate={setIsToolCallingTemplate}
            toolDefinitions={toolDefinitions}
            handleRemoveToolDefinition={handleRemoveToolDefinition}
            newToolName={newToolName}
            setNewToolName={setNewToolName}
            newToolDescription={newToolDescription}
            setNewToolDescription={setNewToolDescription}
            newToolSchema={newToolSchema}
            setNewToolSchema={setNewToolSchema}
            newToolNameError={newToolNameError}
            setNewToolNameError={setNewToolNameError}
            newToolDescriptionError={newToolDescriptionError}
            setNewToolDescriptionError={setNewToolDescriptionError}
            handleAddToolDefinition={handleAddToolDefinition}
            isLoading={isLoading}
            isSaving={isSaving}
          />

          {/* Preview Section */}
          <TemplatePreview 
            showMasks={showMasks}
            hasMasks={hasMasks}
            generatePreview={generatePreview}
            generateMaskPreview={generateMaskPreview}
            setShowMasks={setShowMasks}
          />
        </div>
      </div>

      {/* New Template Modal */}
      <NewTemplateModal 
        isOpen={isModalOpen}
        newTemplateName={newTemplateName}
        setNewTemplateName={setNewTemplateName}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateTemplate}
      />

      {/* Archive Confirmation Modal */}
      <ConfirmationModal
        isOpen={isArchiveConfirmOpen}
        onClose={() => setIsArchiveConfirmOpen(false)}
        onConfirm={confirmArchiveTemplate}
        title="Confirm Archive"
        message={
          selectedTemplate ? (
            <>
              Are you sure you want to archive the template "<strong>{selectedTemplate.name}</strong>"?
              This action cannot be undone directly.
            </>
          ) : ''
        }
        confirmButtonText="Confirm Archive"
        confirmButtonVariant="danger"
      />
    </div>
  );
};

export default TemplateBuilder;