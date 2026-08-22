const assert = require('assert');
const { findAndKeepLatestOrders } = require('../js/processor');

console.log("  ⚡ Running Performance & Large-Dataset Benchmark Test Suite...");

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

function generateMockOrders(count, partyCount = 50, itemCount = 100) {
    const rows = [];
    const parties = Array.from({ length: partyCount }, (_, i) => `PARTY_${i + 1}`);
    const items = Array.from({ length: itemCount }, (_, i) => `ITEM_${i + 1}`);
    
    for (let i = 0; i < count; i++) {
        const party = parties[i % partyCount];
        const item = items[i % itemCount];
        const day = (i % 28) + 1;
        const month = ((i % 12) + 1).toString().padStart(2, '0');
        const dateStr = `${day.toString().padStart(2, '0')}-${month}-2026`;
        const bal = (i % 5 === 0) ? 0 : (i % 50) + 1; // 20% completed
        
        rows.push({
            'ORDER NO': `APR/SO/${1000 + i}`,
            'DATE': dateStr,
            'PART NO.': `P-${item}`,
            'PARTY NAME': party,
            'ITEM NAME': item,
            'ORDER QTY': 100,
            'DESP QTY': 100 - bal,
            'BALANCE': bal,
            'RATE': 50,
            'VALUE': bal * 50
        });
    }
    return rows;
}

// 1. 1,000 rows benchmark
test("1. Deduplication throughput for 1,000 rows (< 50ms)", () => {
    const data = generateMockOrders(1000, 20, 50);
    const start = Date.now();
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    const duration = Date.now() - start;
    
    assert.ok(result.length > 0);
    assert.ok(duration < 500, `Took ${duration}ms, expected < 500ms`);
    console.log(`       1,000 rows processed in ${duration}ms (Output rows: ${result.length})`);
});

// 2. 10,000 rows benchmark
test("2. Deduplication throughput for 10,000 rows (< 250ms)", () => {
    const data = generateMockOrders(10000, 50, 200);
    const start = Date.now();
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    const duration = Date.now() - start;
    
    assert.ok(result.length > 0);
    assert.ok(duration < 1000, `Took ${duration}ms, expected < 1000ms`);
    console.log(`       10,000 rows processed in ${duration}ms (Output rows: ${result.length})`);
});

// 3. 50,000 rows benchmark
test("3. Deduplication throughput for 50,000 rows (< 1000ms)", () => {
    const data = generateMockOrders(50000, 100, 500);
    const start = Date.now();
    const result = findAndKeepLatestOrders(data, [], [], [], []);
    const duration = Date.now() - start;
    
    assert.ok(result.length > 0);
    assert.ok(duration < 3000, `Took ${duration}ms, expected < 3000ms`);
    console.log(`       50,000 rows processed in ${duration}ms (Output rows: ${result.length})`);
});

if (failed > 0) {
    throw new Error(`Performance benchmark failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
