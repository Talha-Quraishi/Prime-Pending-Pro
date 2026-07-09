self.importScripts('../libs/xlsx.full.min.js');
self.importScripts('../libs/exceljs.min.js');
self.importScripts('processor.js');

self.onmessage = async function(e) {
    try {
        const { action, fileData, excludedParties, deduplicateParties, specialParties, partyMerges, fullyExcludedParties, enableExcelStyling } = e.data;
        
        if (action === 'scan') {
            // Speed optimization: disable formulas, styles, and HTML features when just auto-scanning
            const workbook = XLSX.read(fileData, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false });
            const originalSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[originalSheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
            
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
            const uniqueParties = [...scannedParties].sort();
            const headersRow = headerIdx !== -1 ? rawData[headerIdx] : null;
            self.postMessage({
                success: true,
                action: 'scan',
                rowCount: rawData.length,
                uniqueParties,
                headers: headersRow
            });
            return;
        }

        // Read sheet for normal processing
        self.postMessage({ action: 'status', progress: 25, message: 'Reading Excel workbook and parsing sheets...' });
        const workbook = XLSX.read(fileData, { type: 'array', cellStyles: true });
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
        const finalDeduplicated = findAndKeepLatestOrders(transformed, excludedParties, deduplicateParties, specialParties, fullyExcludedParties);
        
        self.postMessage({ action: 'status', progress: 95, message: 'Generating styled sheets via ExcelJS...' });
        // Build workbook buffer using ExcelJS
        const wbout = await generateExcelJSWorkbookBuffer(fileData, transformed, finalDeduplicated, enableExcelStyling);
        
        self.postMessage({
            success: true,
            originalJson,
            transformed,
            finalDeduplicated,
            wbout,
            originalSheetName
        });
    } catch(err) {
        self.postMessage({ success: false, error: err.message || err });
    }
};
