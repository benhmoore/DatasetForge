import React from 'react';
import Icon from './Icons';
import { importTextFile } from '../lib/FileImportUtil';

/**
 * A reusable file import button component
 * 
 * @param {Object} props
 * @param {Function} props.onImport - Callback when file is successfully imported (content, file) => void
 * @param {string} props.slotName - Name of the slot being filled (for success message)
 * @param {boolean} props.disabled - Whether the button is disabled
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.iconName - Name of icon to display (default: "upload")
 * @param {string} props.buttonType - Visual style: "icon" (just icon), "text" (just text), or "full" (icon and text)
 * @param {string} props.buttonText - Text to show (for "text" or "full" types)
 * @param {string} props.position - UI position: "inline" (within text flow) or "absolute" (positioned absolutely)
 */
const FileImportButton = ({ 
  onImport, 
  slotName, 
  disabled = false, 
  className = '',
  iconName = "upload",
  buttonType = "icon",  // "icon", "text", or "full"
  buttonText = "Import file",
  position = "inline"   // "inline" or "absolute"
}) => {
  
  const handleImportClick = () => {
    if (disabled) return;
    
    importTextFile({
      onSuccess: (content, file) => {
        onImport(content, file);
      }
    });
  };
  
  // Define button styles based on type and position
  let buttonStyles = '';
  
  if (position === "absolute") {
    buttonStyles = "absolute inset-y-0 right-0 pr-2 flex items-center";
  }
  
  if (buttonType === "icon") {
    buttonStyles += " p-1 text-gray-400 hover:text-purple-600 rounded-full hover:bg-gray-100";
  } else if (buttonType === "text") {
    buttonStyles += " text-xs text-purple-600 hover:text-purple-800 flex items-center";
  } else if (buttonType === "full") {
    buttonStyles += " text-xs text-purple-600 hover:text-purple-800 flex items-center";
  }
  
  if (disabled) {
    buttonStyles += " disabled:opacity-50 disabled:cursor-not-allowed disabled:text-purple-300";
  }
  
  return (
    <button
      type="button"
      onClick={handleImportClick}
      disabled={disabled}
      className={`${buttonStyles} transition-colors duration-150 ${className}`}
      title={`Import content from text file${slotName ? ` into ${slotName}` : ''}`}
      aria-label={`Import content from text file${slotName ? ` into ${slotName}` : ''}`}
    >
      {(buttonType === "icon" || buttonType === "full") && (
        <Icon name={iconName} className={`${buttonType === "icon" ? "w-4 h-4" : "w-3 h-3 mr-1"}`} />
      )}
      {(buttonType === "text" || buttonType === "full") && <span>{buttonText}</span>}
    </button>
  );
};

export default FileImportButton;