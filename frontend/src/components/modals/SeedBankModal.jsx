import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import Icon from '../Icons';
import CustomTextInput from '../CustomTextInput';
import api from '../../api/apiClient';

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
  const [localSeedList, setLocalSeedList] = useState([]);
  const [filteredSeeds, setFilteredSeeds] = useState([]);
  const [selectedSeeds, setSelectedSeeds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalSeeds, setTotalSeeds] = useState(0);
  const [seedBankId, setSeedBankId] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  const pageSize = 100; // Number of seeds to load per page
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  
  // Initialize or get seed bank when modal opens
  useEffect(() => {
    if (isOpen && template && template.id) {
      setIsLoading(true);
      
      // First, check if a seed bank exists for this template
      api.getSeedBanks(template.id)
        .then(response => {
          const banks = response.items;
          
          if (banks.length > 0) {
            // Use the first seed bank
            const bank = banks[0];
            setSeedBankId(bank.id);
            
            // Load seeds from this bank
            return api.getSeedBankById(bank.id, 1, pageSize);
          } else {
            // Create a new seed bank for this template
            return api.createSeedBank({
              name: `${template.name} Seed Bank`,
              template_id: template.id,
              description: `Seed bank for ${template.name} template`
            }).then(newBank => {
              setSeedBankId(newBank.id);
              
              // If we have seeds in the local state, save them to the new bank
              if (seedList && seedList.length > 0) {
                return api.createSeeds(newBank.id, seedList)
                  .then(() => {
                    return api.getSeedBankById(newBank.id, 1, pageSize);
                  });
              }
              
              // Return empty seeds object
              return { seeds: [] };
            });
          }
        })
        .then(result => {
          // Load seeds and update local state
          const seeds = result.seeds || [];
          setLocalSeedList(seeds);
          setTotalSeeds(seeds.length);
          setCurrentPage(1);
          setHasChanges(false);
        })
        .catch(error => {
          console.error("Error loading seed bank:", error);
          toast.error("Failed to load seed bank");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, template, seedList]);

  // Update filtered seeds when localSeedList or searchTerm changes
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredSeeds(localSeedList);
      return;
    }

    const lowerSearchTerm = searchTerm.toLowerCase();
    const filtered = localSeedList.filter(seed => {
      return Object.entries(seed.slots).some(([key, value]) => {
        return value && value.toString().toLowerCase().includes(lowerSearchTerm);
      });
    });
    
    setFilteredSeeds(filtered);
  }, [searchTerm, localSeedList]);

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
        // Pass the latest seeds back to the parent
        if (localSeedList && localSeedList.length > 0) {
          setSeedList(localSeedList.map(seed => seed.slots));
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [isOpen, onClose, localSeedList, setSeedList]);

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        modalRef.current && 
        !modalRef.current.contains(e.target) && 
        isOpen
      ) {
        // Pass the latest seeds back to the parent
        if (localSeedList && localSeedList.length > 0) {
          setSeedList(localSeedList.map(seed => seed.slots));
        }
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, localSeedList, setSeedList]);

  // Add a new seed
  const addSeed = useCallback(() => {
    if (isDisabled || !seedBankId) return;
    
    const createInitialSeed = (templateSlots) => {
      if (!templateSlots || !Array.isArray(templateSlots)) return {};
      
      return templateSlots.reduce((acc, slot) => {
        if (typeof slot === 'string') {
          acc[slot] = '';
        }
        return acc;
      }, {});
    };
    
    // Create a blank seed
    const blankSeed = createInitialSeed(template?.slots);
    
    setIsLoading(true);
    
    // Save to API
    api.createSeeds(seedBankId, [blankSeed])
      .then(newSeeds => {
        // Add to local state
        setLocalSeedList(prevList => [...prevList, ...newSeeds]);
        setTotalSeeds(prev => prev + 1);
        
        // Scroll to bottom of table after a short delay to show the new seed
        setTimeout(() => {
          const tableContainer = document.querySelector('.overflow-y-auto');
          if (tableContainer) {
            tableContainer.scrollTop = tableContainer.scrollHeight;
          }
        }, 100);
        
        toast.success('New seed added');
      })
      .catch(error => {
        console.error("Error adding seed:", error);
        toast.error("Failed to add seed");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [template, isDisabled, seedBankId]);

  // Delete selected seeds
  const deleteSelectedSeeds = useCallback(() => {
    if (isDisabled || selectedSeeds.size === 0 || !seedBankId) return;
    
    if (localSeedList.length - selectedSeeds.size < 1) {
      toast.error("Cannot delete all seeds. At least one seed must remain.");
      return;
    }
    
    setIsLoading(true);
    
    // Delete each selected seed via API
    const deletePromises = Array.from(selectedSeeds).map(seedId => {
      return api.deleteSeed(seedId);
    });
    
    Promise.all(deletePromises)
      .then(() => {
        // Filter local state
        const newLocalList = localSeedList.filter(seed => !selectedSeeds.has(seed.id));
        setLocalSeedList(newLocalList);
        setTotalSeeds(prev => prev - selectedSeeds.size);
        
        // Update parent seedList
        setSeedList(newLocalList.map(seed => seed.slots));
        
        setSelectedSeeds(new Set());
        toast.success(`${selectedSeeds.size} seed${selectedSeeds.size > 1 ? 's' : ''} deleted`);
      })
      .catch(error => {
        console.error("Error deleting seeds:", error);
        toast.error("Failed to delete seeds");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [selectedSeeds, localSeedList, setSeedList, isDisabled, seedBankId]);

  // Toggle seed selection
  const toggleSelectSeed = useCallback((seedId) => {
    if (!seedId) return;
    
    setSelectedSeeds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(seedId)) {
        newSet.delete(seedId);
      } else {
        newSet.add(seedId);
      }
      return newSet;
    });
  }, []);

  // Select all displayed seeds
  const selectAllDisplayed = useCallback(() => {
    const newSet = new Set();
    
    filteredSeeds.forEach((seed) => {
      if (seed.id) {
        newSet.add(seed.id);
      }
    });
    
    setSelectedSeeds(newSet);
  }, [filteredSeeds]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedSeeds(new Set());
  }, []);

  // Export selected seeds
  const exportSelectedSeeds = useCallback(() => {
    if (isDisabled || selectedSeeds.size === 0) return;
    
    try {
      const selectedSeedIds = Array.from(selectedSeeds);
      const exportData = localSeedList
        .filter(seed => selectedSeedIds.includes(seed.id))
        .map(seed => {
          // Create a clean version with just the slots
          return seed.slots;
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
  }, [selectedSeeds, localSeedList, template, isDisabled]);

  // Import seeds
  const handleImportSeeds = useCallback(() => {
    if (isDisabled || !seedBankId) return;
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

          // Process seeds for import - each item should just be the slots object
          const seedsToImport = importedData.map((importedSeed, index) => {
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

          if (seedsToImport.length === 0) {
             toast.warn("No valid seed objects found in the imported file.");
             return;
          }

          // Clean up blank seeds
          const cleanedSeeds = cleanupSeedList(seedsToImport, templateSlots);
          
          // Save to API
          setIsLoading(true);
          api.createSeeds(seedBankId, cleanedSeeds)
            .then(newSeeds => {
              // Update local state with the new seeds
              setLocalSeedList(prevList => [...prevList, ...newSeeds]);
              setTotalSeeds(prev => prev + newSeeds.length);
              
              // Update parent state
              setSeedList(prevList => {
                const newList = [...prevList];
                newSeeds.forEach(seed => {
                  newList.push(seed.slots);
                });
                return newList;
              });
              
              toast.success(`Successfully imported ${newSeeds.length} seeds.`);
              
              // Display warning about ignored slots if any were found
              if (ignoredSlots.size > 0) {
                const ignoredSlotsList = Array.from(ignoredSlots).join(', ');
                toast.warn(`Warning: The following slots from the imported file were ignored as they are not in the current template: ${ignoredSlotsList}`, { autoClose: 5000 });
              }
            })
            .catch(error => {
              console.error("Error importing seeds:", error);
              toast.error("Failed to import seeds");
            })
            .finally(() => {
              setIsLoading(false);
            });

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
  }, [template, setSeedList, isDisabled, seedBankId]);

  // Handle importing content from a file into a specific slot
  const handleImportFileToSlot = useCallback((seed, slot) => {
    if (isDisabled) return;
    
    return (content, file) => {
      // Update the seed in the database
      setIsLoading(true);
      
      const updatedSlots = {
        ...seed.slots,
        [slot]: content
      };
      
      api.updateSeed(seed.id, { slots: updatedSlots })
        .then(updatedSeed => {
          // Update local state
          setLocalSeedList(prevList => {
            return prevList.map(s => {
              if (s.id === seed.id) {
                return updatedSeed;
              }
              return s;
            });
          });
          
          // Update parent state
          setSeedList(prevList => {
            return prevList.map((s, index) => {
              if (index === currentSeedIndex) {
                return updatedSeed.slots;
              }
              return s;
            });
          });
          
          setHasChanges(true);
          toast.success(`Successfully imported content from ${file.name} into ${slot}.`);
        })
        .catch(error => {
          console.error("Error updating seed:", error);
          toast.error("Failed to update seed");
        })
        .finally(() => {
          setIsLoading(false);
        });
    };
  }, [isDisabled, currentSeedIndex, setSeedList]);

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
              {totalSeeds} seed{totalSeeds !== 1 ? 's' : ''}
            </span>
          </h2>
          <button
            className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition-colors"
            onClick={() => {
              // Update parent state with the latest seeds
              if (localSeedList && localSeedList.length > 0) {
                setSeedList(localSeedList.map(seed => seed.slots));
              }
              onClose();
            }}
            aria-label="Close modal"
            title="Save & Close"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-2 items-center bg-gray-50">
          {/* Search */}
          <div className="relative flex-grow max-w-md">
            <CustomTextInput
              ref={searchInputRef}
              mode="single"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search seeds..."
              disabled={isDisabled || isLoading}
              showAiActionButton={false}
              containerClassName="m-0"
              actionButtons={
                searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    title="Clear search"
                  >
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                )
              }
              className="pl-10"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon name="search" className="h-5 w-5 text-gray-400" />
            </div>
          </div>

          {/* Actions buttons */}
          <div className="flex items-center space-x-2 ml-auto">            
            {/* Import/Export buttons */}
            <button
              type="button"
              onClick={handleImportSeeds}
              disabled={isDisabled || isLoading || !seedBankId}
              className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 border border-purple-300 rounded hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors"
              title="Import seeds from JSON file"
            >
              <Icon name="upload" className="w-4 h-4 mr-1" />
              Import
            </button>
            <button
              type="button"
              onClick={exportSelectedSeeds}
              disabled={isDisabled || isLoading || selectedSeeds.size === 0}
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
              disabled={isDisabled || isLoading || !seedBankId}
              className="px-3 py-1.5 text-sm bg-green-100 text-green-700 border border-green-300 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors"
              title="Add new blank seed"
            >
              <Icon name="plus" className="w-4 h-4 mr-1" />
              Add Seed
            </button>
            <button
              type="button"
              onClick={deleteSelectedSeeds}
              disabled={isDisabled || isLoading || selectedSeeds.size === 0}
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
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading seeds...</p>
            </div>
          ) : filteredSeeds.length === 0 ? (
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
                          checked={filteredSeeds.length > 0 && filteredSeeds.every(seed => 
                            seed.id && selectedSeeds.has(seed.id)
                          )}
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllDisplayed();
                            } else {
                              clearSelection();
                            }
                          }}
                          disabled={isDisabled || isLoading}
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
                      const seedId = seed.id;
                      
                      // Find the current seed index for highlighting
                      const isCurrentSeed = currentSeedIndex !== null && 
                                          currentSeedIndex < seedList.length && 
                                          JSON.stringify(seedList[currentSeedIndex]) === JSON.stringify(seed.slots);
                      
                      return (
                        <tr 
                          key={seedId || `seed-${displayIndex}`} 
                          className={`${selectedSeeds.has(seedId) ? 'bg-blue-50' : 'hover:bg-gray-50'} transition-colors ${isCurrentSeed ? 'ring-2 ring-primary-500 ring-inset' : ''} cursor-pointer`}
                          onClick={(e) => {
                            // Don't trigger on checkbox clicks (those are handled separately)
                            if (e.target.type !== 'checkbox' && !e.target.closest('input')) {
                              // Update the current seed index in the parent component
                              // Find where this seed is in the parent's seedList
                              const parentIndex = seedList.findIndex(s => 
                                JSON.stringify(s) === JSON.stringify(seed.slots)
                              );
                              
                              if (parentIndex !== -1) {
                                setCurrentSeedIndex(parentIndex);
                              } else {
                                // If not found in parent, update parent and set index
                                const newSeeds = [...seedList];
                                newSeeds.push(seed.slots);
                                setSeedList(newSeeds);
                                setCurrentSeedIndex(newSeeds.length - 1);
                              }
                            }
                          }}
                        >
                          {/* Checkbox */}
                          <td className="px-3 py-4 whitespace-nowrap">
                            <input 
                              type="checkbox" 
                              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                              checked={selectedSeeds.has(seedId)}
                              onChange={() => toggleSelectSeed(seedId)}
                              disabled={isDisabled || isLoading}
                            />
                          </td>
                          
                          {/* Seed number */}
                          <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                            {displayIndex + 1}
                          </td>
                          
                          {/* Slot values - Always editable */}
                          {template.slots.map((slot, slotIndex) => (
                            <td key={slot} className="px-3 py-4 text-sm">
                              <div className="relative">
                                <CustomTextInput 
                                  mode="single"
                                  value={seed.slots[slot] || ''} 
                                  onChange={(e) => {
                                    if (isDisabled || isLoading) return;
                                    
                                    // Update the seed in the database
                                    setIsLoading(true);
                                    
                                    const updatedSlots = {
                                      ...seed.slots,
                                      [slot]: e.target.value
                                    };
                                    
                                    api.updateSeed(seed.id, { slots: updatedSlots })
                                      .then(updatedSeed => {
                                        // Update local state
                                        setLocalSeedList(prevList => {
                                          return prevList.map(s => {
                                            if (s.id === seed.id) {
                                              return updatedSeed;
                                            }
                                            return s;
                                          });
                                        });
                                        
                                        // If this is the currently selected seed, update parent state
                                        if (isCurrentSeed) {
                                          setSeedList(prevList => {
                                            return prevList.map((s, idx) => {
                                              if (idx === currentSeedIndex) {
                                                return updatedSeed.slots;
                                              }
                                              return s;
                                            });
                                          });
                                        }
                                      })
                                      .catch(error => {
                                        console.error("Error updating seed:", error);
                                        // Don't show toast for every keystroke - it would be too noisy
                                      })
                                      .finally(() => {
                                        setIsLoading(false);
                                      });
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
                                    
                                    // Find matching seed in parent list
                                    const parentIndex = seedList.findIndex(s => 
                                      JSON.stringify(s) === JSON.stringify(seed.slots)
                                    );
                                    
                                    if (parentIndex !== -1) {
                                      setCurrentSeedIndex(parentIndex);
                                    } else {
                                      // If not found in parent, update parent and set index
                                      const newSeeds = [...seedList];
                                      newSeeds.push(seed.slots);
                                      setSeedList(newSeeds);
                                      setCurrentSeedIndex(newSeeds.length - 1);
                                    }
                                    
                                    onClose();
                                  }}
                                  placeholder={`Enter ${slot}...`}
                                  disabled={isDisabled || isLoading}
                                  containerClassName="m-0"
                                  className="text-sm"
                                  showAiActionButton={true}
                                  aiContext={`You are helping create content for a "${slot}" field in a dataset. This field represents a ${slot} entry in seed data for AI prompts.`}
                                  systemPrompt={`Generate or improve the text for this "${slot}" field. Keep the content authentic, relevant, and concise.`}
                                  actionButtons={
                                    <button
                                      className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors rounded-full"
                                      title={`Import file for ${slot}`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = '.txt,.md,.json,.csv';
                                        input.onchange = (event) => {
                                          const file = event.target.files?.[0];
                                          if (!file) return;
                                          
                                          const reader = new FileReader();
                                          reader.onload = (e) => {
                                            const content = e.target?.result;
                                            if (typeof content === 'string') {
                                              // Call the handler
                                              const handler = handleImportFileToSlot(seed, slot);
                                              if (handler) handler(content, file);
                                            }
                                          };
                                          reader.readAsText(file);
                                        };
                                        input.click();
                                      }}
                                      disabled={isDisabled || isLoading}
                                    >
                                      <Icon name="upload" className="h-4 w-4" />
                                    </button>
                                  }
                                />
                              </div>
                              {seed.slots[slot] && seed.slots[slot].length > 100 && (
                                <p className="mt-1 text-xs text-gray-500">
                                  {seed.slots[slot].length.toLocaleString()} characters
                                </p>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination if needed */}
              {totalSeeds > pageSize && (
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-gray-500">
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalSeeds)} of {totalSeeds} seeds
                  </span>
                  <div className="flex space-x-2">
                    <button
                      className="px-3 py-1 bg-gray-200 text-gray-800 rounded disabled:opacity-50"
                      onClick={() => {
                        if (currentPage > 1) {
                          setCurrentPage(prev => prev - 1);
                          // Todo: implement API call to load previous page
                        }
                      }}
                      disabled={currentPage === 1 || isLoading}
                    >
                      Previous
                    </button>
                    <button
                      className="px-3 py-1 bg-gray-200 text-gray-800 rounded disabled:opacity-50"
                      onClick={() => {
                        if (currentPage * pageSize < totalSeeds) {
                          setCurrentPage(prev => prev + 1);
                          // Todo: implement API call to load next page
                        }
                      }}
                      disabled={currentPage * pageSize >= totalSeeds || isLoading}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            {hasChanges ? (
              <span className="text-green-600">✓ Changes saved automatically</span>
            ) : null}
          </div>
          <button
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
            onClick={() => {
              // Pass the latest seeds back to the parent
              if (localSeedList && localSeedList.length > 0) {
                setSeedList(localSeedList.map(seed => seed.slots));
              }
              onClose();
            }}
            disabled={isLoading}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SeedBankModal;