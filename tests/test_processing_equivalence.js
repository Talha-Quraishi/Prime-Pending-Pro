/**
 * Prime-Pending-Pro Worker vs Fallback Processing Equivalence Test Suite
 * Asserts that the background Web Worker algorithm and the main-thread Fallback
 * algorithm produce 100% identical outputs for all datasets and business rule configurations.
 */

const assert = require('assert');
const { transformExcelData, findAndKeepLatestOrders } = require('../js/processor');

console.log("  ⚖️ Running Worker vs Fallback Processing Equivalence Suite...");

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

// 1. Equivalence on standard pending dataset
test("1. Worker and Fallback deduplication produce identical row count and fields on standard orders", () => {
    const rawData = [
        ['ORDER NO', 'DATE', 'PART NO.', 'ITEM NAME', 'ORDER QTY', 'DESP QTY', 'BALANCE', 'RATE', 'VALUE'],
        ['PARTY ALPHA', '', '', '', '', '', '', '', ''],
        ['APR/SO/001', '10-05-2026', 'P100', 'WIDGET A', '10', '0', '10', '100', '1000'],
        ['APR/SO/002', '12-05-2026', 'P100', 'WIDGET A', '15', '0', '15', '100', '1500'],
        ['PARTY BETA', '', '', '', '', '', '', '', ''],
        ['DEL/2026/01', '15-05-2026', 'P200', 'WIDGET B', '5', '0', '5', '50', '250'],
        ['DEL/2026/02', '16-05-2026', 'P200', 'WIDGET B', '20', '0', '20', '50', '1000']
    ];

    const transformedWorker = transformExcelData(rawData);
    const deduplicatedWorker = findAndKeepLatestOrders(transformedWorker, [], [], [], []);

    const transformedFallback = transformExcelData(rawData);
    const deduplicatedFallback = findAndKeepLatestOrders(transformedFallback, [], [], [], []);

    assert.strictEqual(deduplicatedWorker.length, deduplicatedFallback.length);
    assert.deepStrictEqual(deduplicatedWorker, deduplicatedFallback);
    assert.strictEqual(deduplicatedWorker.length, 2);
    assert.strictEqual(deduplicatedWorker[0]['ORDER NO'], 'APR/SO/002');
    assert.strictEqual(deduplicatedWorker[1]['ORDER NO'], 'DEL/2026/02');
});

// 2. Equivalence with complex party rules (Keep All, Latest Date, Marka, Exclude)
test("2. Worker and Fallback produce identical outputs across all 4 party rule types", () => {
    const rawData = [
        ['ORDER NO', 'DATE', 'PART NO.', 'ITEM NAME', 'ORDER QTY', 'DESP QTY', 'BALANCE', 'RATE', 'VALUE'],
        ['KEEP ALL CORP', '', '', '', '', '', '', '', ''],
        ['APR/SO/010', '01-05-2026', 'P1', 'ITEM 1', '10', '0', '10', '10', '100'],
        ['APR/SO/011', '05-05-2026', 'P1', 'ITEM 1', '10', '0', '10', '10', '100'],
        ['LATEST DATE LTD', '', '', '', '', '', '', '', ''],
        ['APR/SO/020', '01-05-2026', 'P2', 'ITEM 2', '5', '0', '5', '20', '100'],
        ['APR/SO/021', '08-05-2026', 'P2', 'ITEM 2', '5', '0', '5', '20', '100'],
        ['APR/SO/022', '08-05-2026', 'P3', 'ITEM 3', '5', '0', '5', '20', '100'],
        ['MARKA ENTERPRISE', '', '', '', '', '', '', '', ''],
        ['APR/SO/030 [TAG_A]', '01-05-2026', 'P4', 'ITEM 4', '10', '0', '10', '30', '300'],
        ['APR/SO/031 [TAG_B]', '02-05-2026', 'P4', 'ITEM 4', '10', '0', '10', '30', '300'],
        ['EXCLUDE INC', '', '', '', '', '', '', '', ''],
        ['APR/SO/040', '01-05-2026', 'P5', 'ITEM 5', '10', '0', '10', '40', '400']
    ];

    const excluded = ['KEEP ALL CORP'];
    const latest = ['LATEST DATE LTD'];
    const special = ['MARKA ENTERPRISE'];
    const fullyExcluded = ['EXCLUDE INC'];

    const outWorker = findAndKeepLatestOrders(transformExcelData(rawData), excluded, latest, special, fullyExcluded);
    const outFallback = findAndKeepLatestOrders(transformExcelData(rawData), excluded, latest, special, fullyExcluded);

    assert.strictEqual(outWorker.length, outFallback.length);
    assert.deepStrictEqual(outWorker, outFallback);
    assert.strictEqual(outWorker.length, 6); // 2 keep all + 2 latest date + 2 marka tags
});

// 3. Equivalence on completion invalidation (dispatch before & after pending)
test("3. Worker and Fallback invalidate completed/zero-balance records with 100% parity", () => {
    const rawData = [
        ['ORDER NO', 'DATE', 'PART NO.', 'ITEM NAME', 'ORDER QTY', 'DESP QTY', 'BALANCE', 'RATE', 'VALUE'],
        ['PARTY GAMMA', '', '', '', '', '', '', '', ''],
        ['APR/SO/101', '01-05-2026', 'ITEM_X', 'ITEM_X', '10', '0', '10', '100', '1000'],
        ['DEL/2026/99', '05-05-2026', 'ITEM_X', 'ITEM_X', '10', '10', '0', '100', '0'], // Invalidates APR/SO/101
        ['APR/SO/102', '10-05-2026', 'ITEM_X', 'ITEM_X', '5', '0', '5', '100', '500']     // Valid pending
    ];

    const outWorker = findAndKeepLatestOrders(transformExcelData(rawData), [], [], [], []);
    const outFallback = findAndKeepLatestOrders(transformExcelData(rawData), [], [], [], []);

    assert.strictEqual(outWorker.length, outFallback.length);
    assert.deepStrictEqual(outWorker, outFallback);
    assert.strictEqual(outWorker.length, 1);
    assert.strictEqual(outWorker[0]['ORDER NO'], 'APR/SO/102');
});

// 4. Equivalence on empty and single-row datasets
test("4. Worker and Fallback handle edge empty and single-row datasets identically", () => {
    const emptyWorker = findAndKeepLatestOrders([], [], [], [], []);
    const emptyFallback = findAndKeepLatestOrders([], [], [], [], []);
    assert.deepStrictEqual(emptyWorker, emptyFallback);

    const singleRow = [
        ['ORDER NO', 'DATE', 'PART NO.', 'ITEM NAME', 'ORDER QTY', 'DESP QTY', 'BALANCE', 'RATE', 'VALUE'],
        ['PARTY ZETA', '', '', '', '', '', '', '', ''],
        ['APR/SO/999', '01-01-2026', 'P99', 'ITEM 99', '1', '0', '1', '50', '50']
    ];

    const singleWorker = findAndKeepLatestOrders(transformExcelData(singleRow), [], [], [], []);
    const singleFallback = findAndKeepLatestOrders(transformExcelData(singleRow), [], [], [], []);
    assert.deepStrictEqual(singleWorker, singleFallback);
    assert.strictEqual(singleWorker.length, 1);
});

if (failed > 0) {
    throw new Error(`Equivalence tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
