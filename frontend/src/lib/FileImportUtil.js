// FileImportUtil.js
// Utility functions for importing file content into seed slots

import { toast } from 'react-toastify';

/**
 * Handles importing a text file and returns its content
 * 
 * @param {Object} options - Import options
 * @param {Array<string>} [options.acceptTypes=['.md','.txt','.json','.csv','.text','.markdown','.html']] - Acceptable file extensions
 * @param {Function} options.onSuccess - Callback function when file is successfully imported (content) => void
 * @param {Function} [options.onError] - Optional callback function for handling errors (error) => void
 */
export const importTextFile = (options) => {
  const {
    acceptTypes = ['.md','.txt','.json','.csv','.text','.markdown','.html'],
    onSuccess,
    onError
  } = options;
  
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = acceptTypes.join(',');
  
  input.onchange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Check if file is text-based by MIME type
    const validTextTypes = [
      'text/plain', 
      'text/markdown', 
      'text/csv', 
      'text/html', 
      'application/json',
      'application/x-md',
      'application/markdown'
    ];
    
    // Also allow any type with no specified MIME type but valid extension
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTextTypes.includes(file.type) && !acceptTypes.includes(fileExtension)) {
      const errorMessage = `Unsupported file type. Please select a supported text file (${acceptTypes.join(', ')}).`;
      toast.error(errorMessage);
      if (onError) onError(new Error(errorMessage));
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
          throw new Error("Failed to read file content.");
        }
        
        onSuccess(content, file);
      } catch (error) {
        console.error("Error importing file content:", error);
        toast.error(`Failed to import file: ${error.message || "Unknown error"}`);
        if (onError) onError(error);
      }
    };
    
    reader.onerror = (e) => {
      console.error("Error reading file:", e);
      toast.error("Failed to read the selected file.");
      if (onError) onError(new Error("Failed to read the selected file."));
    };
    
    reader.readAsText(file);
  };
  
  input.click();
};