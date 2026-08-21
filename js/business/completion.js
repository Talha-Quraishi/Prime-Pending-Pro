function isOrderCompleted(row) {
    if (!row || typeof row !== 'object') return false;
    const parseFn = typeof safeParseFloat === 'function' 
        ? safeParseFloat 
        : (typeof require !== 'undefined' ? require('./normalization').safeParseFloat : function(v) { return parseFloat(v) || 0; });
    const balance = parseFn(row['BALANCE']);
    return balance <= 0;
}

/**
 * Constructs a unique deduplication/invalidation key for an order row.
 * @param {string} partyName 
 * @param {Object} row 
 * @param {Array<string>} specialPartiesList 
 * @param {Function} getMarkaInfoFn 
 * @returns {string}
 */
function getOrderGroupKey(partyName, row, specialPartiesList = [], getMarkaInfoFn) {
    const cleanParty = String(partyName || '').trim().toUpperCase();
    const isSpecial = specialPartiesList.includes(cleanParty);
    const itemName = String(row['ITEM NAME'] || '').trim();
    const partNo = String(row['PART NO.'] || '').trim();

    if (isSpecial && typeof getMarkaInfoFn === 'function') {
        const markaInfo = getMarkaInfoFn(row['ORDER NO']);
        if (markaInfo && markaInfo.hasMarka) {
            return `${cleanParty}-${markaInfo.marka}-${itemName}-${partNo}`;
        }
    }
    return `${cleanParty}-${itemName}-${partNo}`;
}

if (typeof self !== 'undefined') {
    self.isOrderCompleted = isOrderCompleted;
    self.getOrderGroupKey = getOrderGroupKey;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isOrderCompleted,
        getOrderGroupKey
    };
}
