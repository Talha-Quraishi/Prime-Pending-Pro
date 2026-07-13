const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// 1. Load processor.js into VM context to test its functions without modifying global scope
const context = {
    console: console,
    ExcelJS: {},
    XLSX: {}
};
const code = fs.readFileSync('js/processor.js', 'utf8');
vm.runInNewContext(code, context);

const findAndKeepLatestOrders = context.findAndKeepLatestOrders;

console.log("🧪 Running Deduplication Logic Unit Tests...");

// Helper to check assertion success
let testsPassed = 0;
let testsFailed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ Passed: ${name}`);
        testsPassed++;
    } catch (e) {
        console.error(`  ❌ Failed: ${name}`);
        console.error(e);
        testsFailed++;
    }
}

// --- TEST CASES ---

test("Case 1: Keep All - all pending rows are preserved", () => {
    const data = [
        { 'PARTY NAME': 'PARTY A', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': '10' },
        { 'PARTY NAME': 'PARTY A', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': '5' }
    ];
    
    // List 1 (Keep All) contains 'PARTY A'
    const result = findAndKeepLatestOrders(data, ['PARTY A'], [], [], []);
    
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]['ORDER NO'], 'O1');
    assert.strictEqual(result[1]['ORDER NO'], 'O2');
});

test("Case 2: Keep Latest - keeps only the latest date's pending orders", () => {
    const data = [
        { 'PARTY NAME': 'PARTY B', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': '10' },
        { 'PARTY NAME': 'PARTY B', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 2', 'PART NO.': 'P2', 'ORDER NO': 'O2', 'BALANCE': '5' }
    ];
    
    // List 2 (Keep Latest) contains 'PARTY B'
    const result = findAndKeepLatestOrders(data, [], ['PARTY B'], [], []);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['ORDER NO'], 'O2'); // keeps only the latest date
});

test("Case 2: Keep Latest with completed order fallback - does not miss parties", () => {
    const data = [
        { 'PARTY NAME': 'PARTY B', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': '10' },
        { 'PARTY NAME': 'PARTY B', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 2', 'PART NO.': 'P2', 'ORDER NO': 'O2', 'BALANCE': '0' } // completed
    ];
    
    // List 2 (Keep Latest) contains 'PARTY B'
    const result = findAndKeepLatestOrders(data, [], ['PARTY B'], [], []);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['ORDER NO'], 'O1'); // correctly fell back to the latest date that still has pending items
});

test("Case 3: Default - keeps only the latest date's order for each item", () => {
    const data = [
        { 'PARTY NAME': 'PARTY C', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': '10' },
        { 'PARTY NAME': 'PARTY C', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': '5' }
    ];
    
    // Default rule
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['ORDER NO'], 'O2'); // keeps only the latest order
});

test("Case 3: Default - newer completed order invalidates older pending order (Lovely requirement)", () => {
    const data = [
        { 'PARTY NAME': 'PARTY C', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': '10' },
        { 'PARTY NAME': 'PARTY C', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': '0' } // completed
    ];
    
    // Default rule
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    
    assert.strictEqual(result.length, 0); // older pending is correctly discarded because latest order is completed
});

test("Case 3: Default - keeps bottom-most row for duplicates on the same date (Lovely requirement)", () => {
    const data = [
        { 'PARTY NAME': 'PARTY C', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': '22', 'ORDER QTY': '24' }, // top row
        { 'PARTY NAME': 'PARTY C', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': '12', 'ORDER QTY': '20' }  // bottom row (latest status)
    ];
    
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]['ORDER QTY'], '20'); // kept the bottom-most row
    assert.strictEqual(result[0]['BALANCE'], '12');
});

test("Marka configuration: splits Marka vs No-Marka orders correctly", () => {
    const data = [
        { 'PARTY NAME': 'PARTY D', 'DATE': '01-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O1', 'BALANCE': '10' }, // no-marka older
        { 'PARTY NAME': 'PARTY D', 'DATE': '15-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O2', 'BALANCE': '5' },  // no-marka newer
        { 'PARTY NAME': 'PARTY D', 'DATE': '10-05-2026', 'ITEM NAME': 'ITEM 1', 'PART NO.': 'P1', 'ORDER NO': 'O3 SHREE', 'BALANCE': '8' } // marka order
    ];
    
    // Marka List contains 'PARTY D'
    const result = findAndKeepLatestOrders(data, [], [], ['PARTY D'], []);
    
    // No-marka orders O1 and O2 deduplicate against each other (keeps latest: O2).
    // Marka order O3 SHREE does not collide with no-marka orders, so it is also kept.
    assert.strictEqual(result.length, 2);
    
    // Verify kept orders
    const orderNos = result.map(r => r['ORDER NO']);
    assert.ok(orderNos.includes('O2'));
    assert.ok(orderNos.includes('O3 SHREE'));
});

// --- REPORT ---

console.log(`\n📊 Test Run Summary:`);
console.log(`  Passed: ${testsPassed}`);
console.log(`  Failed: ${testsFailed}`);

if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log("🌟 All tests passed! The app logic is locked and verified.");
    process.exit(0);
}
