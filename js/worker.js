self.importScripts('../libs/xlsx.full.min.js');
self.importScripts('../libs/exceljs.min.js');
self.importScripts('business/normalization.js');
self.importScripts('excel/schema.js');
self.importScripts('business/completion.js');
self.importScripts('business/party-rules.js');
self.importScripts('business/deduplication.js');
self.importScripts('excel/exporter.js');
self.importScripts('processor.js');

self.onmessage = async function(e) {
    try {
        const { action, fileData, excludedParties, deduplicateParties, specialParties, partyMerges, fullyExcludedParties, partyMonthSelections, enableExcelStyling } = e.data;
        
        if (action === 'scan') {
            // Speed optimization: disable formulas, styles, and HTML features when just auto-scanning
            const workbook = XLSX.read(fileData, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false });
            const originalSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[originalSheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

            // Shared scan logic (same as main-thread fallback in excel/reader.js)
            const scan = scanSigfaRows(rawData);
            self.postMessage({
                success: true,
                action: 'scan',
                rowCount: scan.rowCount,
                uniqueParties: scan.uniqueParties,
                partyMonthsMap: scan.partyMonthsMap,
                headers: scan.headers
            });
            return;
        }

        // Read sheet for normal processing
        self.postMessage({ action: 'status', progress: 25, message: 'Reading Excel workbook and parsing sheets...' });
        const workbook = XLSX.read(fileData, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false });
        const originalSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[originalSheetName];
        
        self.postMessage({ action: 'status', progress: 45, message: 'Converting sheet rows to structured JSON...' });
        const originalRawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const originalJson = convertArrayOfArraysToObjects(originalRawData);
        
        // Assign to global variables for processor functions to read
        self.partyMerges = partyMerges;
        self.fullyExcludedParties = fullyExcludedParties;
        
        self.postMessage({ action: 'status', progress: 65, message: 'Restructuring rows into parties and orders...' });
        const transformed = transformExcelData(originalRawData);
        
        self.postMessage({ action: 'status', progress: 80, message: 'Applying party-specific rules and deduplication...' });
        const finalDeduplicated = findAndKeepLatestOrders(transformed, excludedParties, deduplicateParties, specialParties, fullyExcludedParties, partyMonthSelections);
        
        const exportMsg = enableExcelStyling ? 'Generating styled sheets via ExcelJS...' : 'Generating Excel workbook...';
        self.postMessage({ action: 'status', progress: 95, message: exportMsg });
        // Build workbook buffer using ExcelJS
        const wbout = await generateExcelJSWorkbookBuffer(fileData, transformed, finalDeduplicated, enableExcelStyling);
        
        self.postMessage({
            success: true,
            originalJson,
            transformed,
            finalDeduplicated,
            wbout,
            originalSheetName
        }, [wbout.buffer]);
    } catch(err) {
        self.postMessage({ success: false, error: err.message || err });
    }
};
