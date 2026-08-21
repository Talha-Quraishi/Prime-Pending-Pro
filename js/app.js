/**
 * Prime-Pending-Pro - Main Application Orchestrator
 * Coordinates UI views, Web Worker processing pipelines, rules management, and storage.
 */

// --- Global Application State ---
let originalJsonData = null;
let transformedData = null;
let finalDeduplicatedData = null; // Single source of truth for processed pending orders
let currentFilteredData = null;   // Active view after search/filter
let uniquePartiesList = [];       // Unique parties list from active file

let originalFileName = '';
let processedWbout = null;
let uploadedFileData = null;
let isRestoringFromHistory = false;

let originalExcelButtonHTML = '';
let activeProcessWorker = null;
let processingStartTime = 0;

// Deduplication Rules Arrays (Loaded from config.json or localStorage)
let excludedParties = [];           // "Keep All Orders"
let deduplicateParties = [];        // "Keep Latest Only"
let specialParties = [];            // Marka grouping
let fullyExcludedParties = [];      // Exclude completely
let partyRulesMap = {};             // Map of partyName -> rule
let partyMerges = {};               // Map of spellingMistakePartyName -> correctedPartyName 

function setFinalDeduplicatedData(data) {
    finalDeduplicatedData = data;
    if (finalDeduplicatedData) {
        finalDeduplicatedData.forEach(row => {
            const pName = String(row['PARTY NAME'] || '');
            const iName = String(row['ITEM NAME'] || '');
            const partNo = String(row['PART NO.'] || '');
            row._searchStr = (pName + ' ' + iName + ' ' + partNo).toLowerCase();
            
            const orderNo = String(row['ORDER NO'] || '').toUpperCase();
            row._isDel = orderNo.startsWith('DEL');
            row._isApr = orderNo.startsWith('APR');
        });
    }
}

function cancelAnimation() {}

function updateProgressUI(percent, statusText) {
    const progressBar = document.getElementById('progressBar');
    const processingStatus = document.getElementById('processingStatus');
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (processingStatus) processingStatus.textContent = `${statusText} (${percent}%)`;
}

function showError(type, err) {
    const messageText = document.getElementById('messageText');
    const simpleMessage = document.getElementById('simpleMessage');
    const showErrorLink = document.getElementById('showErrorLink');
    const detailedError = document.getElementById('detailedError');

    const errorMessages = {
        errorNoFile: "Please select an Excel file first.",
        errorInvalidFile: "Invalid file format. Please upload a .xlsx, .xls, or .csv file.",
        errorRead: "Error reading the selected file. The file may be corrupt or locked.",
        errorProcessing: "An error occurred while processing the file. Please verify the schema."
    };

    const msg = errorMessages[type] || "An unexpected error occurred.";
    if (messageText) messageText.textContent = msg;
    if (simpleMessage) {
        simpleMessage.classList.remove('text-green-500', 'dark:text-green-400');
        simpleMessage.classList.add('text-red-500', 'dark:text-red-400');
    }

    if (err && detailedError && showErrorLink) {
        detailedError.textContent = err.stack || err.message || String(err);
        showErrorLink.classList.remove('hidden');
    }
    if (typeof showToast === 'function') {
        showToast(msg, 'error');
    }
}

// --- Main Processing Pipeline ---

function processFile() {
    const fileInput = document.getElementById('fileInput');
    const transformButton = document.getElementById('transformButton');
    const processingContainer = document.getElementById('processingContainer');
    const messageText = document.getElementById('messageText');
    const showErrorLink = document.getElementById('showErrorLink');
    const detailedError = document.getElementById('detailedError');
    const progressBar = document.getElementById('progressBar');
    const excelStylingToggle = document.getElementById('excelStylingToggle');
    const uploadContainer = document.getElementById('fileDropArea');
    const downloadContainer = document.getElementById('downloadContainer');
    const resetButton = document.getElementById('resetButton');
    const simpleMessage = document.getElementById('simpleMessage');

    if (!fileInput || !fileInput.file) { showError('errorNoFile', null); return; }
    if (transformButton) transformButton.classList.add('hidden');
    if (processingContainer) processingContainer.classList.remove('hidden');
    if (messageText) messageText.textContent = '';
    if (showErrorLink) showErrorLink.classList.add('hidden');
    if (detailedError) detailedError.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
    processingStartTime = Date.now();

    const dashSkeleton = document.getElementById('dashboardSkeletonState');
    const dashEmpty = document.getElementById('dashboardEmptyState');
    const dashContent = document.getElementById('dashboardContent');
    if (dashSkeleton) dashSkeleton.classList.remove('hidden');
    if (dashEmpty) dashEmpty.classList.add('hidden');
    if (dashContent) dashContent.classList.add('hidden');
    updateProgressUI(5, "Reading raw file data...");

    const file = fileInput.file;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const fileData = new Uint8Array(e.target.result);
            uploadedFileData = fileData;
            updateProgressUI(15, "Initializing processing engine...");

            const enableExcelStyling = excelStylingToggle ? excelStylingToggle.checked : true;
            const res = await processWorkbook({
                fileData,
                rules: {
                    excludedParties,
                    deduplicateParties,
                    specialParties,
                    partyMerges,
                    fullyExcludedParties
                },
                enableExcelStyling,
                onProgress: updateProgressUI
            });

            updateProgressUI(100, "Transformation complete! Rendering interface...");
            originalJsonData = res.originalJson;
            transformedData = res.transformed;
            setFinalDeduplicatedData(res.finalDeduplicated);
            processedWbout = res.wbout;

            if (transformedData && transformedData.length > 0) {
                uniquePartiesList = [...new Set(transformedData.map(r => String(r['PARTY NAME']).trim()))].filter(Boolean).sort();
                if (typeof updatePartiesDatalist === 'function') updatePartiesDatalist();
                if (typeof renderPartyRulesList === 'function') renderPartyRulesList();
            }

            setTimeout(() => {
                const statTotalRows = document.getElementById('statTotalRows');
                if (statTotalRows && originalJsonData) statTotalRows.textContent = originalJsonData.length;

                setTimeout(() => {
                    if (processingContainer) processingContainer.classList.add('hidden');
                    if (uploadContainer) uploadContainer.classList.add('hidden');
                    if (downloadContainer) {
                        downloadContainer.classList.remove('hidden');
                        downloadContainer.classList.add('fade-in');
                    }
                    if (resetButton) {
                        resetButton.classList.remove('hidden');
                        resetButton.classList.add('fade-in');
                    }
                    
                    const durationSec = ((Date.now() - processingStartTime) / 1000).toFixed(1) + 's';
                    const postSummary = document.getElementById('postProcessSummary');
                    if (postSummary) {
                        const inputCount = originalJsonData ? originalJsonData.length : 0;
                        const outputCount = finalDeduplicatedData ? finalDeduplicatedData.length : 0;
                        const transCount = transformedData ? transformedData.length : 0;
                        const removedCount = Math.max(0, transCount - outputCount);
                        
                        const inEl = document.getElementById('summaryInputRows');
                        const outEl = document.getElementById('summaryOutputRows');
                        const remEl = document.getElementById('summaryRemovedRows');
                        const timeEl = document.getElementById('summaryTimeTaken');
                        if (inEl) inEl.textContent = typeof formatIndianNumber === 'function' ? formatIndianNumber(inputCount) : inputCount.toLocaleString('en-IN');
                        if (outEl) outEl.textContent = typeof formatIndianNumber === 'function' ? formatIndianNumber(outputCount) : outputCount.toLocaleString('en-IN');
                        if (remEl) remEl.textContent = typeof formatIndianNumber === 'function' ? formatIndianNumber(removedCount) : removedCount.toLocaleString('en-IN');
                        if (timeEl) timeEl.textContent = durationSec;
                        postSummary.classList.remove('hidden');
                    }

                    currentFilteredData = finalDeduplicatedData;
                    if (typeof setFilterType === 'function') setFilterType('ALL');
                    
                    if (!isRestoringFromHistory && typeof saveCurrentUploadToHistory === 'function') {
                        const totalRows = originalJsonData ? originalJsonData.length : 0;
                        const uniqueParties = uniquePartiesList ? uniquePartiesList.length : 0;
                        const totalValue = finalDeduplicatedData ? finalDeduplicatedData.reduce((acc, r) => acc + (typeof safeParseFloat === 'function' ? safeParseFloat(r['VALUE']) : (parseFloat(r['VALUE']) || 0)), 0) : 0;
                        const totalQty = finalDeduplicatedData ? finalDeduplicatedData.reduce((acc, r) => acc + (typeof safeParseFloat === 'function' ? safeParseFloat(r['BALANCE']) : (parseFloat(r['BALANCE']) || 0)), 0) : 0;
                        saveCurrentUploadToHistory({ totalRows, uniqueParties, totalValue, totalQty });
                    }
                    isRestoringFromHistory = false;
                    
                    if (messageText) messageText.textContent = "File processed successfully!";
                    if (simpleMessage) {
                        simpleMessage.classList.remove('text-red-500', 'dark:text-red-400');
                        simpleMessage.classList.add('text-green-500', 'dark:text-green-400');
                    }
                    if (typeof showToast === 'function') showToast("File processed successfully!", 'success');
                }, 150);
            }, 200);
        } catch (procErr) {
            showError('errorProcessing', procErr);
            if (processingContainer) processingContainer.classList.add('hidden');
            if (transformButton) transformButton.classList.remove('hidden');
        }
    };
    reader.onerror = function(e) {
        cancelAnimation();
        showError('errorRead', e.target.error);
        if (processingContainer) processingContainer.classList.add('hidden');
        if (transformButton) transformButton.classList.remove('hidden');
    };
    reader.readAsArrayBuffer(file);
}

function resetUI() {
    cancelAnimation();
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileName');
    const messageText = document.getElementById('messageText');
    const simpleMessage = document.getElementById('simpleMessage');
    const showErrorLink = document.getElementById('showErrorLink');
    const detailedError = document.getElementById('detailedError');
    const uploadContainer = document.getElementById('fileDropArea');
    const transformButton = document.getElementById('transformButton');
    const downloadContainer = document.getElementById('downloadContainer');
    const resetButton = document.getElementById('resetButton');
    const processingContainer = document.getElementById('processingContainer');
    const progressBar = document.getElementById('progressBar');
    const searchInput = document.getElementById('searchInput');

    if (fileInput) { fileInput.value = ''; fileInput.file = null; }
    originalJsonData = null;
    transformedData = null;
    setFinalDeduplicatedData(null);
    currentFilteredData = null;
    originalFileName = '';
    processedWbout = null;
    uploadedFileData = null;
    
    if (fileNameDisplay) fileNameDisplay.textContent = '';
    if (messageText) messageText.textContent = '';
    if (simpleMessage) {
        simpleMessage.classList.remove('text-green-500', 'dark:text-green-400');
        simpleMessage.classList.add('text-red-500', 'dark:text-red-400');
    }
    if (showErrorLink) showErrorLink.classList.add('hidden');
    if (detailedError) detailedError.classList.add('hidden');
    
    if (uploadContainer) uploadContainer.classList.remove('hidden');
    if (transformButton) {
        transformButton.classList.remove('hidden');
        transformButton.disabled = true;
    }

    const previewEmpty = document.getElementById('previewEmptyState');
    const fileStats = document.getElementById('fileStatsContainer');
    const schemaValidation = document.getElementById('schemaValidationContainer');
    const postSummary = document.getElementById('postProcessSummary');
    const statFileName = document.getElementById('statFileName');
    const statFileSize = document.getElementById('statFileSize');
    const statTotalRows = document.getElementById('statTotalRows');

    if (previewEmpty) previewEmpty.classList.remove('hidden');
    if (fileStats) fileStats.classList.add('hidden');
    if (schemaValidation) schemaValidation.classList.add('hidden');
    if (postSummary) postSummary.classList.add('hidden');
    if (statFileName) statFileName.textContent = '';
    if (statFileSize) statFileSize.textContent = '';
    if (statTotalRows) statTotalRows.textContent = '0';

    if (downloadContainer) downloadContainer.classList.add('hidden');
    if (resetButton) resetButton.classList.add('hidden');
    if (processingContainer) processingContainer.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
    
    const dashContent = document.getElementById('dashboardContent');
    const dashSkeleton = document.getElementById('dashboardSkeletonState');
    const dashEmpty = document.getElementById('dashboardEmptyState');
    if (dashContent) dashContent.classList.add('hidden');
    if (dashSkeleton) dashSkeleton.classList.add('hidden');
    if (dashEmpty) dashEmpty.classList.remove('hidden');
    
    if (chartPartiesInstance) { chartPartiesInstance.destroy(); chartPartiesInstance = null; }
    if (chartItemsInstance) { chartItemsInstance.destroy(); chartItemsInstance = null; }
    if (chartTrendInstance) { chartTrendInstance.destroy(); chartTrendInstance = null; }
    if (chartDistributionInstance) { chartDistributionInstance.destroy(); chartDistributionInstance = null; }
    if (chartAgingInstance) { chartAgingInstance.destroy(); chartAgingInstance = null; }
    
    if (searchInput) searchInput.value = '';

    const dashTotalValueDisplay = document.getElementById('dashTotalValueDisplay');
    const dashTotalQtyDisplay = document.getElementById('dashTotalQtyDisplay');
    const dashUniqueItemsDisplay = document.getElementById('dashUniqueItemsDisplay');
    const dashUniquePartiesDisplay = document.getElementById('dashUniquePartiesDisplay');
    if (dashTotalValueDisplay) dashTotalValueDisplay.textContent = '₹0';
    if (dashTotalQtyDisplay) dashTotalQtyDisplay.textContent = '0';
    if (dashUniqueItemsDisplay) dashUniqueItemsDisplay.textContent = '0';
    if (dashUniquePartiesDisplay) dashUniquePartiesDisplay.textContent = '0';

    if (typeof setPriceMode === 'function') setPriceMode('MRP');

    uniquePartiesList = [];
    if (typeof updatePartiesDatalist === 'function') updatePartiesDatalist();
    const partySelectorCard = document.getElementById('partySelectorCard');
    if (partySelectorCard) partySelectorCard.classList.add('hidden');
    const partyRulesList = document.getElementById('partyRulesList');
    if (partyRulesList) partyRulesList.textContent = '';
}

async function persistConfigValue(key, value) {
    if (window.electronAPI) {
        const config = await window.electronAPI.loadConfig() || {};
        config[key] = value;
        await window.electronAPI.saveConfig(config);
    } else {
        localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : value);
    }
}

// --- Application Initialization Coordinator ---

async function initializeApp() {
    let versionStr = '3.30.21';
    if (window.electronAPI && window.electronAPI.getAppVersion) {
        try {
            versionStr = await window.electronAPI.getAppVersion();
        } catch (e) {
            console.warn("Could not retrieve version from electronAPI:", e);
        }
    }
    
    document.title = `Pending Order Maker v${versionStr}`;
    const titlebarVer = document.getElementById('titlebarVersion');
    if (titlebarVer) titlebarVer.textContent = `Prime Pending Pro v${versionStr}`;
    const updateBadge = document.getElementById('updateVersionBadge');
    if (updateBadge) updateBadge.textContent = `v${versionStr}`;
    const aboutLabel = document.getElementById('aboutVersionLabel');
    if (aboutLabel) aboutLabel.textContent = `v${versionStr} (Talha)`;
    const watermarkEl = document.getElementById('watermark');
    if (watermarkEl) watermarkEl.title = `Prime Pending Pro v${versionStr}`;

    let config = {};
    if (window.electronAPI) {
        const watermarkVer = document.getElementById('watermarkVersion');
        if (watermarkVer) watermarkVer.textContent = `v${versionStr} (Desktop)`;
        const verDisp = document.getElementById('versionDisplay');
        if (verDisp) verDisp.textContent = `v${versionStr} (Desktop)`;
        config = await window.electronAPI.loadConfig() || {};
    } else {
        const watermarkVer = document.getElementById('watermarkVersion');
        if (watermarkVer) watermarkVer.textContent = `v${versionStr} • Created by Talha`;
        const verDisp = document.getElementById('versionDisplay');
        if (verDisp) verDisp.textContent = `v${versionStr}`;
        try {
            config = {
                theme: localStorage.getItem('theme'),
                sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
                excludedParties: JSON.parse(localStorage.getItem('excludedParties')),
                deduplicateParties: JSON.parse(localStorage.getItem('deduplicateParties')),
                specialParties: JSON.parse(localStorage.getItem('specialParties')),
                fullyExcludedParties: JSON.parse(localStorage.getItem('fullyExcludedParties')),
                partyMerges: JSON.parse(localStorage.getItem('partyMerges')),
                enableExcelStyling: localStorage.getItem('enableExcelStyling') !== 'false',
                performanceMode: localStorage.getItem('performanceMode') === 'true'
            };
        } catch (e) {
            config = {};
        }
    }

    // Set deduplication rules from loaded configuration
    if (config.excludedParties && Array.isArray(config.excludedParties)) {
        excludedParties = config.excludedParties.map(p => String(p).toUpperCase());
    }
    if (config.deduplicateParties && Array.isArray(config.deduplicateParties)) {
        deduplicateParties = config.deduplicateParties.map(p => String(p).toUpperCase());
    }
    if (config.specialParties && Array.isArray(config.specialParties)) {
        specialParties = config.specialParties.map(p => String(p).toUpperCase());
    }
    if (config.fullyExcludedParties && Array.isArray(config.fullyExcludedParties)) {
        fullyExcludedParties = config.fullyExcludedParties.map(p => String(p).toUpperCase());
    }
    if (config.partyMerges && typeof config.partyMerges === 'object') {
        partyMerges = {};
        for (const key in config.partyMerges) {
            partyMerges[key.toUpperCase()] = config.partyMerges[key];
        }
    }

    partyRulesMap = {};
    excludedParties.forEach(p => partyRulesMap[p] = 'keep-all');
    deduplicateParties.forEach(p => partyRulesMap[p] = 'keep-latest');
    specialParties.forEach(p => partyRulesMap[p] = 'marka');
    fullyExcludedParties.forEach(p => partyRulesMap[p] = 'exclude');

    if (typeof renderChipsInUI === 'function') renderChipsInUI();
    if (typeof setupChipInputListeners === 'function') setupChipInputListeners();

    // Initialize modules
    if (typeof initializeNavigation === 'function') initializeNavigation();
    if (typeof initializeSettingsUI === 'function') initializeSettingsUI();
    if (typeof initializeHistory === 'function') initializeHistory();
    if (typeof initializeDashboard === 'function') initializeDashboard();
    if (typeof initializeDragAndDrop === 'function') initializeDragAndDrop();

    const savedTheme = config.theme;
    let initialTheme = savedTheme === 'dark' ? 'dark' : (savedTheme === 'light' ? 'light' : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    if (typeof applyTheme === 'function') applyTheme(initialTheme);

    const sidebar = document.getElementById('sidebar');
    if (config.sidebarCollapsed && sidebar) {
        sidebar.classList.add('collapsed');
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }

    const excelStylingToggle = document.getElementById('excelStylingToggle');
    if (excelStylingToggle) {
        excelStylingToggle.checked = config.enableExcelStyling !== false;
    }

    const performanceModeToggle = document.getElementById('performanceModeToggle');
    if (performanceModeToggle) {
        performanceModeToggle.checked = config.performanceMode === true;
        if (config.performanceMode === true) {
            document.documentElement.classList.add('low-spec');
        }
    }

    const downloadExcelButton = document.getElementById('downloadExcelButton');
    if (downloadExcelButton) {
        originalExcelButtonHTML = downloadExcelButton.innerHTML;
        if (typeof downloadTransformedFile === 'function') {
            downloadExcelButton.addEventListener('click', downloadTransformedFile);
        }
    }

    const transformButton = document.getElementById('transformButton');
    if (transformButton) transformButton.addEventListener('click', processFile);

    const resetButton = document.getElementById('resetButton');
    if (resetButton) resetButton.addEventListener('click', resetUI);

    const cancelProcessButton = document.getElementById('cancelProcessButton');
    if (cancelProcessButton) {
        cancelProcessButton.addEventListener('click', () => {
            if (typeof cancelProcessing === 'function') {
                cancelProcessing();
            }
            const processingContainer = document.getElementById('processingContainer');
            const transformButton = document.getElementById('transformButton');
            const fileInput = document.getElementById('fileInput');
            const progressBar = document.getElementById('progressBar');
            const messageText = document.getElementById('messageText');
            const simpleMessage = document.getElementById('simpleMessage');

            if (processingContainer) processingContainer.classList.add('hidden');
            if (transformButton) {
                transformButton.classList.remove('hidden');
                if (fileInput && fileInput.file) transformButton.disabled = false;
            }
            if (progressBar) progressBar.style.width = '0%';
            if (messageText) messageText.textContent = "Processing cancelled by user.";
            if (simpleMessage) {
                simpleMessage.classList.remove('text-green-500', 'dark:text-green-400');
                simpleMessage.classList.add('text-yellow-500', 'dark:text-yellow-400');
            }
            if (typeof showToast === 'function') showToast("File processing cancelled.", "warning");
        });
    }

    // Party rules search filter
    const partySearch = document.getElementById('partySearch');
    const partyRulesList = document.getElementById('partyRulesList');
    if (partySearch && partyRulesList) {
        partySearch.addEventListener('input', (typeof debounce === 'function' ? debounce : (fn) => fn)(() => {
            const query = partySearch.value.toLowerCase().trim();
            const items = partyRulesList.querySelectorAll('.party-rule-item');
            items.forEach(item => {
                const party = (item.dataset.party || '').toLowerCase();
                item.style.display = (!query || party.includes(query)) ? '' : 'none';
            });
        }, 150));
    }

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); triggerFileSelection(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const btn = document.getElementById('transformButton');
            if (btn && !btn.disabled && !btn.classList.contains('hidden')) btn.click();
        }
        if (e.key === 'Escape') {
            const rBtn = document.getElementById('resetButton');
            if (rBtn && !rBtn.classList.contains('hidden')) { e.preventDefault(); resetUI(); }
        }
    });
}

document.addEventListener('DOMContentLoaded', initializeApp);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        processFile,
        resetUI,
        initializeApp,
        setFinalDeduplicatedData
    };
}
