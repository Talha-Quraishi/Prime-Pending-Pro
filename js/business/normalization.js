/**
 * Prime-Pending-Pro Business Normalization Layer
 * Pure utility functions for number parsing, date normalization, string cleanup, and marka tag extraction.
 */

/**
 * Safely parse numbers from Excel cells, strings, or comma-formatted numbers.
 * @param {*} val 
 * @returns {number}
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
 * @param {*} dateInput
 * @returns {Date}
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

/**
 * Extracts marka/tag suffix from order number (e.g. "APR/SO/001 [TAG_A]" -> { hasMarka: true, marka: "[TAG_A]" })
 * @param {string} orderNo 
 * @returns {{ hasMarka: boolean, marka: string }}
 */
function getMarkaInfo(orderNo) {
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
}

/**
 * Calculates Levenshtein string distance for fuzzy party matching.
 */
function getLevenshteinDistance(a, b) {
    const strA = String(a || '');
    const strB = String(b || '');
    const matrix = [];
    for (let i = 0; i <= strB.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= strA.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= strB.length; i++) {
        for (let j = 1; j <= strA.length; j++) {
            if (strB.charAt(i - 1) === strA.charAt(j - 1)) {
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
    return matrix[strB.length][strA.length];
}

if (typeof self !== 'undefined') {
    self.safeParseFloat = safeParseFloat;
    self.parseDMY = parseDMY;
    self.getMarkaInfo = getMarkaInfo;
    self.getLevenshteinDistance = getLevenshteinDistance;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        safeParseFloat,
        parseDMY,
        getMarkaInfo,
        getLevenshteinDistance
    };
}
