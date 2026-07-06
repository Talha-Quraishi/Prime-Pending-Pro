// --- APP INITIALIZATION, NAVIGATION, FILE SELECTION & MAIN THREAD RUNNERS ---

function getLocalDateString(dateObj) {
    if (!dateObj || dateObj.getTime() === 0) return '';
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Debounce helper for high-performance input filters
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function convertIpcBuffer(data) {
    if (!data) return null;
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
        return data;
    }
    if (data.type === 'Buffer' && Array.isArray(data.data)) {
        return new Uint8Array(data.data);
    }
    return data;
}

// --- DOM Elements ---
const fileInput = document.getElementById('fileInput');
const fileDropArea = document.getElementById('fileDropArea');
const browseButton = document.getElementById('browseButton');
const transformButton = document.getElementById('transformButton');
const downloadExcelButton = document.getElementById('downloadExcelButton'); 
const pdfSigfaButton = document.getElementById('pdfSigfaButton');
const pdfWorkingButton = document.getElementById('pdfWorkingButton');
const pdfDeduplicatedButton = document.getElementById('pdfDeduplicatedButton');
const resetButton = document.getElementById('resetButton');
const fileNameDisplay = document.getElementById('fileName');
const messageContainer = document.getElementById('messageContainer');
const simpleMessage = document.getElementById('simpleMessage');
const messageText = document.getElementById('messageText');
const showErrorLink = document.getElementById('showErrorLink');
const detailedError = document.getElementById('detailedError');
const processingContainer = document.getElementById('processingContainer');
const progressBar = document.getElementById('progressBar');
const processingStatus = document.getElementById('processingStatus');
const uploadContainer = document.getElementById('fileDropArea'); // Maps to the process mode container
const downloadContainer = document.getElementById('downloadContainer');

// Main Navigation Elements
const mainTabProcess = document.getElementById('mainTabProcess');
const mainTabInsights = document.getElementById('mainTabInsights');
const mainTabHistory = document.getElementById('mainTabHistory');
const mainTabSettings = document.getElementById('mainTabSettings');
const viewProcessContainer = document.getElementById('viewProcessContainer');
const viewInsightsContainer = document.getElementById('viewInsightsContainer');
const viewHistoryContainer = document.getElementById('viewHistoryContainer');
const viewSettingsContainer = document.getElementById('viewSettingsContainer');

// History View elements
const historyTableBody = document.getElementById('historyTableBody');
const historyEmptyState = document.getElementById('historyEmptyState');
const historySearch = document.getElementById('historySearch');

// Control Elements
const themeToggle = document.getElementById('themeToggle');
const themeToggleSwitch = document.getElementById('themeToggleSwitch');
const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar = document.getElementById('sidebar');
let themeIconLight = document.getElementById('themeIconLight');
let themeIconDark = document.getElementById('themeIconDark');
const htmlElement = document.documentElement;
const toastContainer = document.getElementById('toastContainer');
const checkForUpdatesBtn = document.getElementById('checkForUpdatesBtn');
let updateSpin = document.getElementById('updateSpin');

// Settings Backup & Restore buttons
const exportRulesBtn = document.getElementById('exportRulesBtn');
const importRulesBtn = document.getElementById('importRulesBtn');
const importRulesInput = document.getElementById('importRulesInput');
const excelStylingToggle = document.getElementById('excelStylingToggle');

const partySearch = document.getElementById('partySearch');
const partyRulesList = document.getElementById('partyRulesList');

// Dashboard Elements
const dashboardContainer = document.getElementById('dashboardContainer');
const dashTotalValueDisplay = document.getElementById('dashTotalValueDisplay');
const dashTotalQtyDisplay = document.getElementById('dashTotalQtyDisplay');
const dashUniqueItemsDisplay = document.getElementById('dashUniqueItemsDisplay');
const dashUniquePartiesDisplay = document.getElementById('dashUniquePartiesDisplay');

// Filter Elements
const searchInput = document.getElementById('searchInput');
const filterAll = document.getElementById('filterAll');
const filterDel = document.getElementById('filterDel');
const filterApr = document.getElementById('filterApr');
const dataTableBody = document.getElementById('dataTableBody');
const tableEmptyState = document.getElementById('tableEmptyState');

let chartPartiesInstance = null;
let chartItemsInstance = null;
let chartTrendInstance = null;
let chartDistributionInstance = null;
let chartAgingInstance = null; 

// Data Variables
let originalJsonData = null;
let transformedData = null;
let finalDeduplicatedData = null; // Source of truth
let currentFilteredData = null;   // Active view
let uniquePartiesList = [];       // Unique parties list from active file
let dashboardTableRows = [];      // For lazy loading detailed order list
let loadedRowCount = 0;           // For lazy loading detailed order list
const TABLE_CHUNK_SIZE = 50;

let originalFileName = '';
let processedWbout = null;
let uploadedFileData = null;
let isRestoringFromHistory = false;

let animationFrameId = null;
let originalExcelButtonHTML = '';
let currentFilterType = 'ALL'; 

// Deduplication Rules Arrays (Loaded from config.json or localStorage)
let excludedParties = [];           // "Keep All Orders"
let deduplicateParties = [];        // "Keep Latest Only"
let specialParties = [];            // Marka grouping
let fullyExcludedParties = [];      // Exclude completely
let partyRulesMap = {};             // Map of partyName -> rule
let partyMerges = {};               // Map of spellingMistakePartyName -> correctedPartyName 

// --- Event Listeners ---

// Main Tab Switch Listeners
mainTabProcess.addEventListener('click', () => switchMainView('process'));
mainTabInsights.addEventListener('click', () => switchMainView('insights'));
mainTabHistory.addEventListener('click', () => {
    switchMainView('history');
    loadHistoryTable();
});
mainTabSettings.addEventListener('click', () => switchMainView('settings'));

function switchMainView(viewName) {
    const tabs = {
        process: { btn: mainTabProcess, view: viewProcessContainer, title: "Process File" },
        insights: { btn: mainTabInsights, view: viewInsightsContainer, title: "Data Insights Dashboard" },
        history: { btn: mainTabHistory, view: viewHistoryContainer, title: "Processed File History" },
        settings: { btn: mainTabSettings, view: viewSettingsContainer, title: "Rules & Settings" }
    };
    
    Object.keys(tabs).forEach(k => {
        const item = tabs[k];
        if (k === viewName) {
            item.btn.classList.add('active');
            item.view.classList.remove('hidden');
            document.getElementById('viewTitle').textContent = item.title;
        } else {
            item.btn.classList.remove('active');
            item.view.classList.add('hidden');
        }
    });
    
    if (viewName !== 'process') {
        cancelAnimation();
    }
}

// --- File Selector Wrappers (Native Dialog vs Browser Picker) ---
async function triggerFileSelection() {
    if (window.electronAPI) {
        try {
            const fileObj = await window.electronAPI.selectFile();
            if (fileObj) {
                const binaryData = convertIpcBuffer(fileObj.data);
                const mockFile = new File([binaryData], fileObj.name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                mockFile.path = fileObj.path;
                fileInput.file = mockFile;
                handleFile(mockFile);
            }
        } catch (err) {
            console.error("Native select error", err);
            showToast("Error opening explorer dialog", "error");
        }
    } else {
        fileInput.click();
    }
}

// --- Helper: Update file metadata preview card ---
function updateFilePreview(rawData, transData) {
    document.getElementById('statTotalRows').textContent = rawData.length;
}

function showPartyRulesSkeleton() {
    if (!partyRulesList) return;
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
    for (let i = 0; i < 5; i++) {
        const skeletonItem = document.createElement('div');
        skeletonItem.className = 'skeleton skeleton-party-item flex items-center justify-between p-2 border border-gray-200/30 dark:border-neutral-800/30 opacity-60';
        partyRulesList.appendChild(skeletonItem);
    }
}

// --- Core Functions ---
function handleFile(file) {
    const validTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
    if (validTypes.includes(file.type) || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        const fileName = file.name;
        fileNameDisplay.textContent = `Selected: ${fileName}`;
        showToast(`File "${fileName}" selected successfully!`, 'success');
        originalFileName = fileName;
        transformButton.disabled = false;
        messageText.textContent = ''; showErrorLink.classList.add('hidden'); detailedError.classList.add('hidden');
        fileInput.file = file;

        // Show metadata preview
        document.getElementById('previewEmptyState').classList.add('hidden');
        document.getElementById('fileStatsContainer').classList.remove('hidden');
        document.getElementById('statFileName').textContent = file.name;
        document.getElementById('statFileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';
        document.getElementById('statTotalRows').textContent = 'Scanning...';

        // Show scanning indicator
        const scanIndicator = document.getElementById('scanningIndicator');
        scanIndicator.classList.remove('hidden');

        // Show skeleton loading items immediately
        showPartyRulesSkeleton();
        const partySelectorCard = document.getElementById('partySelectorCard');
        if (partySelectorCard) {
            partySelectorCard.classList.remove('hidden');
        }

        // Auto-scan: offload to web worker to keep UI thread 100% responsive
        const scanReader = new FileReader();
        scanReader.onload = function(ev) {
            const fileData = new Uint8Array(ev.target.result);
            let scanWorker = null;
            try {
                scanWorker = new Worker('js/worker.js');
                scanWorker.onmessage = function(workerEvent) {
                    scanWorker.terminate();
                    const result = workerEvent.data;
                    if (result.success && result.action === 'scan') {
                        document.getElementById('statTotalRows').textContent = result.rowCount;
                        uniquePartiesList = result.uniqueParties;
                        
                        // Hide scanning indicator, show party selector
                        scanIndicator.classList.add('hidden');
                        const partySelectorCard = document.getElementById('partySelectorCard');
                        if (partySelectorCard) {
                            partySelectorCard.classList.remove('hidden');
                            partySelectorCard.classList.add('fade-in');
                        }
                        document.getElementById('partyScanCount').textContent = `${uniquePartiesList.length} parties`;

                        renderPartyRulesList();
                        showToast(`Auto-scanned ${uniquePartiesList.length} parties from file`, 'success');
                    } else {
                        runScanFallback(fileData);
                    }
                };
                scanWorker.onerror = function(err) {
                    console.error('Scan worker crashed, running main thread fallback:', err);
                    scanWorker.terminate();
                    runScanFallback(fileData);
                };
                scanWorker.postMessage({
                    action: 'scan',
                    fileData
                });
            } catch (workerError) {
                console.error('Failed to create scan worker, running main thread fallback:', workerError);
                runScanFallback(fileData);
            }
            
            function runScanFallback(data) {
                try {
                    // Optimized fallback: disable formulas and styles for high speed
                    const wb = XLSX.read(data, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

                    document.getElementById('statTotalRows').textContent = rawData.length;

                    // Quick transform to extract party names
                    const scannedParties = new Set();
                    let headerIdx = -1;
                    for (let i = 0; i < rawData.length; i++) {
                        if (!rawData[i] || typeof rawData[i].join !== 'function') continue;
                        const rowStr = rawData[i].join(',').toUpperCase();
                        if (rowStr.includes('ORDER NO') && rowStr.includes('PART NO.')) { headerIdx = i; break; }
                    }
                    if (headerIdx !== -1) {
                        let currentParty = '';
                        for (let i = headerIdx + 1; i < rawData.length; i++) {
                            const row = rawData[i];
                            if (!row || !Array.isArray(row) || row.every(c => c === "")) continue;
                            const col0 = row[0] ? String(row[0]).trim() : '';
                            const partNo = row[2] ? String(row[2]).trim() : '';
                            const itemName = row[3] ? String(row[3]).trim() : '';
                            const hasItem = partNo || itemName;
                            const col0Upper = col0.toUpperCase();
                            const isOrder = col0Upper.startsWith('APR/SO') || col0Upper.startsWith('DEL');
                            const isParty = col0 && !isOrder && !hasItem && !col0Upper.startsWith('TOTAL');
                            if (isParty) { currentParty = col0.replace(/\s+/g, ' '); scannedParties.add(currentParty); }
                        }
                    }

                    uniquePartiesList = [...scannedParties].sort();

                    // Hide scanning indicator, show party selector
                    scanIndicator.classList.add('hidden');
                    const partySelectorCard = document.getElementById('partySelectorCard');
                    if (partySelectorCard) {
                        partySelectorCard.classList.remove('hidden');
                        partySelectorCard.classList.add('fade-in');
                    }
                    document.getElementById('partyScanCount').textContent = `${uniquePartiesList.length} parties`;

                    renderPartyRulesList();
                    showToast(`Auto-scanned ${uniquePartiesList.length} parties from file`, 'success');
                } catch (scanErr) {
                    console.error('Scan fallback failed:', scanErr);
                    scanIndicator.classList.add('hidden');
                    document.getElementById('statTotalRows').textContent = 'Scan failed';
                }
            }
        };
        scanReader.onerror = function() {
            scanIndicator.classList.add('hidden');
            document.getElementById('statTotalRows').textContent = 'Scan error';
        };
        scanReader.readAsArrayBuffer(file);

    } else { 
        showError('errorInvalidFile', null); 
        transformButton.disabled = true; 
        fileNameDisplay.textContent = ''; 
        document.getElementById('previewEmptyState').classList.remove('hidden');
        document.getElementById('fileStatsContainer').classList.add('hidden');
        document.getElementById('partySelectorCard').classList.add('hidden');
    }
}

function showToast(message, type = "success", ttl = 4000) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span><button class="close" onclick="this.parentElement.remove()">&times;</button>`;
    toastContainer.appendChild(toast); if (ttl > 0) setTimeout(() => toast.remove(), ttl);
}

function updateProgressUI(percent, statusText) {
    progressBar.style.width = `${percent}%`;
    processingStatus.textContent = `${statusText} (${percent}%)`;
}

function cancelAnimation() {}

function processFile() {
    if (!fileInput.file) { showError('errorNoFile', null); return; }
    transformButton.classList.add('hidden'); processingContainer.classList.remove('hidden');
    messageText.textContent = ''; showErrorLink.classList.add('hidden'); detailedError.classList.add('hidden'); progressBar.style.width = '0%';

    // Toggle Dashboard Skeleton Loader state
    const dashSkeleton = document.getElementById('dashboardSkeletonState');
    const dashEmpty = document.getElementById('dashboardEmptyState');
    const dashContent = document.getElementById('dashboardContent');
    if (dashSkeleton) dashSkeleton.classList.remove('hidden');
    if (dashEmpty) dashEmpty.classList.add('hidden');
    if (dashContent) dashContent.classList.add('hidden');
    updateProgressUI(5, "Reading raw file data...");

    const file = fileInput.file;
    const reader = new FileReader();
    reader.onload = function(e) {
        setTimeout(() => { 
            const fileData = new Uint8Array(e.target.result);
            uploadedFileData = fileData;
            updateProgressUI(15, "Initializing processing engine...");

            function handleSuccess(res) {
                updateProgressUI(100, "Transformation complete! Rendering interface...");
                originalJsonData = res.originalJson;
                transformedData = res.transformed;
                finalDeduplicatedData = res.finalDeduplicated;
                processedWbout = res.wbout;

                // Extract distinct parties and sort alphabetically
                if (transformedData && transformedData.length > 0) {
                    uniquePartiesList = [...new Set(transformedData.map(r => String(r['PARTY NAME']).trim()))].filter(Boolean).sort();
                    renderPartyRulesList();
                }

                setTimeout(() => {
                    updateFilePreview(originalJsonData, transformedData);

                    setTimeout(() => {
                        processingContainer.classList.add('hidden'); uploadContainer.classList.add('hidden');
                        downloadContainer.classList.remove('hidden'); downloadContainer.classList.add('fade-in');
                        resetButton.classList.remove('hidden'); resetButton.classList.add('fade-in');
                        
                        currentFilteredData = finalDeduplicatedData;
                        setFilterType('ALL');
                        
                        // Save to processing history (if not restoring from a past history item)
                        if (!isRestoringFromHistory) {
                            const totalRows = originalJsonData ? originalJsonData.length : 0;
                            const uniqueParties = uniquePartiesList ? uniquePartiesList.length : 0;
                            const totalValue = finalDeduplicatedData ? finalDeduplicatedData.reduce((acc, r) => acc + safeParseFloat(r['VALUE']), 0) : 0;
                            const totalQty = finalDeduplicatedData ? finalDeduplicatedData.reduce((acc, r) => acc + safeParseFloat(r['BALANCE']), 0) : 0;
                            saveCurrentUploadToHistory({ totalRows, uniqueParties, totalValue, totalQty });
                        }
                        isRestoringFromHistory = false; // Reset flag
                        
                        messageText.textContent = "File processed successfully!";
                        simpleMessage.classList.remove('text-red-500', 'dark:text-red-400'); simpleMessage.classList.add('text-green-500', 'dark:text-green-400');
                        showToast("File processed successfully!", 'success');
                    }, 150);
                }, 200);
            }

            // Standalone web worker execution path
            let worker = null;
            try {
                worker = new Worker('js/worker.js');

                worker.onmessage = function(workerEvent) {
                    const result = workerEvent.data;
                    if (result.action === 'status') {
                        updateProgressUI(result.progress, result.message);
                        return;
                    }
                    worker.terminate();

                    if (result.success) {
                        handleSuccess(result);
                    } else {
                        showError('errorProcessing', new Error(result.error));
                        processingContainer.classList.add('hidden');
                        transformButton.classList.remove('hidden');
                    }
                };

                worker.onerror = function(err) {
                    console.error("Worker crash, running main thread fallback:", err);
                    worker.terminate();
                    runFallback();
                };

                const enableExcelStyling = excelStylingToggle ? excelStylingToggle.checked : true;
                worker.postMessage({
                    fileData,
                    excludedParties,
                    deduplicateParties,
                    specialParties,
                    partyMerges,
                    fullyExcludedParties,
                    enableExcelStyling
                });
            } catch (workerError) {
                console.error("Failed to create Web Worker, running main thread fallback:", workerError);
                runFallback();
            }

            function runFallback() {
                updateProgressUI(20, "Reading workbook and parsing sheets...");
                setTimeout(() => {
                    try {
                        const workbook = XLSX.read(fileData, { type: 'array', cellStyles: true });
                        const originalSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[originalSheetName];
                        
                        updateProgressUI(40, "Converting sheet rows to structured JSON...");
                        setTimeout(() => {
                            const originalRawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                            const originalJson = convertArrayOfArraysToObjects(originalRawData);
                            
                            updateProgressUI(60, "Restructuring rows and applying rules...");
                            setTimeout(() => {
                                const transformed = transformExcelData(originalRawData);
                                const finalDeduplicated = findAndKeepLatestOrders(transformed, excludedParties, deduplicateParties, specialParties, fullyExcludedParties);
                                
                                updateProgressUI(80, "Generating styled sheets via ExcelJS...");
                                const enableExcelStyling = excelStylingToggle ? excelStylingToggle.checked : true;
                                setTimeout(() => {
                                    generateExcelJSWorkbookBuffer(fileData, transformed, finalDeduplicated, enableExcelStyling)
                                        .then(wbout => {
                                            handleSuccess({
                                                originalJson,
                                                transformed,
                                                finalDeduplicated,
                                                wbout,
                                                originalSheetName
                                            });
                                        })
                                        .catch(err => {
                                            console.error("ExcelJS fallback export failed:", err);
                                            const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
                                            handleSuccess({
                                                originalJson,
                                                transformed,
                                                finalDeduplicated,
                                                wbout,
                                                originalSheetName
                                            });
                                        });
                                }, 50);
                            }, 50);
                        }, 50);
                    } catch (fallbackError) {
                        showError('errorProcessing', fallbackError);
                        processingContainer.classList.add('hidden');
                        transformButton.classList.remove('hidden');
                    }
                }, 50);
            }
        }, 300);
    };
    reader.onerror = function(e) { cancelAnimation(); showError('errorRead', e.target.error); processingContainer.classList.add('hidden'); transformButton.classList.remove('hidden'); };
    reader.readAsArrayBuffer(file);
}

function showError(key, err) {
    const errorMessages = {
        errorInvalidFile: "Please select a valid Excel file (.xlsx, .xls, .csv).",
        errorNoFile: "Please select a file first.",
        errorRead: "Error reading file. Please check for corruption.",
        errorProcessing: "An error occurred during transformation. Please check sheet columns.",
        errorNoData: "No data loaded. Please process a valid sheet first."
    };
    const msg = errorMessages[key] || key || "Error occurred";
    showToast(msg, 'error');
    messageText.textContent = msg;
    simpleMessage.classList.remove('text-green-500', 'dark:text-green-400'); simpleMessage.classList.add('text-red-500', 'dark:text-red-400');
    if (err) { detailedError.textContent = err.stack || err.message || err; showErrorLink.classList.remove('hidden'); showErrorLink.onclick = (e) => { e.preventDefault(); detailedError.classList.toggle('hidden'); }; }
}

async function downloadTransformedFile() {
    if (!processedWbout) return;
    downloadExcelButton.disabled = true; 
    downloadExcelButton.innerHTML = `<span class="flex items-center justify-center"><span>Generating...</span><span class="loading-dots"><span></span><span></span><span></span></span></span>`; 
    showToast("Generating Excel file...", 'warning');
    
    setTimeout(async () => { 
        try {
            const baseName = originalFileName.lastIndexOf('.') > -1 ? originalFileName.substring(0, originalFileName.lastIndexOf('.')) : originalFileName;
            const defaultName = `${baseName}_transformed.xlsx`;
            
            if (window.electronAPI) {
                const savedPath = await window.electronAPI.saveFile({
                    defaultName: defaultName,
                    data: processedWbout
                });
                if (savedPath) showToast(`Excel saved successfully! ✅`, 'success');
                else showToast("Save cancelled. ❌", 'warning');
            } else {
                const blob = new Blob([processedWbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = defaultName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast("Excel file downloaded successfully!", 'success');
            }
        } catch (error) {
            console.error(error);
            showError('errorProcessing', error);
        } finally {
            downloadExcelButton.disabled = false;
            downloadExcelButton.innerHTML = originalExcelButtonHTML || "Download Transformed Excel File";
        }
    }, 50);
}

function resetUI() {
    cancelAnimation(); fileInput.value = ''; fileInput.file = null;
    originalJsonData = null; transformedData = null; finalDeduplicatedData = null; currentFilteredData = null;
    originalFileName = ''; processedWbout = null; uploadedFileData = null;
    fileNameDisplay.textContent = ''; messageText.textContent = '';
    simpleMessage.classList.remove('text-green-500', 'dark:text-green-400'); simpleMessage.classList.add('text-red-500', 'dark:text-red-400');
    showErrorLink.classList.add('hidden'); detailedError.classList.add('hidden');
    
    // Handle visibility
    uploadContainer.classList.remove('hidden');
    transformButton.classList.remove('hidden');

    // Reset File Preview Sidebar
    document.getElementById('previewEmptyState').classList.remove('hidden');
    document.getElementById('fileStatsContainer').classList.add('hidden');
    document.getElementById('statFileName').textContent = '';
    document.getElementById('statFileSize').textContent = '';
    document.getElementById('statTotalRows').textContent = '0';

    transformButton.disabled = true;
    downloadContainer.classList.add('hidden'); downloadContainer.classList.remove('fade-in');
    resetButton.classList.add('hidden'); resetButton.classList.remove('fade-in');
    processingContainer.classList.add('hidden'); progressBar.style.width = '0%';
    
    // Hide Dashboard Content, Show Empty State
    document.getElementById('dashboardContent').classList.add('hidden');
    const dashSkeleton = document.getElementById('dashboardSkeletonState');
    if (dashSkeleton) dashSkeleton.classList.add('hidden');
    document.getElementById('dashboardEmptyState').classList.remove('hidden');
    
    if (chartPartiesInstance) chartPartiesInstance.destroy(); if (chartItemsInstance) chartItemsInstance.destroy(); if (chartTrendInstance) chartTrendInstance.destroy(); if (chartDistributionInstance) chartDistributionInstance.destroy(); if (chartAgingInstance) chartAgingInstance.destroy();
    searchInput.value = '';

    // Reset party selector
    uniquePartiesList = [];
    document.getElementById('partySelectorCard').classList.add('hidden');
    if (partyRulesList) partyRulesList.innerHTML = `<p class="italic text-gray-400 dark:text-gray-500 text-center py-4">Scanning...</p>`;
    if (partySearch) partySearch.value = '';
}

// --- DASHBOARD & FILTER LOGIC ---
function setFilterType(type) {
    currentFilterType = type;
    [filterAll, filterDel, filterApr].forEach(btn => {
        btn.className = "px-3 py-1 text-sm font-semibold rounded text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all";
    });
    const activeBtn = type === 'ALL' ? filterAll : (type === 'DEL' ? filterDel : filterApr);
    activeBtn.className = "px-3 py-1 text-sm font-semibold rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm transition-all";
    applyDashboardFilters();
}

function applyDashboardFilters() {
    if (!finalDeduplicatedData) return;
    const query = searchInput.value.toLowerCase().trim();
    currentFilteredData = finalDeduplicatedData.filter(row => {
        const orderNo = String(row['ORDER NO'] || '').toUpperCase();
        const partyName = String(row['PARTY NAME'] || '').toLowerCase();
        const itemName = String(row['ITEM NAME'] || '').toLowerCase();
        const partNo = String(row['PART NO.'] || '').toLowerCase();
        let matchesType = true;
        if (currentFilterType === 'DEL') matchesType = orderNo.startsWith('DEL');
        else if (currentFilterType === 'APR') matchesType = orderNo.startsWith('APR');
        let matchesSearch = true;
        if (query) matchesSearch = partyName.includes(query) || itemName.includes(query) || partNo.includes(query);
        return matchesType && matchesSearch;
    });
    updateDashboardUI(currentFilteredData);
}

function loadNextRowChunk() {
    if (loadedRowCount >= dashboardTableRows.length) return;
    const nextChunk = dashboardTableRows.slice(loadedRowCount, loadedRowCount + TABLE_CHUNK_SIZE);
    const fragment = document.createDocumentFragment();
    const today = new Date();
    
    nextChunk.forEach(rowData => {
        const tr = document.createElement('tr');
        tr.className = "bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600";
        
        let diffDays = 0;
        if (rowData.dateObj.getTime() !== 0) {
            const diffTime = Math.abs(today - rowData.dateObj);
            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-900 dark:text-white truncate" title="${rowData.orderNo}">${rowData.orderNo}</td>
            <td class="px-4 py-3">${rowData.dateRaw}</td>
            <td class="px-4 py-3 text-red-500 font-semibold">${diffDays}</td>
            <td class="px-4 py-3 truncate" title="${rowData.pName}">${rowData.pName}</td>
            <td class="px-4 py-3 truncate" title="${rowData.iName}">${rowData.iName}</td>
            <td class="px-4 py-3 text-right">${rowData.qty}</td>
            <td class="px-4 py-3 text-right">₹${rowData.val.toLocaleString('en-IN')}</td>
        `;
        fragment.appendChild(tr);
    });
    
    dataTableBody.appendChild(fragment);
    loadedRowCount += nextChunk.length;
}

function updateDashboardUI(data) {
    if (!data) return;
    document.getElementById('dashboardEmptyState').classList.add('hidden');
    const dashSkeleton = document.getElementById('dashboardSkeletonState');
    if (dashSkeleton) dashSkeleton.classList.add('hidden');
    document.getElementById('dashboardContent').classList.remove('hidden');
    
    let totalValue = 0, totalQty = 0;
    const uniqueItems = new Set();
    const uniqueParties = new Set();
    const partiesValueMap = {};
    const itemsQtyMap = {};
    const dateCountMap = {};
    
    // Aging Buckets
    const agingBuckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    
    let delCount = 0, aprCount = 0;
    const today = new Date();

    dataTableBody.innerHTML = '';
    dashboardTableRows = [];
    loadedRowCount = 0;

    if (data.length === 0) tableEmptyState.classList.remove('hidden'); else tableEmptyState.classList.add('hidden');

    data.forEach(row => {
        const val = safeParseFloat(row['VALUE']);
        const qty = safeParseFloat(row['BALANCE']) || safeParseFloat(row['ORDER QTY']);
        const pName = row['PARTY NAME'] || 'Unknown';
        const iName = row['ITEM NAME'] || 'Unknown';
        const orderNo = String(row['ORDER NO']).toUpperCase();
        const dateRaw = row['DATE'];

        totalValue += val; totalQty += qty; uniqueItems.add(iName); uniqueParties.add(pName);
        partiesValueMap[pName] = (partiesValueMap[pName] || 0) + val;
        itemsQtyMap[iName] = (itemsQtyMap[iName] || 0) + qty;

        if (orderNo.startsWith('DEL')) delCount++; else if (orderNo.startsWith('APR')) aprCount++;

        const dateObj = dateRaw ? parseDMY(dateRaw) : new Date(0);
        if (dateObj.getTime() !== 0) {
            const isoDate = getLocalDateString(dateObj);
            dateCountMap[isoDate] = (dateCountMap[isoDate] || 0) + 1;
            
            const diffTime = Math.abs(today - dateObj);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            // Populate Aging Buckets
            if (diffDays <= 30) agingBuckets['0-30']++;
            else if (diffDays <= 60) agingBuckets['31-60']++;
            else if (diffDays <= 90) agingBuckets['61-90']++;
            else agingBuckets['90+']++;
        }

        dashboardTableRows.push({
            orderNo,
            dateRaw: dateRaw || 'N/A',
            dateObj,
            pName,
            iName,
            qty,
            val
        });
    });

    // Render first chunk of rows
    loadNextRowChunk();

    dashTotalValueDisplay.textContent = totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' });
    dashTotalQtyDisplay.textContent = totalQty.toLocaleString('en-IN');
    dashUniqueItemsDisplay.textContent = uniqueItems.size;
    dashUniquePartiesDisplay.textContent = uniqueParties.size;

    const sortedParties = Object.entries(partiesValueMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sortedItems = Object.entries(itemsQtyMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sortedDates = Object.keys(dateCountMap).sort();
    const trendData = sortedDates.map(d => dateCountMap[d]);
    const trendLabels = sortedDates.map(d => { const p = d.split('-'); return `${p[2]}-${p[1]}`; });

    renderCharts(sortedParties, sortedItems, trendLabels, trendData, delCount, aprCount, agingBuckets);
}

function renderCharts(parties, items, dates, trendCounts, delC, aprC, aging) {
    const ctxParties = document.getElementById('chartParties').getContext('2d');
    const ctxItems = document.getElementById('chartItems').getContext('2d');
    const ctxTrend = document.getElementById('chartTrend').getContext('2d');
    const ctxDist = document.getElementById('chartDistribution').getContext('2d');
    const ctxAging = document.getElementById('chartAging').getContext('2d'); 

    const isDark = htmlElement.classList.contains('dark');
    const textColor = isDark ? '#e5e7eb' : '#374151';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    const partiesLabels = parties.map(d => d[0].substring(0, 15) + '...');
    const partiesData = parties.map(d => d[1]);
    if (chartPartiesInstance) {
        chartPartiesInstance.data.labels = partiesLabels;
        chartPartiesInstance.data.datasets[0].data = partiesData;
        chartPartiesInstance.options.scales.y.ticks.color = textColor;
        chartPartiesInstance.options.scales.y.grid.color = gridColor;
        chartPartiesInstance.options.scales.x.ticks.color = textColor;
        chartPartiesInstance.update('none');
    } else {
        chartPartiesInstance = new Chart(ctxParties, { type: 'bar', data: { labels: partiesLabels, datasets: [{ label: 'Pending Value (₹)', data: partiesData, backgroundColor: 'rgba(34, 197, 94, 0.6)', borderColor: 'rgba(34, 197, 94, 1)', borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { display: false } } } } });
    }

    const itemsLabels = items.map(d => d[0].substring(0, 15) + '...');
    const itemsData = items.map(d => d[1]);
    if (chartItemsInstance) {
        chartItemsInstance.data.labels = itemsLabels;
        chartItemsInstance.data.datasets[0].data = itemsData;
        chartItemsInstance.options.scales.x.ticks.color = textColor;
        chartItemsInstance.options.scales.x.grid.color = gridColor;
        chartItemsInstance.options.scales.y.ticks.color = textColor;
        chartItemsInstance.update('none');
    } else {
        chartItemsInstance = new Chart(ctxItems, { type: 'bar', indexAxis: 'y', data: { labels: itemsLabels, datasets: [{ label: 'Qty', data: itemsData, backgroundColor: 'rgba(59, 130, 246, 0.6)', borderColor: 'rgba(59, 130, 246, 1)', borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { display: false } } } } });
    }

    if (chartTrendInstance) {
        chartTrendInstance.data.labels = dates;
        chartTrendInstance.data.datasets[0].data = trendCounts;
        chartTrendInstance.options.scales.y.ticks.color = textColor;
        chartTrendInstance.options.scales.y.grid.color = gridColor;
        chartTrendInstance.options.scales.x.ticks.color = textColor;
        chartTrendInstance.update('none');
    } else {
        chartTrendInstance = new Chart(ctxTrend, { type: 'line', data: { labels: dates, datasets: [{ label: 'Orders', data: trendCounts, borderColor: 'rgba(168, 85, 247, 1)', backgroundColor: 'rgba(168, 85, 247, 0.1)', fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { display: false } } } } });
    }

    const distData = [delC, aprC, Math.max(0, (finalDeduplicatedData ? finalDeduplicatedData.length : 0) - delC - aprC)];
    if (chartDistributionInstance) {
        chartDistributionInstance.data.datasets[0].data = distData;
        chartDistributionInstance.update('none');
    } else {
        chartDistributionInstance = new Chart(ctxDist, { type: 'doughnut', data: { labels: ['DEL (Local)', 'APR (Outstation)', 'Other'], datasets: [{ data: distData, backgroundColor: ['rgba(59, 130, 246, 0.7)', 'rgba(249, 115, 22, 0.7)', 'rgba(156, 163, 175, 0.5)'], borderColor: ['rgba(59, 130, 246, 1)', 'rgba(249, 115, 22, 1)', 'rgba(156, 163, 175, 1)'], borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } } });
    }

    const agingData = [aging['0-30'], aging['31-60'], aging['61-90'], aging['90+']];
    if (chartAgingInstance) {
        chartAgingInstance.data.datasets[0].data = agingData;
        chartAgingInstance.options.scales.y.ticks.color = textColor;
        chartAgingInstance.options.scales.y.grid.color = gridColor;
        chartAgingInstance.options.scales.x.ticks.color = textColor;
        chartAgingInstance.update('none');
    } else {
        chartAgingInstance = new Chart(ctxAging, {
            type: 'bar',
            data: {
                labels: ['0-30 Days', '31-60 Days', '61-90 Days', '90+ Days'],
                datasets: [{
                    label: 'Orders',
                    data: agingData,
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.6)',
                        'rgba(59, 130, 246, 0.6)',
                        'rgba(249, 115, 22, 0.6)',
                        'rgba(239, 68, 68, 0.6)'
                    ],
                    borderColor: [
                        'rgba(34, 197, 94, 1)',
                        'rgba(59, 130, 246, 1)',
                        'rgba(249, 115, 22, 1)',
                        'rgba(239, 68, 68, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } },
                    x: { ticks: { color: textColor }, grid: { display: false } }
                }
            }
        });
    }
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

function toggleTheme() { const newTheme = htmlElement.classList.contains('dark') ? 'light' : 'dark'; persistConfigValue('theme', newTheme); applyTheme(newTheme); }

function applyTheme(theme) {
    if (theme === 'dark') { 
        htmlElement.classList.add('dark'); 
        themeIconLight.classList.add('hidden'); 
        themeIconDark.classList.remove('hidden'); 
        if (themeToggleSwitch) themeToggleSwitch.checked = true;
    } else { 
        htmlElement.classList.remove('dark'); 
        themeIconLight.classList.remove('hidden'); 
        themeIconDark.classList.add('hidden'); 
        if (themeToggleSwitch) themeToggleSwitch.checked = false;
    }
    updateThemeToggleTitle(theme);
    if (finalDeduplicatedData) updateDashboardUI(currentFilteredData);
}

function updateThemeToggleTitle(theme) {
    const currentTheme = theme || (htmlElement.classList.contains('dark') ? 'dark' : 'light');
    themeToggle.title = currentTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
}

async function initializeApp() {
    if (downloadExcelButton) {
        originalExcelButtonHTML = downloadExcelButton.innerHTML;
    }
    let config = {};
    const versionStr = (window.electronAPI && window.electronAPI.appVersion) ? window.electronAPI.appVersion : '3.30.3';
    if (window.electronAPI) {
        const watermarkVer = document.getElementById('watermarkVersion');
        if (watermarkVer) watermarkVer.textContent = `v${versionStr} (Desktop)`;
        const verDisp = document.getElementById('versionDisplay');
        if (verDisp) verDisp.textContent = `v${versionStr} (Desktop)`;
        
        // Bind custom window controls
        const winMin = document.getElementById('winMin');
        const winMax = document.getElementById('winMax');
        const winClose = document.getElementById('winClose');
        
        if (winMin) winMin.addEventListener('click', () => window.electronAPI.minimize());
        if (winMax) winMax.addEventListener('click', () => window.electronAPI.maximize());
        if (winClose) winClose.addEventListener('click', () => window.electronAPI.close());
        
        config = await window.electronAPI.loadConfig() || {};
    } else {
        const watermarkVer = document.getElementById('watermarkVersion');
        if (watermarkVer) watermarkVer.textContent = `v${versionStr}`;
        const verDisp = document.getElementById('versionDisplay');
        if (verDisp) verDisp.textContent = `v${versionStr}`;
        const winMin = document.getElementById('winMin');
        const winMax = document.getElementById('winMax');
        const winClose = document.getElementById('winClose');
        if (winMin) winMin.style.display = 'none';
        if (winMax) winMax.style.display = 'none';
        if (winClose) winClose.style.display = 'none';
        
        try {
            config = {
                theme: localStorage.getItem('theme'),
                sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
                excludedParties: JSON.parse(localStorage.getItem('excludedParties')),
                deduplicateParties: JSON.parse(localStorage.getItem('deduplicateParties')),
                specialParties: JSON.parse(localStorage.getItem('specialParties')),
                fullyExcludedParties: JSON.parse(localStorage.getItem('fullyExcludedParties')),
                partyMerges: JSON.parse(localStorage.getItem('partyMerges')),
                enableExcelStyling: localStorage.getItem('enableExcelStyling') !== 'false'
            };
        } catch (e) {
            config = {};
        }
    }
    
    // Set dynamic deduplication rules from loaded configuration with uppercase normalization
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
    
    // Recompile initial partyRulesMap
    partyRulesMap = {};
    excludedParties.forEach(p => partyRulesMap[p] = 'keep-all');
    deduplicateParties.forEach(p => partyRulesMap[p] = 'keep-latest');
    specialParties.forEach(p => partyRulesMap[p] = 'marka');
    fullyExcludedParties.forEach(p => partyRulesMap[p] = 'exclude');
    
    // Initialize settings visual chips and inputs
    renderChipsInUI();
    setupChipInputListeners();
    
    const savedTheme = config.theme; 
    let initialTheme = savedTheme === 'dark' ? 'dark' : (savedTheme === 'light' ? 'light' : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); 
    applyTheme(initialTheme);
    
    if (config.sidebarCollapsed) {
        if (sidebar) sidebar.classList.add('collapsed');
    }

    // Diagnostics for transformButton visibility
    setTimeout(() => {
        const btn = document.getElementById('transformButton');
        console.log('--- DIAGNOSTICS FOR TRANSFORM BUTTON ---');
        if (!btn) {
            console.log('ERROR: transformButton not found in DOM!');
        } else {
            console.log('transformButton clientWidth/clientHeight:', btn.clientWidth, btn.clientHeight);
            console.log('transformButton offsetWidth/offsetHeight:', btn.offsetWidth, btn.offsetHeight);
            console.log('transformButton classes:', Array.from(btn.classList).join(' '));
            console.log('transformButton display/visibility style:', btn.style.display, btn.style.visibility);
            console.log('transformButton computed display:', window.getComputedStyle(btn).display);
            console.log('transformButton parent classes:', btn.parentElement ? Array.from(btn.parentElement.classList).join(' ') : 'no parent');
            console.log('transformButton parent parent classes:', btn.parentElement && btn.parentElement.parentElement ? Array.from(btn.parentElement.parentElement.classList).join(' ') : 'no grandparent');
        }
    }, 1000);

    if (window.lucide) {
        window.lucide.createIcons();
        // Re-assign dynamic elements after Lucide DOM replacement
        themeIconLight = document.getElementById('themeIconLight');
        themeIconDark = document.getElementById('themeIconDark');
        updateSpin = document.getElementById('updateSpin');
    }
    if (excelStylingToggle) {
        excelStylingToggle.checked = config.enableExcelStyling !== false;
    }
}

// Bind UI event listeners
browseButton.addEventListener('click', triggerFileSelection);

// Bind scroll listener for lazy loading detailed order list
const dataTableContainer = document.querySelector('.data-table-container');
if (dataTableContainer) {
    dataTableContainer.addEventListener('scroll', () => {
        // If scrolled within 40px of bottom, load next chunk
        if (dataTableContainer.scrollTop + dataTableContainer.clientHeight >= dataTableContainer.scrollHeight - 40) {
            loadNextRowChunk();
        }
    });
}

if (excelStylingToggle) {
    excelStylingToggle.addEventListener('change', () => {
        persistConfigValue('enableExcelStyling', excelStylingToggle.checked);
    });
}
fileDropArea.addEventListener('click', (e) => { if (e.target === fileDropArea || fileDropArea.contains(e.target) && !browseButton.contains(e.target)) triggerFileSelection(); });
fileDropArea.addEventListener('dragover', (e) => { e.preventDefault(); fileDropArea.classList.add('drag-active', 'border-blue-500', 'dark:border-blue-400'); });
fileDropArea.addEventListener('dragleave', (e) => { e.preventDefault(); fileDropArea.classList.remove('drag-active', 'border-blue-500', 'dark:border-blue-400'); });
fileDropArea.addEventListener('drop', (e) => { e.preventDefault(); fileDropArea.classList.remove('drag-active', 'border-blue-500', 'dark:border-blue-400'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });
transformButton.addEventListener('click', processFile);
downloadExcelButton.addEventListener('click', downloadTransformedFile);
pdfSigfaButton.addEventListener('click', (e) => downloadPdfSigfaSheet(e.currentTarget));
pdfWorkingButton.addEventListener('click', (e) => downloadPdfWorkingSheet(e.currentTarget));
pdfDeduplicatedButton.addEventListener('click', (e) => downloadPdfDeduplicatedSheet(e.currentTarget));
resetButton.addEventListener('click', resetUI);

themeToggle.addEventListener('click', toggleTheme);
if (themeToggleSwitch) {
    themeToggleSwitch.addEventListener('change', toggleTheme);
}

if (exportRulesBtn) exportRulesBtn.addEventListener('click', exportRulesConfig);
if (importRulesBtn) importRulesBtn.addEventListener('click', () => importRulesInput.click());
if (importRulesInput) importRulesInput.addEventListener('change', importRulesConfig);

if (hamburgerBtn && sidebar) {
    hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        persistConfigValue('sidebarCollapsed', isCollapsed);
    });
}

searchInput.addEventListener('input', debounce(applyDashboardFilters, 150));
filterAll.addEventListener('click', () => setFilterType('ALL'));
filterDel.addEventListener('click', () => setFilterType('DEL'));
filterApr.addEventListener('click', () => setFilterType('APR'));

// Settings Sub-Tabs Switching
const settingsNavItems = document.querySelectorAll('.settings-nav-item');
const settingsPanes = document.querySelectorAll('.settings-pane');

settingsNavItems.forEach(item => {
    item.addEventListener('click', () => {
        settingsNavItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        const tabName = item.dataset.settingsTab;
        settingsPanes.forEach(pane => {
            if (pane.id === `settingsPane${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`) {
                pane.classList.remove('hidden');
            } else {
                pane.classList.add('hidden');
            }
        });
    });
});

// Auto-Updater Renderer Logic
const updateBtnText = document.getElementById('updateBtnText');
const updateStatusText = document.getElementById('updateStatusText');
const updateProgressContainer = document.getElementById('updateProgressContainer');
const updateProgressBar = document.getElementById('updateProgressBar');
const updateProgressPercent = document.getElementById('updateProgressPercent');

let appUpdateState = 'idle'; 

if (checkForUpdatesBtn && window.electronAPI && window.electronAPI.checkForUpdates) {
    checkForUpdatesBtn.addEventListener('click', () => {
        if (appUpdateState === 'idle') {
            appUpdateState = 'checking';
            updateSpin.classList.remove('hidden');
            updateBtnText.textContent = 'Checking for updates...';
            updateStatusText.textContent = 'Contacting the release repository...';
            window.electronAPI.checkForUpdates();
        } else if (appUpdateState === 'ready') {
            window.electronAPI.installUpdate();
        }
    });

    window.electronAPI.onUpdateMessage((status, info) => {
        console.log('Update message received:', status, info);
        if (status === 'checking') {
            appUpdateState = 'checking';
            updateSpin.classList.remove('hidden');
            updateBtnText.textContent = 'Checking for updates...';
            updateStatusText.textContent = 'Checking release registry...';
        } else if (status === 'available') {
            appUpdateState = 'downloading';
            updateSpin.classList.add('hidden');
            updateBtnText.textContent = 'Downloading update...';
            checkForUpdatesBtn.disabled = true;
            updateStatusText.textContent = `New version ${info ? info.version : ''} found! Starting download...`;
            updateProgressContainer.classList.remove('hidden');
        } else if (status === 'not-available') {
            appUpdateState = 'idle';
            updateSpin.classList.add('hidden');
            updateBtnText.textContent = 'Check for Updates';
            checkForUpdatesBtn.disabled = false;
            updateStatusText.textContent = 'You are currently running the latest version.';
            showToast('You are running the latest version! ✅', 'success');
        } else if (status === 'progress') {
            appUpdateState = 'downloading';
            const percent = Math.round(info);
            updateProgressBar.style.width = `${percent}%`;
            updateProgressPercent.textContent = `${percent}%`;
            updateStatusText.textContent = `Downloading package... (${percent}%)`;
        } else if (status === 'downloaded') {
            appUpdateState = 'ready';
            updateSpin.classList.add('hidden');
            updateProgressContainer.classList.add('hidden');
            checkForUpdatesBtn.disabled = false;
            checkForUpdatesBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            checkForUpdatesBtn.classList.add('bg-green-600', 'hover:bg-green-700');
            updateBtnText.textContent = 'Restart & Install Update';
            updateStatusText.textContent = 'Update downloaded successfully! Click button to restart and apply.';
            showToast('Update ready to install! 📦', 'success');
        } else if (status === 'error') {
            appUpdateState = 'idle';
            updateSpin.classList.add('hidden');
            updateProgressContainer.classList.add('hidden');
            checkForUpdatesBtn.disabled = false;
            updateBtnText.textContent = 'Check for Updates';
            updateStatusText.textContent = 'Check failed. Verify network connection.';
            showToast('Update check failed: ' + info, 'error');
        }
    });
}

// Quick search filter for rules list
partySearch.addEventListener('input', debounce(() => {
    const query = partySearch.value.toLowerCase().trim();
    const items = partyRulesList.querySelectorAll('.party-rule-item');
    items.forEach(item => {
        const party = (item.dataset.party || '').toLowerCase();
        item.style.display = (!query || party.includes(query)) ? '' : 'none';
    });
}, 150));

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); triggerFileSelection(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (!transformButton.disabled) transformButton.click(); }
    if (e.key === 'Escape' && !resetButton.classList.contains('hidden')) { e.preventDefault(); resetUI(); }
});

// Window Drag & Drop Overlay Event Handlers
let dragCounter = 0;
const dragDropOverlay = document.getElementById('dragDropOverlay');
const dragDropContent = document.getElementById('dragDropContent');

window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
        dragDropOverlay.classList.remove('pointer-events-none', 'opacity-0');
        dragDropOverlay.classList.add('opacity-100');
        dragDropContent.classList.remove('scale-95');
        dragDropContent.classList.add('scale-100');
    }
});

window.addEventListener('dragover', (e) => {
    e.preventDefault();
});

window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
        dragDropOverlay.classList.remove('opacity-100', 'scale-100');
        dragDropOverlay.classList.add('pointer-events-none', 'opacity-0');
        dragDropContent.classList.remove('scale-100');
        dragDropContent.classList.add('scale-95');
    }
});

window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragDropOverlay.classList.remove('opacity-100', 'scale-100');
    dragDropOverlay.classList.add('pointer-events-none', 'opacity-0');
    dragDropContent.classList.remove('scale-100');
    dragDropContent.classList.add('scale-95');
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
    }
});

async function regenerateWorkbook() {
    if (!uploadedFileData || !transformedData || !finalDeduplicatedData) return;
    try {
        const workbook = XLSX.read(uploadedFileData, { type: 'array' });
        const originalSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[originalSheetName];
        const originalRawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const originalJson = convertArrayOfArraysToObjects(originalRawData);
        
        const enableExcelStyling = excelStylingToggle ? excelStylingToggle.checked : true;
        processedWbout = await generateExcelJSWorkbookBuffer(uploadedFileData, transformedData, finalDeduplicatedData, enableExcelStyling);
    } catch (e) {
        console.error("Failed to regenerate workbook:", e);
    }
}

// --- HISTORY PERSISTENCE & UI LOGIC ---

async function saveCurrentUploadToHistory(metadata) {
    if (!window.electronAPI) return; // Only supported in Electron
    if (!uploadedFileData) return;
    
    try {
        const payload = {
            filename: originalFileName,
            fileData: uploadedFileData,
            metadata: {
                totalRows: metadata.totalRows || 0,
                uniqueParties: metadata.uniqueParties || 0,
                totalValue: metadata.totalValue || 0,
                totalQty: metadata.totalQty || 0
            }
        };
        const result = await window.electronAPI.saveToHistory(payload);
        if (result && result.success) {
            showToast("Saved to processing history! 📁", "success");
        } else {
            console.error("Failed to save to history", result?.error);
        }
    } catch (e) {
        console.error("Failed to save to history:", e);
    }
}

async function loadHistoryTable() {
    if (!window.electronAPI) {
        historyTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-gray-500">History is only supported in desktop mode.</td></tr>`;
        return;
    }
    
    try {
        const list = await window.electronAPI.loadHistoryList() || [];
        renderHistoryRows(list);
    } catch (e) {
        console.error("Error loading history list:", e);
        historyTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-red-500">Error loading history.</td></tr>`;
    }
}

function renderHistoryRows(list) {
    historyTableBody.innerHTML = '';
    const query = historySearch.value.toLowerCase().trim();
    const filtered = list.filter(item => !query || item.filename.toLowerCase().includes(query));
    
    if (filtered.length === 0) {
        historyEmptyState.classList.remove('hidden');
        return;
    }
    historyEmptyState.classList.add('hidden');
    
    filtered.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/50 dark:hover:bg-[#1a1a1a]/30 transition-colors border-b border-gray-100 dark:border-neutral-800/60";
        
        const dateStr = new Date(item.date).toLocaleString();
        const sizeStr = (item.sizeBytes / 1024).toFixed(1) + ' KB';
        const valStr = '₹' + safeParseFloat(item.totalValue).toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const qtyStr = safeParseFloat(item.totalQty).toLocaleString('en-IN');
        
        tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">${dateStr}</td>
            <td class="px-4 py-3 font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[200px]" title="${item.filename}">${item.filename}</td>
            <td class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">${sizeStr}</td>
            <td class="px-4 py-3 text-right font-mono font-medium text-gray-600 dark:text-gray-400">${item.totalRows}</td>
            <td class="px-4 py-3 text-right font-mono font-medium text-gray-600 dark:text-gray-400">${item.uniqueParties}</td>
            <td class="px-4 py-3 text-right font-mono font-bold text-green-600 dark:text-green-400">${valStr}</td>
            <td class="px-4 py-3 text-right font-mono font-medium text-blue-600 dark:text-blue-400">${qtyStr}</td>
            <td class="px-4 py-3 text-center whitespace-nowrap">
                <div class="flex items-center justify-center gap-2">
                    <button class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2 py-1 rounded text-[10px] transition-all flex items-center gap-1 shadow-sm" onclick="loadHistoricalRecord('${item.id}')">
                        <i data-lucide="folder-open" class="w-3 h-3"></i> Load
                    </button>
                    <button class="bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-300 font-bold px-2 py-1 rounded text-[10px] transition-all flex items-center gap-1 border border-gray-200/50 dark:border-neutral-800" onclick="downloadHistoricalRaw('${item.id}', '${item.filename.replace(/'/g, "\\'")}')">
                        <i data-lucide="download" class="w-3 h-3"></i> Save Raw
                    </button>
                    <button class="bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white font-bold px-2 py-1 rounded text-[10px] transition-all flex items-center gap-1 border border-red-500/20" onclick="deleteHistoricalRecord('${item.id}')">
                        <i data-lucide="trash-2" class="w-3 h-3"></i> Delete
                    </button>
                </div>
            </td>
        `;
        historyTableBody.appendChild(tr);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

async function loadHistoricalRecord(id) {
    if (!window.electronAPI) return;
    showToast("Restoring historical file session...", "warning");
    
    try {
        const fileBuffer = await window.electronAPI.loadHistoricalFile(id);
        if (!fileBuffer) {
            showToast("Failed to read history file from disk.", "error");
            return;
        }
        
        // Find filename
        const list = await window.electronAPI.loadHistoryList() || [];
        const record = list.find(r => r.id === id);
        const filename = record ? record.filename : 'historical_file.xlsx';
        
        // Convert to File object
        const binaryData = convertIpcBuffer(fileBuffer);
        const mockFile = new File([binaryData], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        originalFileName = filename;
        fileNameDisplay.textContent = `Selected (History): ${filename}`;
        
        // Select tab process
        isRestoringFromHistory = true;
        switchMainView('process');
        
        // Load the file as a normal file
        handleFile(mockFile);
        
        showToast("Historical file restored successfully! ✅", "success");
    } catch (e) {
        console.error("Failed to restore history session:", e);
        showToast("Error restoring history session.", "error");
    }
}

async function downloadHistoricalRaw(id, filename) {
    if (!window.electronAPI) return;
    try {
        const fileBuffer = await window.electronAPI.loadHistoricalFile(id);
        if (!fileBuffer) {
            showToast("File not found on disk.", "error");
            return;
        }
        
        const binaryData = convertIpcBuffer(fileBuffer);
        const savedPath = await window.electronAPI.saveFile({
            defaultName: filename,
            data: binaryData,
            filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] }]
        });
        
        if (savedPath) {
            showToast("File saved successfully! ✅", "success");
        }
    } catch (e) {
        console.error("Failed to save historical raw file:", e);
        showToast("Error saving raw file.", "error");
    }
}

async function deleteHistoricalRecord(id) {
    if (!window.electronAPI) return;
    if (!confirm("Are you sure you want to delete this historical record?")) return;
    
    try {
        const success = await window.electronAPI.deleteFromHistory(id);
        if (success) {
            showToast("Record deleted successfully! 🗑️", "success");
            loadHistoryTable();
        } else {
            showToast("Failed to delete record.", "error");
        }
    } catch (e) {
        console.error("Error deleting record:", e);
        showToast("Error deleting record.", "error");
    }
}

// Bind history functions to window so inline onclick handlers resolve them
window.loadHistoricalRecord = loadHistoricalRecord;
window.downloadHistoricalRaw = downloadHistoricalRaw;
window.deleteHistoricalRecord = deleteHistoricalRecord;

// Bind history search input
if (historySearch) {
    historySearch.addEventListener('input', () => {
        loadHistoryTable();
    });
}

document.addEventListener('DOMContentLoaded', initializeApp);
