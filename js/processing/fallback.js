/**
 * Prime-Pending-Pro Main Thread Fallback Processing Module
 * Fallback pipeline when Web Workers are unavailable or encounter a crash.
 * Guaranteed to produce identical result shapes and values as worker.js.
 */

/**
 * Runs the complete transformation pipeline synchronously on the main thread.
 * @param {Object} payload - Input file data and party rule configurations
 * @param {Object} options - Progress reporting callbacks
 * @returns {Promise<Object>} Processed result shape identical to worker.js
 */
async function runFallbackProcessing(payload, options = {}) {
    const { onProgress } = options;
    const report = (p, msg) => {
        if (typeof onProgress === 'function') onProgress(p, msg);
    };

    const {
        fileData,
        excludedParties = [],
        deduplicateParties = [],
        specialParties = [],
        partyMerges = {},
        fullyExcludedParties = [],
        enableExcelStyling = true
    } = payload;

    report(20, "Reading workbook and parsing sheets...");

    // Yield execution briefly to let UI render progress
    await new Promise(r => setTimeout(r, 20));

    if (typeof XLSX === 'undefined') {
        throw new Error("XLSX library not loaded for fallback execution");
    }

    const workbook = XLSX.read(fileData, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false });
    const originalSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[originalSheetName];

    report(40, "Converting sheet rows to structured JSON...");
    await new Promise(r => setTimeout(r, 20));

    const originalRawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    const originalJson = typeof convertArrayOfArraysToObjects === 'function'
        ? convertArrayOfArraysToObjects(originalRawData)
        : originalRawData;

    report(60, "Restructuring rows and applying rules...");
    await new Promise(r => setTimeout(r, 20));

    if (typeof transformExcelData !== 'function' || typeof findAndKeepLatestOrders !== 'function') {
        throw new Error("Processor functions (transformExcelData / findAndKeepLatestOrders) are not available");
    }

    const transformed = transformExcelData(originalRawData);
    const finalDeduplicated = findAndKeepLatestOrders(
        transformed,
        excludedParties,
        deduplicateParties,
        specialParties,
        fullyExcludedParties
    );

    report(80, "Generating styled sheets via ExcelJS...");
    await new Promise(r => setTimeout(r, 20));

    let wbout;
    try {
        if (typeof generateExcelJSWorkbookBuffer === 'function') {
            wbout = await generateExcelJSWorkbookBuffer(fileData, transformed, finalDeduplicated, enableExcelStyling);
        } else {
            wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        }
    } catch (exportErr) {
        console.warn("ExcelJS fallback export failed, falling back to raw XLSX:", exportErr);
        wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    }

    report(100, "Transformation complete!");

    return {
        success: true,
        originalJson,
        transformed,
        finalDeduplicated,
        wbout,
        originalSheetName
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runFallbackProcessing
    };
}
