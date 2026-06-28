// --- RULES MANAGEMENT, SETTINGS PERSISTENCE & SPELLING ---

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

async function saveDeduplicationRules() {
    excludedParties = settingsExclusions.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    deduplicateParties = settingsSpecialParties.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    specialParties = settingsMarkaParties.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    fullyExcludedParties = settingsFullyExcluded.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    
    // Sync to the map
    partyRulesMap = {};
    excludedParties.forEach(p => partyRulesMap[p] = 'keep-all');
    deduplicateParties.forEach(p => partyRulesMap[p] = 'keep-latest');
    specialParties.forEach(p => partyRulesMap[p] = 'marka');
    fullyExcludedParties.forEach(p => partyRulesMap[p] = 'exclude');
    
    await persistRulesToStorage(false);
    
    renderPartyRulesList();
    triggerReDeduplication();
}

function triggerReDeduplication() {
    if (originalJsonData || transformedData) {
        const dataSrc = transformedData || originalJsonData;
        finalDeduplicatedData = findAndKeepLatestOrders(dataSrc, excludedParties, deduplicateParties, specialParties, fullyExcludedParties);
        currentFilteredData = finalDeduplicatedData;
        applyDashboardFilters();
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
            version: "3.27",
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

            // Update memory state
            excludedParties = parsed.excludedParties || [];
            deduplicateParties = parsed.deduplicateParties || [];
            specialParties = parsed.specialParties || [];
            fullyExcludedParties = parsed.fullyExcludedParties || [];
            partyMerges = parsed.partyMerges || {};

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
                const spellingSuggestions = scanForDuplicateParties(uniquePartiesList);
                renderSpellingSuggestions(spellingSuggestions);
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

    const query = partySearch.value.toLowerCase().trim();
    partyRulesList.innerHTML = '';
    
    uniquePartiesList.forEach(party => {
        const partyUpper = party.toUpperCase();
        const activeRule = partyRulesMap[partyUpper] || 'default';

        if (query && !partyUpper.toLowerCase().includes(query)) return;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'party-rule-item flex items-center justify-between p-2 rounded border border-gray-200/50 dark:border-neutral-800 bg-white dark:bg-[#1b1b1b]/50 hover:border-gray-300 dark:hover:border-neutral-700 transition-all';
        itemDiv.dataset.party = partyUpper;

        itemDiv.innerHTML = `
            <span class="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[65%]" title="${partyUpper}">${partyUpper}</span>
            <div class="flex items-center gap-4 flex-shrink-0 mr-1">
                <label class="flex items-center justify-center cursor-pointer" title="Keep All (No deduplication)">
                    <input type="checkbox" data-rule="keep-all" ${activeRule === 'keep-all' ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-neutral-800">
                </label>
                <label class="flex items-center justify-center cursor-pointer" title="Keep Latest Date only">
                    <input type="checkbox" data-rule="keep-latest" ${activeRule === 'keep-latest' ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-neutral-800">
                </label>
                <label class="flex items-center justify-center cursor-pointer" title="Marka Grouping (Advanced)">
                    <input type="checkbox" data-rule="marka" ${activeRule === 'marka' ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-neutral-800">
                </label>
                <label class="flex items-center justify-center cursor-pointer" title="Fully Exclude Party">
                    <input type="checkbox" data-rule="exclude" ${activeRule === 'exclude' ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-neutral-800">
                </label>
            </div>
        `;

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

function scanForDuplicateParties(partiesList) {
    const suggestions = [];
    const normalizedMap = {};
    
    partiesList.forEach(party => {
        const normalized = party.toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .trim();
        if (!normalized) return;
        if (!normalizedMap[normalized]) {
            normalizedMap[normalized] = [];
        }
        normalizedMap[normalized].push(party);
    });
    
    // Check identical normalized names
    for (const normalized in normalizedMap) {
        const group = normalizedMap[normalized];
        if (group.length > 1) {
            const target = group.reduce((a, b) => a.length >= b.length ? a : b);
            group.forEach(src => {
                if (src !== target) {
                    suggestions.push({ src, target, reason: 'Identical spacing/punctuation' });
                }
            });
        }
    }
    
    // Check near-identical Levenshtein distance
    const uniqueNorms = Object.keys(normalizedMap);
    for (let i = 0; i < uniqueNorms.length; i++) {
        for (let j = i + 1; j < uniqueNorms.length; j++) {
            const normA = uniqueNorms[i];
            const normB = uniqueNorms[j];
            const dist = getLevenshteinDistance(normA, normB);
            if (dist > 0 && dist <= 2) {
                const groupA = normalizedMap[normA];
                const groupB = normalizedMap[normB];
                const srcParty = groupA[0];
                const targetParty = groupB[0];
                if (srcParty && targetParty) {
                    if (!suggestions.some(s => (s.src === srcParty && s.target === targetParty))) {
                        suggestions.push({ src: srcParty, target: targetParty, reason: `Spelling typo (edit distance: ${dist})` });
                    }
                }
            }
        }
    }
    return suggestions;
}

function renderSpellingSuggestions(suggestions) {
    if (!spellingMergeCard || !spellingMergeList) return;
    if (!suggestions || suggestions.length === 0) {
        spellingMergeCard.classList.add('hidden');
        return;
    }

    spellingMergeList.innerHTML = '';
    suggestions.forEach((s, idx) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'flex items-center justify-between py-1 bg-amber-500/5 dark:bg-amber-500/10 rounded px-2 border border-amber-500/20';
        itemDiv.innerHTML = `
            <div class="truncate max-w-[70%]" title="Merge ${s.src} into ${s.target}">
                <span class="text-red-600 dark:text-red-400 line-through font-semibold">${s.src}</span>
                <span class="text-gray-400 mx-1">➔</span>
                <span class="text-green-600 dark:text-green-400 font-semibold">${s.target}</span>
            </div>
            <button class="bg-amber-600 hover:bg-amber-700 text-white font-bold px-2 py-0.5 rounded text-[9px] transition-all flex items-center gap-0.5" data-idx="${idx}">
                Merge
            </button>
        `;
        
        const btn = itemDiv.querySelector('button');
        btn.addEventListener('click', () => {
            // Add to partyMerges map!
            partyMerges[s.src.toUpperCase()] = s.target;
            
            // Remove the source party from uniquePartiesList
            uniquePartiesList = uniquePartiesList.filter(p => p.toUpperCase() !== s.src.toUpperCase());
            
            // Hide or re-render spelling suggestions
            const remaining = suggestions.filter((_, i) => i !== idx);
            renderSpellingSuggestions(remaining);
            
            // Render updated party rules list
            renderPartyRulesList();
            
            showToast(`Merged spelling variant "${s.src}" into "${s.target}"`, 'success');
            
            // Retransform to apply new merging rules, and auto-persist!
            triggerReDeduplication();
            persistRulesToStorage(true);
        });
        
        spellingMergeList.appendChild(itemDiv);
    });
    
    spellingMergeCard.classList.remove('hidden');
    spellingMergeCard.classList.add('fade-in');
}
