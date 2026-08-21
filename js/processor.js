/**
 * Prime-Pending-Pro Core Processor Coordinator
 * Coordinates Excel schema detection, row normalization, party merges, completion invalidation, and deduplication.
 */

// If running in CommonJS (Node.js tests), import all business submodules
const _norm = typeof require !== 'undefined' ? require('./business/normalization') : (typeof self !== 'undefined' ? self : globalThis);
const _schema = typeof require !== 'undefined' ? require('./excel/schema') : (typeof self !== 'undefined' ? self : globalThis);
const _dedup = typeof require !== 'undefined' ? require('./business/deduplication') : (typeof self !== 'undefined' ? self : globalThis);
const _party = typeof require !== 'undefined' ? require('./business/party-rules') : (typeof self !== 'undefined' ? self : globalThis);
const _exporter = typeof require !== 'undefined' ? require('./excel/exporter') : (typeof self !== 'undefined' ? self : globalThis);

/**
 * Transforms raw 2D Excel sheet data into structured pending order rows.
 * Uses flexible header column detection rather than rigid hardcoded indices.
 * @param {Array<Array<*>>} data 
 * @returns {Array<Object>}
 */
function transformExcelData(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error("Empty workbook or invalid sheet data.");
    }

    const headerFinder = typeof findHeaderRowIndex === 'function' ? findHeaderRowIndex : _schema.findHeaderRowIndex;
    const colMapper = typeof detectColumnMap === 'function' ? detectColumnMap : _schema.detectColumnMap;
    const headerValidator = typeof validateRequiredHeaders === 'function' ? validateRequiredHeaders : _schema.validateRequiredHeaders;
    const floatParser = typeof safeParseFloat === 'function' ? safeParseFloat : _norm.safeParseFloat;
    const mergeResolver = typeof resolvePartyMerge === 'function' ? resolvePartyMerge : _party.resolvePartyMerge;

    const headerRowIndex = headerFinder(data);
    if (headerRowIndex === -1) {
        throw new Error("Header row not found. Please ensure the file contains 'ORDER NO' and 'ITEM NAME' / 'PART NO.' columns.");
    }

    const headers = data[headerRowIndex];
    const colMap = colMapper(headers);

    // Validate critical required headers
    headerValidator(colMap);

    const orderNoCol = colMap.orderNo;
    const dateCol = colMap.date !== -1 ? colMap.date : 1;
    const partNoCol = colMap.partNo;
    const itemNameCol = colMap.itemName;
    const orderQtyCol = colMap.orderQty;
    const despQtyCol = colMap.despQty;
    const balanceCol = colMap.balance;
    const rateCol = colMap.rate;
    const valueCol = colMap.value;

    const transformedRows = [];
    let currentPartyName = '', currentOrderNo = '', currentDate = '';

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !Array.isArray(row) || row.every(cell => cell === "" || cell === null || cell === undefined)) continue;
        
        const orderNoCell = (orderNoCol !== -1 && row[orderNoCol] !== undefined) ? String(row[orderNoCol]).trim() : '';
        const col0Cell = (row[0] !== undefined) ? String(row[0]).trim() : '';
        const partNo = (partNoCol !== -1 && row[partNoCol] !== undefined) ? String(row[partNoCol]).trim() : '';
        const itemName = (itemNameCol !== -1 && row[itemNameCol] !== undefined) ? String(row[itemNameCol]).trim() : '';
        const hasItemData = Boolean(partNo || itemName);
        
        const orderNoUpper = orderNoCell.toUpperCase();
        // Check order voucher format: APR/SO/..., DEL/..., DEL-..., DEL..., or contains digits/slashes with SO/DEL
        const isOrderNo = orderNoUpper.startsWith('APR/SO') ||
                          orderNoUpper.startsWith('DEL/') ||
                          orderNoUpper.startsWith('DEL-') ||
                          orderNoUpper.startsWith('DEL ') ||
                          /^DEL[0-9]/.test(orderNoUpper) ||
                          (orderNoUpper.startsWith('DEL') && (orderNoUpper.includes('/') || orderNoUpper.includes('-') || /\d/.test(orderNoUpper)));

        // Identify party row: either from orderNo column or col0 when no item data present
        let candidatePartyName = '';
        if (orderNoCell && !isOrderNo && !hasItemData && !orderNoUpper.startsWith('TOTAL')) {
            candidatePartyName = orderNoCell;
        } else if (col0Cell && !hasItemData && !col0Cell.toUpperCase().startsWith('TOTAL') && !isOrderNo) {
            candidatePartyName = col0Cell;
        }

        if (candidatePartyName) {
            let pName = candidatePartyName.replace(/\s+/g, ' ');
            const pMerges = (typeof partyMerges !== 'undefined' && partyMerges) ? partyMerges : ((typeof globalThis !== 'undefined' && globalThis.partyMerges) ? globalThis.partyMerges : {});
            pName = mergeResolver(pName, pMerges);
            currentPartyName = pName;
            currentOrderNo = '';
            currentDate = '';
            continue;
        }

        if (isOrderNo) {
            currentOrderNo = orderNoCell;
            currentDate = (dateCol !== -1 && row[dateCol] !== undefined) ? String(row[dateCol]).trim() : '';
        }

        if (!currentPartyName || !itemName || !currentDate) continue;

        transformedRows.push({
            'ORDER NO': currentOrderNo,
            'DATE': currentDate,
            'PART NO.': partNo,
            'PARTY NAME': currentPartyName,
            'ITEM NAME': itemName,
            'ORDER QTY': orderQtyCol !== -1 ? floatParser(row[orderQtyCol]) : 0,
            'DESP QTY': despQtyCol !== -1 ? floatParser(row[despQtyCol]) : 0,
            'BALANCE': balanceCol !== -1 ? floatParser(row[balanceCol]) : 0,
            'RATE': rateCol !== -1 ? floatParser(row[rateCol]) : 0,
            'VALUE': valueCol !== -1 ? floatParser(row[valueCol]) : 0
        });
    }

    return transformedRows;
}

if (typeof self !== 'undefined') {
    self.transformExcelData = transformExcelData;
}

// Support Node.js testing environment while keeping global browser scope
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        safeParseFloat: _norm.safeParseFloat,
        parseDMY: _norm.parseDMY,
        getMarkaInfo: _norm.getMarkaInfo,
        getLevenshteinDistance: _norm.getLevenshteinDistance,
        COLUMN_SYNONYMS: _schema.COLUMN_SYNONYMS,
        normalizeHeader: _schema.normalizeHeader,
        findColumnIndex: _schema.findColumnIndex,
        findHeaderRowIndex: _schema.findHeaderRowIndex,
        detectColumnMap: _schema.detectColumnMap,
        validateRequiredHeaders: _schema.validateRequiredHeaders,
        convertArrayOfArraysToObjects: _schema.convertArrayOfArraysToObjects,
        autofitColumns: _schema.autofitColumns,
        transformExcelData,
        findAndKeepLatestOrders: _dedup.findAndKeepLatestOrders,
        generateExcelJSWorkbookBuffer: _exporter.generateExcelJSWorkbookBuffer
    };
}
