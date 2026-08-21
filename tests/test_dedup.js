const assert = require('assert');
const { findAndKeepLatestOrders } = require('../js/processor');

console.log("  🧪 Running Deduplication Test Suite...");

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

// 1. Empty input
test("1. Empty input returns empty array", () => {
    assert.deepStrictEqual(findAndKeepLatestOrders([], [], [], [], []), []);
    assert.deepStrictEqual(findAndKeepLatestOrders(null, [], [], [], []), []);
});

// 2. One-row input
test("2. One-row input returns single pending row", () => {
    const data = [{ 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 }];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['ORDER NO'], 'O1');
});

// 3. Same item multiple times on different dates
test("3. Same item on different dates keeps only latest date order", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': 5 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['ORDER NO'], 'O2');
    assert.strictEqual(result[0]['BALANCE'], 5);
});

// 4. Same-day duplicates keeps bottom-most row
test("4. Same-day duplicates keeps bottom-most row", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 22, 'ORDER QTY': 24 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 12, 'ORDER QTY': 20 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['BALANCE'], 12);
    assert.strictEqual(result[0]['ORDER QTY'], 20);
});

// 5. Multiple completed records invalidates pending
test("5. Multiple completed records invalidates older pending records", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '10-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': 0 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O3', 'BALANCE': 0 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 0);
});

// 6. Completed record before pending record
test("6. Completed record before pending record does not invalidate newer pending record", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 0 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': 8 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['ORDER NO'], 'O2');
});

// 7. Completed record after pending record
test("7. Completed record after pending record invalidates pending record", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': 0 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 0);
});

// 8. Multiple parties
test("8. Multiple parties are isolated during deduplication", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'PARTY B', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': 15 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]['PARTY NAME'], 'PARTY A');
    assert.strictEqual(result[1]['PARTY NAME'], 'PARTY B');
});

// 9. Multiple part numbers for same item
test("9. Different part numbers for same item do not collide", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P2', 'ORDER NO': 'O2', 'BALANCE': 20 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 2);
});

// 10. Marka grouping
test("10. Marka grouping isolates distinct marka tags for special parties", () => {
    const data = [
        { 'PARTY NAME': 'SPECIAL_P', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'SPECIAL_P', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': 5 },
        { 'PARTY NAME': 'SPECIAL_P', 'DATE': '10-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O3 MARKA_TAG', 'BALANCE': 8 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], ['SPECIAL_P'], []);
    assert.strictEqual(result.length, 2);
    const orderNos = result.map(r => r['ORDER NO']);
    assert.ok(orderNos.includes('O2'));
    assert.ok(orderNos.includes('O3 MARKA_TAG'));
});

// 11. Keep-all parties
test("11. Keep-all parties preserves all pending rows", () => {
    const data = [
        { 'PARTY NAME': 'KEEP_ALL_P', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'KEEP_ALL_P', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': 5 }
    ];
    const result = findAndKeepLatestOrders(data, ['KEEP_ALL_P'], [], [], []);
    assert.strictEqual(result.length, 2);
});

// 12. Latest-date parties
test("12. Latest-date parties keeps only orders on the latest pending date", () => {
    const data = [
        { 'PARTY NAME': 'LATEST_P', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'LATEST_P', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 2', 'PART NO.': 'P2', 'ORDER NO': 'O2', 'BALANCE': 5 }
    ];
    const result = findAndKeepLatestOrders(data, [], ['LATEST_P'], [], []);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['ORDER NO'], 'O2');
});

// 13. Fully excluded parties
test("13. Fully excluded parties are completely omitted from output", () => {
    const data = [
        { 'PARTY NAME': 'EXCLUDE_P', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'NORMAL_P', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': 5 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], ['EXCLUDE_P']);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['PARTY NAME'], 'NORMAL_P');
});

// 14. Missing / blank part numbers
test("14. Missing or blank part numbers handled gracefully", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': '', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': '', 'ORDER NO': 'O2', 'BALANCE': 5 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['ORDER NO'], 'O2');
});

// 15. Invalid / zero / negative balances
test("15. Zero or negative balances treated as non-pending / completed", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 0 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 2', 'PART NO.': 'P2', 'ORDER NO': 'O2', 'BALANCE': -5 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 3', 'PART NO.': 'P3', 'ORDER NO': 'O3', 'BALANCE': '0.00' }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 0);
});

// 16. Blank dates
test("16. Blank dates fallback safely to default epoch without crashing", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 1);
});

// 17. Identical rows
test("17. Identical duplicate rows deduplicate to a single row", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '10-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '10-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 }
    ];
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    assert.strictEqual(result.length, 1);
});

// 18. Case insensitivity in party configuration
test("18. Party rule configuration is case-insensitive", () => {
    const data = [
        { 'PARTY NAME': 'party a', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': 10 },
        { 'PARTY NAME': 'PARTY A', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': 5 }
    ];
    const result = findAndKeepLatestOrders(data, ['PARTY A'], [], [], []);
    assert.strictEqual(result.length, 2);
});

if (failed > 0) {
    throw new Error(`Deduplication tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
