/**
 * Prime-Pending-Pro Excel Exporter Module
 * Handles ExcelJS workbook generation, styling, sheet formatting, and file downloads.
 */

/**
 * Generates an ExcelJS workbook buffer containing SIGFA SHEET, WORKING SHEET, and WITHOUT DUPLICATE.
 * @param {Uint8Array|ArrayBuffer} fileData 
 * @param {Array<Object>} transformedRows 
 * @param {Array<Object>} finalDeduplicatedRows 
 * @param {boolean} enableExcelStyling 
 * @returns {Promise<Uint8Array>}
 */
async function generateExcelJSWorkbookBuffer(fileData, transformedRows, finalDeduplicatedRows, enableExcelStyling) {
    if (typeof ExcelJS === 'undefined') {
        throw new Error("ExcelJS library is not loaded");
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileData);
    
    // 1. Rename the first sheet to "SIGFA SHEET" if it has a different name
    if (workbook.worksheets.length > 0) {
        workbook.worksheets[0].name = "SIGFA SHEET";
    }
    
    // 2. Remove existing WORKING SHEET and WITHOUT DUPLICATE sheets if they exist
    const oldWorking = workbook.getWorksheet('WORKING SHEET');
    if (oldWorking) workbook.removeWorksheet(oldWorking.id);
    
    const oldDeduplicated = workbook.getWorksheet('WITHOUT DUPLICATE');
    if (oldDeduplicated) workbook.removeWorksheet(oldDeduplicated.id);
    
    // 3. Add WORKING SHEET
    const wsWorking = workbook.addWorksheet('WORKING SHEET');
    if (transformedRows && transformedRows.length > 0) {
        const headers = Object.keys(transformedRows[0]);
        wsWorking.addRow(headers);
        transformedRows.forEach(row => {
            const vals = headers.map(h => row[h]);
            wsWorking.addRow(vals);
        });
        
        headers.forEach((h, i) => {
            let maxLen = h.length;
            transformedRows.forEach(row => {
                const val = row[h];
                if (val !== undefined && val !== null) {
                    maxLen = Math.max(maxLen, String(val).length);
                }
            });
            const col = wsWorking.getColumn(i + 1);
            col.width = maxLen + 4;
        });
    }
    
    // 4. Add WITHOUT DUPLICATE Sheet
    const wsDeduplicated = workbook.addWorksheet('WITHOUT DUPLICATE', {
        views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }]
    });
    
    if (finalDeduplicatedRows && finalDeduplicatedRows.length > 0) {
        const headers = Object.keys(finalDeduplicatedRows[0]);
        wsDeduplicated.addRow(headers);
        finalDeduplicatedRows.forEach(row => {
            const vals = headers.map(h => row[h]);
            wsDeduplicated.addRow(vals);
        });
        
        // AutoFilter
        wsDeduplicated.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: finalDeduplicatedRows.length + 1, column: headers.length }
        };
        
        headers.forEach((h, i) => {
            let maxLen = h.length;
            finalDeduplicatedRows.forEach(row => {
                const val = row[h];
                if (val !== undefined && val !== null) {
                    maxLen = Math.max(maxLen, String(val).length);
                }
            });
            const col = wsDeduplicated.getColumn(i + 1);
            col.width = maxLen + 4;
        });
        
        if (enableExcelStyling) {
            const headerRow = wsDeduplicated.getRow(1);
            headerRow.height = 24;
            headerRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF1E3A8A' }
                };
                cell.font = {
                    name: 'Segoe UI',
                    size: 10,
                    bold: true,
                    color: { argb: 'FFFFFFFF' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                    bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
                    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
                };
            });
            
            const cellFont = { name: 'Segoe UI', size: 9 };
            const cellBorder = {
                top: { style: 'thin', color: { argb: 'FFF3F4F6' } },
                bottom: { style: 'thin', color: { argb: 'FFF3F4F6' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };
            const cellAlignments = {
                left: { vertical: 'middle', horizontal: 'left' },
                center: { vertical: 'middle', horizontal: 'center' },
                right: { vertical: 'middle', horizontal: 'right' }
            };

            const colAlignments = headers.map(h => {
                if (h === 'ORDER NO' || h === 'PART NO.' || h === 'DATE') return 'center';
                if (h === 'ORDER QTY' || h === 'DESP QTY' || h === 'BALANCE' || h === 'RATE' || h === 'VALUE') return 'right';
                return 'left';
            });
            
            wsDeduplicated.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;
                row.height = 20;
                row.eachCell((cell, colNumber) => {
                    const align = colAlignments[colNumber - 1] || 'left';
                    cell.font = cellFont;
                    cell.alignment = cellAlignments[align];
                    cell.border = cellBorder;
                });
            });
        } else {
            const headerRow = wsDeduplicated.getRow(1);
            headerRow.eachCell((cell) => {
                cell.font = {
                    name: 'Segoe UI',
                    size: 10,
                    bold: true
                };
            });
        }
    }
    
    const buf = await workbook.xlsx.writeBuffer();
    return new Uint8Array(buf);
}

async function downloadTransformedFile() {
    const downloadExcelButton = document.getElementById('downloadExcelButton');
    if (!processedWbout || !downloadExcelButton) return;

    downloadExcelButton.disabled = true; 
    downloadExcelButton.innerHTML = `<span class="flex items-center justify-center"><span>Generating...</span><span class="loading-dots"><span></span><span></span><span></span></span></span>`; 
    if (typeof showToast === 'function') {
        showToast("Generating Excel file...", 'warning');
    }
    
    setTimeout(async () => { 
        try {
            const baseName = originalFileName.lastIndexOf('.') > -1 ? originalFileName.substring(0, originalFileName.lastIndexOf('.')) : (originalFileName || 'pending_orders');
            const defaultName = `${baseName}_transformed.xlsx`;
            
            if (window.electronAPI) {
                const savedPath = await window.electronAPI.saveFile({
                    defaultName: defaultName,
                    data: processedWbout
                });
                if (savedPath && typeof showToast === 'function') {
                    showToast(`Excel saved successfully! ✅`, 'success');
                } else if (typeof showToast === 'function') {
                    showToast("Save cancelled. ❌", 'warning');
                }
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
                if (typeof showToast === 'function') {
                    showToast("Excel file downloaded successfully!", 'success');
                }
            }
        } catch (error) {
            console.error("Export error:", error);
            if (typeof showError === 'function') {
                showError('errorProcessing', error);
            }
        } finally {
            downloadExcelButton.disabled = false;
            downloadExcelButton.innerHTML = (typeof originalExcelButtonHTML !== 'undefined' && originalExcelButtonHTML) ? originalExcelButtonHTML : "Download Transformed Excel File";
        }
    }, 50);
}

/**
 * Regenerates the styled workbook from current data. Expensive for large files,
 * so callers go through the debounced wrapper below - rapid rule toggles
 * collapse into a single regeneration after activity settles.
 */
function regenerateWorkbookInternal() {
    if (!uploadedFileData || !transformedData || !finalDeduplicatedData) return;
    try {
        const excelStylingToggle = document.getElementById('excelStylingToggle');
        const enableExcelStyling = excelStylingToggle ? excelStylingToggle.checked : true;
        if (typeof generateExcelJSWorkbookBuffer === 'function') {
            processedWbout = generateExcelJSWorkbookBuffer(uploadedFileData, transformedData, finalDeduplicatedData, enableExcelStyling);
            // Keep the promise contract: resolve processedWbout once the async export settles
            Promise.resolve(processedWbout).then((buf) => { processedWbout = buf; }).catch((e) => {
                console.error("Failed to regenerate workbook:", e);
            });
        }
    } catch (e) {
        console.error("Failed to regenerate workbook:", e);
    }
}

const debouncedRegenerate = (typeof debounce === 'function' ? debounce : (fn) => fn)(regenerateWorkbookInternal, 500);

function regenerateWorkbook(immediate = false) {
    if (immediate && typeof debouncedRegenerate.cancel === 'function') {
        debouncedRegenerate.cancel();
        return regenerateWorkbookInternal();
    }
    return debouncedRegenerate();
}

if (typeof self !== 'undefined') {
    self.generateExcelJSWorkbookBuffer = generateExcelJSWorkbookBuffer;
    self.downloadTransformedFile = downloadTransformedFile;
    self.regenerateWorkbook = regenerateWorkbook;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateExcelJSWorkbookBuffer,
        downloadTransformedFile,
        regenerateWorkbook
    };
}
