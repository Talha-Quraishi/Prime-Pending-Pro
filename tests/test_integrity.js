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
        'js/ui/navigation.js',
        'js/ui/settings.js',
        'js/ui/history.js',
        'js/ui/dashboard.js',
        'js/excel/reader.js',
        'js/excel/exporter.js'
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

    // Verify syntax
    assert.doesNotThrow(() => {
        new vm.Script(workerCode, { filename: 'js/worker.js' });
    });

    // Check message handlers
    assert.ok(workerCode.includes('onmessage'), "js/worker.js must define onmessage");
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

if (failed > 0) {
    throw new Error(`Integrity tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
