import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
// Removed useOutletContext
import api from '../api/apiClient';
import SystemPromptEditor from './SystemPromptEditor';
import ModelSelector from './ModelSelector'; // Import ModelSelector

const TemplateBuilder = ({ context }) => { // Accept context as prop
  // Destructure selectedDataset from context
  const { selectedDataset } = context;
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [slots, setSlots] = useState([]);
  const [newSlot, setNewSlot] = useState('');
  const [isToolCallingTemplate, setIsToolCallingTemplate] = useState(false);
  const [toolDefinitions, setToolDefinitions] = useState([]);
  const [newToolName, setNewToolName] = useState('');
  const [newToolDescription, setNewToolDescription] = useState('');
  const [newToolParameters, setNewToolParameters] = useState('{}');
  const [modelOverride, setModelOverride] = useState(''); // Add state for model override

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
  }, []);

  // Populate form with selected template
  const populateForm = (template) => {
    if (template) {
      setName(template.name);
      setSystemPrompt(template.system_prompt);
      setUserPrompt(template.user_prompt);
      setSlots(template.slots);
      setIsToolCallingTemplate(template.is_tool_calling_template || false);
      setToolDefinitions(template.tool_definitions || []);
      setModelOverride(template.model_override || ''); // Populate model override
    } else {
      // Clear form
      setName('');
      setSystemPrompt('');
      setUserPrompt('');
      setSlots([]);
      setIsToolCallingTemplate(false);
      setToolDefinitions([]);
      setModelOverride(''); // Clear model override
    }
  };

  // Handle template selection
  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    populateForm(template);
  };

  // Handle template save
  const handleSaveTemplate = async () => {
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    
    setIsSaving(true);
    
    try {
      const templateData = {
        name,
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        slots,
        is_tool_calling_template: isToolCallingTemplate,
        tool_definitions: isToolCallingTemplate ? toolDefinitions : null,
        model_override: modelOverride || null // Include model override (send null if empty)
      };
      
      if (selectedTemplate) {
        // Update existing template with optimistic UI update
        const updatedTemplate = {
          ...selectedTemplate,
          ...templateData
        };
        
        // Update local state immediately for responsive UI
        setTemplates(templates.map(t => 
          t.id === selectedTemplate.id ? updatedTemplate : t
        ));
        
        // Update on server
        await api.updateTemplate(selectedTemplate.id, templateData);
        toast.success('Template updated successfully');
      } else {
        // Create placeholder template with temporary ID for responsive UI
        const temporaryTemplate = {
          id: `temp-${Date.now()}`,
          ...templateData,
          archived: false
        };
        
        // Update local state immediately
        setTemplates([temporaryTemplate, ...templates]);
        
        // Create on server
        const newTemplate = await api.createTemplate(templateData);
        setSelectedTemplate(newTemplate);
        toast.success('Template created successfully');
      }
      
      // Refresh templates to sync with server
      fetchTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error('Failed to save template');
      
      // Revert optimistic updates on error
      fetchTemplates();
    } finally {
      setIsSaving(false);
    }
  };

  // Handle template archive
  const handleArchiveTemplate = async () => {
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

  // Create a new template
  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    
    // Clear the current selection
    setSelectedTemplate(null);
    
    // Set the form with the new name and default values
    setName(newTemplateName);
    setSystemPrompt('');
    setUserPrompt('');
    setSlots([]);
    setModelOverride(''); // Clear model override for new template
    
    // Close the modal
    setIsModalOpen(false);
    setNewTemplateName('');
  };

  // Add tool definition
  const handleAddToolDefinition = () => {
    try {
      const parameters = JSON.parse(newToolParameters);
      
      if (!newToolName.trim()) {
        toast.error('Please enter a tool name');
        return;
      }
      
      const newTool = {
        name: newToolName,
        description: newToolDescription,
        parameters
      };
      
      setToolDefinitions([...toolDefinitions, newTool]);
      setNewToolName('');
      setNewToolDescription('');
      setNewToolParameters('{}');
    } catch (e) {
      toast.error('Invalid JSON for parameters');
    }
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

  return (
    <div className="grid grid-cols-4 gap-4 h-full">
      {/* Template Sidebar */}
      <div className="col-span-1 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Templates</h2>
          <button
            className="text-primary-600 hover:text-primary-800"
            onClick={() => setIsModalOpen(true)}
            title="Create new template"
          >
            ➕
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
                onClick={() => handleSelectTemplate(template)}
              >
                {typeof template.id === 'string' && template.id.startsWith('temp-') ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
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
      
      {/* Template Editor */}
      <div className="col-span-3 p-4 rounded-lg border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            {selectedTemplate ? 'Edit Template' : 'New Template'}
          </h2>
          
          <div className="space-x-2">
            {selectedTemplate && (
              <button
                className="px-3 py-1 text-red-600 hover:text-red-800 border border-red-200 rounded-md"
                onClick={handleArchiveTemplate}
                disabled={isSaving}
              >
                Archive
              </button>
            )}
            
            <button
              className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700"
              onClick={handleSaveTemplate}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
        
        {/* Template Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
              placeholder="Enter template name"
            />
          </div>

          {/* Model Override Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model Override (Optional)
            </label>
            <ModelSelector
              selectedModel={modelOverride}
              onModelChange={setModelOverride}
              allowNone={true} // Allow clearing the override
            />
            <p className="text-xs text-gray-500 mt-1">If set, this model will be used instead of your default generation model.</p>
          </div>
          
          <div>
            <SystemPromptEditor
              value={systemPrompt}
              onChange={setSystemPrompt}
              templateId={selectedTemplate?.id}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              User Prompt Template
            </label>
            <textarea
              id="user-prompt"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md h-32"
              placeholder="Enter user prompt with {slot} placeholders"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slots
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newSlot}
                onChange={(e) => setNewSlot(e.target.value)}
                className="flex-grow p-2 border border-gray-300 rounded-md"
                placeholder="New slot name"
              />
              <button
                className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                onClick={handleAddSlot}
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
                    className="text-gray-500 hover:text-gray-700"
                    onClick={() => handleRemoveSlot(slot)}
                    title="Remove slot"
                  >
                    ✕
                  </button>
                  <button
                    className="ml-1 text-primary-600 hover:text-primary-800"
                    onClick={() => handleInsertSlot(slot)}
                    title="Insert slot in template"
                  >
                    ↩
                  </button>
                </div>
              ))}
            </div>
          </div>
          
          {/* Tool Calling Toggle */}
          <div className="mb-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="toolCallingToggle"
                checked={isToolCallingTemplate}
                onChange={(e) => setIsToolCallingTemplate(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="toolCallingToggle" className="text-sm font-medium text-gray-700">
                Tool Calling Template
              </label>
            </div>
          </div>
          
          {/* Tool Definitions Section - only show if toolCallingTemplate is enabled */}
          {isToolCallingTemplate && (
            <div className="mb-4 p-3 border border-gray-200 rounded-md">
              <h3 className="text-md font-semibold mb-2">Tool Definitions</h3>
              
              {toolDefinitions.map((tool, index) => (
                <div key={index} className="p-2 mb-2 bg-gray-50 rounded border flex justify-between items-start">
                  <div>
                    <div className="font-medium">{tool.name}</div>
                    <div className="text-sm text-gray-600">{tool.description}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Parameters: {JSON.stringify(tool.parameters)}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRemoveToolDefinition(index)} 
                    className="text-red-600 hover:text-red-800"
                  >
                    ✕
                  </button>
                </div>
              ))}
              
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  placeholder="Tool Name"
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
                <input
                  type="text"
                  placeholder="Tool Description"
                  value={newToolDescription}
                  onChange={(e) => setNewToolDescription(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
                <textarea
                  placeholder="Parameters JSON Schema"
                  value={newToolParameters}
                  onChange={(e) => setNewToolParameters(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md h-24"
                />
                <button
                  onClick={handleAddToolDefinition}
                  className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                >
                  Add Tool
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preview
            </label>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
              {generatePreview()}
            </div>
          </div>
        </div>
      </div>
      
      {/* New Template Modal */}
      {isModalOpen && (
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
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                onClick={handleCreateTemplate}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateBuilder;