/**
 * Prime-Pending-Pro Excel Exporter Module
 * Handles file saving (native Electron dialog vs browser blob download) and workbook regeneration.
 */

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

async function regenerateWorkbook() {
    if (!uploadedFileData || !transformedData || !finalDeduplicatedData) return;
    try {
        const excelStylingToggle = document.getElementById('excelStylingToggle');
        const enableExcelStyling = excelStylingToggle ? excelStylingToggle.checked : true;
        if (typeof generateExcelJSWorkbookBuffer === 'function') {
            processedWbout = await generateExcelJSWorkbookBuffer(uploadedFileData, transformedData, finalDeduplicatedData, enableExcelStyling);
        }
    } catch (e) {
        console.error("Failed to regenerate workbook:", e);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        downloadTransformedFile,
        regenerateWorkbook
    };
}
