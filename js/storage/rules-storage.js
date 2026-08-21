/**
 * Prime-Pending-Pro Rules Storage & Migration Module
 * Manages deterministic serialization, validation, and schema version migrations for party rules.
 */

const RULES_STORAGE_VERSION = 1;

/**
 * Validates and normalizes raw rules structure, applying default migrations if needed.
 * @param {Object} raw 
 * @returns {Object} Cleaned, migrated rules object
 */
function migrateRulesData(raw) {
    if (!raw || typeof raw !== 'object') {
        return {
            rulesVersion: RULES_STORAGE_VERSION,
            excludedParties: [],
            deduplicateParties: [],
            specialParties: [],
            fullyExcludedParties: [],
            partyMerges: {}
        };
    }

    const cleanArray = (arr) => Array.isArray(arr) ? arr.map(p => String(p).trim().toUpperCase()).filter(Boolean) : [];
    const cleanMerges = (obj) => {
        if (!obj || typeof obj !== 'object') return {};
        const res = {};
        for (const [k, v] of Object.entries(obj)) {
            if (k && v) res[String(k).trim().toUpperCase()] = String(v).trim();
        }
        return res;
    };

    return {
        rulesVersion: RULES_STORAGE_VERSION,
        excludedParties: cleanArray(raw.excludedParties),
        deduplicateParties: cleanArray(raw.deduplicateParties),
        specialParties: cleanArray(raw.specialParties),
        fullyExcludedParties: cleanArray(raw.fullyExcludedParties),
        partyMerges: cleanMerges(raw.partyMerges)
    };
}

/**
 * Loads and migrates party rules from localStorage or memory store.
 * @returns {Object}
 */
function loadRulesFromStorage() {
    try {
        if (typeof localStorage === 'undefined') {
            return migrateRulesData({});
        }

        const excluded = JSON.parse(localStorage.getItem('excludedParties') || '[]');
        const deduplicate = JSON.parse(localStorage.getItem('deduplicateParties') || '[]');
        const special = JSON.parse(localStorage.getItem('specialParties') || '[]');
        const fullyExcluded = JSON.parse(localStorage.getItem('fullyExcludedParties') || '[]');
        const partyMerges = JSON.parse(localStorage.getItem('partyMerges') || '{}');

        return migrateRulesData({
            excludedParties: excluded,
            deduplicateParties: deduplicate,
            specialParties: special,
            fullyExcludedParties: fullyExcluded,
            partyMerges
        });
    } catch (e) {
        console.warn("Corrupt party rules found in storage, resetting to safe defaults:", e);
        return migrateRulesData({});
    }
}

/**
 * Persists party rules to localStorage with version metadata.
 * @param {Object} rulesConfig 
 */
function saveRulesToStorage(rulesConfig) {
    if (typeof localStorage === 'undefined') return;
    const validated = migrateRulesData(rulesConfig);

    localStorage.setItem('rulesVersion', String(RULES_STORAGE_VERSION));
    localStorage.setItem('excludedParties', JSON.stringify(validated.excludedParties));
    localStorage.setItem('deduplicateParties', JSON.stringify(validated.deduplicateParties));
    localStorage.setItem('specialParties', JSON.stringify(validated.specialParties));
    localStorage.setItem('fullyExcludedParties', JSON.stringify(validated.fullyExcludedParties));
    localStorage.setItem('partyMerges', JSON.stringify(validated.partyMerges));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RULES_STORAGE_VERSION,
        migrateRulesData,
        loadRulesFromStorage,
        saveRulesToStorage
    };
}
