const assert = require('assert');
const {
    normalizeHeader,
    findColumnIndex,
    findHeaderRowIndex,
    detectColumnMap,
    transformExcelData,
    COLUMN_SYNONYMS
} = require('../js/processor');

console.log("  📊 Running Excel Parser & Schema Resilience Test Suite...");

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

// 1. Header normalization
test("1. normalizeHeader trims, uppercases, and removes punctuation", () => {
    assert.strictEqual(normalizeHeader('  order  no. '), 'ORDER NO');
    assert.strictEqual(normalizeHeader('Part-No_'), 'PART NO');
    assert.strictEqual(normalizeHeader('ORDER#'), 'ORDER');
    assert.strictEqual(normalizeHeader('BAL/QTY'), 'BAL QTY');
});

// 2. Finding columns with synonyms
test("2. findColumnIndex matches exact and synonym variations", () => {
    const headers = ['SO NUMBER', 'SO DATE', 'ITEM CODE', 'CUSTOMER', 'DESCRIPTION', 'SO QTY', 'DEL QTY', 'PENDING QTY', 'PRICE', 'AMOUNT'];
    
    assert.strictEqual(findColumnIndex(headers, COLUMN_SYNONYMS.orderNo), 0);
    assert.strictEqual(findColumnIndex(headers, COLUMN_SYNONYMS.date), 1);
    assert.strictEqual(findColumnIndex(headers, COLUMN_SYNONYMS.partNo), 2);
    assert.strictEqual(findColumnIndex(headers, COLUMN_SYNONYMS.partyName), 3);
    assert.strictEqual(findColumnIndex(headers, COLUMN_SYNONYMS.itemName), 4);
    assert.strictEqual(findColumnIndex(headers, COLUMN_SYNONYMS.orderQty), 5);
    assert.strictEqual(findColumnIndex(headers, COLUMN_SYNONYMS.despQty), 6);
    assert.strictEqual(findColumnIndex(headers, COLUMN_SYNONYMS.balance), 7);
    assert.strictEqual(findColumnIndex(headers, COLUMN_SYNONYMS.rate), 8);
    assert.strictEqual(findColumnIndex(headers, COLUMN_SYNONYMS.value), 9);
});

// 3. Column reordering resilience
test("3. transformExcelData succeeds when columns are reordered", () => {
    // Reordered: BALANCE is col 0, ORDER NO is col 2, ITEM NAME is col 1, DATE is col 3
    const reorderedData = [
        ['BALANCE', 'ITEM NAME', 'ORDER NO', 'DATE', 'PART NO.', 'ORDER QTY', 'DESP QTY', 'RATE', 'VALUE'],
        ['ACME CORP', '', '', '', '', '', '', '', ''],
        ['5', 'BEARING 6204', 'APR/SO/100', '15-05-2026', 'P-6204', '10', '5', '100', '500']
    ];

    const result = transformExcelData(reorderedData);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['PARTY NAME'], 'ACME CORP');
    assert.strictEqual(result[0]['ORDER NO'], 'APR/SO/100');
    assert.strictEqual(result[0]['ITEM NAME'], 'BEARING 6204');
    assert.strictEqual(result[0]['BALANCE'], 5);
    assert.strictEqual(result[0]['ORDER QTY'], 10);
    assert.strictEqual(result[0]['VALUE'], 500);
});

// 4. Extra unmapped columns do not break processing
test("4. Extra custom columns are ignored without errors", () => {
    const dataWithExtraCols = [
        ['EXTRA_COL_1', 'ORDER NO', 'DATE', 'PART NO.', 'ITEM NAME', 'EXTRA_COL_2', 'ORDER QTY', 'DESP QTY', 'BALANCE', 'RATE', 'VALUE', 'REMARKS'],
        ['', 'BETA INDUSTRIES', '', '', '', '', '', '', '', '', '', ''],
        ['INFO', 'APR/SO/200', '20-05-2026', 'P-100', 'SHAFT', 'NOTE', '20', '0', '20', '50', '1000', 'URGENT']
    ];

    const result = transformExcelData(dataWithExtraCols);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['PARTY NAME'], 'BETA INDUSTRIES');
    assert.strictEqual(result[0]['ORDER NO'], 'APR/SO/200');
    assert.strictEqual(result[0]['BALANCE'], 20);
});

// 5. Header case & whitespace differences
test("5. Tolerates lowercase, uppercase, and extra spaces in headers", () => {
    const data = [
        ['  order no  ', ' date ', 'part no.', ' item name ', 'order qty', 'desp qty', ' balance ', 'rate', 'value'],
        ['DELTA SUPPLIERS', '', '', '', '', '', '', '', ''],
        ['APR/SO/300', '01-06-2026', 'P-01', 'VALVE', '5', '0', '5', '200', '1000']
    ];

    const result = transformExcelData(data);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['PARTY NAME'], 'DELTA SUPPLIERS');
    assert.strictEqual(result[0]['ORDER NO'], 'APR/SO/300');
    assert.strictEqual(result[0]['BALANCE'], 5);
});

// 6. Missing required column produces clear error
test("6. Missing required ORDER NO column throws descriptive error", () => {
    const dataWithoutOrderNo = [
        ['DATE', 'PART NO.', 'ITEM NAME', 'ORDER QTY', 'DESP QTY', 'BALANCE', 'RATE', 'VALUE'],
        ['01-05-2026', 'P1', 'ITEM 1', '10', '0', '10', '50', '500']
    ];

    assert.throws(() => {
        transformExcelData(dataWithoutOrderNo);
    }, /Missing required column: ORDER NO/);
});

test("7. Missing required BALANCE column throws descriptive error", () => {
    const dataWithoutBalance = [
        ['ORDER NO', 'DATE', 'PART NO.', 'ITEM NAME', 'RATE', 'VALUE'],
        ['APR/SO/100', '01-05-2026', 'P1', 'ITEM 1', '50', '500']
    ];

    assert.throws(() => {
        transformExcelData(dataWithoutBalance);
    }, /Missing required column: BALANCE/);
});

test("8. Empty dataset throws descriptive error", () => {
    assert.throws(() => {
        transformExcelData([]);
    }, /Empty workbook/);
});

if (failed > 0) {
    throw new Error(`Parser tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
