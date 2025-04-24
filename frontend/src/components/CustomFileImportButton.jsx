import React, { useState } from 'react';
import Icon from './Icons';

/**
 * CustomFileImportButton component for importing files into seed slots
 * Supports both single and multiple file selection in one button
 * 
 * @param {Object} props
 * @param {Function} props.onImport - Function to handle file import (receives files array)
 * @param {boolean} props.disabled - Whether the button should be disabled
 * @param {string} props.className - Optional additional classes
 */
const CustomFileImportButton = ({ 
  onImport, 
  disabled = false,
  className = ''
}) => {
  // State to track if tooltip is visible
  const [showTooltip, setShowTooltip] = useState(false);
  
  const buttonBaseClass = "p-2 text-gray-500 transition-colors relative flex items-center mr-2 rounded-full" + 
    (disabled ? " opacity-50 cursor-not-allowed" : " hover:text-gray-700 hover:bg-gray-100");

  return (
      <button
        type="button"
        onClick={onImport}
        className={buttonBaseClass}
        disabled={disabled}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        title="Import file(s)"
      >
        <Icon name="upload" className="h-4 w-4" />
        {/* Custom tooltip */}
        {showTooltip && !disabled && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-10">
            Import one or multiple files
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
          </div>
        )}
      </button>
  );
};

export default CustomFileImportButton;