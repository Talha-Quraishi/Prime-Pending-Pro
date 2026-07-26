// --- TEST SUITE: PARTY RULES MANAGEMENT & MAPPING LOGIC ---
const assert = require('assert');

console.log("🧪 Running Party Rules Unit Tests...\n");

let passed = 0;
let failed = 0;

function runTest(description, fn) {
    try {
        fn();
        console.log(`  ✅ Passed: ${description}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ Failed: ${description}`);
        console.error(`     Error: ${err.message}`);
        failed++;
    }
}

// Simulated Party Rules state & compilation function from js/rules.js
function recompileRulesListsFromMap(partyRulesMap) {
    const excludedParties = [];
    const deduplicateParties = [];
    const specialParties = [];
    const fullyExcludedParties = [];
    
    for (const party in partyRulesMap) {
        const rule = partyRulesMap[party];
        if (rule === 'keep-all') excludedParties.push(party);
        else if (rule === 'keep-latest') deduplicateParties.push(party);
        else if (rule === 'marka') specialParties.push(party);
        else if (rule === 'exclude') fullyExcludedParties.push(party);
    }

    return { excludedParties, deduplicateParties, specialParties, fullyExcludedParties };
}

function validatePartyMergeMapping(partyMerges) {
    if (!partyMerges || typeof partyMerges !== 'object') return false;
    for (const source in partyMerges) {
        const target = partyMerges[source];
        if (typeof source !== 'string' || typeof target !== 'string') return false;
        if (source.trim() === '' || target.trim() === '') return false;
        if (source.trim().toUpperCase() === target.trim().toUpperCase()) return false; // Self-merge prohibited
    }
    return true;
}

// Test 1: Category Compilation
runTest("Rule compilation categorizes parties correctly into 4 rule buckets", () => {
    const map = {
        "PARTY A": "keep-all",
        "PARTY B": "keep-latest",
        "PARTY C": "marka",
        "PARTY D": "exclude"
    };

    const res = recompileRulesListsFromMap(map);
    assert.deepStrictEqual(res.excludedParties, ["PARTY A"]);
    assert.deepStrictEqual(res.deduplicateParties, ["PARTY B"]);
    assert.deepStrictEqual(res.specialParties, ["PARTY C"]);
    assert.deepStrictEqual(res.fullyExcludedParties, ["PARTY D"]);
});

// Test 2: Unrecognized Rule Handling
runTest("Rule compilation ignores unrecognized rule types safely", () => {
    const map = {
        "PARTY A": "unknown-rule",
        "PARTY B": "keep-latest"
    };

    const res = recompileRulesListsFromMap(map);
    assert.deepStrictEqual(res.excludedParties, []);
    assert.deepStrictEqual(res.deduplicateParties, ["PARTY B"]);
    assert.deepStrictEqual(res.specialParties, []);
    assert.deepStrictEqual(res.fullyExcludedParties, []);
});

// Test 3: Party Merges Validation - Valid Map
runTest("Party merge validation accepts valid merge mappings", () => {
    const merges = {
        "OLD PARTY NAME": "NEW PARTY NAME",
        "ACME PACKAGING": "ACME CORP"
    };
    assert.strictEqual(validatePartyMergeMapping(merges), true);
});

// Test 4: Party Merges Validation - Reject Self-Merge
runTest("Party merge validation rejects self-merging party names", () => {
    const invalidMerges = {
        "SAME PARTY": "SAME PARTY"
    };
    assert.strictEqual(validatePartyMergeMapping(invalidMerges), false);
});

// Summary
console.log(`\n📊 Test Run Summary:`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failed > 0) {
    console.error("\n❌ Some tests failed!");
    process.exit(1);
} else {
    console.log("🌟 All party rules tests passed successfully!\n");
}
