// --- CORE DATA PROCESSING & CONVERSION ALGORITHMS ---

function safeParseFloat(val) {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    const cleanStr = String(val).replace(/,/g, '').trim();
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0 : parsed;
}

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

function convertArrayOfArraysToObjects(data) {
    if (!data || data.length === 0) return [];
    let headerRowIndex = -1;
    for (let i = 0; i < data.length; i++) {
        if (!data[i] || typeof data[i].join !== 'function') continue;
        const rowStr = data[i].join(',').toUpperCase();
        if (rowStr.includes('ORDER NO') || rowStr.includes('PART NO.') || rowStr.includes('ITEM NAME')) { headerRowIndex = i; break; }
    }
    if (headerRowIndex === -1) headerRowIndex = 0;
    const headers = data[headerRowIndex];
    const arrayOfObjects = [];
    for (let i = headerRowIndex + 1; i < data.length; i++) { 
        const row = data[i];
        if (!row || !Array.isArray(row)) continue;
        const obj = {};
        for (let j = 0; j < headers.length; j++) { if (headers[j]) obj[headers[j]] = row[j] || ""; }
        if (Object.keys(obj).length > 0) arrayOfObjects.push(obj);
    }
    return arrayOfObjects;
}

function transformExcelData(data) {
    const transformedRows = [];
    let currentPartyName = '', currentOrderNo = '', currentDate = '';
    let headerRowIndex = -1;
    for(let i=0; i<data.length; i++) {
        if (!data[i] || typeof data[i].join !== 'function') continue; 
        const rowStr = data[i].join(',').toUpperCase();
        if (rowStr.includes('ORDER NO') && rowStr.includes('PART NO.')) { headerRowIndex = i; break; }
    }
    if (headerRowIndex === -1) throw new Error("Header row not found.");
    
    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !Array.isArray(row) || row.every(cell => cell === "")) continue;
        const orderNo = row[0] ? String(row[0]).trim() : '';
        const partNo = row[2] ? String(row[2]).trim() : '';
        const itemName = row[3] ? String(row[3]).trim() : '';
        const hasItemData = partNo || itemName;
        const orderNoUpper = orderNo.toUpperCase();
        const isOrderNo = orderNoUpper.startsWith('APR/SO') || orderNoUpper.startsWith('DEL');
        const isPartyRow = orderNo && !isOrderNo && !hasItemData && !orderNoUpper.startsWith('TOTAL');
        
         if (isPartyRow) { 
             let pName = orderNo.trim().replace(/\s+/g, ' ');
             const pNameUpper = pName.toUpperCase();
             if (typeof partyMerges !== 'undefined' && partyMerges[pNameUpper]) {
                 pName = partyMerges[pNameUpper];
             }
             currentPartyName = pName;
             currentOrderNo = '';
             currentDate = '';
             continue;
         }
        if (isOrderNo) { currentOrderNo = orderNo; currentDate = row.length > 1 && row[1] ? String(row[1]).trim() : ''; }
        if (!currentPartyName || !itemName || !currentDate) continue;

        transformedRows.push({
            'ORDER NO': currentOrderNo, 'DATE': currentDate, 'PART NO.': partNo, 'PARTY NAME': currentPartyName,
            'ITEM NAME': itemName, 'ORDER QTY': safeParseFloat(row[4]), 'DESP QTY': safeParseFloat(row[5]), 'BALANCE': safeParseFloat(row[6]),
            'RATE': safeParseFloat(row[7]), 'VALUE': safeParseFloat(row[8])
        });
    }
    return transformedRows;
}

function findAndKeepLatestOrders(data, excludedPartiesList, deduplicatePartiesList, specialPartiesList, fullyExcludedPartiesList) {
    const partiesToKeepAll = excludedPartiesList || [];            // List 1: Keep All Orders (No deduplication)
    const partiesToKeepLatestDate = deduplicatePartiesList || [];  // List 2: Keep Latest Date Only (Delete old dates)
    const specialParty = specialPartiesList || [];                  // Marka grouping (advanced)
    const fullyExcluded = fullyExcludedPartiesList || [];          // Fully Excluded list

    // Helper to safely parse Balance as float
    const getBalanceVal = (row) => {
        if (!row) return 0;
        return safeParseFloat(row['BALANCE']);
    };

    // Helper to extract Marka if present in ORDER NO (identified by a space)
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

    // 1. Find max date for each groupKey in List 2 (Keep Latest Date Only)
    const maxGroupDateMap = new Map();
    for (const row of data) {
        if (!row || typeof row !== 'object') continue;
        const partyName = String(row['PARTY NAME']).trim().toUpperCase();
        if (fullyExcluded.includes(partyName)) continue;
        
        // Special parties bypass List 2 to ensure they always get standard item-level deduplication per marka
        if (specialParty.includes(partyName)) continue;

        if (!partiesToKeepLatestDate.includes(partyName)) continue;
        if (partiesToKeepAll.includes(partyName)) continue; // Keep All takes priority if in both

        // Skip rows with zero or negative balances so that we only keep the latest date that has pending orders
        if (getBalanceVal(row) <= 0) continue;

        const currentDate = parseDMY(row['DATE']);
        let groupKey = partyName;
        const existingMax = maxGroupDateMap.get(groupKey);
        if (!existingMax || currentDate > existingMax) {
            maxGroupDateMap.set(groupKey, currentDate);
        }
    }

    // 2. Build the latest date map for the default item-level deduplication (for parties not in List 1 or List 2, OR in specialParties)
    const latestItemDateMap = new Map();
    for (const row of data) {
        if (!row || typeof row !== 'object') continue;
        const partyName = String(row['PARTY NAME']).trim().toUpperCase();
        if (fullyExcluded.includes(partyName)) continue;
        
        // Skip parties that are in List 1, UNLESS they are in specialParties (Marka grouping)
        // Keep Latest (List 2) parties are not skipped so we can build the latestItemDateMap to check for newer dispatches
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

    // 3. Filter rows into final list
    const finalData = [];
    const processedKeys = new Set();
    
    // Iterate backwards (bottom-to-top) to ensure the last occurrence in the spreadsheet
    // (representing the latest status) is kept, while maintaining original top-to-bottom order.
    for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        if (!row || typeof row !== 'object') continue;
        const partyName = String(row['PARTY NAME']).trim().toUpperCase();
        if (fullyExcluded.includes(partyName)) continue;

        // Track key for completed rows to invalidate any older pending duplicates above them
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

        // Case 1: Keep All Orders (No deduplication at all) - bypassed for specialParties
        if (partiesToKeepAll.includes(partyName) && !specialParty.includes(partyName)) {
            finalData.unshift(row);
            continue;
        }

        // Case 2: Keep Latest Date Orders Only - bypassed for specialParties
        if (partiesToKeepLatestDate.includes(partyName) && !specialParty.includes(partyName)) {
            const currentDate = parseDMY(row['DATE']);
            let groupKey = partyName;
             const maxDate = maxGroupDateMap.get(groupKey);
             if (maxDate && currentDate.getTime() === maxDate.getTime()) {
                 const key = `${partyName}-${row['ITEM NAME']}-${row['PART NO.']}`;
                 const absoluteLatestDate = latestItemDateMap.get(key);
                 
                 // If there is a newer record showing a dispatch/completion (date > maxDate), do not keep this older item
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
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
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
        
        // Auto-fit columns for WORKING SHEET
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
    
    // 4. Add WITHOUT DUPLICATE Sheet (with optional styling and freeze pane)
    // To freeze row 1, set ySplit: 1
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
        
        // Set autoFilter range on the sheet headers
        wsDeduplicated.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: finalDeduplicatedRows.length + 1, column: headers.length }
        };
        
        // Apply Autofit columns
        headers.forEach((h, i) => {
            let maxLen = h.length;
            finalDeduplicatedRows.forEach(row => {
                const val = row[h];
                if (val !== undefined && val !== null) {
                    maxLen = Math.max(maxLen, String(val).length);
                }
            });
            const col = wsDeduplicated.getColumn(i + 1);
            col.width = maxLen + 4; // Add padding
        });
        
        // Apply Styling if enabled
        if (enableExcelStyling) {
            // Header styling
            const headerRow = wsDeduplicated.getRow(1);
            headerRow.height = 24;
            headerRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF1E3A8A' } // Dark blue
                };
                cell.font = {
                    name: 'Segoe UI',
                    size: 10,
                    bold: true,
                    color: { argb: 'FFFFFFFF' } // White text
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
                    bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
                    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
                };
            });
            
            // Reusable styling references to avoid allocating thousands of duplicate objects
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
                if (rowNumber === 1) return; // Skip header
                row.height = 20;
                row.eachCell((cell, colNumber) => {
                    const align = colAlignments[colNumber - 1] || 'left';
                    cell.font = cellFont;
                    cell.alignment = cellAlignments[align];
                    cell.border = cellBorder;
                });
            });
        } else {
            // Apply freeze pane borders & Segoe UI font to header even if not styled
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
    
    // Write to array buffer
    const buf = await workbook.xlsx.writeBuffer();
    return new Uint8Array(buf);
}
