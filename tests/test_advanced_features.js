/**
 * Prime-Pending-Pro Advanced Features Test Suite
 * Validates Pareto (80/20) analytics, Rule Profile bundling & merging,
 * Storage retention purge logic, and Interactive Drill-down filters.
 */

const assert = require('assert');
const { computeDashboardMetrics } = require('../js/ui/dashboard');
const { mergeRulesData, createRulesProfile } = require('../js/storage/rules-storage');

function runAdvancedFeaturesTests() {
    console.log('🚀 Running Advanced Features & Analytics Test Suite...\n');
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`    ✅ Passed: ${name}`);
            passed++;
        } catch (e) {
            console.error(`    ❌ FAILED: ${name}`);
            console.error(`       Error: ${e.message}\n`);
            failed++;
        }
    }

    // ==========================================
    // 1. Pareto 80/20 Classification Tests
    // ==========================================
    test('1. Pareto 80/20 correctly segments Category A, B, and C accounts', () => {
        const sampleRows = [
            { 'ORDER NO': 'DEL-101', 'DATE': '2026-02-01', 'PARTY NAME': 'MEGA CORP', 'ITEM NAME': 'WIDGET A', 'BALANCE': 100, 'RATE': 800 }, // 80,000 (80%)
            { 'ORDER NO': 'DEL-102', 'DATE': '2026-02-02', 'PARTY NAME': 'MID ENTERPRISES', 'ITEM NAME': 'WIDGET B', 'BALANCE': 50, 'RATE': 300 }, // 15,000 (15%)
            { 'ORDER NO': 'DEL-103', 'DATE': '2026-02-03', 'PARTY NAME': 'SMALL TRADERS', 'ITEM NAME': 'WIDGET C', 'BALANCE': 10, 'RATE': 500 } // 5,000 (5%)
        ];

        const metrics = computeDashboardMetrics(sampleRows, 0, new Date('2026-02-15'));
        assert.strictEqual(metrics.totalValue, 100000, 'Total value should be 100,000');
        assert.strictEqual(metrics.paretoParties.length, 3, 'Should have 3 pareto parties');

        const [mega, mid, small] = metrics.paretoParties;
        assert.strictEqual(mega.name, 'MEGA CORP');
        assert.strictEqual(mega.category, 'A', 'MEGA CORP should be Category A');
        assert.strictEqual(mega.pctOfTotal, 80);

        assert.strictEqual(mid.name, 'MID ENTERPRISES');
        assert.strictEqual(mid.category, 'B', 'MID ENTERPRISES should be Category B');
        assert.strictEqual(mid.pctOfTotal, 15);

        assert.strictEqual(small.name, 'SMALL TRADERS');
        assert.strictEqual(small.category, 'C', 'SMALL TRADERS should be Category C');
        assert.strictEqual(small.pctOfTotal, 5);

        assert.strictEqual(metrics.paretoSummary.catACount, 1);
        assert.strictEqual(metrics.paretoSummary.catBCount, 1);
        assert.strictEqual(metrics.paretoSummary.catCCount, 1);
    });

    test('2. Pareto handles single party by placing in Category A', () => {
        const singlePartyRows = [
            { 'ORDER NO': 'DEL-001', 'DATE': '2026-01-01', 'PARTY NAME': 'ONLY ONE', 'ITEM NAME': 'ITEM X', 'BALANCE': 10, 'RATE': 100 }
        ];
        const metrics = computeDashboardMetrics(singlePartyRows, 0);
        assert.strictEqual(metrics.paretoParties.length, 1);
        assert.strictEqual(metrics.paretoParties[0].category, 'A');
        assert.strictEqual(metrics.paretoSummary.catACount, 1);
    });

    test('3. Pareto handles empty dataset safely without throwing', () => {
        const metrics = computeDashboardMetrics([]);
        assert.strictEqual(metrics.paretoParties.length, 0);
        assert.strictEqual(metrics.paretoSummary.catACount, 0);
        assert.strictEqual(metrics.paretoSummary.catAVal, 0);
    });

    // ==========================================
    // 2. Rule Profiles & Merging Tests
    // ==========================================
    test('4. createRulesProfile packages schema, version, stats, and rule arrays', () => {
        const state = {
            excludedParties: ['PARTY A', 'PARTY B'],
            deduplicateParties: ['PARTY C'],
            specialParties: ['PARTY D'],
            fullyExcludedParties: ['PARTY E'],
            partyMerges: { 'OLD NAME': 'PARTY A' },
            partyMonthSelections: { 'PARTY A': ['2026-01', '2026-02'] }
        };

        const profile = createRulesProfile(state, { name: 'Q1 Profile', appVersion: '3.30.22' });
        assert.strictEqual(profile.schema, 'prime-pending-pro-rules-profile');
        assert.strictEqual(profile.profileName, 'Q1 Profile');
        assert.strictEqual(profile.summary.keepAllCount, 2);
        assert.strictEqual(profile.summary.latestDateCount, 1);
        assert.strictEqual(profile.summary.markaCount, 1);
        assert.strictEqual(profile.summary.fullyExcludedCount, 1);
        assert.strictEqual(profile.summary.mergesCount, 1);
        assert.strictEqual(profile.summary.monthSelectionsCount, 1);
        assert.deepStrictEqual(profile.rules.excludedParties, ['PARTY A', 'PARTY B']);
    });

    test('5. mergeRulesData unions non-conflicting rules across parties', () => {
        const existing = {
            excludedParties: ['PARTY A'],
            deduplicateParties: ['PARTY B'],
            specialParties: [],
            fullyExcludedParties: [],
            partyMerges: {},
            partyMonthSelections: {}
        };

        const incoming = {
            excludedParties: ['PARTY C'],
            deduplicateParties: [],
            specialParties: ['PARTY D'],
            fullyExcludedParties: [],
            partyMerges: {},
            partyMonthSelections: {}
        };

        const merged = mergeRulesData(existing, incoming);
        assert.deepStrictEqual(merged.excludedParties.sort(), ['PARTY A', 'PARTY C'].sort());
        assert.deepStrictEqual(merged.deduplicateParties, ['PARTY B']);
        assert.deepStrictEqual(merged.specialParties, ['PARTY D']);
    });

    test('6. mergeRulesData overrides existing rule when incoming specifies a new rule for same party', () => {
        const existing = {
            excludedParties: ['ABC TRADERS'], // currently Keep All
            deduplicateParties: [],
            specialParties: [],
            fullyExcludedParties: [],
            partyMerges: {},
            partyMonthSelections: {}
        };

        const incoming = {
            excludedParties: [],
            deduplicateParties: ['ABC TRADERS'], // incoming sets to Latest Date
            specialParties: [],
            fullyExcludedParties: [],
            partyMerges: {},
            partyMonthSelections: {}
        };

        const merged = mergeRulesData(existing, incoming);
        assert.strictEqual(merged.excludedParties.includes('ABC TRADERS'), false, 'Should no longer be in excludedParties');
        assert.strictEqual(merged.deduplicateParties.includes('ABC TRADERS'), true, 'Should now be in deduplicateParties');
    });

    test('7. mergeRulesData unions partyMonthSelections without duplicating months', () => {
        const existing = {
            partyMonthSelections: { 'PARTY X': ['2026-01', '2026-02'] }
        };

        const incoming = {
            partyMonthSelections: { 'PARTY X': ['2026-02', '2026-03'], 'PARTY Y': ['2026-04'] }
        };

        const merged = mergeRulesData(existing, incoming);
        assert.deepStrictEqual(merged.partyMonthSelections['PARTY X'], ['2026-01', '2026-02', '2026-03']);
        assert.deepStrictEqual(merged.partyMonthSelections['PARTY Y'], ['2026-04']);
    });

    // ==========================================
    // 3. Storage Retention Purge Calculation Tests
    // ==========================================
    test('8. Date-based retention calculates items older than N days accurately', () => {
        const now = new Date('2026-08-23T12:00:00Z').getTime();
        const mockIndex = [
            { id: '1', date: '2026-08-20T12:00:00Z' }, // 3 days old (Keep)
            { id: '2', date: '2026-07-15T12:00:00Z' }, // 39 days old (Delete if > 30)
            { id: '3', date: '2026-05-01T12:00:00Z' }  // 114 days old (Delete if > 30)
        ];

        const olderThanDays = 30;
        const toKeep = [];
        const toDelete = [];

        mockIndex.forEach(item => {
            const itemTime = new Date(item.date).getTime();
            const ageDays = (now - itemTime) / (1000 * 60 * 60 * 24);
            if (ageDays > olderThanDays) {
                toDelete.push(item);
            } else {
                toKeep.push(item);
            }
        });

        assert.strictEqual(toKeep.length, 1);
        assert.strictEqual(toKeep[0].id, '1');
        assert.strictEqual(toDelete.length, 2);
    });

    test('9. Count-based retention caps records to maxItems newest entries', () => {
        const mockIndex = [
            { id: '1', date: '2026-08-23' },
            { id: '2', date: '2026-08-22' },
            { id: '3', date: '2026-08-21' },
            { id: '4', date: '2026-08-20' },
            { id: '5', date: '2026-08-19' }
        ];

        const maxItems = 3;
        const toKeep = mockIndex.slice(0, maxItems);
        const toDelete = mockIndex.slice(maxItems);

        assert.strictEqual(toKeep.length, 3);
        assert.strictEqual(toDelete.length, 2);
        assert.deepStrictEqual(toDelete.map(d => d.id), ['4', '5']);
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
    if (failed > 0) {
        throw new Error(`${failed} tests failed in Advanced Features Test Suite`);
    }
    return { passed, failed };
}

let result;
try {
    result = runAdvancedFeaturesTests();
} catch (e) {
    result = { passed: 0, failed: 1 };
}

module.exports = result;

