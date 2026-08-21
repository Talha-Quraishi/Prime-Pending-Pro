const assert = require('assert');
const { parseDMY } = require('../js/processor');

console.log("  📅 Running Date Parsing Test Suite...");

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

// 1. DD-MM-YYYY format
test("1. DD-MM-YYYY format (01-02-2026 -> 1 Feb 2026)", () => {
    const d = parseDMY('01-02-2026');
    assert.strictEqual(d.getDate(), 1);
    assert.strictEqual(d.getMonth(), 1); // 0-indexed (1 = Feb)
    assert.strictEqual(d.getFullYear(), 2026);
});

// 2. DD-MM-YYYY format (02-01-2026 -> 2 Jan 2026)
test("2. DD-MM-YYYY format (02-01-2026 -> 2 Jan 2026)", () => {
    const d = parseDMY('02-01-2026');
    assert.strictEqual(d.getDate(), 2);
    assert.strictEqual(d.getMonth(), 0); // 0 = Jan
    assert.strictEqual(d.getFullYear(), 2026);
});

// 3. YYYY-MM-DD ISO format
test("3. YYYY-MM-DD format (2026-02-01 -> 1 Feb 2026)", () => {
    const d = parseDMY('2026-02-01');
    assert.strictEqual(d.getDate(), 1);
    assert.strictEqual(d.getMonth(), 1);
    assert.strictEqual(d.getFullYear(), 2026);
});

// 4. DD/MM/YYYY slash separator
test("4. DD/MM/YYYY format (01/02/2026 -> 1 Feb 2026)", () => {
    const d = parseDMY('01/02/2026');
    assert.strictEqual(d.getDate(), 1);
    assert.strictEqual(d.getMonth(), 1);
    assert.strictEqual(d.getFullYear(), 2026);
});

// 5. DD.MM.YYYY dot separator
test("5. DD.MM.YYYY format (01.02.2026 -> 1 Feb 2026)", () => {
    const d = parseDMY('01.02.2026');
    assert.strictEqual(d.getDate(), 1);
    assert.strictEqual(d.getMonth(), 1);
    assert.strictEqual(d.getFullYear(), 2026);
});

// 6. Excel serial date number
test("6. Excel serial number date parsing", () => {
    // 46000 is ~2025/2026
    const d = parseDMY(46000);
    assert.ok(d instanceof Date);
    assert.ok(d.getFullYear() >= 2025);
});

// 7. Blank / null / undefined dates
test("7. Blank / empty / null dates return epoch Date(0)", () => {
    assert.strictEqual(parseDMY('').getTime(), 0);
    assert.strictEqual(parseDMY('   ').getTime(), 0);
    assert.strictEqual(parseDMY(null).getTime(), 0);
    assert.strictEqual(parseDMY(undefined).getTime(), 0);
});

// 8. Invalid string dates
test("8. Invalid dates return epoch Date(0) without throwing", () => {
    assert.strictEqual(parseDMY('invalid-date-string').getTime(), 0);
    assert.strictEqual(parseDMY('abc/def/ghi').getTime(), 0);
});

// 9. Leap day
test("9. Leap day parsing (29-02-2024 -> 29 Feb 2024)", () => {
    const d = parseDMY('29-02-2024');
    assert.strictEqual(d.getDate(), 29);
    assert.strictEqual(d.getMonth(), 1);
    assert.strictEqual(d.getFullYear(), 2024);
});

// 10. Date instance input
test("10. Native Date object input returns normalized date clone", () => {
    const original = new Date(2026, 5, 15, 14, 30);
    const d = parseDMY(original);
    assert.strictEqual(d.getFullYear(), 2026);
    assert.strictEqual(d.getMonth(), 5);
    assert.strictEqual(d.getDate(), 15);
    assert.strictEqual(d.getHours(), 0); // Normalized to start of day
});

// 11. Out-of-bounds month swap (MM-DD-YYYY detection when month > 12)
test("11. Out-of-bounds month swap detection (15-05-2026 vs 05-15-2026)", () => {
    const d1 = parseDMY('15-05-2026'); // DD-MM-YYYY
    assert.strictEqual(d1.getDate(), 15);
    assert.strictEqual(d1.getMonth(), 4); // May
    
    // In MM-DD-YYYY, month is 05, day is 15 -> swapped when m > 11
    const d2 = parseDMY('15/05/2026');
    assert.strictEqual(d2.getDate(), 15);
    assert.strictEqual(d2.getMonth(), 4);
});

if (failed > 0) {
    throw new Error(`Date tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
