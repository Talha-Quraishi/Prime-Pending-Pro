const assert = require('assert');
const path = require('path');
const { transformExcelData, findAndKeepLatestOrders } = require('../js/processor');

console.log("  🔒 Running Security & IPC Regression Test Suite...");

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

// History ID security validation logic mirroring main.js
function isValidHistoryId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) && id.length > 0 && id.length <= 64;
}

function getSafeHistoryPath(historyDir, id) {
    if (!isValidHistoryId(id)) return null;
    const resolved = path.resolve(historyDir, `${id}.xlsx`);
    const resolvedDir = path.resolve(historyDir);
    if (!resolved.startsWith(resolvedDir + path.sep)) {
        return null;
    }
    return resolved;
}

// 1. History ID format validation
test("1. History ID format allows valid IDs and rejects unsafe formats", () => {
    assert.strictEqual(isValidHistoryId('1715000000000'), true);
    assert.strictEqual(isValidHistoryId('upload_2026-05_01'), true);
    assert.strictEqual(isValidHistoryId('rec-123_abc'), true);

    // Rejection of invalid / malicious IDs
    assert.strictEqual(isValidHistoryId('../config'), false);
    assert.strictEqual(isValidHistoryId('..\\history'), false);
    assert.strictEqual(isValidHistoryId('id; rm -rf /'), false);
    assert.strictEqual(isValidHistoryId('id<script>'), false);
    assert.strictEqual(isValidHistoryId(''), false);
    assert.strictEqual(isValidHistoryId(null), false);
    assert.strictEqual(isValidHistoryId(undefined), false);
    assert.strictEqual(isValidHistoryId({}), false);
});

// 2. Directory traversal prevention
test("2. History path resolver prevents path traversal attacks", () => {
    const mockHistoryDir = path.join(__dirname, 'mock_history');
    
    // Valid ID resolves inside mock_history
    const validPath = getSafeHistoryPath(mockHistoryDir, '12345');
    assert.ok(validPath);
    assert.ok(validPath.startsWith(path.resolve(mockHistoryDir)));

    // Traversal attempts must return null
    assert.strictEqual(getSafeHistoryPath(mockHistoryDir, '../index.json'), null);
    assert.strictEqual(getSafeHistoryPath(mockHistoryDir, '..\\..\\config.json'), null);
    assert.strictEqual(getSafeHistoryPath(mockHistoryDir, '/etc/passwd'), null);
    assert.strictEqual(getSafeHistoryPath(mockHistoryDir, 'C:\\Windows\\system32'), null);
});

// 3. XSS string in party names
test("3. Excel party names with HTML/XSS payloads preserved as raw strings", () => {
    const xssParty = '<img src=x onerror=alert(1)>';
    const rawData = [
        ['ORDER NO', 'DATE', 'PART NO.', 'ITEM NAME', 'ORDER QTY', 'DESP QTY', 'BALANCE', 'RATE', 'VALUE'],
        [xssParty, '', '', '', '', '', '', '', ''],
        ['APR/SO/100', '15-05-2026', 'P1', '<script>alert("xss")</script>', '10', '0', '10', '100', '1000']
    ];

    const transformed = transformExcelData(rawData);
    assert.strictEqual(transformed.length, 1);
    assert.strictEqual(transformed[0]['PARTY NAME'], xssParty);
    assert.strictEqual(transformed[0]['ITEM NAME'], '<script>alert("xss")</script>');

    const deduplicated = findAndKeepLatestOrders(transformed, [xssParty], [], [], []);
    assert.strictEqual(deduplicated.length, 1);
    assert.strictEqual(deduplicated[0]['PARTY NAME'], xssParty);
});

// 4. escapeHtml sanitization utility
test("4. escapeHtml safely encodes all HTML sensitive characters", () => {
    const { escapeHtml } = require('../js/utils/helpers');
    assert.strictEqual(escapeHtml('<script>alert("XSS & \'attack\'")</script>'), '&lt;script&gt;alert(&quot;XSS &amp; &#039;attack&#039;&quot;)&lt;/script&gt;');
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
    assert.strictEqual(escapeHtml(12345), '12345');
});

// 5. Prototype pollution sanitization guard
test("5. Prototype pollution keys are strictly stripped from configuration payloads", () => {
    function sanitizeConfigObject(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
        const clean = {};
        for (const key of Object.keys(obj)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            const val = obj[key];
            if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                clean[key] = sanitizeConfigObject(val);
            } else if (Array.isArray(val)) {
                clean[key] = val.map(item => (item !== null && typeof item === 'object' && !Array.isArray(item)) ? sanitizeConfigObject(item) : item);
            } else {
                clean[key] = val;
            }
        }
        return clean;
    }

    const payload = JSON.parse('{"theme":"dark","__proto__":{"polluted":true},"nested":{"constructor":"evil","validKey":"ok"}}');
    const sanitized = sanitizeConfigObject(payload);
    assert.strictEqual(sanitized.theme, 'dark');
    assert.strictEqual(sanitized.polluted, undefined);
    assert.strictEqual(sanitized.__proto__.polluted, undefined);
    assert.strictEqual(sanitized.nested.constructor, Object);
    assert.strictEqual(sanitized.nested.validKey, 'ok');
});

// 6. BrowserWindow Security Configuration in main.js
test("6. main.js enables contextIsolation, sandbox, webSecurity, and denies popups/navigation", () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    
    assert.ok(mainCode.includes('contextIsolation: true'), "main.js must enable contextIsolation");
    assert.ok(mainCode.includes('nodeIntegration: false'), "main.js must disable nodeIntegration");
    assert.ok(mainCode.includes('sandbox: true'), "main.js must enable sandbox");
    assert.ok(mainCode.includes('webSecurity: true'), "main.js must enable webSecurity");
    assert.ok(mainCode.includes('allowRunningInsecureContent: false'), "main.js must disallow insecure content");
    assert.ok(mainCode.includes('setWindowOpenHandler'), "main.js must handle setWindowOpenHandler to deny popups");
    assert.ok(mainCode.includes("'will-navigate'"), "main.js must prevent will-navigate");
    assert.ok(mainCode.includes("'will-redirect'"), "main.js must prevent will-redirect");
    assert.ok(mainCode.includes("'will-attach-webview'"), "main.js must prevent will-attach-webview");
    assert.ok(mainCode.includes('setPermissionRequestHandler'), "main.js must deny ambient permissions");
});

if (failed > 0) {
    throw new Error(`Security tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };

