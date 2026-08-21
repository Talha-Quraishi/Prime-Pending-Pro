/**
 * Prime-Pending-Pro Excel Reader & Schema Validation Module
 * Handles file drag-and-drop, explorer file picker, metadata scanning with Web Worker, and schema integrity validation.
 */

async function triggerFileSelection() {
    const fileInput = document.getElementById('fileInput');
    if (window.electronAPI) {
        try {
            const fileObj = await window.electronAPI.selectFile();
            if (fileObj) {
                const binaryData = typeof convertIpcBuffer === 'function' ? convertIpcBuffer(fileObj.data) : fileObj.data;
                const mockFile = new File([binaryData], fileObj.name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                mockFile.path = fileObj.path;
                if (fileInput) fileInput.file = mockFile;
                handleFile(mockFile);
            }
        } catch (err) {
            console.error("Native select error", err);
            if (typeof showToast === 'function') {
                showToast("Error opening explorer dialog", "error");
            }
        }
    } else if (fileInput) {
        fileInput.click();
    }
}

function handleFile(file) {
    if (typeof XLSX === 'undefined' || typeof ExcelJS === 'undefined') {
        if (typeof showToast === 'function') showToast("Initializing Excel engines, please wait a moment...", "warning");
        setTimeout(() => handleFile(file), 500);
        return;
    }

    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileName');
    const transformButton = document.getElementById('transformButton');
    const messageText = document.getElementById('messageText');
    const showErrorLink = document.getElementById('showErrorLink');
    const detailedError = document.getElementById('detailedError');
    const scanIndicator = document.getElementById('scanningIndicator');
    const partySelectorCard = document.getElementById('partySelectorCard');

    const validTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
    if (validTypes.includes(file.type) || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        const fileName = file.name;
        if (fileNameDisplay) fileNameDisplay.textContent = `Selected: ${fileName}`;
        if (typeof showToast === 'function') showToast(`File "${fileName}" selected successfully!`, 'success');
        originalFileName = fileName;
        if (transformButton) transformButton.disabled = true; // Wait for schema validation
        if (messageText) messageText.textContent = '';
        if (showErrorLink) showErrorLink.classList.add('hidden');
        if (detailedError) detailedError.classList.add('hidden');
        if (fileInput) fileInput.file = file;

        // Show metadata preview
        const previewEmptyState = document.getElementById('previewEmptyState');
        const fileStatsContainer = document.getElementById('fileStatsContainer');
        const schemaValidationContainer = document.getElementById('schemaValidationContainer');
        const statFileName = document.getElementById('statFileName');
        const statFileSize = document.getElementById('statFileSize');
        const statTotalRows = document.getElementById('statTotalRows');

        if (previewEmptyState) previewEmptyState.classList.add('hidden');
        if (fileStatsContainer) fileStatsContainer.classList.remove('hidden');
        if (schemaValidationContainer) schemaValidationContainer.classList.add('hidden');
        if (statFileName) statFileName.textContent = file.name;
        if (statFileSize) statFileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
        if (statTotalRows) statTotalRows.textContent = 'Scanning...';

        if (scanIndicator) scanIndicator.classList.remove('hidden');

        // Show skeleton loading items immediately
        if (typeof showPartyRulesSkeleton === 'function') showPartyRulesSkeleton();
        if (partySelectorCard) partySelectorCard.classList.remove('hidden');

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
                        if (statTotalRows) statTotalRows.textContent = result.rowCount;
                        uniquePartiesList = result.uniqueParties;
                        if (typeof updatePartiesDatalist === 'function') updatePartiesDatalist();
                        
                        validateExcelSchema(result.headers);

                        if (scanIndicator) scanIndicator.classList.add('hidden');
                        if (partySelectorCard) {
                            partySelectorCard.classList.remove('hidden');
                            partySelectorCard.classList.add('fade-in');
                        }
                        const partyScanCount = document.getElementById('partyScanCount');
                        if (partyScanCount) partyScanCount.textContent = `${uniquePartiesList.length} parties`;

                        if (typeof renderPartyRulesList === 'function') renderPartyRulesList();
                        if (typeof showToast === 'function') showToast(`Auto-scanned ${uniquePartiesList.length} parties from file`, 'success');
                    } else {
                        runScanFallback(fileData);
                    }
                };
                scanWorker.onerror = function(err) {
                    console.error('Scan worker crashed, running main thread fallback:', err);
                    scanWorker.terminate();
                    runScanFallback(fileData);
                };
                const transferBuffer = fileData.slice(0);
                scanWorker.postMessage({
                    action: 'scan',
                    fileData: transferBuffer
                }, [transferBuffer]);
            } catch (workerError) {
                console.error('Failed to create scan worker, running main thread fallback:', workerError);
                runScanFallback(fileData);
            }
            
            function runScanFallback(data) {
                try {
                    const wb = XLSX.read(data, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

                    if (statTotalRows) statTotalRows.textContent = rawData.length;

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
                    if (typeof updatePartiesDatalist === 'function') updatePartiesDatalist();
                    const fallbackHeaders = headerIdx !== -1 ? rawData[headerIdx] : null;
                    
                    validateExcelSchema(fallbackHeaders);

                    if (scanIndicator) scanIndicator.classList.add('hidden');
                    if (partySelectorCard) {
                        partySelectorCard.classList.remove('hidden');
                        partySelectorCard.classList.add('fade-in');
                    }
                    const partyScanCount = document.getElementById('partyScanCount');
                    if (partyScanCount) partyScanCount.textContent = `${uniquePartiesList.length} parties`;

                    if (typeof renderPartyRulesList === 'function') renderPartyRulesList();
                    if (typeof showToast === 'function') showToast(`Auto-scanned ${uniquePartiesList.length} parties from file`, 'success');
                } catch (scanErr) {
                    console.error('Scan fallback failed:', scanErr);
                    if (scanIndicator) scanIndicator.classList.add('hidden');
                    if (statTotalRows) statTotalRows.textContent = 'Scan failed';
                    validateExcelSchema(null);
                }
            }
        };
        scanReader.onerror = function() {
            if (scanIndicator) scanIndicator.classList.add('hidden');
            if (statTotalRows) statTotalRows.textContent = 'Scan error';
            validateExcelSchema(null);
        };
        scanReader.readAsArrayBuffer(file);

    } else { 
        if (typeof showError === 'function') showError('errorInvalidFile', null); 
        if (transformButton) transformButton.disabled = true; 
        if (fileNameDisplay) fileNameDisplay.textContent = ''; 
        const previewEmptyState = document.getElementById('previewEmptyState');
        const fileStatsContainer = document.getElementById('fileStatsContainer');
        const schemaValidationContainer = document.getElementById('schemaValidationContainer');
        if (previewEmptyState) previewEmptyState.classList.remove('hidden');
        if (fileStatsContainer) fileStatsContainer.classList.add('hidden');
        if (partySelectorCard) partySelectorCard.classList.add('hidden');
        if (schemaValidationContainer) schemaValidationContainer.classList.add('hidden');
    }
}

function validateExcelSchema(headers) {
    const schemaValidationContainer = document.getElementById('schemaValidationContainer');
    const schemaChecklist = document.getElementById('schemaChecklist');
    const schemaAlert = document.getElementById('schemaAlert');
    const statFormat = document.getElementById('statFormat');
    const transformButton = document.getElementById('transformButton');
    
    if (!schemaValidationContainer || !schemaChecklist || !schemaAlert || !statFormat) return true;
    
    schemaValidationContainer.classList.remove('hidden');
    schemaChecklist.textContent = '';
    
    const requiredSchema = [
        { index: 0, label: 'Order No', search: 'ORDER' },
        { index: 2, label: 'Part No.', search: 'PART' },
        { index: 3, label: 'Item Name', search: 'ITEM' },
        { index: 4, label: 'Order Qty', search: 'ORDER' },
        { index: 5, label: 'Desp Qty', search: 'DESP' },
        { index: 6, label: 'Balance', search: 'BAL' },
        { index: 7, label: 'Rate', search: 'RATE' },
        { index: 8, label: 'Value', search: 'VAL' }
    ];

    let isValid = true;
    
    if (!headers || !Array.isArray(headers)) {
        isValid = false;
        requiredSchema.forEach(col => {
            const item = document.createElement('div');
            item.className = 'schema-item schema-error';
            const iconSpan = document.createElement('span');
            iconSpan.className = 'schema-icon';
            iconSpan.textContent = '❌';
            const textSpan = document.createElement('span');
            textSpan.textContent = `${col.label}: Missing`;
            item.appendChild(iconSpan);
            item.appendChild(textSpan);
            schemaChecklist.appendChild(item);
        });
    } else {
        requiredSchema.forEach(col => {
            const headerVal = headers[col.index];
            const headerStr = headerVal ? String(headerVal).trim().toUpperCase() : '';
            const matches = headerStr.includes(col.search);
            
            const item = document.createElement('div');
            const iconSpan = document.createElement('span');
            iconSpan.className = 'schema-icon';
            const textSpan = document.createElement('span');

            if (matches) {
                item.className = 'schema-item schema-ok';
                iconSpan.textContent = '✔';
                textSpan.textContent = `${col.label}: OK`;
            } else {
                isValid = false;
                item.className = 'schema-item schema-error';
                iconSpan.textContent = '❌';
                const dispVal = headerStr ? `Found "${String(headerVal).substring(0, 15)}"` : 'Missing';
                textSpan.textContent = `${col.label}: ${dispVal}`;
            }
            item.appendChild(iconSpan);
            item.appendChild(textSpan);
            schemaChecklist.appendChild(item);
        });
    }
    
    if (isValid) {
        statFormat.textContent = 'SIGFA OK';
        statFormat.className = 'font-bold text-sm text-green-600 dark:text-green-400';
        schemaAlert.classList.add('hidden');
        if (transformButton) transformButton.disabled = false;
    } else {
        statFormat.textContent = 'SIGFA INVALID';
        statFormat.className = 'font-bold text-sm text-red-500 dark:text-red-400';
        schemaAlert.classList.remove('hidden');
        if (transformButton) transformButton.disabled = true;
    }
    
    return isValid;
}

function initializeDragAndDrop() {
    const fileDropArea = document.getElementById('fileDropArea');
    const browseButton = document.getElementById('browseButton');
    const fileInput = document.getElementById('fileInput');

    if (browseButton) {
        browseButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            triggerFileSelection();
        });
    }

    if (fileDropArea) {
        fileDropArea.addEventListener('click', (e) => {
            triggerFileSelection();
        });

        fileDropArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                triggerFileSelection();
            }
        });

        let dropAreaRect = null;
        fileDropArea.addEventListener('mouseenter', () => {
            dropAreaRect = fileDropArea.getBoundingClientRect();
        });
        fileDropArea.addEventListener('mousemove', (e) => {
            if (!dropAreaRect) {
                dropAreaRect = fileDropArea.getBoundingClientRect();
            }
            const x = e.clientX - dropAreaRect.left;
            const y = e.clientY - dropAreaRect.top;
            fileDropArea.style.setProperty('--mouse-x', `${x}px`);
            fileDropArea.style.setProperty('--mouse-y', `${y}px`);
        });
        fileDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileDropArea.classList.add('drag-active', 'border-blue-500', 'dark:border-blue-400');
        });
        fileDropArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            fileDropArea.classList.remove('drag-active', 'border-blue-500', 'dark:border-blue-400');
        });
        fileDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileDropArea.classList.remove('drag-active', 'border-blue-500', 'dark:border-blue-400');
            if (e.dataTransfer && e.dataTransfer.files[0]) {
                handleFile(e.dataTransfer.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) handleFile(e.target.files[0]);
        });
    }

    // Full-screen Drag Overlay
    let dragCounter = 0;
    const dragDropOverlay = document.getElementById('dragDropOverlay');
    const dragDropContent = document.getElementById('dragDropContent');

    if (dragDropOverlay && dragDropContent) {
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

        window.addEventListener('dragover', (e) => e.preventDefault());

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
            
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFile(e.dataTransfer.files[0]);
            }
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        triggerFileSelection,
        handleFile,
        validateExcelSchema,
        initializeDragAndDrop
    };
}
