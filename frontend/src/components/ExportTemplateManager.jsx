import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import Icon from './Icons';

const ExportTemplateManager = ({ isOpen, onClose }) => {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    format_name: '',
    template: '',
    is_default: false
  });

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await api.getExportTemplates(1, 100);
      
      // Sort templates by various factors for better organization
      const sortedTemplates = [...response.items].sort((a, b) => {
        // First separate system vs user templates
        if (a.owner_id === null && b.owner_id !== null) return -1;
        if (a.owner_id !== null && b.owner_id === null) return 1;
        
        // Then prioritize default templates
        if (a.is_default && !b.is_default) return -1;
        if (!a.is_default && b.is_default) return 1;
        
        // Then group by format type
        const formatPriority = {
          'mlx-chat': 1,
          'mlx-instruct': 2,
          'openai-chatml': 3,
          'llama': 4,
          'tool-calling': 5,
          'raw': 6
        };
        
        const aPriority = formatPriority[a.format_name] || 100;
        const bPriority = formatPriority[b.format_name] || 100;
        
        if (aPriority !== bPriority) return aPriority - bPriority;
        
        // Finally sort by name
        return a.name.localeCompare(b.name);
      });
      
      setTemplates(sortedTemplates);
    } catch (error) {
      console.error('Failed to fetch export templates:', error);
      toast.error('Failed to load export templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (isEditing) {
      // Update existing template
      try {
        const response = await api.updateExportTemplate(selectedTemplate.id, formData);
        toast.success('Template updated successfully');
        
        // Update the template in the list
        setTemplates(templates.map(t => 
          t.id === response.id ? response : t
        ));
        
        resetForm();
      } catch (error) {
        console.error('Failed to update template:', error);
        toast.error('Failed to update template');
      }
    } else {
      // Create new template
      try {
        const response = await api.createExportTemplate(formData);
        toast.success('Template created successfully');
        
        // Add the new template to the list
        setTemplates([...templates, response]);
        
        resetForm();
      } catch (error) {
        console.error('Failed to create template:', error);
        toast.error('Failed to create template');
      }
    }
  };

  const handleEdit = (template) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      description: template.description,
      format_name: template.format_name,
      template: template.template,
      is_default: template.is_default
    });
    setIsEditing(true);
    setIsCreating(true);
  };

  const handleArchive = async (templateId) => {
    try {
      await api.archiveExportTemplate(templateId);
      toast.success('Template archived successfully');
      
      // Remove the template from the list
      setTemplates(templates.filter(t => t.id !== templateId));
    } catch (error) {
      console.error('Failed to archive template:', error);
      toast.error('Failed to archive template');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      format_name: '',
      template: '',
      is_default: false
    });
    setIsCreating(false);
    setIsEditing(false);
    setSelectedTemplate(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800">Export Templates</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <Icon name="close" className="h-6 w-6" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Template list */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-700">Available Templates</h3>
                <button
                  onClick={() => {
                    resetForm();
                    setIsCreating(true);
                  }}
                  className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm flex items-center"
                >
                  <Icon name="plus" className="w-4 h-4 mr-1" />
                  New Template
                </button>
              </div>
              
              {isLoading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : (
                <div className="space-y-4 pr-4 max-h-[60vh] overflow-y-auto">
                  {templates.map(template => (
                    <div
                      key={template.id}
                      className={`border rounded-lg p-4 hover:border-gray-300 transition-all ${
                        selectedTemplate?.id === template.id 
                          ? 'border-primary-500 bg-primary-50' 
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-800 flex items-center">
                            {template.name}
                            {template.is_default && (
                              <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
                                Default
                              </span>
                            )}
                          </h4>
                          <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                          <div className="mt-2 flex items-center flex-wrap gap-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {template.format_name}
                            </span>
                            
                            {/* Model Type Tags */}
                            {template.format_name === 'mlx-chat' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                MLX
                              </span>
                            )}
                            {template.format_name === 'mlx-instruct' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                MLX
                              </span>
                            )}
                            {template.format_name === 'openai-chatml' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                OpenAI
                              </span>
                            )}
                            {template.format_name === 'llama' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Llama/Mistral
                              </span>
                            )}
                            {template.format_name === 'tool-calling' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                Function Calling
                              </span>
                            )}
                            {template.format_name === 'raw' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                Generic
                              </span>
                            )}
                            
                            {/* Template Source Tag */}
                            {template.owner_id === null && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                System
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(template)}
                            className="text-primary-600 hover:text-primary-800"
                            title="Edit template"
                          >
                            <Icon name="cog" className="w-5 h-5" />
                          </button>
                          {template.owner_id !== null && (
                            <button
                              onClick={() => handleArchive(template.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Archive template"
                            >
                              <Icon name="trash" className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Template form */}
            <div>
              {isCreating ? (
                <div>
                  <h3 className="text-lg font-medium text-gray-700 mb-4">
                    {isEditing ? 'Edit Template' : 'Create New Template'}
                  </h3>
                  
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Template Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Format Name (e.g., "mlx-chat", "custom")
                      </label>
                      <input
                        type="text"
                        name="format_name"
                        value={formData.format_name}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Template (Jinja2 format)
                      </label>
                      <div className="text-xs text-gray-500 mb-2">
                        Available variables: system_prompt, user_prompt, slots, output, tool_calls, timestamp, dataset_name, dataset_id, example_id
                      </div>
                      <textarea
                        name="template"
                        value={formData.template}
                        onChange={handleInputChange}
                        rows={8}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        required
                      />
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="is_default"
                        id="is_default"
                        checked={formData.is_default}
                        onChange={handleInputChange}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label htmlFor="is_default" className="ml-2 block text-sm text-gray-700">
                        Set as default for this format
                      </label>
                    </div>
                    
                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        type="button"
                        onClick={resetForm}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-primary-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-primary-700"
                      >
                        {isEditing ? 'Update Template' : 'Create Template'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-6 bg-gray-50 rounded-lg h-full">
                  <Icon name="export" className="w-16 h-16 text-gray-400 mb-4" />
                  <h4 className="text-lg font-medium text-gray-700 mb-2">Create or Edit Templates</h4>
                  <p className="text-sm text-gray-500 text-center mb-4">
                    Create custom export templates to format your datasets exactly how you need them for fine-tuning.
                  </p>
                  <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm"
                  >
                    Create New Template
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportTemplateManager;