/**
 * Prime-Pending-Pro Deduplication Domain Layer
 * Core business algorithm for finding and keeping latest pending orders across all party rule classifications.
 */

/**
 * Core business rules for order deduplication:
 * 
 * 1. KEEP ALL (List 1): Preserves every pending row for configured parties without deduplication.
 * 2. KEEP LATEST (List 2): Preserves only orders matching the latest pending date for the party.
 * 3. DEFAULT: Groups by Party + Item Name + Part No, keeping the latest pending status.
 * 4. COMPLETED INVALIDATION: When a newer row has Balance <= 0, older pending rows for that item are discarded.
 * 5. MARKA GROUPING: Parties in special list group by Party + Marka Tag + Item Name + Part No.
 * 
 * @param {Array<Object>} data - Transformed order rows
 * @param {Array<string>} excludedPartiesList - Keep All parties
 * @param {Array<string>} deduplicatePartiesList - Keep Latest Date parties
 * @param {Array<string>} specialPartiesList - Marka Grouping parties
 * @param {Array<string>} fullyExcludedPartiesList - Fully Excluded parties
 * @returns {Array<Object>} Filtered, deduplicated pending order rows
 */
function findAndKeepLatestOrders(data, excludedPartiesList = [], deduplicatePartiesList = [], specialPartiesList = [], fullyExcludedPartiesList = []) {
    if (!data || !Array.isArray(data) || data.length === 0) return [];

    const partiesToKeepAll = (excludedPartiesList || []).map(p => String(p).toUpperCase());
    const partiesToKeepLatestDate = (deduplicatePartiesList || []).map(p => String(p).toUpperCase());
    const specialParty = (specialPartiesList || []).map(p => String(p).toUpperCase());
    const fullyExcluded = (fullyExcludedPartiesList || []).map(p => String(p).toUpperCase());

    const getBalanceVal = (row) => {
        if (!row) return 0;
        const parseFn = typeof safeParseFloat === 'function'
            ? safeParseFloat
            : (typeof require !== 'undefined' ? require('./normalization').safeParseFloat : function(v) { return parseFloat(v) || 0; });
        return parseFn(row['BALANCE']);
    };

    const parseDate = (dateVal) => {
        const dateFn = typeof parseDMY === 'function'
            ? parseDMY
            : (typeof require !== 'undefined' ? require('./normalization').parseDMY : function(d) { return new Date(d || 0); });
        return dateFn(dateVal);
    };

    const extractMarka = (orderNo) => {
        const markaFn = typeof getMarkaInfo === 'function'
            ? getMarkaInfo
            : (typeof require !== 'undefined' ? require('./normalization').getMarkaInfo : function() { return { hasMarka: false, marka: '' }; });
        return markaFn(orderNo);
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

        const currentDate = parseDate(row['DATE']);
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

        const currentDate = parseDate(row['DATE']);
        let key;
        if (specialParty.includes(partyName)) {
            const markaInfo = extractMarka(row['ORDER NO']);
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
                    const markaInfo = extractMarka(row['ORDER NO']);
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
            const currentDate = parseDate(row['DATE']);
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
        const currentDate = parseDate(row['DATE']);
        let key;
        if (specialParty.includes(partyName)) {
            const markaInfo = extractMarka(row['ORDER NO']);
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

if (typeof self !== 'undefined') {
    self.findAndKeepLatestOrders = findAndKeepLatestOrders;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        findAndKeepLatestOrders
    };
}
