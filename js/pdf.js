// --- PDF GENERATION & EXPORT LOGIC ---

function downloadPdfGeneric(dataToDownload, sheetNameSuffix, buttonElement) {
     if (!dataToDownload || dataToDownload.length === 0) { showError('errorNoData', `No data available.`); return; }
     const originalButtonText = buttonElement.innerHTML; buttonElement.disabled = true; buttonElement.innerHTML = `<span class="flex justify-center items-center h-full"><span class="loading-dots"><span></span><span></span><span></span></span></span>`; showToast("Generating PDF...", 'warning');
     
     setTimeout(async () => { 
         try { 
             const { jsPDF } = window.jspdf; 
             const doc = new jsPDF({ orientation: 'landscape' }); 
             doc.setFontSize(16); 
             doc.setTextColor(40); 
             const pdfTitle = `${sheetNameSuffix.replace(/_/g, ' ')} Data`; 
             doc.text(pdfTitle, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' }); 
             
             let tableData = dataToDownload; 
             if(Array.isArray(dataToDownload) && dataToDownload.length > 0 && Array.isArray(dataToDownload[0])) { 
                 tableData = convertArrayOfArraysToObjects(dataToDownload); 
             } 
             if (!Array.isArray(tableData) || tableData.length === 0) throw new Error("Invalid data format."); 
             
             const tableColumn = Object.keys(tableData[0]); 
             const tableRows = tableData.map(d => tableColumn.map(col => (d[col] === null || d[col] === undefined) ? '' : String(d[col]))); 
             
             doc.autoTable({ 
                 head: [tableColumn], 
                 body: tableRows, 
                 startY: 25, 
                 theme: 'grid', 
                 styles: { fontSize: 8, cellPadding: 1, overflow: 'linebreak' }, 
                 headStyles: { fillColor: [22, 160, 133], fontSize: 7 }, 
                 didDrawPage: function (data) { 
                     doc.setFontSize(10); 
                     doc.text("Page " + doc.internal.getNumberOfPages(), doc.internal.pageSize.width - data.settings.margin.right - 10, doc.internal.pageSize.height - 10); 
                 } 
             }); 
             
             const baseName = originalFileName.lastIndexOf('.') > -1 ? originalFileName.substring(0, originalFileName.lastIndexOf('.')) : originalFileName;
             const defaultName = `${baseName}_${sheetNameSuffix}.pdf`;
             
             if (window.electronAPI) {
                 const pdfBuffer = doc.output('arraybuffer');
                 const savedPath = await window.electronAPI.saveFile({
                     defaultName: defaultName,
                     data: pdfBuffer,
                     filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
                 });
                 if (savedPath) showToast(`PDF saved successfully! ✅`, 'success');
                 else showToast("PDF save cancelled. ❌", 'warning');
             } else {
                 doc.save(defaultName); 
                 showToast("PDF file downloaded successfully!", 'success'); 
             }
         } catch (error) { 
             console.error(error); 
             showError('errorProcessing', error); 
         } finally { 
             buttonElement.disabled = false; 
             buttonElement.innerHTML = originalButtonText; 
         } 
     }, 50);
}

function downloadPdfSigfaSheet(btn) { downloadPdfGeneric(originalJsonData, 'SIGFA_Sheet', btn); }
function downloadPdfWorkingSheet(btn) { downloadPdfGeneric(transformedData, 'Working_Sheet', btn); }
function downloadPdfDeduplicatedSheet(btn) { downloadPdfGeneric(finalDeduplicatedData, 'Without_Duplicate_Sheet', btn); }
