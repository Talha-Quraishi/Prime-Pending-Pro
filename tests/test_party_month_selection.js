/**
 * Prime-Pending-Pro Scanned Party Order Month Selection Test Suite
 * Asserts automatic month scanning from imported orders, multi-year isolation,
 * keeping selected month orders while deleting non-selected months, and storage persistence.
 */

const assert = require('assert');
const { findAndKeepLatestOrders } = require('../js/business/deduplication');
const { getPartyMonthsMap, getMonthKeyFromDate, formatMonthKey } = require('../js/business/party-rules');
const { migrateRulesData, saveRulesToStorage, loadRulesFromStorage } = require('../js/storage/rules-storage');
const { parseDMY } = require('../js/business/normalization');

console.log("  📅 Running Scanned Party Month Selection Test Suite...");

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

// 1. getPartyMonthsMap scans rows and groups order months chronologically per party
test("1. getPartyMonthsMap scans imported data and extracts distinct sorted months per party", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '15-07-2025' },
        { 'PARTY NAME': 'PARTY A', 'DATE': '20-08-2025' },
        { 'PARTY NAME': 'PARTY A', 'DATE': '10-07-2025' }, // Duplicate July
        { 'PARTY NAME': 'PARTY B', 'DATE': '05-09-2025' }
    ];

    const monthsMap = getPartyMonthsMap(data, parseDMY);
    assert.deepStrictEqual(monthsMap['PARTY A'], ['2025-07', '2025-08']);
    assert.deepStrictEqual(monthsMap['PARTY B'], ['2025-09']);
});

// 2. Party with July and August orders: selecting August keeps August and deletes July
test("2. Selecting August orders for a party keeps August orders and removes July orders", () => {
    const data = [
        { 'PARTY NAME': 'ABC TRADERS', 'ITEM NAME': 'WIDGET 1', 'PART NO.': 'P1', 'DATE': '10-07-2025', 'BALANCE': 10 },
        { 'PARTY NAME': 'ABC TRADERS', 'ITEM NAME': 'WIDGET 2', 'PART NO.': 'P2', 'DATE': '15-08-2025', 'BALANCE': 20 },
        { 'PARTY NAME': 'XYZ SUPPLIES', 'ITEM NAME': 'WIDGET 3', 'PART NO.': 'P3', 'DATE': '10-07-2025', 'BALANCE': 30 }
    ];

    const partyMonthSelections = {
        'ABC TRADERS': ['2025-08']
    };

    const res = findAndKeepLatestOrders(data, [], [], [], [], partyMonthSelections);
    assert.strictEqual(res.length, 2);
    // ABC TRADERS only has August order
    assert.strictEqual(res[0]['PARTY NAME'], 'ABC TRADERS');
    assert.strictEqual(res[0]['DATE'], '15-08-2025');
    // XYZ SUPPLIES is unaffected
    assert.strictEqual(res[1]['PARTY NAME'], 'XYZ SUPPLIES');
    assert.strictEqual(res[1]['DATE'], '10-07-2025');
});

// 3. Multi-year isolation (e.g., 2025-08 vs 2026-08)
test("3. Month selection isolates multi-year instances correctly (2025-08 vs 2026-08)", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'DATE': '15-08-2025', 'BALANCE': 10 },
        { 'PARTY NAME': 'PARTY A', 'ITEM NAME': 'ITEM 2', 'PART NO.': 'P2', 'DATE': '15-08-2026', 'BALANCE': 20 }
    ];

    // Select only August 2026
    const partyMonthSelections = {
        'PARTY A': ['2026-08']
    };

    const res = findAndKeepLatestOrders(data, [], [], [], [], partyMonthSelections);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0]['DATE'], '15-08-2026');
});

// 4. Multiple selected months for a party
test("4. Multiple selected months for a party preserves orders from all selected months", () => {
    const data = [
        { 'PARTY NAME': 'PARTY B', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'DATE': '01-06-2025', 'BALANCE': 5 },
        { 'PARTY NAME': 'PARTY B', 'ITEM NAME': 'ITEM 2', 'PART NO.': 'P2', 'DATE': '01-07-2025', 'BALANCE': 10 },
        { 'PARTY NAME': 'PARTY B', 'ITEM NAME': 'ITEM 3', 'PART NO.': 'P3', 'DATE': '01-08-2025', 'BALANCE': 15 }
    ];

    // Select June and August, drop July
    const partyMonthSelections = {
        'PARTY B': ['2025-06', '2025-08']
    };

    const res = findAndKeepLatestOrders(data, [], [], [], [], partyMonthSelections);
    assert.strictEqual(res.length, 2);
    assert.strictEqual(res[0]['ITEM NAME'], 'ITEM 1');
    assert.strictEqual(res[1]['ITEM NAME'], 'ITEM 3');
});

// 5. Month formatting and date helpers
test("5. Month helper formatMonthKey returns clean readable labels", () => {
    assert.strictEqual(formatMonthKey('2025-07'), 'Jul 2025');
    assert.strictEqual(formatMonthKey('2025-08'), 'Aug 2025');
    assert.strictEqual(formatMonthKey('2026-01'), 'Jan 2026');
    assert.strictEqual(getMonthKeyFromDate('15-08-2025', parseDMY), '2025-08');
});

// 6. Storage persistence and backward compatibility
test("6. Storage migration normalizes partyMonthSelections safely", () => {
    const legacy = {
        excludedParties: ['ALPHA'],
        deduplicateParties: ['BETA']
    };
    const migrated = migrateRulesData(legacy);
    assert.deepStrictEqual(migrated.partyMonthSelections, {});

    const withMonths = {
        partyMonthSelections: {
            ' party a ': ['2025-08', 'invalid-month', '2025-07']
        }
    };
    const migratedWithMonths = migrateRulesData(withMonths);
    assert.deepStrictEqual(migratedWithMonths.partyMonthSelections['PARTY A'], ['2025-08', '2025-07']);
});

if (failed > 0) {
    throw new Error(`Party month selection tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
