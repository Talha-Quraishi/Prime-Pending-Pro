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

if (failed > 0) {
    throw new Error(`Security tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
