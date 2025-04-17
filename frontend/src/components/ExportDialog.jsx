import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api/apiClient';
import ExportTemplateManager from './ExportTemplateManager';

const ExportDialog = ({ isOpen, onClose, datasetId, datasetName }) => {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);

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
      setTemplates(response.items);
      
      // Preselect the raw format template
      const rawTemplate = response.items.find(t => t.format_name === 'raw' && t.is_default);
      if (rawTemplate) {
        setSelectedTemplateId(rawTemplate.id);
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Export Dataset</h2>
          
          <div className="mb-6">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600 mb-2">
                Select an export format for your dataset. Each format structures the data differently to match specific fine-tuning requirements.
              </p>
              <button
                onClick={() => setIsTemplateManagerOpen(true)}
                className="text-primary-600 hover:text-primary-800 text-sm flex items-center"
                title="Manage export templates"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage Templates
              </button>
            </div>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4">
                {templates.map(template => (
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
                        <div className="mt-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {template.format_name}
                          </span>
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
              
              <div className="pt-4 border-t border-gray-200 mt-6 flex justify-end space-x-3">
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
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Exporting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;