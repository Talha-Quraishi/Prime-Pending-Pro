// --- RULES MANAGEMENT, SETTINGS PERSISTENCE & SPELLING ---

let filterNewOnly = false;

async function persistRulesToStorage(quiet = false) {
    if (!quiet) showToast("Saving configurations...", "warning");
    if (window.electronAPI) {
        const currentConfig = await window.electronAPI.loadConfig() || {};
        currentConfig.excludedParties = excludedParties;
        currentConfig.deduplicateParties = deduplicateParties;
        currentConfig.specialParties = specialParties;
        currentConfig.fullyExcludedParties = fullyExcludedParties;
        currentConfig.partyMerges = partyMerges;
        const success = await window.electronAPI.saveConfig(currentConfig);
        if (!quiet) {
            if (success) showToast("Party rules saved successfully! ✅", "success");
            else showToast("Failed to save rules. ❌", "error");
        }
    } else {
        localStorage.setItem('excludedParties', JSON.stringify(excludedParties));
        localStorage.setItem('deduplicateParties', JSON.stringify(deduplicateParties));
        localStorage.setItem('specialParties', JSON.stringify(specialParties));
        localStorage.setItem('fullyExcludedParties', JSON.stringify(fullyExcludedParties));
        localStorage.setItem('partyMerges', JSON.stringify(partyMerges));
        if (!quiet) showToast("Party rules saved to LocalStorage! ✅", "success");
    }
}


function triggerReDeduplication() {
    if (originalJsonData || transformedData) {
        const dataSrc = transformedData || originalJsonData;
        finalDeduplicatedData = findAndKeepLatestOrders(dataSrc, excludedParties, deduplicateParties, specialParties, fullyExcludedParties);
        currentFilteredData = finalDeduplicatedData;
        applyDashboardFilters();
        if (typeof regenerateWorkbook === 'function') {
            regenerateWorkbook();
        }
    }
}

function recompileRulesListsFromMap() {
    excludedParties = [];
    deduplicateParties = [];
    specialParties = [];
    fullyExcludedParties = [];
    
    for (const party in partyRulesMap) {
        const rule = partyRulesMap[party];
        if (rule === 'keep-all') excludedParties.push(party);
        else if (rule === 'keep-latest') deduplicateParties.push(party);
        else if (rule === 'marka') specialParties.push(party);
        else if (rule === 'exclude') fullyExcludedParties.push(party);
    }
}

function renderChipsInUI() {
    const categories = [
        { arr: excludedParties, containerId: 'chipContainerExclusions', inputId: 'chipInputExclusions', type: 'exclusions' },
        { arr: deduplicateParties, containerId: 'chipContainerLatest', inputId: 'chipInputLatest', type: 'latest' },
        { arr: specialParties, containerId: 'chipContainerMarka', inputId: 'chipInputMarka', type: 'marka' },
        { arr: fullyExcludedParties, containerId: 'chipContainerExcluded', inputId: 'chipInputExcluded', type: 'excluded' }
    ];

    categories.forEach(({ arr, containerId, inputId, type }) => {
        const container = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        if (!container || !input) return;

        // Remove old chips
        const chips = container.querySelectorAll('.chip');
        chips.forEach(c => c.remove());

        // Render new chips
        arr.forEach(party => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.innerHTML = `
                <span>${party}</span>
                <span class="chip-delete" data-party="${party}" data-type="${type}">&times;</span>
            `;
            container.insertBefore(chip, input);
        });
    });
}

function setupChipInputListeners() {
    const inputs = [
        { inputId: 'chipInputExclusions', arrRef: () => excludedParties, setArr: (val) => { excludedParties = val; }, type: 'keep-all' },
        { inputId: 'chipInputLatest', arrRef: () => deduplicateParties, setArr: (val) => { deduplicateParties = val; }, type: 'keep-latest' },
        { inputId: 'chipInputMarka', arrRef: () => specialParties, setArr: (val) => { specialParties = val; }, type: 'marka' },
        { inputId: 'chipInputExcluded', arrRef: () => fullyExcludedParties, setArr: (val) => { fullyExcludedParties = val; }, type: 'exclude' }
    ];

    inputs.forEach(({ inputId, arrRef, setArr, type }) => {
        const input = document.getElementById(inputId);
        if (!input) return;

        if (input.dataset.listenerBound) return;
        input.dataset.listenerBound = 'true';

        const addChipValue = () => {
            const val = input.value.trim().toUpperCase();
            if (!val) return;
            const currentArr = arrRef();
            if (!currentArr.includes(val)) {
                currentArr.push(val);
                setArr(currentArr);
                partyRulesMap[val] = type;
                persistRulesToStorage(true).then(() => {
                    renderChipsInUI();
                    renderPartyRulesList();
                    triggerReDeduplication();
                });
            }
            input.value = '';
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addChipValue();
            } else if (e.key === 'Backspace' && !input.value) {
                const currentArr = arrRef();
                if (currentArr.length > 0) {
                    const removed = currentArr.pop();
                    setArr(currentArr);
                    delete partyRulesMap[removed];
                    persistRulesToStorage(true).then(() => {
                        renderChipsInUI();
                        renderPartyRulesList();
                        triggerReDeduplication();
                    });
                }
            }
        });

        input.addEventListener('blur', () => {
            addChipValue();
        });
    });

    const containers = ['chipContainerExclusions', 'chipContainerLatest', 'chipContainerMarka', 'chipContainerExcluded'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container || container.dataset.listenerBound) return;
        container.dataset.listenerBound = 'true';

        container.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.chip-delete');
            if (!deleteBtn) return;
            const party = deleteBtn.dataset.party;
            const type = deleteBtn.dataset.type;

            if (type === 'exclusions') excludedParties = excludedParties.filter(p => p !== party);
            else if (type === 'latest') deduplicateParties = deduplicateParties.filter(p => p !== party);
            else if (type === 'marka') specialParties = specialParties.filter(p => p !== party);
            else if (type === 'excluded') fullyExcludedParties = fullyExcludedParties.filter(p => p !== party);

            delete partyRulesMap[party];
            persistRulesToStorage(true).then(() => {
                renderChipsInUI();
                renderPartyRulesList();
                triggerReDeduplication();
            });
        });
    });
}

function exportRulesConfig() {
    try {
        const configData = {
            version: (window.electronAPI && window.electronAPI.appVersion) ? window.electronAPI.appVersion : 'dev',
            timestamp: new Date().toISOString(),
            excludedParties: excludedParties || [],
            deduplicateParties: deduplicateParties || [],
            specialParties: specialParties || [],
            fullyExcludedParties: fullyExcludedParties || [],
            partyMerges: partyMerges || {}
        };
        const jsonStr = JSON.stringify(configData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pending_order_maker_rules_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Rules exported successfully!", 'success');
    } catch (err) {
        showToast("Failed to export rules: " + err.message, 'error');
    }
}

function importRulesConfig(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed) throw new Error("File content is empty or invalid JSON.");

            // Validate minimal structure
            const hasExcluded = Array.isArray(parsed.excludedParties);
            const hasDeduplicate = Array.isArray(parsed.deduplicateParties);
            const hasSpecial = Array.isArray(parsed.specialParties);
            const hasFullyExcluded = Array.isArray(parsed.fullyExcludedParties);
            const hasMerges = parsed.partyMerges && typeof parsed.partyMerges === 'object';

            if (!hasExcluded && !hasDeduplicate && !hasSpecial && !hasFullyExcluded && !hasMerges) {
                throw new Error("Invalid backup format. Missing rules configuration arrays.");
            }

            // Update memory state with uppercase normalization
            excludedParties = (parsed.excludedParties || []).map(p => String(p).toUpperCase());
            deduplicateParties = (parsed.deduplicateParties || []).map(p => String(p).toUpperCase());
            specialParties = (parsed.specialParties || []).map(p => String(p).toUpperCase());
            fullyExcludedParties = (parsed.fullyExcludedParties || []).map(p => String(p).toUpperCase());

            // Normalize partyMerges keys to uppercase, values as-is
            partyMerges = {};
            if (parsed.partyMerges) {
                for (const key in parsed.partyMerges) {
                    partyMerges[key.toUpperCase()] = parsed.partyMerges[key];
                }
            }

            // Sync to partyRulesMap
            partyRulesMap = {};
            excludedParties.forEach(p => partyRulesMap[p] = 'keep-all');
            deduplicateParties.forEach(p => partyRulesMap[p] = 'keep-latest');
            specialParties.forEach(p => partyRulesMap[p] = 'marka');
            fullyExcludedParties.forEach(p => partyRulesMap[p] = 'exclude');

            // Render visual chips
            renderChipsInUI();

            // Re-render UI list & spelling corrections
            renderPartyRulesList();
            if (transformedData && transformedData.length > 0) {
                triggerReDeduplication();
            }

            // Save to persistent storage automatically
            await persistRulesToStorage(true);

            showToast("Rules imported and saved successfully!", 'success');
        } catch (err) {
            showToast("Failed to import rules: " + err.message, 'error');
        } finally {
            // Reset input so the same file can be selected again
            importRulesInput.value = '';
        }
    };
    reader.readAsText(file);
}

function renderPartyRulesList() {
    if (!partyRulesList) return;
    if (!uniquePartiesList || uniquePartiesList.length === 0) {
        partyRulesList.innerHTML = `<p class="italic text-gray-400 dark:text-gray-500 text-center py-4">Upload a file to see parties.</p>`;
        return;
    }

    // Sync partyRulesMap from active arrays for any scanned parties
    uniquePartiesList.forEach(party => {
        const partyUpper = party.toUpperCase();
        if (excludedParties.includes(partyUpper)) {
            partyRulesMap[partyUpper] = 'keep-all';
        } else if (deduplicateParties.includes(partyUpper)) {
            partyRulesMap[partyUpper] = 'keep-latest';
        } else if (specialParties.includes(partyUpper)) {
            partyRulesMap[partyUpper] = 'marka';
        } else if (fullyExcludedParties.includes(partyUpper)) {
            partyRulesMap[partyUpper] = 'exclude';
        } else {
            if (!partyRulesMap[partyUpper]) partyRulesMap[partyUpper] = 'default';
        }
    });

    // Calculate new/unconfigured parties
    const unconfiguredCount = uniquePartiesList.filter(party => {
        const partyUpper = party.toUpperCase();
        return !excludedParties.includes(partyUpper) &&
               !deduplicateParties.includes(partyUpper) &&
               !specialParties.includes(partyUpper) &&
               !fullyExcludedParties.includes(partyUpper);
    }).length;

    const countEl = document.getElementById('partyScanCount');
    if (countEl) {
        if (unconfiguredCount > 0) {
            countEl.textContent = `${uniquePartiesList.length} parties (${unconfiguredCount} new)`;
            countEl.classList.remove('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
            countEl.classList.add('bg-emerald-100', 'text-emerald-700', 'dark:bg-emerald-950/40', 'dark:text-emerald-300');
        } else {
            countEl.textContent = `${uniquePartiesList.length} parties`;
            countEl.classList.remove('bg-emerald-100', 'text-emerald-700', 'dark:bg-emerald-950/40', 'dark:text-emerald-300');
            countEl.classList.add('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
        }
    }

    const query = partySearch.value.toLowerCase().trim();
    
    // Render sticky frozen header for checkboxes column mapping
    partyRulesList.innerHTML = `
        <div class="sticky top-0 z-10 flex items-center justify-between p-2 bg-gray-100 dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-neutral-800 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider -mx-2.5 mb-2 px-[19px] rounded-t select-none">
            <span class="flex-grow min-w-0 truncate">Party Name</span>
            <div class="flex items-center flex-shrink-0 mr-1">
                <span class="w-[75px] text-center" title="Keep All (No deduplication)">📋 All</span>
                <span class="w-[75px] text-center" title="Keep Latest Date only">🔄 Latest</span>
                <span class="w-[75px] text-center" title="Marka Grouping">🏷️ Marka</span>
                <span class="w-[75px] text-center" title="Fully Exclude Party">❌ Exclude</span>
            </div>
        </div>
    `;
    
    uniquePartiesList.forEach(party => {
        const partyUpper = party.toUpperCase();
        const activeRule = partyRulesMap[partyUpper] || 'default';

        if (query && !partyUpper.toLowerCase().includes(query)) return;
        if (filterNewOnly && activeRule !== 'default') return;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'party-rule-item flex items-center justify-between p-2 rounded border border-gray-200/50 dark:border-neutral-800 bg-white dark:bg-[#1b1b1b]/50 hover:border-gray-300 dark:hover:border-neutral-700 transition-all cursor-pointer';
        itemDiv.dataset.party = partyUpper;

        const isNew = activeRule === 'default';
        const badgeHtml = isNew ? `<span class="text-[8px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-bold ml-2 select-none uppercase tracking-wider flex-shrink-0">NEW</span>` : '';

        itemDiv.innerHTML = `
            <div class="flex items-center min-w-0 flex-grow pr-2">
                <span class="font-medium text-gray-800 dark:text-gray-200 truncate" title="${partyUpper}">${partyUpper}</span>
                ${badgeHtml}
            </div>
            <div class="flex items-center flex-shrink-0 mr-1 select-none">
                <div class="w-[75px] flex justify-center">
                    <label class="flex items-center justify-center cursor-pointer py-1 w-full h-full" title="Keep All (No deduplication)">
                        <input type="checkbox" data-rule="keep-all" ${activeRule === 'keep-all' ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-neutral-800">
                    </label>
                </div>
                <div class="w-[75px] flex justify-center">
                    <label class="flex items-center justify-center cursor-pointer py-1 w-full h-full" title="Keep Latest Date only">
                        <input type="checkbox" data-rule="keep-latest" ${activeRule === 'keep-latest' ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-neutral-800">
                    </label>
                </div>
                <div class="w-[75px] flex justify-center">
                    <label class="flex items-center justify-center cursor-pointer py-1 w-full h-full" title="Marka Grouping (Advanced)">
                        <input type="checkbox" data-rule="marka" ${activeRule === 'marka' ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-neutral-800">
                    </label>
                </div>
                <div class="w-[75px] flex justify-center">
                    <label class="flex items-center justify-center cursor-pointer py-1 w-full h-full" title="Fully Exclude Party">
                        <input type="checkbox" data-rule="exclude" ${activeRule === 'exclude' ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-neutral-800">
                    </label>
                </div>
            </div>
        `;

        itemDiv.addEventListener('click', (e) => {
            // Only set focus active if not clicking directly on a checkbox input (which has its own change listeners)
            if (e.target.tagName !== 'INPUT') {
                const rows = Array.from(partyRulesList.querySelectorAll('.party-rule-item'));
                const idx = rows.indexOf(itemDiv);
                if (idx !== -1) {
                    setActivePartyIndex(idx);
                }
            }
        });

        const checkboxes = itemDiv.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', async () => {
                const isChecked = cb.checked;
                const targetRule = cb.dataset.rule;

                if (isChecked) {
                    checkboxes.forEach(other => { if (other !== cb) other.checked = false; });
                    partyRulesMap[partyUpper] = targetRule;
                } else {
                    partyRulesMap[partyUpper] = 'default';
                }

                recompileRulesListsFromMap();
                renderChipsInUI();
                
                // Save rules silently
                await persistRulesToStorage(true);
                
                triggerReDeduplication();
            });
        });

        partyRulesList.appendChild(itemDiv);
    });
}



let activePartyIndex = -1;

function setActivePartyIndex(index) {
    const rows = partyRulesList.querySelectorAll('.party-rule-item');
    if (rows.length === 0) return;
    
    // Bounds check
    if (index < 0) index = 0;
    if (index >= rows.length) index = rows.length - 1;
    
    activePartyIndex = index;
    
    // Highlight active row and remove active class from others
    rows.forEach((row, i) => {
        if (i === index) {
            row.classList.add('bg-blue-50', 'dark:bg-blue-900/20', 'border-blue-300', 'dark:border-blue-800');
            row.scrollIntoView({ block: 'nearest', behavior: 'auto' }); // instant scroll prevents frame drops
        } else {
            row.classList.remove('bg-blue-50', 'dark:bg-blue-900/20', 'border-blue-300', 'dark:border-blue-800');
        }
    });
}

function toggleActiveRowRule(ruleNum) {
    const rows = partyRulesList.querySelectorAll('.party-rule-item');
    if (activePartyIndex < 0 || activePartyIndex >= rows.length) return;
    
    const activeRow = rows[activePartyIndex];
    const partyUpper = activeRow.dataset.party;
    
    const ruleTypes = ['keep-all', 'keep-latest', 'marka', 'exclude'];
    const targetRule = ruleTypes[ruleNum - 1];
    
    // Toggle rule
    const currentRule = partyRulesMap[partyUpper] || 'default';
    if (currentRule === targetRule) {
        partyRulesMap[partyUpper] = 'default';
    } else {
        partyRulesMap[partyUpper] = targetRule;
    }
    
    // Sync checkbox visual states on the row
    const checkboxes = activeRow.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.dataset.rule === targetRule) {
            cb.checked = (partyRulesMap[partyUpper] === targetRule);
        } else {
            cb.checked = false;
        }
    });
    
    // Save rules and re-deduplicate
    recompileRulesListsFromMap();
    renderChipsInUI();
    persistRulesToStorage(true);
    triggerReDeduplication();
    
    showToast(`Updated rule for ${partyUpper} using shortcut keys!`, 'success', 2000);
}

// Bind keyboard shortcuts locally once DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const listEl = document.getElementById('partyRulesList');
    const searchEl = document.getElementById('partySearch');
    const filterNewBtn = document.getElementById('filterNewPartiesBtn');
    
    if (filterNewBtn) {
        filterNewBtn.addEventListener('click', () => {
            filterNewOnly = !filterNewOnly;
            if (filterNewOnly) {
                filterNewBtn.classList.add('border-emerald-500', 'bg-emerald-50/50', 'dark:bg-emerald-950/20', 'text-emerald-700', 'dark:text-emerald-400');
                filterNewBtn.classList.remove('border-gray-300', 'dark:border-neutral-800', 'bg-white', 'dark:bg-[#1b1b1b]', 'text-gray-600', 'dark:text-gray-400');
            } else {
                filterNewBtn.classList.remove('border-emerald-500', 'bg-emerald-50/50', 'dark:bg-emerald-950/20', 'text-emerald-700', 'dark:text-emerald-400');
                filterNewBtn.classList.add('border-gray-300', 'dark:border-neutral-800', 'bg-white', 'dark:bg-[#1b1b1b]', 'text-gray-600', 'dark:text-gray-400');
            }
            renderPartyRulesList();
        });
    }
    
    if (searchEl) {
        searchEl.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                searchEl.blur();
                if (listEl) {
                    listEl.focus();
                    setActivePartyIndex(0);
                }
            }
        });
    }
    
    if (listEl) {
        listEl.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActivePartyIndex(activePartyIndex + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActivePartyIndex(activePartyIndex - 1);
            } else if (['1', '2', '3', '4'].includes(e.key)) {
                e.preventDefault();
                toggleActiveRowRule(parseInt(e.key));
            }
        });
    }
});
