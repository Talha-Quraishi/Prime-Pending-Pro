/**
 * Prime-Pending-Pro Rules Storage & Migration Module
 * Sole owner of deterministic serialization, validation, and schema version migrations for party rules.
 * Supports both Electron persistent config IPC and LocalStorage fallback.
 */

const RULES_STORAGE_VERSION = 1;

let _inMemoryRulesState = {
    rulesVersion: RULES_STORAGE_VERSION,
    excludedParties: [],
    deduplicateParties: [],
    specialParties: [],
    fullyExcludedParties: [],
    partyMerges: {}
};

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
 * Gets the active in-memory rules state.
 * @returns {Object}
 */
function getRulesState() {
    return _inMemoryRulesState;
}

/**
 * Sets the active in-memory rules state after validation.
 * @param {Object} newState 
 * @returns {Object}
 */
function setRulesState(newState) {
    _inMemoryRulesState = migrateRulesData(newState);
    return _inMemoryRulesState;
}

/**
 * Loads and migrates party rules from Electron IPC or localStorage.
 * @returns {Promise<Object>} Migrated rules object
 */
async function loadRulesFromStorage() {
    let rawConfig = null;

    // 1. Attempt Electron IPC config load
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.loadConfig === 'function') {
        try {
            rawConfig = await window.electronAPI.loadConfig();
        } catch (e) {
            console.warn("Electron API loadConfig failed, falling back to LocalStorage:", e);
        }
    }

    // 2. Fallback to LocalStorage if Electron config was empty or unavailable
    if (!rawConfig && typeof localStorage !== 'undefined') {
        try {
            const excluded = JSON.parse(localStorage.getItem('excludedParties') || '[]');
            const deduplicate = JSON.parse(localStorage.getItem('deduplicateParties') || '[]');
            const special = JSON.parse(localStorage.getItem('specialParties') || '[]');
            const fullyExcluded = JSON.parse(localStorage.getItem('fullyExcludedParties') || '[]');
            const partyMerges = JSON.parse(localStorage.getItem('partyMerges') || '{}');

            rawConfig = {
                excludedParties: excluded,
                deduplicateParties: deduplicate,
                specialParties: special,
                fullyExcludedParties: fullyExcluded,
                partyMerges
            };
        } catch (e) {
            console.warn("Corrupt party rules in LocalStorage, resetting to defaults:", e);
            rawConfig = {};
        }
    }

    const validated = migrateRulesData(rawConfig || {});
    _inMemoryRulesState = validated;
    return validated;
}

/**
 * Persists party rules to Electron config and localStorage with version metadata.
 * @param {Object} rulesConfig 
 * @returns {Promise<boolean>} True if saved successfully
 */
async function saveRulesToStorage(rulesConfig) {
    const validated = migrateRulesData(rulesConfig || _inMemoryRulesState);
    _inMemoryRulesState = validated;
    let success = true;

    // 1. Save to LocalStorage
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem('rulesVersion', String(RULES_STORAGE_VERSION));
            localStorage.setItem('excludedParties', JSON.stringify(validated.excludedParties));
            localStorage.setItem('deduplicateParties', JSON.stringify(validated.deduplicateParties));
            localStorage.setItem('specialParties', JSON.stringify(validated.specialParties));
            localStorage.setItem('fullyExcludedParties', JSON.stringify(validated.fullyExcludedParties));
            localStorage.setItem('partyMerges', JSON.stringify(validated.partyMerges));
        } catch (e) {
            console.warn("Failed saving rules to LocalStorage:", e);
            success = false;
        }
    }

    // 2. Save to Electron IPC config
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.saveConfig === 'function') {
        try {
            const currentConfig = (await window.electronAPI.loadConfig()) || {};
            currentConfig.settingsVersion = 1;
            currentConfig.rulesVersion = RULES_STORAGE_VERSION;
            currentConfig.excludedParties = validated.excludedParties;
            currentConfig.deduplicateParties = validated.deduplicateParties;
            currentConfig.specialParties = validated.specialParties;
            currentConfig.fullyExcludedParties = validated.fullyExcludedParties;
            currentConfig.partyMerges = validated.partyMerges;
            const electronSuccess = await window.electronAPI.saveConfig(currentConfig);
            if (!electronSuccess) success = false;
        } catch (e) {
            console.warn("Electron API saveConfig failed:", e);
            success = false;
        }
    }

    return success;
}

if (typeof self !== 'undefined') {
    self.RULES_STORAGE_VERSION = RULES_STORAGE_VERSION;
    self.migrateRulesData = migrateRulesData;
    self.getRulesState = getRulesState;
    self.setRulesState = setRulesState;
    self.loadRulesFromStorage = loadRulesFromStorage;
    self.saveRulesToStorage = saveRulesToStorage;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RULES_STORAGE_VERSION,
        migrateRulesData,
        getRulesState,
        setRulesState,
        loadRulesFromStorage,
        saveRulesToStorage
    };
}
