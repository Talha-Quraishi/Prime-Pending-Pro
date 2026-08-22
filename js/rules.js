let filterNewOnly = false;

async function persistRulesToStorage(quiet = false) {
    if (!quiet && typeof showToast === 'function') showToast("Saving configurations...", "warning");
    
    const saveFn = typeof saveRulesToStorage === 'function' ? saveRulesToStorage : null;
    let success = false;
    if (saveFn) {
        success = await saveFn({
            excludedParties,
            deduplicateParties,
            specialParties,
            fullyExcludedParties,
            partyMerges,
            partyMonthSelections
        });
    }
    if (!quiet && typeof showToast === 'function') {
        if (success) showToast("Party rules saved successfully! ✅", "success");
        else showToast("Failed to save rules. ❌", "error");
    }
    return success;
}

function triggerReDeduplication() {
    const dataSrc = (typeof getTransformedData === 'function' ? getTransformedData() : transformedData) ||
                    (typeof getOriginalJsonData === 'function' ? getOriginalJsonData() : originalJsonData);
    if (dataSrc) {
        const dedupFn = typeof findAndKeepLatestOrders === 'function' ? findAndKeepLatestOrders : null;
        if (dedupFn) {
            const newResult = dedupFn(dataSrc, excludedParties, deduplicateParties, specialParties, fullyExcludedParties, partyMonthSelections);
            if (typeof updateProcessingResult === 'function') {
                updateProcessingResult(newResult);
            } else {
                finalDeduplicatedData = newResult;
                currentFilteredData = newResult;
                if (typeof applyDashboardFilters === 'function') applyDashboardFilters();
                if (typeof regenerateWorkbook === 'function') regenerateWorkbook();
            }
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

        // Render new chips using safe DOM methods
        arr.forEach(party => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            
            const spanText = document.createElement('span');
            spanText.textContent = party;
            
            const delSpan = document.createElement('span');
            delSpan.className = 'chip-delete';
            delSpan.dataset.party = party;
            delSpan.dataset.type = type;
            delSpan.textContent = '×';
            
            chip.appendChild(spanText);
            chip.appendChild(delSpan);
            container.insertBefore(chip, input);
        });
    });

    // Re-apply rules search filter
    applyRulesSearchFilter();
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

            // Conflict check
            const existingType = partyRulesMap[val];
            if (existingType && existingType !== 'default' && existingType !== type) {
                let categoryName = 'another list';
                if (existingType === 'keep-all') categoryName = 'Keep All Orders';
                else if (existingType === 'keep-latest') categoryName = 'Keep Latest Date Only';
                else if (existingType === 'marka') categoryName = 'Marka Grouping';
                else if (existingType === 'exclude') categoryName = 'Fully Excluded';
                
                showToast(`Conflict: "${val}" is already configured under "${categoryName}"!`, "error");
                input.value = '';
                return;
            }

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
            partyMerges: partyMerges || {},
            partyMonthSelections: partyMonthSelections || {}
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
            const rawParsed = JSON.parse(e.target.result);
            if (!rawParsed) throw new Error("File content is empty or invalid JSON.");

            const migrationFn = typeof migrateRulesData === 'function' ? migrateRulesData : (d => d);
            const parsed = migrationFn(rawParsed);

            // Update memory state with uppercase normalization
            excludedParties = parsed.excludedParties || [];
            deduplicateParties = parsed.deduplicateParties || [];
            specialParties = parsed.specialParties || [];
            fullyExcludedParties = parsed.fullyExcludedParties || [];
            partyMerges = parsed.partyMerges || {};
            partyMonthSelections = parsed.partyMonthSelections || {};

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
        partyRulesList.textContent = '';
        const emptyP = document.createElement('p');
        emptyP.className = 'italic text-gray-400 dark:text-gray-500 text-center py-4';
        emptyP.textContent = 'Upload a file to see parties.';
        partyRulesList.appendChild(emptyP);
        return;
    }

    const dataSrc = (typeof getTransformedData === 'function' ? getTransformedData() : transformedData) ||
                    (typeof getOriginalJsonData === 'function' ? getOriginalJsonData() : originalJsonData) || [];
    let partyMonthsMap = typeof getPartyMonthsMap === 'function' ? getPartyMonthsMap(dataSrc) : {};
    
    // If transformed data is not ready yet, use scannedPartyMonthsMap
    if (Object.keys(partyMonthsMap).length === 0 && typeof scannedPartyMonthsMap !== 'undefined' && scannedPartyMonthsMap) {
        partyMonthsMap = scannedPartyMonthsMap;
    }

    // Sync partyRulesMap from active arrays for any scanned parties
    uniquePartiesList.forEach(party => {
        const partyUpper = party.toUpperCase();
        if (typeof classifyPartyRule === 'function') {
            const classified = classifyPartyRule(partyUpper, {
                excludedParties,
                deduplicateParties,
                specialParties,
                fullyExcludedParties
            });
            if (classified === 'KEEP_ALL') partyRulesMap[partyUpper] = 'keep-all';
            else if (classified === 'KEEP_LATEST_DATE') partyRulesMap[partyUpper] = 'keep-latest';
            else if (classified === 'MARKA_GROUPING') partyRulesMap[partyUpper] = 'marka';
            else if (classified === 'FULLY_EXCLUDED') partyRulesMap[partyUpper] = 'exclude';
            else if (!partyRulesMap[partyUpper]) partyRulesMap[partyUpper] = 'default';
        } else {
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
        }
    });

    // Calculate new/unconfigured parties
    const unconfiguredCount = uniquePartiesList.filter(party => {
        const partyUpper = party.toUpperCase();
        if (typeof classifyPartyRule === 'function') {
            return classifyPartyRule(partyUpper, { excludedParties, deduplicateParties, specialParties, fullyExcludedParties }) === 'DEFAULT';
        }
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

    const query = (partySearch && partySearch.value) ? partySearch.value.toLowerCase().trim() : '';
    partyRulesList.textContent = '';
    
    uniquePartiesList.forEach(party => {
        const partyUpper = party.toUpperCase();
        const activeRule = partyRulesMap[partyUpper] || 'default';

        if (query && !partyUpper.toLowerCase().includes(query)) return;
        if (filterNewOnly && activeRule !== 'default') return;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'party-rule-item flex items-center justify-between p-2 px-3 rounded-lg border border-gray-200/60 dark:border-neutral-800 bg-white dark:bg-[#1b1b1b]/50 hover:border-blue-400/50 dark:hover:border-blue-600/50 transition-all cursor-pointer mb-1.5 gap-2';
        itemDiv.dataset.party = partyUpper;

        const nameContainer = document.createElement('div');
        nameContainer.className = 'flex items-center min-w-0 flex-grow pr-2 gap-1.5 flex-wrap';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'font-semibold text-gray-800 dark:text-gray-200 truncate text-xs';
        nameSpan.title = partyUpper;
        nameSpan.textContent = partyUpper;
        nameContainer.appendChild(nameSpan);

        if (activeRule === 'default') {
            const badge = document.createElement('span');
            badge.className = 'text-[8px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-bold select-none uppercase tracking-wider flex-shrink-0';
            badge.textContent = 'UNCHECKED';
            nameContainer.appendChild(badge);
        }

        // Render detected order months badges inline for this party
        const detectedMonths = (partyMonthsMap && partyMonthsMap[partyUpper]) ? partyMonthsMap[partyUpper] : [];
        if (detectedMonths.length > 0) {
            const monthsWrapper = document.createElement('div');
            monthsWrapper.className = 'flex items-center gap-1 flex-wrap select-none ml-1';

            const curSelections = partyMonthSelections[partyUpper] || [];
            const hasActiveFilter = curSelections.length > 0;

            detectedMonths.forEach(mKey => {
                const isSelected = curSelections.includes(mKey);
                const labelText = typeof formatMonthKey === 'function' ? formatMonthKey(mKey) : mKey;

                const mChip = document.createElement('button');
                mChip.type = 'button';
                mChip.dataset.month = mKey;
                mChip.dataset.party = partyUpper;

                if (isSelected) {
                    mChip.className = 'px-1.5 py-0.5 text-[8.5px] font-bold rounded bg-blue-600 text-white shadow-xs hover:bg-blue-700 transition-all flex items-center gap-0.5 cursor-pointer';
                    mChip.innerHTML = `<span>${labelText}</span><span class="text-[7.5px] font-bold">✓</span>`;
                    mChip.title = `Currently keeping orders from ${labelText}. Click to remove filter.`;
                } else if (hasActiveFilter) {
                    mChip.className = 'px-1.5 py-0.5 text-[8.5px] font-medium rounded bg-gray-100 dark:bg-neutral-800 text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-gray-300 border border-dashed border-gray-300 dark:border-neutral-700 transition-all cursor-pointer';
                    mChip.textContent = labelText;
                    mChip.title = `Click to also include orders from ${labelText}`;
                } else {
                    mChip.className = 'px-1.5 py-0.5 text-[8.5px] font-medium rounded bg-gray-100/80 dark:bg-neutral-800/80 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 border border-gray-200/80 dark:border-neutral-700 transition-all cursor-pointer';
                    mChip.textContent = labelText;
                    mChip.title = `Click to keep ONLY ${labelText} orders`;
                }

                mChip.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    let current = partyMonthSelections[partyUpper] || [];
                    if (current.length === 0) {
                        partyMonthSelections[partyUpper] = [mKey];
                    } else if (current.includes(mKey)) {
                        partyMonthSelections[partyUpper] = current.filter(m => m !== mKey);
                        if (partyMonthSelections[partyUpper].length === 0) {
                            delete partyMonthSelections[partyUpper];
                        }
                    } else {
                        partyMonthSelections[partyUpper] = [...current, mKey];
                    }

                    await persistRulesToStorage(true);
                    renderPartyRulesList();
                    triggerReDeduplication();
                });

                monthsWrapper.appendChild(mChip);
            });

            if (curSelections.length > 0) {
                const resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.className = 'px-1 py-0.5 text-[8px] font-medium rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 transition-all cursor-pointer';
                resetBtn.textContent = 'All Months';
                resetBtn.title = 'Reset to keep orders from all months';
                resetBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    delete partyMonthSelections[partyUpper];
                    await persistRulesToStorage(true);
                    renderPartyRulesList();
                    triggerReDeduplication();
                });
                monthsWrapper.appendChild(resetBtn);
            }

            nameContainer.appendChild(monthsWrapper);
        }

        itemDiv.appendChild(nameContainer);

        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'flex items-center flex-shrink-0 mr-1 select-none';

        const rules = [
            { rule: 'keep-all', title: 'Keep All (No deduplication)' },
            { rule: 'keep-latest', title: 'Keep Latest Date only' },
            { rule: 'marka', title: 'Marka Grouping (Advanced)' },
            { rule: 'exclude', title: 'Fully Exclude Party' }
        ];

        rules.forEach(r => {
            const wrap = document.createElement('div');
            wrap.className = 'w-[75px] flex justify-center';

            const label = document.createElement('label');
            label.className = 'flex items-center justify-center cursor-pointer py-1 w-full h-full';
            label.title = r.title;

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.rule = r.rule;
            input.checked = (activeRule === r.rule);
            input.className = 'w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-neutral-800';

            label.appendChild(input);
            wrap.appendChild(label);
            actionsContainer.appendChild(wrap);
        });
        itemDiv.appendChild(actionsContainer);

        itemDiv.addEventListener('click', (e) => {
            const rows = Array.from(partyRulesList.querySelectorAll('.party-rule-item'));
            const idx = rows.indexOf(itemDiv);
            if (idx !== -1) {
                setActivePartyIndex(idx);
                partyRulesList.focus();
            }
        });

        const checkboxes = itemDiv.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', async () => {
                const rows = Array.from(partyRulesList.querySelectorAll('.party-rule-item'));
                const idx = rows.indexOf(itemDiv);
                if (idx !== -1) {
                    setActivePartyIndex(idx);
                }

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
                await persistRulesToStorage(true);
                renderPartyRulesList();
                triggerReDeduplication();
            });
        });

        partyRulesList.appendChild(itemDiv);
    });

    // Re-apply active row highlighting or default to first row if available
    const rows = partyRulesList.querySelectorAll('.party-rule-item');
    if (rows.length > 0) {
        const safeIdx = activePartyIndex >= 0 ? Math.min(activePartyIndex, rows.length - 1) : 0;
        setActivePartyIndex(safeIdx);
    }
}

let activePartyIndex = -1;

function setActivePartyIndex(index) {
    const listEl = document.getElementById('partyRulesList');
    if (!listEl) return;
    const rows = listEl.querySelectorAll('.party-rule-item');
    if (rows.length === 0) return;
    
    // Bounds check
    if (index < 0) index = 0;
    if (index >= rows.length) index = rows.length - 1;
    
    activePartyIndex = index;
    
    // Highlight active row and remove active class from others
    rows.forEach((row, i) => {
        if (i === index) {
            row.classList.add('active-party-row');
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            row.classList.remove('active-party-row');
        }
    });
}

function toggleActiveRowRule(ruleNum) {
    const listEl = document.getElementById('partyRulesList');
    if (!listEl) return;
    const rows = listEl.querySelectorAll('.party-rule-item');
    if (activePartyIndex < 0 || activePartyIndex >= rows.length) return;
    
    const activeRow = rows[activePartyIndex];
    const partyUpper = activeRow.dataset.party;
    if (!partyUpper) return;
    
    const ruleTypes = ['keep-all', 'keep-latest', 'marka', 'exclude'];
    const ruleLabels = { 'keep-all': 'Keep All', 'keep-latest': 'Keep Latest Date', 'marka': 'Marka Grouping', 'exclude': 'Fully Excluded' };

    // Reset to default
    if (ruleNum === 0) {
        partyRulesMap[partyUpper] = 'default';
        const checkboxes = activeRow.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => { cb.checked = false; });
        recompileRulesListsFromMap();
        renderChipsInUI();
        persistRulesToStorage(true);
        triggerReDeduplication();
        if (typeof showToast === 'function') {
            showToast(`Reset ${partyUpper} to Default`, 'info', 1500);
        }
        return;
    }

    const targetRule = ruleTypes[ruleNum - 1];
    if (!targetRule) return;
    
    // Toggle rule
    const currentRule = partyRulesMap[partyUpper] || 'default';
    if (currentRule === targetRule) {
        partyRulesMap[partyUpper] = 'default';
        if (typeof showToast === 'function') {
            showToast(`Reset ${partyUpper} to Default`, 'info', 1500);
        }
    } else {
        partyRulesMap[partyUpper] = targetRule;
        if (typeof showToast === 'function') {
            showToast(`Set ${partyUpper} → [${ruleLabels[targetRule] || targetRule}]`, 'success', 1500);
        }
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
    
    recompileRulesListsFromMap();
    renderChipsInUI();
    persistRulesToStorage(true);
    triggerReDeduplication();
}

// Global and local keyboard shortcuts for Party Rules List
document.addEventListener('keydown', (e) => {
    const target = e.target;
    const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const searchEl = document.getElementById('partySearch');
    const listEl = document.getElementById('partyRulesList');

    // Handle party search navigation
    if (target && target === searchEl) {
        if (e.key === 'ArrowDown' || e.key === 'Down' || e.key === 'Enter') {
            e.preventDefault();
            searchEl.blur();
            if (listEl) {
                listEl.focus();
                setActivePartyIndex(activePartyIndex >= 0 ? activePartyIndex : 0);
            }
        }
        return;
    }

    // Ignore single-key shortcuts when typing in other inputs/textareas
    if (isInput) return;

    // Check if party rules list exists and has items
    if (listEl) {
        const rows = listEl.querySelectorAll('.party-rule-item');
        if (rows.length > 0) {
            if (e.key === 'ArrowDown' || e.key === 'Down') {
                e.preventDefault();
                setActivePartyIndex(activePartyIndex < 0 ? 0 : activePartyIndex + 1);
                return;
            }
            if (e.key === 'ArrowUp' || e.key === 'Up') {
                e.preventDefault();
                setActivePartyIndex(activePartyIndex <= 0 ? 0 : activePartyIndex - 1);
                return;
            }
            if (['1', '2', '3', '4'].includes(e.key)) {
                e.preventDefault();
                if (activePartyIndex < 0) {
                    setActivePartyIndex(0);
                }
                toggleActiveRowRule(parseInt(e.key));
                return;
            }
            if (e.key === '0' || e.key === 'Delete') {
                if (activePartyIndex >= 0) {
                    e.preventDefault();
                    toggleActiveRowRule(0);
                    return;
                }
            }
        }
    }
});

// Bind UI event listeners once DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
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
        searchEl.addEventListener('input', () => {
            renderPartyRulesList();
        });
        searchEl.addEventListener('search', () => {
            renderPartyRulesList();
        });
    }

    const rulesSearchEl = document.getElementById('rulesSearchInput');
    if (rulesSearchEl) {
        rulesSearchEl.addEventListener('input', () => {
            applyRulesSearchFilter();
        });
    }
});

/**
 * Filter configured rule chips across all 4 lists in the Settings pane
 */
function applyRulesSearchFilter() {
    const searchInput = document.getElementById('rulesSearchInput');
    if (!searchInput) return;
    const query = searchInput.value.trim().toUpperCase();

    const containers = [
        'chipContainerExclusions',
        'chipContainerLatest',
        'chipContainerMarka',
        'chipContainerExcluded'
    ];

    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;

        const chips = container.querySelectorAll('.chip');
        chips.forEach(chip => {
            const span = chip.querySelector('span');
            if (!span) return;
            const partyName = span.textContent.trim().toUpperCase();
            if (!query || partyName.includes(query)) {
                chip.style.display = '';
            } else {
                chip.style.display = 'none';
            }
        });
    });
}
