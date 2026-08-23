/**
 * Prime-Pending-Pro UI Dashboard Metrics Test Suite
 * Regression tests for computeDashboardMetrics (pure aggregation used by the Insights dashboard).
 * Guards against broken field access, undefined helpers, and discount/aging miscalculations.
 */

const assert = require('assert');

console.log("  📊 Running UI Dashboard Metrics Test Suite...");

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

// Load business globals exactly like the browser script order does,
// so dashboard.js resolves safeParseFloat / parseDMY.
const normalization = require('../js/business/normalization');
globalThis.safeParseFloat = normalization.safeParseFloat;
globalThis.parseDMY = normalization.parseDMY;

const { computeDashboardMetrics } = require('../js/ui/dashboard');

const FIXED_TODAY = new Date(2026, 7, 23); // 23-Aug-2026 (local midnight)

const sampleRows = [
    {
        'ORDER NO': 'DEL/1234', 'DATE': '01-06-2026', 'PART NO.': 'P-1',
        'PARTY NAME': 'ACME CORP', 'ITEM NAME': 'WIDGET A',
        'ORDER QTY': 10, 'DESP QTY': 0, 'BALANCE': 10, 'RATE': '1,000', 'VALUE': 10000
    },
    {
        'ORDER NO': 'APR/SO/9', 'DATE': '20-08-2026', 'PART NO.': 'P-2',
        'PARTY NAME': 'GLOBEX LTD', 'ITEM NAME': 'WIDGET A',
        'ORDER QTY': 5, 'DESP QTY': 0, 'BALANCE': 5, 'RATE': 200, 'VALUE': 1000
    },
    {
        'ORDER NO': 'DEL/777', 'DATE': '01-01-2025', 'PART NO.': 'P-3',
        'PARTY NAME': 'ACME CORP', 'ITEM NAME': 'GADGET B',
        'ORDER QTY': 2, 'DESP QTY': 0, 'BALANCE': 2, 'RATE': 50, 'VALUE': 100
    },
    {
        'ORDER NO': '', 'DATE': '', 'PART NO.': '',
        'PARTY NAME': '', 'ITEM NAME': '',
        'ORDER QTY': 0, 'DESP QTY': 0, 'BALANCE': 3, 'RATE': 10, 'VALUE': 30
    }
];

// 1. Core KPI aggregation
test("1. Totals, unique counts, and DEL/APR classification aggregate correctly", () => {
    const m = computeDashboardMetrics(sampleRows, 0, FIXED_TODAY);

    assert.strictEqual(m.tableRows.length, 4);
    // totalValue = 10*1000 + 5*200 + 2*50 + 3*10 = 11130
    assert.ok(Math.abs(m.totalValue - 11130) < 1e-9, `totalValue was ${m.totalValue}`);
    // totalQty = 10 + 5 + 2 + 3 = 20
    assert.strictEqual(m.totalQty, 20);
    assert.deepStrictEqual(m.uniqueItems.sort(), ['GADGET B', 'WIDGET A']);
    assert.deepStrictEqual(m.uniqueParties.sort(), ['ACME CORP', 'GLOBEX LTD']);
    assert.strictEqual(m.delCount, 2);
    assert.strictEqual(m.aprCount, 1);
});

// 2. Comma-formatted numbers and rate strings are normalized
test("2. Numeric parsing tolerates comma-formatted values", () => {
    const m = computeDashboardMetrics([sampleRows[0]], 0, FIXED_TODAY);
    // RATE: '1,000' must parse as 1000 -> value 10 * 1000
    assert.ok(Math.abs(m.totalValue - 10000) < 1e-9, `totalValue was ${m.totalValue}`);
});

// 3. Discount modes reduce computed value
test("3. Discount rates apply to RATE only (61% mode)", () => {
    const full = computeDashboardMetrics(sampleRows, 0, FIXED_TODAY);
    const disc = computeDashboardMetrics(sampleRows, 0.61, FIXED_TODAY);
    assert.strictEqual(full.totalQty, disc.totalQty, "Qty must never change with price mode");
    assert.ok(disc.totalValue < full.totalValue, "Discounted value must be lower");
    assert.ok(Math.abs(disc.totalValue - full.totalValue * 0.39) < 1e-6,
        `Expected 39% of full value, got ${disc.totalValue} vs ${full.totalValue}`);
});

// 4. Aging buckets use day distance from reference date
test("4. Aging buckets bucket rows into 0-30 / 31-60 / 61-90 / 90+ by pending days", () => {
    const m = computeDashboardMetrics(sampleRows, 0, FIXED_TODAY);
    // 01-Jun-2026 is 83 days before 23-Aug-2026
    assert.strictEqual(m.agingBuckets['61-90'], 1);
    // 20-Aug-2026 is 3 days before
    assert.strictEqual(m.agingBuckets['0-30'], 1);
    // 01-Jan-2025 is far past
    assert.strictEqual(m.agingBuckets['90+'], 1);
    // Row with empty date contributes to no aging bucket and has diffDays 0
    const emptyDateRow = m.tableRows[3];
    assert.strictEqual(emptyDateRow.diffDays, 0);
});

// 5. Table rows carry the exact fields the detailed table renders
test("5. Table row objects expose orderNo/dateRaw/pName/iName/qty/val for lazy table rendering", () => {
    const m = computeDashboardMetrics([sampleRows[0]], 0, FIXED_TODAY);
    const tr = m.tableRows[0];
    assert.strictEqual(tr.orderNo, 'DEL/1234');
    assert.strictEqual(tr.dateRaw, '01-06-2026');
    assert.strictEqual(tr.pName, 'ACME CORP');
    assert.strictEqual(tr.iName, 'WIDGET A');
    assert.strictEqual(tr.qty, 10);
    assert.ok(Math.abs(tr.val - 10000) < 1e-9);
});

// 6. Per-party value map feeds the Top Parties chart
test("6. Party/item aggregation maps accumulate per key", () => {
    const m = computeDashboardMetrics(sampleRows, 0, FIXED_TODAY);
    // ACME CORP = 10000 + 100
    assert.ok(Math.abs(m.partiesValueMap['ACME CORP'] - 10100) < 1e-9);
    assert.ok(Math.abs(m.partiesValueMap['GLOBEX LTD'] - 1000) < 1e-9);
    // WIDGET A = 10000 + 1000
    assert.ok(Math.abs(m.itemsQtyMap['WIDGET A'] - 15) < 1e-9);
});

// 7. Empty and invalid inputs return the zeroed shape instead of throwing
test("7. Null, empty, or malformed data recovers to a zeroed metrics shape", () => {
    [null, undefined, [], [null, 'garbage', 42]].forEach(input => {
        const m = computeDashboardMetrics(input, 0, FIXED_TODAY);
        assert.strictEqual(m.totalValue, 0);
        assert.strictEqual(m.totalQty, 0);
        assert.deepStrictEqual(m.uniqueItems, []);
        assert.deepStrictEqual(m.uniqueParties, []);
        assert.deepStrictEqual(m.tableRows, []);
        assert.strictEqual(m.delCount, 0);
        assert.strictEqual(m.aprCount, 0);
        assert.deepStrictEqual(m.agingBuckets, { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 });
    });
});

// 8. Trend date keys are YYYY-MM-DD sorted feed for the trend chart
test("8. Date count map produces sortable YYYY-MM-DD trend keys", () => {
    const m = computeDashboardMetrics(sampleRows, 0, FIXED_TODAY);
    const keys = Object.keys(m.dateCountMap).sort();
    assert.ok(keys.includes('2026-06-01'));
    assert.ok(keys.includes('2026-08-20'));
    assert.ok(keys.includes('2025-01-01'));
    assert.ok(keys.every(k => /^\d{4}-\d{2}-\d{2}$/.test(k)));
});

if (failed > 0) {
    throw new Error(`UI dashboard metrics tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
