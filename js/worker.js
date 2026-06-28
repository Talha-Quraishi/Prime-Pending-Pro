self.importScripts('../libs/xlsx.full.min.js');
self.importScripts('processor.js');

self.onmessage = function(e) {
    try {
        const { fileData, excludedParties, deduplicateParties, specialParties, partyMerges, fullyExcludedParties } = e.data;
        
        // Read sheet
        const workbook = XLSX.read(fileData, { type: 'array', cellStyles: true });
        const originalSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[originalSheetName];
        const originalRawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        const originalJson = convertArrayOfArraysToObjects(originalRawData);
        
        // Assign to global variables for processor functions to read
        self.partyMerges = partyMerges;
        self.fullyExcludedParties = fullyExcludedParties;
        
        const transformed = transformExcelData(originalRawData);
        const finalDeduplicated = findAndKeepLatestOrders(transformed, excludedParties, deduplicateParties, specialParties, fullyExcludedParties);
        
        // Build sheets
        if (originalSheetName !== "SIGFA SHEET") {
            workbook.Sheets["SIGFA SHEET"] = worksheet;
            delete workbook.Sheets[originalSheetName];
            workbook.SheetNames[workbook.SheetNames.indexOf(originalSheetName)] = "SIGFA SHEET";
        }
        const newWorksheet = XLSX.utils.json_to_sheet(transformed);
        autofitColumns(newWorksheet, transformed);
        XLSX.utils.book_append_sheet(workbook, newWorksheet, 'WORKING SHEET');
        
        const deduplicatedWorksheet = XLSX.utils.json_to_sheet(finalDeduplicated);
        autofitColumns(deduplicatedWorksheet, finalDeduplicated);
        if (deduplicatedWorksheet['!ref']) {
            deduplicatedWorksheet['!autofilter'] = { ref: deduplicatedWorksheet['!ref'] };
        }
        XLSX.utils.book_append_sheet(workbook, deduplicatedWorksheet, 'WITHOUT DUPLICATE');
        
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        
        const transferList = wbout instanceof ArrayBuffer ? [wbout] : (wbout && wbout.buffer instanceof ArrayBuffer ? [wbout.buffer] : []);
        self.postMessage({
            success: true,
            originalJson,
            transformed,
            finalDeduplicated,
            wbout,
            originalSheetName
        }, transferList);
    } catch(err) {
        self.postMessage({ success: false, error: err.message || err });
    }
};
