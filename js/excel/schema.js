/**
 * Prime-Pending-Pro Excel Schema & Header Mapping Layer
 * Detects column header synonyms, locates header rows, and maps raw spreadsheet layouts to standard keys.
 */

const COLUMN_SYNONYMS = {
    orderNo: ['ORDER NO', 'ORDER NO.', 'ORDER NUMBER', 'ORDER_NO', 'ORDER ID', 'ORDER REF', 'SO NO', 'SO NUMBER', 'VOUCHER NO', 'VOUCHER NUMBER', 'ORDER NUM'],
    date: ['DATE', 'ORDER DATE', 'SO DATE', 'VOUCHER DATE', 'ENTRY DATE'],
    partNo: ['PART NO.', 'PART NO', 'PART NUMBER', 'ITEM CODE', 'PART CODE', 'PRODUCT CODE', 'CATALOG NO', 'CATALOG NUMBER', 'PART'],
    partyName: ['PARTY NAME', 'PARTY', 'CUSTOMER NAME', 'CUSTOMER', 'ACCOUNT NAME', 'ACCOUNT'],
    itemName: ['ITEM NAME', 'ITEM', 'DESCRIPTION', 'PRODUCT NAME', 'ITEM DESCRIPTION', 'MATERIAL DESCRIPTION', 'ITEM DESC'],
    orderQty: ['ORDER QTY', 'ORDER QUANTITY', 'ORDER QTY.', 'ORDER_QTY', 'SO QTY'],
    despQty: ['DESP QTY', 'DISPATCH QTY', 'DISPATCHED QTY', 'DELIVERY QTY', 'DEL QTY', 'DESP QTY.', 'DESP_QTY', 'DISPATCH_QTY'],
    balance: ['BALANCE', 'BAL QTY', 'BALANCE QTY', 'PENDING QTY', 'REMAINING QTY', 'BAL', 'BALANCE QTY.', 'BAL_QTY', 'PENDING_QTY'],
    rate: ['RATE', 'PRICE', 'UNIT PRICE', 'UNIT RATE', 'ITEM RATE'],
    value: ['VALUE', 'AMOUNT', 'TOTAL VALUE', 'TOTAL AMOUNT', 'NET AMOUNT', 'BAL VALUE', 'BALANCE VALUE']
};

/**
 * Normalizes header string: case-insensitive, strip punctuation, multiple spaces.
 * @param {string} str 
 * @returns {string}
 */
function normalizeHeader(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/[\._\-#\/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

/**
 * Find index of a column in headers using a synonyms list.
 * @param {Array<string>} headers 
 * @param {Array<string>} synonyms 
 * @returns {number} 0-based column index, or -1 if not found
 */
function findColumnIndex(headers, synonyms) {
    if (!headers || !Array.isArray(headers)) return -1;
    const normalizedHeaders = headers.map(h => normalizeHeader(h));
    const normalizedSynonyms = synonyms.map(s => normalizeHeader(s));

    // Exact match across all normalized synonyms
    for (let i = 0; i < normalizedHeaders.length; i++) {
        const h = normalizedHeaders[i];
        if (!h) continue;
        if (normalizedSynonyms.includes(h)) {
            return i;
        }
    }
    return -1;
}

/**
 * Detect the header row index in a 2D array of Excel data.
 * @param {Array<Array<*>>} data 
 * @returns {number} 0-based header row index, or -1 if not found
 */
function findHeaderRowIndex(data) {
    if (!data || !Array.isArray(data)) return -1;
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;
        
        let matchCount = 0;
        for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
            if (findColumnIndex(row, synonyms) !== -1) {
                matchCount++;
            }
        }
        if (matchCount >= 2) {
            return i;
        }
    }
    return -1;
}

/**
 * Detects mapping of standard columns to their 0-based indices in the worksheet.
 * @param {Array<string>} headerRow 
 * @returns {Object}
 */
function detectColumnMap(headerRow) {
    const colMap = {};
    for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
        colMap[key] = findColumnIndex(headerRow, synonyms);
    }
    return colMap;
}

/**
 * Validates that required columns exist in the detected column map.
 * @param {Object} colMap 
 */
function validateRequiredHeaders(colMap) {
    if (colMap.orderNo === -1) {
        throw new Error("Missing required column: ORDER NO. Processing cannot continue without order identifiers.");
    }
    if (colMap.balance === -1 && colMap.orderQty === -1) {
        throw new Error("Missing required column: BALANCE. Processing cannot determine pending quantities.");
    }
}

/**
 * Converts a 2D array of spreadsheet cells into an array of JavaScript objects.
 * @param {Array<Array<*>>} data 
 * @returns {Array<Object>}
 */
function convertArrayOfArraysToObjects(data) {
    if (!data || data.length === 0) return [];
    let headerRowIndex = findHeaderRowIndex(data);
    if (headerRowIndex === -1) headerRowIndex = 0;
    const headers = data[headerRowIndex];
    const arrayOfObjects = [];
    for (let i = headerRowIndex + 1; i < data.length; i++) { 
        const row = data[i];
        if (!row || !Array.isArray(row)) continue;
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            if (headers[j]) obj[headers[j]] = row[j] !== undefined ? row[j] : "";
        }
        if (Object.keys(obj).length > 0) arrayOfObjects.push(obj);
    }
    return arrayOfObjects;
}

/**
 * Adjusts column widths in a SheetJS worksheet to autofit content.
 */
function autofitColumns(ws, data) {
    if (!data || data.length === 0) return;
    const keys = Object.keys(data[0]);
    const colWidths = keys.map(key => {
        let maxLen = key.length;
        for (const row of data) {
            const val = row[key];
            if (val !== undefined && val !== null) {
                const len = String(val).length;
                if (len > maxLen) maxLen = len;
            }
        }
        return { wch: maxLen + 2 };
    });
    ws['!cols'] = colWidths;
}

if (typeof self !== 'undefined') {
    self.COLUMN_SYNONYMS = COLUMN_SYNONYMS;
    self.normalizeHeader = normalizeHeader;
    self.findColumnIndex = findColumnIndex;
    self.findHeaderRowIndex = findHeaderRowIndex;
    self.detectColumnMap = detectColumnMap;
    self.validateRequiredHeaders = validateRequiredHeaders;
    self.convertArrayOfArraysToObjects = convertArrayOfArraysToObjects;
    self.autofitColumns = autofitColumns;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        COLUMN_SYNONYMS,
        normalizeHeader,
        findColumnIndex,
        findHeaderRowIndex,
        detectColumnMap,
        validateRequiredHeaders,
        convertArrayOfArraysToObjects,
        autofitColumns
    };
}
