import { useState, useRef, useEffect } from 'react';
import Icon from './Icons';

const CustomSelect = ({ 
  options, 
  value, 
  onChange, 
  placeholder = "Select...", 
  disabled = false,
  isLoading = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(''); // Add state for search term
  const selectRef = useRef(null);
  const searchInputRef = useRef(null); // Ref for the search input

  // Find the label for the currently selected value
  const selectedOption = options.find(option => option.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  // Close dropdown when clicking outside, but not if clicking the search input
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        selectRef.current &&
        !selectRef.current.contains(event.target) &&
        !searchInputRef.current?.contains(event.target) // Don't close if clicking search
      ) {
        setIsOpen(false);
        setSearchTerm(''); // Clear search on close
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm(''); // Clear search on select
  };

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative" ref={selectRef}>
      <button
        type="button"
        className={`w-full p-2 border border-gray-300 rounded-md text-left flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200 ${
          disabled || isLoading ? 'bg-gray-100 cursor-not-allowed text-gray-500' : 'bg-white hover:bg-gray-50'
        }`}
        onClick={() => !disabled && !isLoading && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
      >
        <span className="truncate">
          {isLoading ? 'Loading...' : displayLabel}
        </span>
        <Icon
          name="chevronDown"
          className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && !disabled && !isLoading && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-gray-200 max-h-60 flex flex-col">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-200">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search..."
              className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()} // Prevent closing dropdown when clicking input
            />
          </div>
          {/* Options List */}
          <ul className="py-1 overflow-y-auto flex-grow">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">
                {options.length === 0 ? 'No options available' : 'No matching options'}
              </li>
            ) : (
              filteredOptions.map((option) => (
                <li
                  key={option.value}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-primary-50 hover:text-primary-700 ${
                    option.value === value ? 'bg-primary-100 text-primary-800 font-medium' : 'text-gray-700'
                  }`}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.label}
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
