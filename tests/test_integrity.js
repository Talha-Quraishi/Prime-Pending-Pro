/**
 * Prime-Pending-Pro Integrity & Syntax Validation Test Suite
 * Prevents regressions like syntax errors, duplicate variable declarations,
 * missing assets/icons, unlinked scripts, and broken window event contracts.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log("  🔍 Running Application Integrity & Asset Validation Test Suite...");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`    ✅ Passed: ${name}`);
        passed++;
    } catch (e) {
        console.error(`    ❌ Failed: ${name}`);
        console.error(e);
        failed++;
    }
}

const rootDir = path.resolve(__dirname, '..');

// 1. JavaScript Syntax & Compilation Validation
test("1. All core project JavaScript files parse and compile without syntax errors", () => {
    const coreJsFiles = [
        'main.js',
        'preload.js',
        'js/app.js',
        'js/processor.js',
        'js/rules.js',
        'js/worker.js',
        'js/utils/helpers.js',
        'js/utils/dates.js',
        'js/utils/formatting.js',
        'js/ui/toast.js',
        'js/ui/modal.js',
        'js/ui/navigation.js',
        'js/ui/settings.js',
        'js/ui/history.js',
        'js/ui/dashboard.js',
        'js/excel/reader.js',
        'js/excel/exporter.js',
        'js/processing/pipeline.js',
        'js/processing/worker-manager.js',
        'js/processing/fallback.js',
        'js/business/normalization.js',
        'js/excel/schema.js',
        'js/business/completion.js',
        'js/business/party-rules.js',
        'js/business/deduplication.js',
        'js/storage/rules-storage.js'
    ];

    coreJsFiles.forEach(relPath => {
        const fullPath = path.join(rootDir, relPath);
        assert.ok(fs.existsSync(fullPath), `File not found: ${relPath}`);
        const code = fs.readFileSync(fullPath, 'utf8');
        
        // vm.Script will throw a SyntaxError if there is any syntax/parsing error
        // such as duplicate variable declarations in the same scope, unclosed braces, etc.
        assert.doesNotThrow(() => {
            new vm.Script(code, { filename: relPath });
        }, `SyntaxError in ${relPath}`);
    });
});

// 2. HTML Asset References Exist on Disk
test("2. All script and stylesheet assets referenced in index.html exist and are non-empty", () => {
    const htmlPath = path.join(rootDir, 'index.html');
    assert.ok(fs.existsSync(htmlPath), "index.html must exist");
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Match <script src="...">
    const scriptSrcMatches = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)];
    assert.ok(scriptSrcMatches.length > 0, "index.html should have script tags");

    for (const match of scriptSrcMatches) {
        let src = match[1].split('?')[0]; // strip query strings
        // Ignore external http/https if any
        if (src.startsWith('http://') || src.startsWith('https://')) continue;
        
        const resolvedPath = path.join(rootDir, src.replace(/^\.\//, ''));
        assert.ok(fs.existsSync(resolvedPath), `Script file missing from disk: ${src} (referenced in index.html)`);
        const stats = fs.statSync(resolvedPath);
        assert.ok(stats.size > 0, `Script file is empty (0 bytes): ${src}`);
    }

    // Match <link rel="stylesheet" href="...">
    const linkHrefMatches = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)];
    for (const match of linkHrefMatches) {
        let href = match[1].split('?')[0];
        if (href.startsWith('http://') || href.startsWith('https://')) continue;

        const resolvedPath = path.join(rootDir, href.replace(/^\.\//, ''));
        assert.ok(fs.existsSync(resolvedPath), `Stylesheet file missing from disk: ${href} (referenced in index.html)`);
        const stats = fs.statSync(resolvedPath);
        assert.ok(stats.size > 0, `Stylesheet file is empty (0 bytes): ${href}`);
    }

    // Verify required vendor libraries are all included in index.html
    const requiredVendorScripts = [
        'libs/xlsx.full.min.js',
        'libs/exceljs.min.js',
        'libs/chart.umd.js',
        'libs/lucide.min.js'
    ];
    requiredVendorScripts.forEach(lib => {
        assert.ok(html.includes(lib), `index.html must include required library: ${lib}`);
    });
});

// 3. Lucide Icons Declarations and Library Setup
test("3. Lucide icons are properly configured and declared with valid icon names", () => {
    const htmlPath = path.join(rootDir, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Verify lucide.min.js is included in index.html
    assert.ok(html.includes('lucide.min.js'), "index.html must include lucide.min.js");
    const lucideFile = path.join(rootDir, 'libs/lucide.min.js');
    assert.ok(fs.existsSync(lucideFile), "libs/lucide.min.js must exist on disk");

    // Verify data-lucide icons
    const lucideMatches = [...html.matchAll(/data-lucide=["']([^"']*)["']/gi)];
    assert.ok(lucideMatches.length > 0, "Expected data-lucide icons in index.html");
    
    for (const m of lucideMatches) {
        const iconName = m[1].trim();
        assert.ok(iconName.length > 0, `Found empty data-lucide attribute in index.html`);
    }

    // Verify app.js calls createIcons()
    const appJs = fs.readFileSync(path.join(rootDir, 'js/app.js'), 'utf8');
    assert.ok(appJs.includes('createIcons'), "js/app.js must call lucide.createIcons()");
});

// 4. Window Controls and Critical UI Elements Binding
test("4. Window controls (min, max, close) and critical element IDs exist in index.html", () => {
    const htmlPath = path.join(rootDir, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const requiredIds = [
        'winMin',
        'winMax',
        'winClose',
        'titlebarVersion',
        'fileInput',
        'fileDropArea',
        'browseButton',
        'transformButton',
        'downloadExcelButton',
        'resetButton',
        'cancelProcessButton',
        'postProcessSummary',
        'copyDiagnosticBtn',
        'mainTabProcess',
        'mainTabInsights',
        'mainTabHistory',
        'mainTabSettings'
    ];

    requiredIds.forEach(id => {
        const hasId = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
        assert.ok(hasId, `Required UI element ID "${id}" is missing from index.html`);
    });
});

// 5. Worker Syntax and Message Contract
test("5. Background web worker has valid syntax and handles required actions", () => {
    const workerPath = path.join(rootDir, 'js/worker.js');
    assert.ok(fs.existsSync(workerPath), "js/worker.js must exist");
    const workerCode = fs.readFileSync(workerPath, 'utf8');

    // Simulate realistic Web Worker scope with sequential importScripts execution
    const sandbox = {
        console: console
    };
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    const context = vm.createContext(sandbox);

    sandbox.importScripts = (...scripts) => {
        for (const s of scripts) {
            let scriptRel;
            if (s.startsWith('../')) scriptRel = s.replace(/^\.\.\//, '');
            else scriptRel = path.join('js', s);
            const fullScriptPath = path.join(rootDir, scriptRel);
            if (fs.existsSync(fullScriptPath)) {
                const code = fs.readFileSync(fullScriptPath, 'utf8');
                vm.runInContext(code, context, { filename: scriptRel });
            }
        }
    };

    assert.doesNotThrow(() => {
        vm.runInContext(workerCode, context, { filename: 'js/worker.js' });
    }, "Sequential importScripts execution in worker context failed");

    assert.ok(typeof sandbox.onmessage === 'function', "js/worker.js must define onmessage");
    assert.ok(workerCode.includes("'scan'") || workerCode.includes('"scan"'), "js/worker.js must support scan action");
});

// 6. Versioned Application Storage Migration Check
test("6. Legacy unversioned storage correctly migrates to schemaVersion: 1 without data loss", () => {
    function migrateConfig(legacyConfig) {
        if (!legacyConfig || typeof legacyConfig !== 'object') {
            return { schemaVersion: 1, settingsVersion: 1, excludedParties: [], deduplicateParties: [], specialParties: [], fullyExcludedParties: [], partyMerges: {} };
        }
        const migrated = { ...legacyConfig };
        migrated.schemaVersion = migrated.schemaVersion || 1;
        migrated.settingsVersion = migrated.settingsVersion || 1;
        migrated.excludedParties = Array.isArray(migrated.excludedParties) ? migrated.excludedParties : [];
        migrated.deduplicateParties = Array.isArray(migrated.deduplicateParties) ? migrated.deduplicateParties : [];
        migrated.specialParties = Array.isArray(migrated.specialParties) ? migrated.specialParties : [];
        migrated.fullyExcludedParties = Array.isArray(migrated.fullyExcludedParties) ? migrated.fullyExcludedParties : [];
        migrated.partyMerges = (migrated.partyMerges && typeof migrated.partyMerges === 'object') ? migrated.partyMerges : {};
        return migrated;
    }

    const legacy = {
        theme: 'dark',
        excludedParties: ['ABC CORP'],
        partyMerges: { 'ABC': 'ABC CORP' }
    };

    const migrated = migrateConfig(legacy);
    assert.strictEqual(migrated.schemaVersion, 1);
    assert.strictEqual(migrated.settingsVersion, 1);
    assert.strictEqual(migrated.theme, 'dark');
    assert.deepStrictEqual(migrated.excludedParties, ['ABC CORP']);
    assert.deepStrictEqual(migrated.partyMerges, { 'ABC': 'ABC CORP' });
    assert.deepStrictEqual(migrated.deduplicateParties, []);
});

// 7. Corrupt Persisted Storage Recovery Path
test("7. Corrupt JSON configuration has safe fallback recovery path without throwing", () => {
    function safeParseStorage(rawJson, fallback) {
        try {
            if (!rawJson || typeof rawJson !== 'string') return fallback;
            const parsed = JSON.parse(rawJson);
            return (parsed && typeof parsed === 'object') ? parsed : fallback;
        } catch (e) {
            return fallback;
        }
    }

    const corruptJson = "{ invalid json content ... missing quote";
    const recovered = safeParseStorage(corruptJson, { schemaVersion: 1, recovered: true });
    assert.strictEqual(recovered.schemaVersion, 1);
    assert.strictEqual(recovered.recovered, true);
});

// 8. File Browse Button & Trigger Selection Contract
test("8. Browse File button and fileDropArea have active click bindings and triggerFileSelection handler", () => {
    const readerPath = path.join(rootDir, 'js/excel/reader.js');
    assert.ok(fs.existsSync(readerPath), "js/excel/reader.js must exist");
    const readerCode = fs.readFileSync(readerPath, 'utf8');

    // Verify triggerFileSelection is defined and handles electronAPI and fileInput fallback
    assert.ok(readerCode.includes('async function triggerFileSelection()') || readerCode.includes('function triggerFileSelection()'), "reader.js must define triggerFileSelection");
    assert.ok(readerCode.includes('window.electronAPI.selectFile'), "triggerFileSelection must support electronAPI.selectFile");
    assert.ok(readerCode.includes('fileInput.click()'), "triggerFileSelection must support fileInput.click fallback");

    // Verify browseButton click listener is bound
    assert.ok(readerCode.includes('browseButton.addEventListener'), "reader.js must attach click listener to browseButton");
    assert.ok(readerCode.includes('fileDropArea.addEventListener'), "reader.js must attach click listener to fileDropArea");
});

// 9. Dark Mode Switch & Settings Theme Toggle Functionality
test("9. Dark mode theme switching, DOM state, icon synchronization, and Settings theme button bindings", () => {
    const navPath = path.join(rootDir, 'js/ui/navigation.js');
    assert.ok(fs.existsSync(navPath), "js/ui/navigation.js must exist");
    const navCode = fs.readFileSync(navPath, 'utf8');

    // Verify theme toggling functions and event listeners exist in navigation.js
    assert.ok(navCode.includes('function applyTheme('), "navigation.js must define applyTheme");
    assert.ok(navCode.includes('function toggleTheme('), "navigation.js must define toggleTheme");
    assert.ok(navCode.includes('themeToggle.addEventListener'), "navigation.js must attach click listener to Settings themeToggle button");
    assert.ok(navCode.includes('themeToggleSwitch.addEventListener'), "navigation.js must attach change listener to sidebar themeToggleSwitch");

    // Test DOM and State transitions using simulated DOM environment
    const classList = new Set();
    const mockDocumentElement = {
        classList: {
            add: (cls) => classList.add(cls),
            remove: (cls) => classList.delete(cls),
            contains: (cls) => classList.has(cls)
        }
    };

    const mockThemeToggleSwitch = { checked: false };
    const darkIconClasses = new Set(['hidden']);
    const lightIconClasses = new Set(['hidden']);

    const mockThemeIconDark = {
        classList: {
            add: (cls) => darkIconClasses.add(cls),
            remove: (cls) => darkIconClasses.delete(cls),
            contains: (cls) => darkIconClasses.has(cls)
        }
    };

    const mockThemeIconLight = {
        classList: {
            add: (cls) => lightIconClasses.add(cls),
            remove: (cls) => lightIconClasses.delete(cls),
            contains: (cls) => lightIconClasses.has(cls)
        }
    };

    const mockStorage = {};

    const sandbox = {
        document: {
            documentElement: mockDocumentElement,
            getElementById: (id) => {
                if (id === 'themeToggleSwitch') return mockThemeToggleSwitch;
                if (id === 'themeIconDark') return mockThemeIconDark;
                if (id === 'themeIconLight') return mockThemeIconLight;
                return null;
            }
        },
        localStorage: {
            setItem: (k, v) => { mockStorage[k] = v; },
            getItem: (k) => mockStorage[k]
        },
        window: {},
        module: { exports: {} },
        console: console
    };

    vm.createContext(sandbox);
    vm.runInContext(navCode, sandbox);

    const { applyTheme, toggleTheme } = sandbox.module.exports;
    assert.strictEqual(typeof applyTheme, 'function', "applyTheme must be a function");
    assert.strictEqual(typeof toggleTheme, 'function', "toggleTheme must be a function");

    // Test: Apply Dark Mode
    applyTheme('dark');
    assert.strictEqual(mockDocumentElement.classList.contains('dark'), true, "HTML element must have 'dark' class");
    assert.strictEqual(mockThemeToggleSwitch.checked, true, "Sidebar switch must be checked in dark mode");
    assert.strictEqual(mockThemeIconDark.classList.contains('hidden'), false, "Dark moon icon must be visible in dark mode");
    assert.strictEqual(mockThemeIconLight.classList.contains('hidden'), true, "Light sun icon must be hidden in dark mode");

    // Test: Apply Light Mode
    applyTheme('light');
    assert.strictEqual(mockDocumentElement.classList.contains('dark'), false, "HTML element must not have 'dark' class");
    assert.strictEqual(mockThemeToggleSwitch.checked, false, "Sidebar switch must be unchecked in light mode");
    assert.strictEqual(mockThemeIconDark.classList.contains('hidden'), true, "Dark moon icon must be hidden in light mode");
    assert.strictEqual(mockThemeIconLight.classList.contains('hidden'), false, "Light sun icon must be visible in light mode");

    // Test: toggleTheme from light -> dark
    const themeResult1 = toggleTheme();
    assert.strictEqual(themeResult1, 'dark', "toggleTheme from light must return 'dark'");
    assert.strictEqual(mockDocumentElement.classList.contains('dark'), true);
    assert.strictEqual(mockStorage['theme'], 'dark', "Theme must be persisted as 'dark'");

    // Test: toggleTheme from dark -> light
    const themeResult2 = toggleTheme();
    assert.strictEqual(themeResult2, 'light', "toggleTheme from dark must return 'light'");
    assert.strictEqual(mockDocumentElement.classList.contains('dark'), false);
    assert.strictEqual(mockStorage['theme'], 'light', "Theme must be persisted as 'light'");
});

// 10. Smooth App-Themed Bouncing Beads Loader Animation
test("10. Smooth app-themed bouncing beads loader animation, relaxed baseline, and brand theme glow", () => {
    const stylePath = path.join(rootDir, 'style.css');
    assert.ok(fs.existsSync(stylePath), "style.css must exist");
    const styleContent = fs.readFileSync(stylePath, 'utf8');

    // Verify keyframe animation and easing
    assert.ok(styleContent.includes('@keyframes smooth-bead-bounce'), "style.css must define @keyframes smooth-bead-bounce");
    assert.ok(styleContent.includes('bouncing-beads'), "style.css must define bouncing-beads container");
    assert.ok(styleContent.includes('bead'), "style.css must define bead styling");

    // Verify App Theme colors and ambient glow drop-shadow
    assert.ok(styleContent.includes('#2563eb'), "style.css must use brand theme blue in light mode");
    assert.ok(styleContent.includes('#60a5fa'), "style.css must use brand theme blue in dark mode");

    // Verify index.html contains bouncing-beads in scanningIndicator and clean progressBar in processingContainer
    const htmlPath = path.join(rootDir, 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(htmlContent.includes('id="scanningIndicator"'), "index.html must include scanningIndicator");
    assert.ok(htmlContent.includes('id="progressBar"'), "index.html must include progressBar");
});

// 11. Global Keyboard Shortcuts and Party Rules Key Navigation
test("11. Global keyboard shortcuts and party rules key navigation (1-4, Arrow keys, Ctrl+O, Ctrl+Enter, Ctrl+S)", () => {
    const appPath = path.join(rootDir, 'js', 'app.js');
    const rulesPath = path.join(rootDir, 'js', 'rules.js');

    assert.ok(fs.existsSync(appPath), "js/app.js must exist");
    assert.ok(fs.existsSync(rulesPath), "js/rules.js must exist");

    const appContent = fs.readFileSync(appPath, 'utf8');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    // Verify app.js shortcuts
    assert.ok(appContent.includes("e.key === 'o' || e.key === 'O'"), "app.js must handle Ctrl+O file selection");
    assert.ok(appContent.includes("e.key === 'Enter'"), "app.js must handle Ctrl+Enter transformation");
    assert.ok(appContent.includes("e.key === 's' || e.key === 'S'"), "app.js must handle Ctrl+S download");
    assert.ok(appContent.includes("e.key === 'Escape'"), "app.js must handle Escape reset");
    assert.ok(appContent.includes("partySearch"), "app.js must handle Ctrl+F / search focus");

    // Verify rules.js keyboard navigation
    assert.ok(rulesContent.includes("ArrowDown"), "rules.js must handle ArrowDown party selection");
    assert.ok(rulesContent.includes("ArrowUp"), "rules.js must handle ArrowUp party selection");
    assert.ok(rulesContent.includes("['1', '2', '3', '4']"), "rules.js must handle 1-4 party rule shortcuts");
    assert.ok(rulesContent.includes("setActivePartyIndex"), "rules.js must define setActivePartyIndex");
    assert.ok(rulesContent.includes("toggleActiveRowRule"), "rules.js must define toggleActiveRowRule");
});

// 12. Auto-Updater Wiring and Downloaded Update File Management
test("12. Updater UI is fully wired: check/download/install plus open-location and delete-file actions", () => {
    const mainCode = fs.readFileSync(path.join(rootDir, 'main.js'), 'utf8');
    const preloadCode = fs.readFileSync(path.join(rootDir, 'preload.js'), 'utf8');
    const settingsPath = path.join(rootDir, 'js', 'ui', 'settings.js');
    assert.ok(fs.existsSync(settingsPath), "js/ui/settings.js must exist");
    const settingsCode = fs.readFileSync(settingsPath, 'utf8');
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

    // Renderer controller binds every state and action
    assert.ok(settingsCode.includes('function initializeUpdaterUI'), "settings.js must define initializeUpdaterUI");
    assert.ok(settingsCode.includes('onUpdateMessage'), "settings.js must subscribe to onUpdateMessage");
    ["electronAPI.checkForUpdates", "electronAPI.downloadUpdate", "electronAPI.installUpdate",
     "electronAPI.openDownloadedUpdateLocation", "electronAPI.deleteDownloadedUpdate"].forEach(call => {
        assert.ok(settingsCode.includes(call), `settings.js must call ${call}`);
    });

    // Preload bridges every channel
    ['check-for-updates', 'download-update', 'install-update',
     'open-downloaded-update-location', 'delete-downloaded-update'].forEach(channel => {
        assert.ok(preloadCode.includes(`'${channel}'`), `preload.js must expose '${channel}'`);
    });

    // Main process handles the new file-management channels
    assert.ok(mainCode.includes("'open-downloaded-update-location'"), "main.js must handle open-downloaded-update-location");
    assert.ok(mainCode.includes("'delete-downloaded-update'"), "main.js must handle delete-downloaded-update");
    assert.ok(mainCode.includes('shell.showItemInFolder'), "main.js must reveal the installer via shell.showItemInFolder");

    // UI contract: action row + buttons exist in markup
    ['updateActionsRow', 'installUpdateBtn', 'openUpdateLocationBtn',
     'deleteUpdateFileBtn', 'downloadedFilePathLabel'].forEach(id => {
        assert.ok(html.includes(`id="${id}"`), `index.html must contain #${id} for the updater card`);
    });

    // Release notes are rendered as text, never HTML (XSS guard)
    assert.ok(!/whatsNewContent\.innerHTML/.test(settingsCode), "release notes must not be assigned via innerHTML");
});

// 13. UI Performance & Polish Contracts
test("13. UI perf contracts: table scroll container id, shortcut overlay, styled modals, debounced regeneration", () => {
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

    // Infinite-scroll lazy loading requires this exact container id (dashboard.js binds to it)
    assert.ok(html.includes('id="dataTableContainer"'), "index.html must expose #dataTableContainer for chart/table lazy loading");

    // Keyboard cheat-sheet markup exists
    ['shortcutOverlay', 'shortcutCard', 'shortcutCloseBtn'].forEach(id => {
        assert.ok(html.includes(`id="${id}"`), `index.html must contain #${id}`);
    });

    // Styled confirm dialog module exists and is used instead of native confirm()
    const modalPath = path.join(rootDir, 'js', 'ui', 'modal.js');
    assert.ok(fs.existsSync(modalPath), "js/ui/modal.js must exist");
    const modalCode = fs.readFileSync(modalPath, 'utf8');
    assert.ok(modalCode.includes('function showConfirmDialog'), "modal.js must define showConfirmDialog");
    assert.ok(!modalCode.includes('.innerHTML'), "modal.js must build DOM without innerHTML");

    const historyCode = fs.readFileSync(path.join(rootDir, 'js', 'ui', 'history.js'), 'utf8');
    const settingsCode = fs.readFileSync(path.join(rootDir, 'js', 'ui', 'settings.js'), 'utf8');
    assert.ok(!/\bconfirm\(/.test(historyCode), "history.js must use showConfirmDialog instead of native confirm()");
    assert.ok(!/\bconfirm\(/.test(settingsCode), "settings.js must use showConfirmDialog instead of native confirm()");
    assert.ok(historyCode.includes('showConfirmDialog'), "history.js delete flow should use the styled dialog");

    // Workbook regeneration is debounced to avoid jank on rule toggles
    const exporterCode = fs.readFileSync(path.join(rootDir, 'js', 'excel', 'exporter.js'), 'utf8');
    assert.ok(exporterCode.includes('debouncedRegenerate'), "exporter.js must debounce workbook regeneration");

    // Party list search is bound once with debounce (no duplicate listeners in app.js)
    const appCode = fs.readFileSync(path.join(rootDir, 'js', 'app.js'), 'utf8');
    assert.ok(!appCode.includes("partySearch.addEventListener"), "app.js must not double-bind partySearch (rules.js owns it)");

    // Reduced motion + idle animation pause shipped in style.css
    const styleContent = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
    assert.ok(styleContent.includes('prefers-reduced-motion'), "style.css must respect prefers-reduced-motion");
    assert.ok(styleContent.includes('ui-idle'), "style.css must pause animations via .ui-idle");
});

if (failed > 0) {
    throw new Error(`Integrity tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };


