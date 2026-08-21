/**
 * Prime-Pending-Pro History Persistence & UI Module
 * Handles loading historical file sessions, rendering history rows, downloading raw files, and deleting history.
 */

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
            if (typeof showToast === 'function') {
                showToast("Saved to processing history! 📁", "success");
            }
        } else {
            console.error("Failed to save to history", result?.error);
        }
    } catch (e) {
        console.error("Failed to save to history:", e);
    }
}

async function loadHistoryTable() {
    const historyTableBody = document.getElementById('historyTableBody');
    if (!historyTableBody) return;

    if (!window.electronAPI) {
        historyTableBody.textContent = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.className = 'text-center py-4 text-gray-500';
        td.textContent = 'History is only supported in desktop mode.';
        tr.appendChild(td);
        historyTableBody.appendChild(tr);
        return;
    }
    
    try {
        const list = await window.electronAPI.loadHistoryList() || [];
        renderHistoryRows(list);
    } catch (e) {
        console.error("Error loading history list:", e);
        historyTableBody.textContent = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.className = 'text-center py-4 text-red-500';
        td.textContent = 'Error loading history.';
        tr.appendChild(td);
        historyTableBody.appendChild(tr);
    }
}

function renderHistoryRows(list) {
    const historyTableBody = document.getElementById('historyTableBody');
    const historyEmptyState = document.getElementById('historyEmptyState');
    const historySearch = document.getElementById('historySearch');
    if (!historyTableBody) return;

    historyTableBody.textContent = '';
    const query = historySearch ? historySearch.value.toLowerCase().trim() : '';
    const filtered = list.filter(item => !query || (item.filename && item.filename.toLowerCase().includes(query)));
    
    if (filtered.length === 0) {
        if (historyEmptyState) historyEmptyState.classList.remove('hidden');
        return;
    }
    if (historyEmptyState) historyEmptyState.classList.add('hidden');
    
    filtered.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/50 dark:hover:bg-[#1a1a1a]/30 transition-colors border-b border-gray-100 dark:border-neutral-800/60";
        
        const dateStr = item.date ? new Date(item.date).toLocaleString() : 'N/A';
        const sizeStr = typeof formatFileSize === 'function' ? formatFileSize(item.sizeBytes) : ((item.sizeBytes || 0) / 1024).toFixed(1) + ' KB';
        const valNum = typeof safeParseFloat === 'function' ? safeParseFloat(item.totalValue) : (parseFloat(item.totalValue) || 0);
        const valStr = '₹' + valNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const qtyNum = typeof safeParseFloat === 'function' ? safeParseFloat(item.totalQty) : (parseFloat(item.totalQty) || 0);
        const qtyStr = qtyNum.toLocaleString('en-IN');
        
        tr.appendChild(createTableCell(dateStr, "px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"));
        tr.appendChild(createTableCell(item.filename || 'Unknown', "px-4 py-3 font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[200px]", item.filename || ''));
        tr.appendChild(createTableCell(sizeStr, "px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"));
        tr.appendChild(createTableCell(String(item.totalRows || 0), "px-4 py-3 text-right font-mono font-medium text-gray-600 dark:text-gray-400"));
        tr.appendChild(createTableCell(String(item.uniqueParties || 0), "px-4 py-3 text-right font-mono font-medium text-gray-600 dark:text-gray-400"));
        tr.appendChild(createTableCell(valStr, "px-4 py-3 text-right font-mono font-bold text-green-600 dark:text-green-400"));
        tr.appendChild(createTableCell(qtyStr, "px-4 py-3 text-right font-mono font-medium text-blue-600 dark:text-blue-400"));
        
        // Actions Cell
        const actionTd = document.createElement('td');
        actionTd.className = "px-4 py-3 text-center whitespace-nowrap";
        
        const actionWrap = document.createElement('div');
        actionWrap.className = "flex items-center justify-center gap-2";
        
        // Load button
        const loadBtn = document.createElement('button');
        loadBtn.className = "bg-blue-600 hover:bg-blue-700 text-white font-bold px-2 py-1 rounded text-[10px] transition-all flex items-center gap-1 shadow-sm";
        loadBtn.innerHTML = `<i data-lucide="folder-open" class="w-3 h-3"></i><span>Load</span>`;
        loadBtn.addEventListener('click', () => loadHistoricalRecord(item.id));
        
        // Save raw button
        const rawBtn = document.createElement('button');
        rawBtn.className = "bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-300 font-bold px-2 py-1 rounded text-[10px] transition-all flex items-center gap-1 border border-gray-200/50 dark:border-neutral-800";
        rawBtn.innerHTML = `<i data-lucide="download" class="w-3 h-3"></i><span>Save Raw</span>`;
        rawBtn.addEventListener('click', () => downloadHistoricalRaw(item.id, item.filename));
        
        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = "bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white font-bold px-2 py-1 rounded text-[10px] transition-all flex items-center gap-1 border border-red-500/20";
        delBtn.innerHTML = `<i data-lucide="trash-2" class="w-3 h-3"></i><span>Delete</span>`;
        delBtn.addEventListener('click', () => deleteHistoricalRecord(item.id));
        
        actionWrap.appendChild(loadBtn);
        actionWrap.appendChild(rawBtn);
        actionWrap.appendChild(delBtn);
        actionTd.appendChild(actionWrap);
        tr.appendChild(actionTd);
        
        historyTableBody.appendChild(tr);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

async function loadHistoricalRecord(id) {
    if (!window.electronAPI) return;
    if (typeof showToast === 'function') {
        showToast("Restoring historical file session...", "warning");
    }
    
    try {
        const fileBuffer = await window.electronAPI.loadHistoricalFile(id);
        if (!fileBuffer) {
            if (typeof showToast === 'function') showToast("Failed to read history file from disk.", "error");
            return;
        }
        
        // Find filename
        const list = await window.electronAPI.loadHistoryList() || [];
        const record = list.find(r => r.id === id);
        const filename = record ? record.filename : 'historical_file.xlsx';
        
        // Convert to File object
        const binaryData = typeof convertIpcBuffer === 'function' ? convertIpcBuffer(fileBuffer) : fileBuffer;
        const mockFile = new File([binaryData], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        originalFileName = filename;
        const fileNameDisplay = document.getElementById('fileName');
        if (fileNameDisplay) fileNameDisplay.textContent = `Selected (History): ${filename}`;
        
        // Select tab process
        isRestoringFromHistory = true;
        if (typeof switchMainView === 'function') switchMainView('process');
        
        // Load the file as a normal file
        if (typeof handleFile === 'function') handleFile(mockFile);
        
        if (typeof showToast === 'function') showToast("Historical file restored successfully! ✅", "success");
    } catch (e) {
        console.error("Failed to restore history session:", e);
        if (typeof showToast === 'function') showToast("Error restoring history session.", "error");
    }
}

async function downloadHistoricalRaw(id, filename) {
    if (!window.electronAPI) return;
    try {
        const fileBuffer = await window.electronAPI.loadHistoricalFile(id);
        if (!fileBuffer) {
            if (typeof showToast === 'function') showToast("File not found on disk.", "error");
            return;
        }
        
        const binaryData = typeof convertIpcBuffer === 'function' ? convertIpcBuffer(fileBuffer) : fileBuffer;
        const savedPath = await window.electronAPI.saveFile({
            defaultName: filename,
            data: binaryData,
            filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] }]
        });
        
        if (savedPath && typeof showToast === 'function') {
            showToast("File saved successfully! ✅", "success");
        }
    } catch (e) {
        console.error("Failed to save historical raw file:", e);
        if (typeof showToast === 'function') showToast("Error saving raw file.", "error");
    }
}

async function deleteHistoricalRecord(id) {
    if (!window.electronAPI) return;
    if (!confirm("Are you sure you want to delete this historical record?")) return;
    
    try {
        const success = await window.electronAPI.deleteFromHistory(id);
        if (success) {
            if (typeof showToast === 'function') showToast("Record deleted successfully! 🗑️", "success");
            loadHistoryTable();
        } else {
            if (typeof showToast === 'function') showToast("Failed to delete record.", "error");
        }
    } catch (e) {
        console.error("Error deleting record:", e);
        if (typeof showToast === 'function') showToast("Error deleting record.", "error");
    }
}

function initializeHistory() {
    const historySearch = document.getElementById('historySearch');
    if (historySearch) {
        historySearch.addEventListener('input', () => {
            loadHistoryTable();
        });
    }
}

// Bind history functions to window so inline onclick handlers resolve them
window.loadHistoricalRecord = loadHistoricalRecord;
window.downloadHistoricalRaw = downloadHistoricalRaw;
window.deleteHistoricalRecord = deleteHistoricalRecord;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        saveCurrentUploadToHistory,
        loadHistoryTable,
        renderHistoryRows,
        loadHistoricalRecord,
        downloadHistoricalRaw,
        deleteHistoricalRecord,
        initializeHistory
    };
}
