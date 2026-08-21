const assert = require('assert');
const { safeParseFloat } = require('../js/processor');

console.log("  🔢 Running Numeric Values Test Suite...");

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

// 1. Integer quantities
test("1. Integer numbers and strings", () => {
    assert.strictEqual(safeParseFloat(100), 100);
    assert.strictEqual(safeParseFloat('100'), 100);
});

// 2. Decimal quantities
test("2. Decimal numbers and strings", () => {
    assert.strictEqual(safeParseFloat(12.345), 12.345);
    assert.strictEqual(safeParseFloat('12.345'), 12.345);
});

// 3. Zero
test("3. Zero numbers and zero strings", () => {
    assert.strictEqual(safeParseFloat(0), 0);
    assert.strictEqual(safeParseFloat('0'), 0);
    assert.strictEqual(safeParseFloat('0.00'), 0);
});

// 4. Negative values
test("4. Negative numbers and negative strings", () => {
    assert.strictEqual(safeParseFloat(-50), -50);
    assert.strictEqual(safeParseFloat('-50.75'), -50.75);
});

// 5. Blank / null / undefined values
test("5. Blank / null / undefined values return 0", () => {
    assert.strictEqual(safeParseFloat(''), 0);
    assert.strictEqual(safeParseFloat('   '), 0);
    assert.strictEqual(safeParseFloat(null), 0);
    assert.strictEqual(safeParseFloat(undefined), 0);
});

// 6. Comma-formatted numbers
test("6. Comma-formatted numbers (Indian and Western formatting)", () => {
    assert.strictEqual(safeParseFloat('1,234.50'), 1234.50);
    assert.strictEqual(safeParseFloat('12,34,567.89'), 1234567.89);
    assert.strictEqual(safeParseFloat('1,000,000'), 1000000);
});

// 7. Invalid strings
test("7. Invalid non-numeric strings return 0 without throwing", () => {
    assert.strictEqual(safeParseFloat('N/A'), 0);
    assert.strictEqual(safeParseFloat('PENDING'), 0);
    assert.strictEqual(safeParseFloat('abc'), 0);
    assert.strictEqual(safeParseFloat('---'), 0);
});

// 8. Very large values
test("8. Very large numeric values", () => {
    assert.strictEqual(safeParseFloat(999999999.99), 999999999.99);
    assert.strictEqual(safeParseFloat('999,999,999.99'), 999999999.99);
});

if (failed > 0) {
    throw new Error(`Numeric tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
