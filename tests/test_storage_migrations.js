/**
 * Prime-Pending-Pro Storage Migration & Versioning Test Suite
 * Asserts deterministic migration of legacy storage objects to schemaVersion 1.
 */

const assert = require('assert');
const { migrateRulesData, RULES_STORAGE_VERSION } = require('../js/storage/rules-storage');

console.log("  💾 Running Storage Migrations & Integrity Test Suite...");

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

// 1. Unversioned legacy data migration
test("1. Unversioned legacy party rules data migrates to schema version 1", () => {
    const legacy = {
        excludedParties: ['party alpha', 'party beta'],
        deduplicateParties: ['party gamma'],
        specialParties: ['party delta'],
        fullyExcludedParties: ['party epsilon']
    };

    const migrated = migrateRulesData(legacy);
    assert.strictEqual(migrated.rulesVersion, RULES_STORAGE_VERSION);
    assert.deepStrictEqual(migrated.excludedParties, ['PARTY ALPHA', 'PARTY BETA']);
    assert.deepStrictEqual(migrated.deduplicateParties, ['PARTY GAMMA']);
    assert.deepStrictEqual(migrated.specialParties, ['PARTY DELTA']);
    assert.deepStrictEqual(migrated.fullyExcludedParties, ['PARTY EPSILON']);
    assert.deepStrictEqual(migrated.partyMerges, {});
});

// 2. Corrupt / null input recovery
test("2. Null, undefined, or primitive input recovers safely to empty schema", () => {
    const fromNull = migrateRulesData(null);
    assert.strictEqual(fromNull.rulesVersion, RULES_STORAGE_VERSION);
    assert.deepStrictEqual(fromNull.excludedParties, []);
    assert.deepStrictEqual(fromNull.partyMerges, {});

    const fromString = migrateRulesData("corrupt string");
    assert.strictEqual(fromString.rulesVersion, RULES_STORAGE_VERSION);
    assert.deepStrictEqual(fromString.deduplicateParties, []);
});

// 3. Party merges normalization
test("3. Party merges normalize keys to uppercase and preserve valid target values", () => {
    const rawWithMerges = {
        partyMerges: {
            ' acme corp ': 'ACME MAIN',
            'beta ltd': 'BETA HOLDINGS'
        }
    };

    const migrated = migrateRulesData(rawWithMerges);
    assert.strictEqual(migrated.partyMerges['ACME CORP'], 'ACME MAIN');
    assert.strictEqual(migrated.partyMerges['BETA LTD'], 'BETA HOLDINGS');
});

// 4. Idempotent migration
test("4. Migration is idempotent (migrating already migrated data produces identical object)", () => {
    const initial = {
        rulesVersion: 1,
        excludedParties: ['PARTY A'],
        deduplicateParties: ['PARTY B'],
        specialParties: ['PARTY C'],
        fullyExcludedParties: ['PARTY D'],
        partyMerges: { 'PARTY X': 'PARTY Y' }
    };

    const migrated1 = migrateRulesData(initial);
    const migrated2 = migrateRulesData(migrated1);
    assert.deepStrictEqual(migrated1, migrated2);
});

// 5. In-memory state get/set
test("5. getRulesState and setRulesState maintain validated reactive state", () => {
    const { getRulesState, setRulesState } = require('../js/storage/rules-storage');
    const newState = {
        excludedParties: ['alpha', 'beta'],
        deduplicateParties: ['gamma'],
        specialParties: [],
        fullyExcludedParties: [],
        partyMerges: { 'old name': 'New Name' }
    };

    setRulesState(newState);
    const state = getRulesState();
    assert.strictEqual(state.rulesVersion, RULES_STORAGE_VERSION);
    assert.deepStrictEqual(state.excludedParties, ['ALPHA', 'BETA']);
    assert.strictEqual(state.partyMerges['OLD NAME'], 'New Name');
});

// 6. loadRulesFromStorage & saveRulesToStorage execution
test("6. loadRulesFromStorage and saveRulesToStorage execute safely without throwing", async () => {
    const { loadRulesFromStorage, saveRulesToStorage } = require('../js/storage/rules-storage');
    const loaded = await loadRulesFromStorage();
    assert.strictEqual(typeof loaded, 'object');
    assert.strictEqual(loaded.rulesVersion, RULES_STORAGE_VERSION);

    const saved = await saveRulesToStorage({
        excludedParties: ['TEST PARTY'],
        deduplicateParties: [],
        specialParties: [],
        fullyExcludedParties: [],
        partyMerges: {}
    });
    assert.strictEqual(typeof saved, 'boolean');
});

if (failed > 0) {
    throw new Error(`Storage migration tests failed: ${failed} failure(s)`);
}

module.exports = { passed, failed };
