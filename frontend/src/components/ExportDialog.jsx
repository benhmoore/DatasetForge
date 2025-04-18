import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import ExportTemplateManager from './ExportTemplateManager';
import Icon from './Icons';

const ExportDialog = ({ isOpen, onClose, datasetId, datasetName }) => {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [formatFilter, setFormatFilter] = useState('all');

  // Fetch templates when dialog opens or when template manager closes
  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen, isTemplateManagerOpen]);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await api.getExportTemplates(1, 100);
      
      // Sort templates to show defaults first, grouped by similar formats
      const sortedTemplates = [...response.items].sort((a, b) => {
        // First prioritize default templates
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
        
        return aPriority - bPriority;
      });
      
      setTemplates(sortedTemplates);
      
      // Preselect the first default template or first template if no defaults
      const defaultTemplate = sortedTemplates.find(t => t.is_default) || sortedTemplates[0];
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
      }
    } catch (error) {
      console.error('Failed to fetch export templates:', error);
      toast.error('Failed to load export formats');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    if (!datasetId) return;
    
    setIsExporting(true);
    
    try {
      const data = await api.exportDataset(datasetId, selectedTemplateId);
      
      // Create a blob and download link
      const blob = new Blob([data], { type: 'application/jsonl' });
      const url = URL.createObjectURL(blob);
      
      // Create a temporary download link
      const a = document.createElement('a');
      a.href = url;
      
      // Format name for filename
      let filename = `dataset-${datasetId}`;
      if (datasetName) {
        // Add sanitized dataset name (replace spaces and special chars)
        filename += `-${datasetName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
      }
      
      // Add format name if a template is selected
      if (selectedTemplateId) {
        const template = templates.find(t => t.id === selectedTemplateId);
        if (template) {
          filename += `-${template.format_name}`;
        }
      }
      
      a.download = `${filename}.jsonl`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Dataset exported successfully');
      onClose();
    } catch (error) {
      console.error('Failed to export dataset:', error);
      toast.error('Failed to export dataset');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;
  
  // Render the template manager when it's open
  if (isTemplateManagerOpen) {
    return (
      <ExportTemplateManager 
        isOpen={isTemplateManagerOpen} 
        onClose={() => setIsTemplateManagerOpen(false)} 
      />
    );
  }

  // Define filter options
  const filterOptions = [
    { value: 'all', label: 'All Formats', color: 'gray' },
    { value: 'mlx', label: 'MLX', color: 'purple' },
    { value: 'openai', label: 'OpenAI', color: 'green' },
    { value: 'llama', label: 'Llama/Mistral', color: 'yellow' },
    { value: 'tool', label: 'Function Calling', color: 'indigo' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full flex flex-col max-h-[90vh]">
        {/* Fixed Header */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Export Dataset</h2>
          
          <div className="mb-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600 mb-2">
                Select an export format for your dataset. Each format structures the data differently to match specific fine-tuning requirements.
              </p>
              <button
                onClick={() => setIsTemplateManagerOpen(true)}
                className="text-primary-600 hover:text-primary-800 text-sm flex items-center"
                title="Manage export templates"
              >
                <Icon name="cog" className="w-4 h-4 mr-1" />
                Manage Templates
              </button>
            </div>
          </div>
          
          {/* Quick Format Filter */}
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Format:</label>
            <div className="flex flex-wrap gap-2">
              {filterOptions.map(option => {
                // Explicitly define background and text colors for each state
                const selectedClasses = {
                  all: 'bg-gray-600 text-white border-gray-600',
                  mlx: 'bg-purple-600 text-white border-purple-600',
                  openai: 'bg-green-600 text-white border-green-600',
                  llama: 'bg-yellow-600 text-white border-yellow-600',
                  tool: 'bg-indigo-600 text-white border-indigo-600'
                };
                
                return (
                  <button
                    key={option.value}
                    onClick={() => setFormatFilter(option.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 border ${
                      formatFilter === option.value 
                        ? selectedClasses[option.value] + ' shadow-sm'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4">
                {templates
                  .filter(template => {
                    if (formatFilter === 'all') return true;
                    if (formatFilter === 'mlx' && (template.format_name === 'mlx-chat' || template.format_name === 'mlx-instruct')) return true;
                    if (formatFilter === 'openai' && template.format_name === 'openai-chatml') return true;
                    if (formatFilter === 'llama' && template.format_name === 'llama') return true;
                    if (formatFilter === 'tool' && template.format_name === 'tool-calling') return true;
                    return false;
                  })
                  .map(template => (
                  <div 
                    key={template.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedTemplateId === template.id 
                        ? 'border-primary-500 bg-primary-50 shadow-md' 
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedTemplateId(template.id)}
                  >
                    <div className="flex items-start">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-800 flex items-center">
                          {template.name}
                          {template.is_default && (
                            <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
                              Default
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {/* Format Tag */}
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {template.format_name}
                          </span>
                          
                          {/* Model Tags */}
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
                        </div>
                      </div>
                      <div className="flex items-center ml-4">
                        <input
                          type="radio"
                          checked={selectedTemplateId === template.id}
                          onChange={() => setSelectedTemplateId(template.id)}
                          className="h-5 w-5 text-primary-600 focus:ring-primary-500 border-gray-300"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Fixed Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
          <button
            type="button"
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-primary-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            onClick={handleExport}
            disabled={isExporting || !selectedTemplateId}
          >
            {isExporting ? (
              <>
                <Icon name="spinner" className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
                Exporting...
              </>
            ) : (
              <>
                <Icon name="download" className="w-4 h-4 mr-1" />
                Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;