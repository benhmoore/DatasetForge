import { useState, useRef, useEffect } from 'react';
import Icon from './Icons';

const CustomSelect = ({ 
  options, 
  value, 
  onChange, 
  placeholder = "Select...", 
  disabled = false,
  isLoading = false,
  actionButton = null
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const selectRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedOption = options.find(option => option.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        selectRef.current &&
        !selectRef.current.contains(event.target) &&
        !searchInputRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={selectRef}>
      <div className={`flex items-center border ${
        isOpen 
          ? 'border-primary-500 ring-2 ring-primary-100' 
          : 'border-gray-300 hover:border-gray-400'
        } rounded-md transition-all duration-200 ${
          disabled || isLoading ? 'bg-gray-50' : 'bg-white'
        }`}>
        <button
          type="button"
          className={`flex-grow p-2.5 text-left flex justify-between items-center focus:outline-none rounded-l-md ${
            disabled || isLoading ? 'cursor-not-allowed text-gray-500' : 'cursor-pointer'
          }`}
          onClick={() => !disabled && !isLoading && setIsOpen(!isOpen)}
          disabled={disabled || isLoading}
          style={{ borderTopRightRadius: actionButton ? 0 : undefined, borderBottomRightRadius: actionButton ? 0 : undefined }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby="select-label"
        >
          <span className="truncate text-sm">
            {isLoading ? (
              <div className="flex items-center">
                <Icon name="spinner" className="animate-spin h-4 w-4 mr-2 text-gray-400" />
                <span>Loading...</span>
              </div>
            ) : displayLabel}
          </span>
          <Icon
            name="chevronDown"
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        
        {actionButton && (
          <div className={`flex p-1 items-center border-l border-gray-300 ${disabled || isLoading ? 'opacity-70' : ''}`} 
               style={{ borderRadius: '0 0.375rem 0.375rem 0' }}>
            {actionButton}
          </div>
        )}
      </div>

      {isOpen && !disabled && !isLoading && (
        <div className="absolute z-40 mt-1.5 w-full bg-white rounded-md shadow-lg border border-gray-200 max-h-60 overflow-hidden flex flex-col"
             role="listbox">
          <div className="p-2 border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search options..."
                className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                <Icon name="search" className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>
          
          <ul className="py-1 overflow-y-auto flex-grow scrollbar-thin scrollbar-thumb-gray-300">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-gray-500 text-center">
                {options.length === 0 ? 'No options available' : 'No matching options'}
              </li>
            ) : (
              filteredOptions.map((option) => (
                <li
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={`px-3 py-2 text-sm cursor-pointer flex items-center transition-colors ${
                    option.value === value 
                      ? 'bg-primary-50 text-primary-800 font-medium' 
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  role="option"
                  aria-selected={option.value === value}
                >
                  {option.value === value && (
                    <Icon name="check" className="h-4 w-4 text-primary-600 mr-2" aria-hidden="true" />
                  )}
                  <span className="truncate">{option.label}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
