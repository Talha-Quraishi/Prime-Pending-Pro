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
    partyMerges: {},
    partyMonthSelections: {}
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
            partyMerges: {},
            partyMonthSelections: {}
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
    const cleanMonthSelections = (obj) => {
        if (!obj || typeof obj !== 'object') return {};
        const res = {};
        for (const [k, v] of Object.entries(obj)) {
            if (k && Array.isArray(v)) {
                const months = v.map(m => String(m).trim()).filter(m => /^\d{4}-\d{2}$/.test(m));
                if (months.length > 0) {
                    res[String(k).trim().toUpperCase()] = months;
                }
            }
        }
        return res;
    };

    return {
        rulesVersion: RULES_STORAGE_VERSION,
        excludedParties: cleanArray(raw.excludedParties),
        deduplicateParties: cleanArray(raw.deduplicateParties),
        specialParties: cleanArray(raw.specialParties),
        fullyExcludedParties: cleanArray(raw.fullyExcludedParties),
        partyMerges: cleanMerges(raw.partyMerges),
        partyMonthSelections: cleanMonthSelections(raw.partyMonthSelections)
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
            const partyMonthSelections = JSON.parse(localStorage.getItem('partyMonthSelections') || '{}');

            rawConfig = {
                excludedParties: excluded,
                deduplicateParties: deduplicate,
                specialParties: special,
                fullyExcludedParties: fullyExcluded,
                partyMerges,
                partyMonthSelections
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
            localStorage.setItem('partyMonthSelections', JSON.stringify(validated.partyMonthSelections));
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
            currentConfig.partyMonthSelections = validated.partyMonthSelections;
            const electronSuccess = await window.electronAPI.saveConfig(currentConfig);
            if (!electronSuccess) success = false;
        } catch (e) {
            console.warn("Electron API saveConfig failed:", e);
            success = false;
        }
    }

    return success;
}

/**
 * Merges incoming rules into existing rules without clobbering non-overlapping parties.
 * Incoming rules override conflicting party rules.
 * @param {Object} existing - Current rules object
 * @param {Object} incoming - New rules object to merge in
 * @returns {Object} Validated merged rules object
 */
function mergeRulesData(existing, incoming) {
    const base = migrateRulesData(existing);
    const inc = migrateRulesData(incoming);

    // Build party-to-rule map from base
    const partyMap = {};
    base.excludedParties.forEach(p => { partyMap[p] = 'keep-all'; });
    base.deduplicateParties.forEach(p => { partyMap[p] = 'keep-latest'; });
    base.specialParties.forEach(p => { partyMap[p] = 'marka'; });
    base.fullyExcludedParties.forEach(p => { partyMap[p] = 'exclude'; });

    // Apply incoming rule overrides
    inc.excludedParties.forEach(p => { partyMap[p] = 'keep-all'; });
    inc.deduplicateParties.forEach(p => { partyMap[p] = 'keep-latest'; });
    inc.specialParties.forEach(p => { partyMap[p] = 'marka'; });
    inc.fullyExcludedParties.forEach(p => { partyMap[p] = 'exclude'; });

    // Reconstruct lists
    const mergedExcluded = [];
    const mergedLatest = [];
    const mergedMarka = [];
    const mergedFullyExcluded = [];

    for (const [party, rule] of Object.entries(partyMap)) {
        if (rule === 'keep-all') mergedExcluded.push(party);
        else if (rule === 'keep-latest') mergedLatest.push(party);
        else if (rule === 'marka') mergedMarka.push(party);
        else if (rule === 'exclude') mergedFullyExcluded.push(party);
    }

    // Merge partyMerges
    const mergedMerges = Object.assign({}, base.partyMerges, inc.partyMerges);

    // Merge month selections (union unique months per party)
    const mergedMonths = Object.assign({}, base.partyMonthSelections);
    for (const [party, months] of Object.entries(inc.partyMonthSelections)) {
        if (mergedMonths[party]) {
            const combined = Array.from(new Set([...mergedMonths[party], ...months])).sort();
            mergedMonths[party] = combined;
        } else {
            mergedMonths[party] = [...months];
        }
    }

    return migrateRulesData({
        rulesVersion: RULES_STORAGE_VERSION,
        excludedParties: mergedExcluded,
        deduplicateParties: mergedLatest,
        specialParties: mergedMarka,
        fullyExcludedParties: mergedFullyExcluded,
        partyMerges: mergedMerges,
        partyMonthSelections: mergedMonths
    });
}

/**
 * Creates a structured, exportable profile bundle with summary stats and metadata.
 * @param {Object} rulesState 
 * @param {Object} [metadata]
 * @returns {Object}
 */
function createRulesProfile(rulesState, metadata = {}) {
    const clean = migrateRulesData(rulesState || _inMemoryRulesState);
    const configuredParties = new Set([
        ...clean.excludedParties,
        ...clean.deduplicateParties,
        ...clean.specialParties,
        ...clean.fullyExcludedParties,
        ...Object.keys(clean.partyMonthSelections)
    ]);

    return {
        schema: "prime-pending-pro-rules-profile",
        profileVersion: 1,
        rulesVersion: RULES_STORAGE_VERSION,
        exportedAt: new Date().toISOString(),
        profileName: metadata.name || "Default Profile",
        description: metadata.description || "Exported custom party rules & month selections",
        appVersion: metadata.appVersion || (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.appVersion ? window.electronAPI.appVersion : "3.30.22"),
        summary: {
            totalConfiguredParties: configuredParties.size,
            keepAllCount: clean.excludedParties.length,
            latestDateCount: clean.deduplicateParties.length,
            markaCount: clean.specialParties.length,
            fullyExcludedCount: clean.fullyExcludedParties.length,
            monthSelectionsCount: Object.keys(clean.partyMonthSelections).length,
            mergesCount: Object.keys(clean.partyMerges).length
        },
        rules: {
            excludedParties: clean.excludedParties,
            deduplicateParties: clean.deduplicateParties,
            specialParties: clean.specialParties,
            fullyExcludedParties: clean.fullyExcludedParties,
            partyMerges: clean.partyMerges,
            partyMonthSelections: clean.partyMonthSelections
        }
    };
}

if (typeof self !== 'undefined') {
    self.RULES_STORAGE_VERSION = RULES_STORAGE_VERSION;
    self.migrateRulesData = migrateRulesData;
    self.mergeRulesData = mergeRulesData;
    self.createRulesProfile = createRulesProfile;
    self.getRulesState = getRulesState;
    self.setRulesState = setRulesState;
    self.loadRulesFromStorage = loadRulesFromStorage;
    self.saveRulesToStorage = saveRulesToStorage;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RULES_STORAGE_VERSION,
        migrateRulesData,
        mergeRulesData,
        createRulesProfile,
        getRulesState,
        setRulesState,
        loadRulesFromStorage,
        saveRulesToStorage
    };
}

