/**
 * Prime-Pending-Pro Core Processor Engine
 * Handles Excel data restructuring, schema mapping, and business deduplication rules.
 */

// --- UTILITIES & NORMALIZATION ---

/**
 * Safely parse numbers from Excel cells, strings, or numbers with commas.
 */
function safeParseFloat(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleanStr = String(val).replace(/,/g, '').trim();
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse diverse date representations into normalized Date objects:
 * - DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
 * - YYYY-MM-DD (ISO strings)
 * - Excel numerical serial dates (days since 1900/1970)
 * - Auto-detect and swap MM-DD-YYYY if month > 12
 */
function parseDMY(dateInput) {
    if (dateInput instanceof Date) {
        return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    }
    if (!dateInput && dateInput !== 0) return new Date(0);
    
    // Handle Excel numeric serial number dates
    if (typeof dateInput === 'number' || (!isNaN(dateInput) && !String(dateInput).includes('-') && !String(dateInput).includes('/') && !String(dateInput).includes('.'))) {
        const num = Number(dateInput);
        if (num > 0) {
            // Excel base date offset is 25569 days to 1-Jan-1970
            const utcDate = new Date((num - 25569) * 86400 * 1000);
            return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
        }
    }
    
    const dateString = String(dateInput).trim();
    if (!dateString) return new Date(0);

    // Handle ISO string dates (YYYY-MM-DD or containing T)
    if (dateString.includes('T')) {
        const d = new Date(dateString);
        if (!isNaN(d.getTime())) {
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }
    }
    
    // Split by common date separators: /, -, ., and space
    const parts = dateString.split(/[-./\s]+/);
    if (parts.length === 3) {
        let y, m, d;
        if (parts[0].length === 4) {
            // Format: YYYY-MM-DD
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10) - 1;
            d = parseInt(parts[2], 10);
        } else {
            // Format: DD-MM-YYYY
            d = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10) - 1;
            y = parseInt(parts[2], 10);
            
            // Auto-detect and swap if month is out-of-bounds (MM-DD-YYYY format)
            if (m < 0 || m > 11) {
                const temp = d;
                d = parseInt(parts[1], 10);
                m = parseInt(parts[0], 10) - 1;
            }
        }
        
        const fullYear = y < 100 ? (y + 2000) : y;
        if (!isNaN(fullYear) && !isNaN(m) && !isNaN(d)) {
            return new Date(fullYear, m, d);
        }
    }
    
    // Fallback: try native Date parsing
    const nativeParsed = new Date(dateString);
    if (!isNaN(nativeParsed.getTime())) {
        if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return new Date(nativeParsed.getUTCFullYear(), nativeParsed.getUTCMonth(), nativeParsed.getUTCDate());
        }
        return new Date(nativeParsed.getFullYear(), nativeParsed.getMonth(), nativeParsed.getDate());
    }
    
    return new Date(0);
}

// --- COLUMN NORMALIZATION & SCHEMA SYNONYMS ---

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
 * Find index of a column in headers using synonyms list.
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
 * Detect the header row index in 2D array of Excel data.
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
 */
function detectColumnMap(headerRow) {
    const colMap = {};
    for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
        colMap[key] = findColumnIndex(headerRow, synonyms);
    }
    return colMap;
}

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
 * Transforms raw 2D Excel sheet data into structured pending order rows.
 * Uses flexible header column detection rather than rigid hardcoded indices.
 */
function transformExcelData(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error("Empty workbook or invalid sheet data.");
    }

    const headerRowIndex = findHeaderRowIndex(data);
    if (headerRowIndex === -1) {
        throw new Error("Header row not found. Please ensure the file contains 'ORDER NO' and 'ITEM NAME' / 'PART NO.' columns.");
    }

    const headers = data[headerRowIndex];
    const colMap = detectColumnMap(headers);

    // Validate critical columns
    if (colMap.orderNo === -1) {
        throw new Error("Missing required column: ORDER NO. Processing cannot continue without order identifiers.");
    }
    if (colMap.balance === -1 && colMap.orderQty === -1) {
        throw new Error("Missing required column: BALANCE. Processing cannot determine pending quantities.");
    }

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
            const pNameUpper = pName.toUpperCase();
            if (typeof partyMerges !== 'undefined' && partyMerges && partyMerges[pNameUpper]) {
                pName = partyMerges[pNameUpper];
            } else if (typeof globalThis !== 'undefined' && globalThis.partyMerges && globalThis.partyMerges[pNameUpper]) {
                pName = globalThis.partyMerges[pNameUpper];
            }
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
            'ORDER QTY': orderQtyCol !== -1 ? safeParseFloat(row[orderQtyCol]) : 0,
            'DESP QTY': despQtyCol !== -1 ? safeParseFloat(row[despQtyCol]) : 0,
            'BALANCE': balanceCol !== -1 ? safeParseFloat(row[balanceCol]) : 0,
            'RATE': rateCol !== -1 ? safeParseFloat(row[rateCol]) : 0,
            'VALUE': valueCol !== -1 ? safeParseFloat(row[valueCol]) : 0
        });
    }

    return transformedRows;
}

// --- DEDUPLICATION ENGINE & BUSINESS RULES ---

/**
 * Core business rules for order deduplication:
 * 
 * 1. KEEP ALL (List 1): Preserves every pending row for configured parties without deduplication.
 * 2. KEEP LATEST (List 2): Preserves only orders matching the latest pending date for the party.
 * 3. DEFAULT: Groups by Party + Item Name + Part No, keeping the latest pending status.
 * 4. COMPLETED INVALIDATION: When a newer row has Balance <= 0, older pending rows for that item are discarded.
 * 5. MARKA GROUPING: Parties in special list group by Party + Marka Tag + Item Name + Part No.
 */
function findAndKeepLatestOrders(data, excludedPartiesList, deduplicatePartiesList, specialPartiesList, fullyExcludedPartiesList) {
    if (!data || !Array.isArray(data) || data.length === 0) return [];

    const partiesToKeepAll = (excludedPartiesList || []).map(p => String(p).toUpperCase());
    const partiesToKeepLatestDate = (deduplicatePartiesList || []).map(p => String(p).toUpperCase());
    const specialParty = (specialPartiesList || []).map(p => String(p).toUpperCase());
    const fullyExcluded = (fullyExcludedPartiesList || []).map(p => String(p).toUpperCase());

    const getBalanceVal = (row) => {
        if (!row) return 0;
        return safeParseFloat(row['BALANCE']);
    };

    const getMarkaInfo = (orderNo) => {
        const rawOrder = String(orderNo || '').trim();
        if (!rawOrder) return { hasMarka: false, marka: '' };

        const spaceIdx = rawOrder.indexOf(' ');
        if (spaceIdx !== -1) {
            const markaPart = rawOrder.substring(spaceIdx + 1).trim();
            if (markaPart) {
                const cleanMarka = markaPart.replace(/\/+$/, '').trim().toUpperCase();
                if (cleanMarka) {
                    return { hasMarka: true, marka: cleanMarka };
                }
            }
        }
        return { hasMarka: false, marka: '' };
    };

    // 1. Find max pending date for each groupKey in List 2 (Keep Latest Date Only)
    const maxGroupDateMap = new Map();
    for (const row of data) {
        if (!row || typeof row !== 'object') continue;
        const partyName = String(row['PARTY NAME'] || '').trim().toUpperCase();
        if (fullyExcluded.includes(partyName)) continue;
        if (specialParty.includes(partyName)) continue;
        if (!partiesToKeepLatestDate.includes(partyName)) continue;
        if (partiesToKeepAll.includes(partyName)) continue; // Keep All takes priority

        // Skip non-pending rows so we only find latest date with actual pending items
        if (getBalanceVal(row) <= 0) continue;

        const currentDate = parseDMY(row['DATE']);
        const existingMax = maxGroupDateMap.get(partyName);
        if (!existingMax || currentDate > existingMax) {
            maxGroupDateMap.set(partyName, currentDate);
        }
    }

    // 2. Build the latest item date map for default deduplication & dispatch checking
    const latestItemDateMap = new Map();
    for (const row of data) {
        if (!row || typeof row !== 'object') continue;
        const partyName = String(row['PARTY NAME'] || '').trim().toUpperCase();
        if (fullyExcluded.includes(partyName)) continue;
        if (partiesToKeepAll.includes(partyName) && !specialParty.includes(partyName)) continue;

        const currentDate = parseDMY(row['DATE']);
        let key;
        if (specialParty.includes(partyName)) {
            const markaInfo = getMarkaInfo(row['ORDER NO']);
            if (markaInfo.hasMarka) {
                key = `${partyName}-${markaInfo.marka}-${row['ITEM NAME']}-${row['PART NO.']}`;
            } else {
                key = `${partyName}-${row['ITEM NAME']}-${row['PART NO.']}`;
            }
        } else {
            key = `${partyName}-${row['ITEM NAME']}-${row['PART NO.']}`;
        }
        
        const existingDate = latestItemDateMap.get(key) || new Date(0);
        if (currentDate >= existingDate) {
            latestItemDateMap.set(key, currentDate);
        }
    }

    // 3. Filter rows into final deduplicated array
    const finalData = [];
    const processedKeys = new Set();

    // Iterate backwards (bottom-to-top) so that same-day duplicates keep the bottom-most row
    for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        if (!row || typeof row !== 'object') continue;
        const partyName = String(row['PARTY NAME'] || '').trim().toUpperCase();
        if (fullyExcluded.includes(partyName)) continue;

        // Track completed/dispatched rows (Balance <= 0) to invalidate older pending duplicates
        if (getBalanceVal(row) <= 0) {
            if (!partiesToKeepAll.includes(partyName) || specialParty.includes(partyName)) {
                let key;
                if (specialParty.includes(partyName)) {
                    const markaInfo = getMarkaInfo(row['ORDER NO']);
                    if (markaInfo.hasMarka) {
                        key = `${partyName}-${markaInfo.marka}-${row['ITEM NAME']}-${row['PART NO.']}`;
                    } else {
                        key = `${partyName}-${row['ITEM NAME']}-${row['PART NO.']}`;
                    }
                } else {
                    key = `${partyName}-${row['ITEM NAME']}-${row['PART NO.']}`;
                }
                processedKeys.add(key);
            }
            continue;
        }

        // Case 1: Keep All Orders (No deduplication at all)
        if (partiesToKeepAll.includes(partyName) && !specialParty.includes(partyName)) {
            finalData.unshift(row);
            continue;
        }

        // Case 2: Keep Latest Date Orders Only
        if (partiesToKeepLatestDate.includes(partyName) && !specialParty.includes(partyName)) {
            const currentDate = parseDMY(row['DATE']);
            const maxDate = maxGroupDateMap.get(partyName);
            if (maxDate && currentDate.getTime() === maxDate.getTime()) {
                const key = `${partyName}-${row['ITEM NAME']}-${row['PART NO.']}`;
                const absoluteLatestDate = latestItemDateMap.get(key);
                
                // If a newer record on a later date shows dispatch/completion, skip older pending item
                if (absoluteLatestDate && absoluteLatestDate > currentDate) {
                    continue;
                }
                
                if (!processedKeys.has(key)) {
                    finalData.unshift(row);
                    processedKeys.add(key);
                }
            }
            continue;
        }

        // Case 3: Default item-level deduplication
        const currentDate = parseDMY(row['DATE']);
        let key;
        if (specialParty.includes(partyName)) {
            const markaInfo = getMarkaInfo(row['ORDER NO']);
            if (markaInfo.hasMarka) {
                key = `${partyName}-${markaInfo.marka}-${row['ITEM NAME']}-${row['PART NO.']}`;
            } else {
                key = `${partyName}-${row['ITEM NAME']}-${row['PART NO.']}`;
            }
        } else {
            key = `${partyName}-${row['ITEM NAME']}-${row['PART NO.']}`;
        }

        const latestDate = latestItemDateMap.get(key);
        if (latestDate && currentDate.getTime() === latestDate.getTime()) {
            if (!processedKeys.has(key)) {
                finalData.unshift(row);
                processedKeys.add(key);
            }
        }
    }

    return finalData;
}

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

function getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

async function generateExcelJSWorkbookBuffer(fileData, transformedRows, finalDeduplicatedRows, enableExcelStyling) {
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

// Support Node.js testing environment while keeping global browser scope
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        safeParseFloat,
        parseDMY,
        normalizeHeader,
        COLUMN_SYNONYMS,
        findColumnIndex,
        findHeaderRowIndex,
        detectColumnMap,
        convertArrayOfArraysToObjects,
        transformExcelData,
        findAndKeepLatestOrders,
        autofitColumns,
        getLevenshteinDistance,
        generateExcelJSWorkbookBuffer
    };
}
