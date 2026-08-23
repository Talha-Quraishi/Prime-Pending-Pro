/**
 * ESLint flat configuration for Prime Pending Pro.
 *
 * The renderer uses classic multi-script architecture where modules share
 * top-level functions/globals at runtime. Those shared names are declared
 * below so `no-undef` stays ENABLED and catches phantom identifiers
 * (e.g. calls to helpers that were renamed or never existed).
 */
const js = require('@eslint/js');
const globals = require('globals');

// Cross-module shared API surface (classic script globals)
const sharedAppGlobals = {
    // External vendor libraries
    XLSX: 'readonly',
    ExcelJS: 'readonly',
    Chart: 'readonly',
    lucide: 'readonly',
    electronAPI: 'readonly',

    // utils/helpers.js
    safeCopyToClipboard: 'readonly',
    debounce: 'readonly',
    animateValue: 'readonly',
    convertIpcBuffer: 'readonly',
    createTableCell: 'readonly',

    // utils/dates.js + formatting.js
    getLocalDateString: 'readonly',
    formatIndianCurrency: 'readonly',
    formatIndianNumber: 'readonly',
    formatFileSize: 'readonly',

    // business/normalization.js
    safeParseFloat: 'readonly',
    parseDMY: 'readonly',
    getMarkaInfo: 'readonly',
    getLevenshteinDistance: 'readonly',

    // excel/schema.js
    COLUMN_SYNONYMS: 'readonly',
    normalizeHeader: 'readonly',
    findColumnIndex: 'readonly',
    findHeaderRowIndex: 'readonly',
    detectColumnMap: 'readonly',
    validateRequiredHeaders: 'readonly',
    convertArrayOfArraysToObjects: 'readonly',
    autofitColumns: 'readonly',

    // business/party-rules.js
    PARTY_RULE_TYPES: 'readonly',
    MONTH_NAMES: 'readonly',
    getMonthKeyFromDate: 'readonly',
    formatMonthKey: 'readonly',
    getPartyMonthsMap: 'readonly',
    resolvePartyMerge: 'readonly',
    classifyPartyRule: 'readonly',
    scanSigfaRows: 'readonly',

    // business/deduplication.js + completion.js
    findAndKeepLatestOrders: 'readonly',
    isOrderCompleted: 'readonly',
    getOrderGroupKey: 'readonly',

    // storage/rules-storage.js
    RULES_STORAGE_VERSION: 'readonly',
    migrateRulesData: 'readonly',
    getRulesState: 'readonly',
    setRulesState: 'readonly',
    loadRulesFromStorage: 'readonly',
    saveRulesToStorage: 'readonly',

    // ui/toast.js + ui/modal.js + navigation.js
    showToast: 'readonly',
    showConfirmDialog: 'readonly',
    switchMainView: 'readonly',
    applyTheme: 'readonly',
    toggleTheme: 'readonly',
    toggleShortcutOverlay: 'readonly',
    initializeNavigation: 'readonly',

    // ui/settings.js + ui/history.js
    setupSettingsTabs: 'readonly',
    setupDiagnosticListeners: 'readonly',
    initializeSettingsUI: 'readonly',
    saveCurrentUploadToHistory: 'readonly',
    loadHistoryTable: 'readonly',
    renderHistoryRows: 'readonly',
    loadHistoricalRecord: 'readonly',
    downloadHistoricalRaw: 'readonly',
    deleteHistoricalRecord: 'readonly',
    initializeHistory: 'readonly',

    // ui/dashboard.js
    computeDashboardMetrics: 'readonly',
    setFilterType: 'readonly',
    applyDashboardFilters: 'readonly',
    loadNextRowChunk: 'readonly',
    updateDashboardUI: 'readonly',
    renderCharts: 'readonly',
    updateChartsTheme: 'readonly',
    setPriceMode: 'readonly',
    setupDiscountListeners: 'readonly',
    initializeDashboard: 'readonly',
    chartPartiesInstance: 'writable',
    chartItemsInstance: 'writable',
    chartTrendInstance: 'writable',
    chartDistributionInstance: 'writable',
    chartAgingInstance: 'writable',
    dashboardTableRows: 'writable',
    loadedRowCount: 'writable',
    TABLE_CHUNK_SIZE: 'readonly',
    currentFilterType: 'writable',
    currentDiscount: 'writable',
    activePriceMode: 'writable',
    debouncedRenderCharts: 'readonly',

    // excel/reader.js + exporter.js + processor.js
    triggerFileSelection: 'readonly',
    handleFile: 'readonly',
    validateExcelSchema: 'readonly',
    initializeDragAndDrop: 'readonly',
    generateExcelJSWorkbookBuffer: 'readonly',
    downloadTransformedFile: 'readonly',
    regenerateWorkbook: 'readonly',
    transformExcelData: 'readonly',

    // processing/*
    runWorkerProcessing: 'readonly',
    cancelActiveWorker: 'readonly',
    isWorkerActive: 'readonly',
    activeWorkerInstance: 'writable',
    processWorkbook: 'readonly',
    cancelProcessing: 'readonly',
    isProcessing: 'readonly',
    isProcessingActive: 'writable',
    runFallbackProcessing: 'readonly',

    // rules.js
    filterNewOnly: 'writable',
    persistRulesToStorage: 'readonly',
    triggerReDeduplication: 'readonly',
    recompileRulesListsFromMap: 'readonly',
    renderChipsInUI: 'readonly',
    setupChipInputListeners: 'readonly',
    updatePartiesDatalist: 'readonly',
    renderPartyRulesList: 'readonly',
    activePartyIndex: 'writable',
    setActivePartyIndex: 'readonly',
    toggleActiveRowRule: 'readonly',
    applyRulesSearchFilter: 'readonly',
    exportRulesConfig: 'readonly',
    importRulesConfig: 'readonly',

    // app.js state + API
    originalJsonData: 'writable',
    transformedData: 'writable',
    finalDeduplicatedData: 'writable',
    currentFilteredData: 'writable',
    uniquePartiesList: 'writable',
    originalFileName: 'writable',
    processedWbout: 'writable',
    uploadedFileData: 'writable',
    isRestoringFromHistory: 'writable',
    originalExcelButtonHTML: 'writable',
    activeProcessWorker: 'writable',
    processingStartTime: 'writable',
    excludedParties: 'writable',
    deduplicateParties: 'writable',
    specialParties: 'writable',
    fullyExcludedParties: 'writable',
    partyMonthSelections: 'writable',
    scannedPartyMonthsMap: 'writable',
    partyRulesMap: 'writable',
    partyMerges: 'writable',
    setFinalDeduplicatedData: 'readonly',
    getOriginalJsonData: 'readonly',
    getTransformedData: 'readonly',
    getFinalDeduplicatedData: 'readonly',
    getCurrentFilteredData: 'readonly',
    getUploadedFileData: 'readonly',
    updateProcessingResult: 'readonly',
    cancelAnimation: 'readonly',
    updateProgressUI: 'readonly',
    showError: 'readonly',
    processFile: 'readonly',
    resetUI: 'readonly',
    persistConfigValue: 'readonly',
    initializeApp: 'readonly'
};

const baseRules = {
    ...js.configs.recommended.rules,
    'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Renderer modules intentionally declare globals consumed by other classic scripts;
    // cross-file duplicates cannot be detected statically anyway, so keep this off
    // and rely on no-undef + the integrity suite instead.
    'no-redeclare': 'off'
};

module.exports = [
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'build/**',
            'libs/**',
            'graphify-out/**',
            'backup_source/**',
            'test_dedup.js'
        ]
    },
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...globals.worker,
                ...globals.es2022,
                ...sharedAppGlobals,
                self: 'writable',
                importScripts: 'readonly',
                // CommonJS escape hatches used by renderer modules for Node testability
                module: 'writable',
                require: 'readonly',
                process: 'readonly'
            }
        },
        rules: baseRules
    },
    {
        files: ['main.js', 'preload.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.es2022 }
        },
        rules: baseRules
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.es2022 }
        },
        rules: baseRules
    }
];
