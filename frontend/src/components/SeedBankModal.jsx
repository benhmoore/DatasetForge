import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import Icon from './Icons';
import api from '../api/apiClient';

// Helper function to check if a seed is blank
const isBlankSeed = (seed, slots) => {
  if (!seed || !slots || slots.length === 0) {
    return true;
  }
  return slots.every(slot => !seed[slot]?.trim());
};

// Helper function to remove blank seeds after adding new ones
const cleanupSeedList = (list, slots) => {
  if (!list || list.length === 0 || !slots || slots.length === 0) {
    return list;
  }

  const nonBlankSeeds = list.filter(seed => !isBlankSeed(seed, slots));

  if (nonBlankSeeds.length > 0) {
    return nonBlankSeeds;
  } else {
    return list.length > 0 ? [list[0]] : [];
  }
};

const SeedBankModal = ({ 
  isOpen, 
  onClose, 
  seedList, 
  setSeedList, 
  template,
  isDisabled,
  currentSeedIndex,
  setCurrentSeedIndex
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredSeeds, setFilteredSeeds] = useState(seedList);
  const [selectedSeeds, setSelectedSeeds] = useState(new Set());
  const [savedSeedBanks, setSavedSeedBanks] = useState([]);
  const [isLoadingSeedBanks, setIsLoadingSeedBanks] = useState(false);
  const [isSavingSeedBank, setIsSavingSeedBank] = useState(false);
  const [showSaveSeedBankDialog, setShowSaveSeedBankDialog] = useState(false);
  const [seedBankName, setSeedBankName] = useState('');
  const [seedBankDescription, setSeedBankDescription] = useState('');
  
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const nameInputRef = useRef(null);

  // Filter seeds based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredSeeds(seedList);
      return;
    }

    const lowerSearchTerm = searchTerm.toLowerCase();
    const filtered = seedList.filter(seed => {
      return Object.entries(seed).some(([key, value]) => {
        return value && value.toString().toLowerCase().includes(lowerSearchTerm);
      });
    });
    
    setFilteredSeeds(filtered);
  }, [searchTerm, seedList]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscapeKey = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [isOpen, onClose]);

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        modalRef.current && 
        !modalRef.current.contains(e.target) && 
        isOpen
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Add a new seed
  const addSeed = useCallback(() => {
    if (isDisabled) return;
    
    const createInitialSeed = (templateSlots) => {
      if (!templateSlots || !Array.isArray(templateSlots)) return {};
      
      return templateSlots.reduce((acc, slot) => {
        if (typeof slot === 'string') {
          acc[slot] = '';
        }
        return acc;
      }, {});
    };
    
    setSeedList(prevList => {
      const blankSeed = createInitialSeed(template?.slots);
      return [...prevList, blankSeed];
    });
    
    toast.success('New seed added');
  }, [template, setSeedList, isDisabled]);

  // Delete selected seeds
  const deleteSelectedSeeds = useCallback(() => {
    if (isDisabled || selectedSeeds.size === 0) return;
    
    if (seedList.length - selectedSeeds.size < 1) {
      toast.error("Cannot delete all seeds. At least one seed must remain.");
      return;
    }
    
    setSeedList(prevList => {
      return prevList.filter((_, index) => !selectedSeeds.has(index));
    });
    
    setSelectedSeeds(new Set());
    toast.success(`${selectedSeeds.size} seed${selectedSeeds.size > 1 ? 's' : ''} deleted`);
  }, [selectedSeeds, seedList.length, setSeedList, isDisabled]);

  // Toggle seed selection
  const toggleSelectSeed = useCallback((index) => {
    setSelectedSeeds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  // Select all displayed seeds
  const selectAllDisplayed = useCallback(() => {
    const newSet = new Set();
    
    filteredSeeds.forEach((_, index) => {
      // Find the original index in the seedList
      const originalIndex = seedList.findIndex(seed => seed === filteredSeeds[index]);
      if (originalIndex !== -1) {
        newSet.add(originalIndex);
      }
    });
    
    setSelectedSeeds(newSet);
  }, [filteredSeeds, seedList]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedSeeds(new Set());
  }, []);

  // Export selected seeds
  const exportSelectedSeeds = useCallback(() => {
    if (isDisabled || selectedSeeds.size === 0) return;
    
    try {
      const exportData = Array.from(selectedSeeds).map(index => {
        const seed = seedList[index];
        const cleanSeed = {};
        template.slots.forEach(slot => {
          cleanSeed[slot] = seed[slot] || '';
        });
        return cleanSeed;
      });

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTemplateName = template.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.href = url;
      link.download = `seed_bank_${safeTemplateName || 'export'}_selected.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${exportData.length} seeds.`);
    } catch (error) {
      console.error("Error exporting seeds:", error);
      toast.error("Failed to export seeds.");
    }
  }, [selectedSeeds, seedList, template, isDisabled]);

  // Import seeds
  const handleImportSeeds = useCallback(() => {
    if (isDisabled) return;
    if (!template?.slots) {
      toast.error("Cannot import seeds without a selected template.");
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        let ignoredSlots = new Set(); // Keep track of ignored slots across all imported seeds
        try {
          const content = e.target?.result;
          if (typeof content !== 'string') {
            throw new Error("Failed to read file content.");
          }
          const importedData = JSON.parse(content);

          if (!Array.isArray(importedData)) {
            throw new Error("Invalid format: Imported file must contain a JSON array.");
          }

          if (importedData.length === 0) {
            toast.info("Imported file contains no seeds.");
            return;
          }

          const templateSlots = template.slots || [];
          const templateSlotSet = new Set(templateSlots); // Use a Set for efficient lookup

          const newSeeds = importedData.map((importedSeed, index) => {
            if (typeof importedSeed !== 'object' || importedSeed === null) {
              console.warn(`Skipping invalid entry at index ${index} during import.`);
              return null;
            }

            // Check for extra slots not in the current template
            Object.keys(importedSeed).forEach(key => {
              if (!templateSlotSet.has(key)) {
                ignoredSlots.add(key); // Add extra key to the set
              }
            });

            // Create the new seed object using only the template's slots
            return templateSlots.reduce((acc, slotName) => {
              acc[slotName] = importedSeed[slotName]?.toString() || '';
              return acc;
            }, {});
          }).filter(seed => seed !== null);

          if (newSeeds.length === 0) {
             toast.warn("No valid seed objects found in the imported file.");
             return;
          }

          const cleanedList = cleanupSeedList(newSeeds, templateSlots);
          setSeedList(prevList => [...prevList, ...cleanedList]);
          toast.success(`Successfully imported ${newSeeds.length} seeds.`);

          // Display warning about ignored slots if any were found
          if (ignoredSlots.size > 0) {
            const ignoredSlotsList = Array.from(ignoredSlots).join(', ');
            toast.warn(`Warning: The following slots from the imported file were ignored as they are not in the current template: ${ignoredSlotsList}`, { autoClose: 5000 });
          }

        } catch (error) {
          console.error("Error importing seeds:", error);
          toast.error(`Import failed: ${error.message || "Could not parse JSON file."}`);
        }
      };

      reader.onerror = (e) => {
        console.error("Error reading file:", e);
        toast.error("Failed to read the selected file.");
      };

      reader.readAsText(file);
    };

    input.click();
  }, [template, setSeedList, isDisabled]);

  if (!isOpen || !template) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4"
      aria-labelledby="seed-bank-title"
      role="dialog"
      aria-modal="true"
    >
      <div 
        ref={modalRef}
        className="bg-white rounded-lg w-full max-w-5xl shadow-xl max-h-[90vh] flex flex-col animate-fadeIn"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-200 flex-shrink-0">
          <h2 id="seed-bank-title" className="text-xl font-semibold flex items-center">
            <Icon name="database" className="h-5 w-5 mr-2 text-gray-500" />
            Seed Bank: {template.name}
            <span className="ml-2 text-gray-500 text-sm font-normal">
              {seedList.length} seed{seedList.length !== 1 ? 's' : ''}
            </span>
          </h2>
          <button
            className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition-colors"
            onClick={onClose}
            aria-label="Close modal"
            title="Close"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-2 items-center bg-gray-50">
          {/* Search */}
          <div className="relative flex-grow max-w-md">
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search seeds..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              disabled={isDisabled}
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon name="search" className="h-5 w-5 text-gray-400" />
            </div>
            {searchTerm && (
              <button
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setSearchTerm('')}
                title="Clear search"
              >
                <Icon name="close" className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          {/* Actions buttons */}
          <div className="flex items-center space-x-2 ml-auto">            
            {/* Import/Export buttons */}
            <button
              type="button"
              onClick={handleImportSeeds}
              disabled={isDisabled}
              className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 border border-purple-300 rounded hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors"
              title="Import seeds from JSON file"
            >
              <Icon name="upload" className="w-4 h-4 mr-1" />
              Import
            </button>
            <button
              type="button"
              onClick={exportSelectedSeeds}
              disabled={isDisabled || selectedSeeds.size === 0}
              className="px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 border border-indigo-300 rounded hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors"
              title="Export selected seeds to JSON file"
            >
              <Icon name="download" className="w-4 h-4 mr-1" />
              Export Selected
            </button>

            <div className="border-r border-gray-300 h-6 mx-2"></div>

            {/* Add/Delete buttons */}
            <button
              type="button"
              onClick={addSeed}
              disabled={isDisabled}
              className="px-3 py-1.5 text-sm bg-green-100 text-green-700 border border-green-300 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors"
              title="Add new blank seed"
            >
              <Icon name="plus" className="w-4 h-4 mr-1" />
              Add Seed
            </button>
            <button
              type="button"
              onClick={deleteSelectedSeeds}
              disabled={isDisabled || selectedSeeds.size === 0}
              className="px-3 py-1.5 text-sm bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors"
              title="Delete selected seeds"
            >
              <Icon name="trash" className="w-4 h-4 mr-1" />
              Delete Selected
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-grow overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-300">
          {filteredSeeds.length === 0 ? (
            <div className="text-center py-12">
              <Icon name="search" className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No seeds found with the current search terms.</p>
              {searchTerm && (
                <button 
                  className="mt-2 text-primary-600 hover:text-primary-700"
                  onClick={() => setSearchTerm('')}
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Seeds table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="w-12 px-3 py-3 text-left">
                        {/* Select all checkbox */}
                        <input 
                          type="checkbox" 
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          checked={filteredSeeds.length > 0 && filteredSeeds.every((_, i) => {
                            const originalIndex = seedList.findIndex(seed => seed === filteredSeeds[i]);
                            return selectedSeeds.has(originalIndex);
                          })}
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllDisplayed();
                            } else {
                              clearSelection();
                            }
                          }}
                          disabled={isDisabled}
                        />
                      </th>
                      <th scope="col" className="w-16 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        #
                      </th>
                      {template.slots.map(slot => (
                        <th 
                          key={slot} 
                          scope="col" 
                          className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {slot}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredSeeds.map((seed, displayIndex) => {
                      // Find the seed's original index in the full seedList
                      const originalIndex = seedList.findIndex(s => s === seed);
                      
                      return (
                        <tr 
                          key={originalIndex} 
                          className={`${selectedSeeds.has(originalIndex) ? 'bg-blue-50' : 'hover:bg-gray-50'} transition-colors ${originalIndex === currentSeedIndex ? 'ring-2 ring-primary-500 ring-inset' : ''} cursor-pointer`}
                          onClick={(e) => {
                            // Don't trigger on checkbox clicks (those are handled separately)
                            if (e.target.type !== 'checkbox' && !e.target.closest('input')) {
                              setCurrentSeedIndex(originalIndex);
                            }
                          }}
                        >
                          {/* Checkbox */}
                          <td className="px-3 py-4 whitespace-nowrap">
                            <input 
                              type="checkbox" 
                              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                              checked={selectedSeeds.has(originalIndex)}
                              onChange={() => toggleSelectSeed(originalIndex)}
                              disabled={isDisabled}
                            />
                          </td>
                          
                          {/* Seed number */}
                          <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                            {displayIndex + 1}
                          </td>
                          
                          {/* Slot values - Always editable */}
                          {template.slots.map((slot, slotIndex) => (
                            <td key={slot} className="px-3 py-4 text-sm">
                              <input 
                                type="text" 
                                value={seed[slot] || ''} 
                                onChange={(e) => {
                                  if (isDisabled) return;
                                  const newList = [...seedList];
                                  newList[originalIndex] = {
                                    ...newList[originalIndex],
                                    [slot]: e.target.value
                                  };
                                  setSeedList(newList);
                                }}
                                onKeyDown={(e) => {
                                  // Tab navigation with keyboard
                                  const isLastSlot = slotIndex === template.slots.length - 1;
                                  const isLastRow = displayIndex === filteredSeeds.length - 1;
                                  
                                  if (e.key === 'Enter') {
                                    // Move to the next row, same column on Enter
                                    if (!isLastRow) {
                                      const nextRowIndex = displayIndex + 1;
                                      
                                      // Focus the same field in the next row
                                      setTimeout(() => {
                                        const nextInput = document.querySelector(`tr:nth-child(${nextRowIndex + 1}) td:nth-child(${slotIndex + 3}) input`);
                                        if (nextInput) nextInput.focus();
                                      }, 0);
                                    }
                                  } else if (e.key === 'ArrowDown') {
                                    // Move down a row
                                    if (!isLastRow) {
                                      const nextRowIndex = displayIndex + 1;
                                      setTimeout(() => {
                                        const nextInput = document.querySelector(`tr:nth-child(${nextRowIndex + 1}) td:nth-child(${slotIndex + 3}) input`);
                                        if (nextInput) nextInput.focus();
                                      }, 0);
                                    }
                                  } else if (e.key === 'ArrowUp') {
                                    // Move up a row
                                    if (displayIndex > 0) {
                                      const prevRowIndex = displayIndex - 1;
                                      setTimeout(() => {
                                        const prevInput = document.querySelector(`tr:nth-child(${prevRowIndex + 1}) td:nth-child(${slotIndex + 3}) input`);
                                        if (prevInput) prevInput.focus();
                                      }, 0);
                                    }
                                  }
                                }}
                                onDoubleClick={() => {
                                  // On double click, select the current seed and close the modal
                                  setCurrentSeedIndex(originalIndex);
                                  onClose();
                                }}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                placeholder={`Enter ${slot}...`}
                                disabled={isDisabled}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-2 p-4 border-t border-gray-200 bg-gray-50">
          <button
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SeedBankModal;