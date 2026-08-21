/**
 * Prime-Pending-Pro Party Rules Domain Layer
 * Classifies party rule behaviors (Keep All, Keep Latest Date, Marka Grouping, Fully Excluded) and resolves party merges.
 */

const PARTY_RULE_TYPES = {
    KEEP_ALL: 'KEEP_ALL',
    KEEP_LATEST_DATE: 'KEEP_LATEST_DATE',
    MARKA_GROUPING: 'MARKA_GROUPING',
    FULLY_EXCLUDED: 'FULLY_EXCLUDED',
    DEFAULT: 'DEFAULT'
};

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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PARTY_RULE_TYPES,
        resolvePartyMerge,
        classifyPartyRule
    };
}
