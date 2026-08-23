/**
 * Prime-Pending-Pro Party Rules Domain Layer
 * Classifies party rule behaviors (Keep All, Keep Latest Date, Marka Grouping, Fully Excluded), resolves party merges,
 * and extracts party order month maps.
 */

const PARTY_RULE_TYPES = {
    KEEP_ALL: 'KEEP_ALL',
    KEEP_LATEST_DATE: 'KEEP_LATEST_DATE',
    MARKA_GROUPING: 'MARKA_GROUPING',
    FULLY_EXCLUDED: 'FULLY_EXCLUDED',
    DEFAULT: 'DEFAULT'
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Extracts a normalized 'YYYY-MM' key from any supported date value using parseDMY.
 * @param {*} dateVal
 * @param {Function} [parseFn]
 * @returns {string|null} 'YYYY-MM' string or null if invalid
 */
function getMonthKeyFromDate(dateVal, parseFn) {
    if (!dateVal && dateVal !== 0) return null;
    const parser = typeof parseFn === 'function'
        ? parseFn
        : (typeof parseDMY === 'function' ? parseDMY : (typeof require !== 'undefined' ? require('./normalization').parseDMY : null));

    const d = parser ? parser(dateVal) : new Date(dateVal);
    if (!d || isNaN(d.getTime()) || d.getTime() === 0) return null;

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

/**
 * Converts a machine-readable 'YYYY-MM' key to a human-friendly display label (e.g. '2025-08' -> 'Aug 2025').
 * @param {string} monthKey
 * @returns {string} Formatted label
 */
function formatMonthKey(monthKey) {
    if (!monthKey || typeof monthKey !== 'string') return '';
    const parts = monthKey.split('-');
    if (parts.length === 2) {
        const y = parts[0];
        const mIdx = parseInt(parts[1], 10) - 1;
        if (mIdx >= 0 && mIdx < 12) {
            return `${MONTH_NAMES[mIdx]} ${y}`;
        }
    }
    return monthKey;
}

/**
 * Scans transformed order rows and extracts a sorted list of unique order months for each party.
 * @param {Array<Object>} data
 * @param {Function} [parseFn]
 * @returns {Object<string, Array<string>>} Map of party name to sorted 'YYYY-MM' months
 */
function getPartyMonthsMap(data, parseFn) {
    if (!data || !Array.isArray(data)) return {};
    const map = {};
    for (const row of data) {
        if (!row || typeof row !== 'object') continue;
        const party = String(row['PARTY NAME'] || '').trim().toUpperCase();
        if (!party) continue;

        const mKey = getMonthKeyFromDate(row['DATE'], parseFn);
        if (mKey && /^\d{4}-\d{2}$/.test(mKey)) {
            if (!map[party]) map[party] = new Set();
            map[party].add(mKey);
        }
    }

    const result = {};
    for (const party in map) {
        result[party] = Array.from(map[party]).sort();
    }
    return result;
}

/**
 * Resolves party alias/merge mappings.
 * @param {string} partyName 
 * @param {Object} partyMerges 
 * @returns {string} Target merged party name, or original if unmerged
 */
function resolvePartyMerge(partyName, partyMerges = {}) {
    if (!partyName) return '';
    const upper = String(partyName).trim().toUpperCase();
    if (partyMerges && typeof partyMerges === 'object' && partyMerges[upper]) {
        return String(partyMerges[upper]).trim();
    }
    return String(partyName).trim();
}

/**
 * Classifies which deduplication rule applies to a specific party.
 * @param {string} partyName 
 * @param {Object} rulesConfig 
 * @returns {string} One of PARTY_RULE_TYPES
 */
function classifyPartyRule(partyName, rulesConfig = {}) {
    const p = String(partyName || '').trim().toUpperCase();
    const {
        excludedParties = [],      // Keep All
        deduplicateParties = [],   // Keep Latest Date
        specialParties = [],       // Marka Grouping
        fullyExcludedParties = []  // Fully Excluded
    } = rulesConfig;

    const isFullyExcluded = fullyExcludedParties.some(x => String(x).toUpperCase() === p);
    if (isFullyExcluded) return PARTY_RULE_TYPES.FULLY_EXCLUDED;

    const isKeepAll = excludedParties.some(x => String(x).toUpperCase() === p);
    const isLatestDate = deduplicateParties.some(x => String(x).toUpperCase() === p);
    const isMarka = specialParties.some(x => String(x).toUpperCase() === p);

    if (isKeepAll) return PARTY_RULE_TYPES.KEEP_ALL;
    if (isLatestDate) return PARTY_RULE_TYPES.KEEP_LATEST_DATE;
    if (isMarka) return PARTY_RULE_TYPES.MARKA_GROUPING;

    return PARTY_RULE_TYPES.DEFAULT;
}

/**
 * Scans raw 2D sheet data for unique parties, their detected order months, and the SIGFA header row.
 * Single source of truth shared by the Web Worker 'scan' action and the main-thread fallback scanner.
 * @param {Array<Array<*>>} rawData - Raw sheet rows from XLSX.utils.sheet_to_json(ws, { header: 1 })
 * @returns {{ rowCount: number, uniqueParties: string[], partyMonthsMap: Object<string,string[]>, headers: Array|null }}
 */
function scanSigfaRows(rawData) {
    const scannedParties = new Set();
    const partyMonthsRaw = {};
    let headerIdx = -1;

    if (!rawData || !Array.isArray(rawData)) {
        return { rowCount: 0, uniqueParties: [], partyMonthsMap: {}, headers: null };
    }

    for (let i = 0; i < rawData.length; i++) {
        if (!rawData[i] || typeof rawData[i].join !== 'function') continue;
        const rowStr = rawData[i].join(',').toUpperCase();
        if (rowStr.includes('ORDER NO') && rowStr.includes('PART NO.')) { headerIdx = i; break; }
    }

    if (headerIdx !== -1) {
        let currentParty = '';
        let currentDate = '';
        for (let i = headerIdx + 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || !Array.isArray(row) || row.every(c => c === "")) continue;
            const col0 = row[0] ? String(row[0]).trim() : '';
            const col1 = row[1] ? String(row[1]).trim() : '';
            const partNo = row[2] ? String(row[2]).trim() : '';
            const itemName = row[3] ? String(row[3]).trim() : '';
            const hasItem = partNo || itemName;
            const col0Upper = col0.toUpperCase();
            const isOrder = col0Upper.startsWith('APR/SO') ||
                            col0Upper.startsWith('DEL/') ||
                            col0Upper.startsWith('DEL-') ||
                            col0Upper.startsWith('DEL ') ||
                            /^DEL[0-9]/.test(col0Upper) ||
                            (col0Upper.startsWith('DEL') && (col0Upper.includes('/') || col0Upper.includes('-') || /\d/.test(col0Upper)));
            const isParty = col0 && !isOrder && !hasItem && !col0Upper.startsWith('TOTAL');
            if (isParty) {
                currentParty = col0.replace(/\s+/g, ' ');
                scannedParties.add(currentParty);
                currentDate = '';
            } else if (isOrder) {
                currentDate = col1;
            }
            if (currentParty && currentDate && hasItem) {
                const partyUpper = currentParty.toUpperCase();
                const mKey = getMonthKeyFromDate(currentDate);
                if (mKey) {
                    if (!partyMonthsRaw[partyUpper]) partyMonthsRaw[partyUpper] = [];
                    if (!partyMonthsRaw[partyUpper].includes(mKey)) partyMonthsRaw[partyUpper].push(mKey);
                }
            }
        }
    }

    const partyMonthsMap = {};
    for (const p in partyMonthsRaw) {
        partyMonthsMap[p] = partyMonthsRaw[p].sort();
    }

    return {
        rowCount: rawData.length,
        uniqueParties: [...scannedParties].sort(),
        partyMonthsMap,
        headers: headerIdx !== -1 ? rawData[headerIdx] : null
    };
}

if (typeof self !== 'undefined') {
    self.PARTY_RULE_TYPES = PARTY_RULE_TYPES;
    self.MONTH_NAMES = MONTH_NAMES;
    self.getMonthKeyFromDate = getMonthKeyFromDate;
    self.formatMonthKey = formatMonthKey;
    self.getPartyMonthsMap = getPartyMonthsMap;
    self.resolvePartyMerge = resolvePartyMerge;
    self.classifyPartyRule = classifyPartyRule;
    self.scanSigfaRows = scanSigfaRows;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PARTY_RULE_TYPES,
        MONTH_NAMES,
        getMonthKeyFromDate,
        formatMonthKey,
        getPartyMonthsMap,
        resolvePartyMerge,
        classifyPartyRule,
        scanSigfaRows
    };
}
