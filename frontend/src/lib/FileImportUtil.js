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
 * @param {boolean} [options.multiple=false] - Whether to allow multiple file selection
 */
export const importTextFile = (options) => {
  const {
    acceptTypes = ['.md','.txt','.json','.csv','.text','.markdown','.html'],
    onSuccess,
    onError,
    multiple = false
  } = options;
  
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = acceptTypes.join(',');
  input.multiple = multiple; // Enable/disable multiple file selection
  
  input.onchange = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    // For single file mode, just process one file
    if (!multiple) {
      processFile(files[0]);
      return;
    }
    
    // For multiple files mode, process all files
    const validFiles = [];
    let errorCount = 0;
    
    // Process files sequentially with Promise.all to track all results
    Promise.all(files.map(file => {
      return new Promise(resolve => {
        validateAndReadFile(file, 
          (content) => {
            validFiles.push({ file, content });
            resolve();
          },
          () => {
            errorCount++;
            resolve();
          }
        );
      });
    })).then(() => {
      // After all files are processed, call the success handler with the array of valid files
      if (validFiles.length > 0) {
        onSuccess(validFiles.map(item => item.content), validFiles.map(item => item.file));
        
        // Show summary toast
        if (errorCount > 0) {
          toast.warning(`Imported ${validFiles.length} files. ${errorCount} file(s) were skipped due to errors.`);
        } else {
          toast.success(`Successfully imported ${validFiles.length} files.`);
        }
      } else if (errorCount > 0) {
        toast.error(`Failed to import any of the ${errorCount} selected files.`);
        if (onError) onError(new Error("No valid files were imported."));
      }
    });
  };
  
  function validateAndReadFile(file, onSuccess, onError) {
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
      const errorMessage = `Skipped "${file.name}": Unsupported file type.`;
      toast.warning(errorMessage);
      if (onError) onError(new Error(errorMessage));
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
          throw new Error(`Failed to read file content from "${file.name}".`);
        }
        
        onSuccess(content);
      } catch (error) {
        console.error(`Error importing file ${file.name}:`, error);
        toast.error(`Failed to import "${file.name}": ${error.message || "Unknown error"}`);
        if (onError) onError(error);
      }
    };
    
    reader.onerror = (e) => {
      console.error(`Error reading file ${file.name}:`, e);
      toast.error(`Failed to read "${file.name}".`);
      if (onError) onError(new Error(`Failed to read "${file.name}".`));
    };
    
    reader.readAsText(file);
  }
  
  // For single file mode
  function processFile(file) {
    validateAndReadFile(file, 
      (content) => onSuccess(content, file),
      (error) => { if (onError) onError(error); }
    );
  }
  
  input.click();
};