/**
 * Prime-Pending-Pro Unified Automated Test Suite Runner
 * Runs all unit tests, security checks, parser resilience, and performance benchmarks.
 */

console.log("================================================================================");
console.log("🚀 STARTING PRIME-PENDING-PRO FULL TEST SUITE");
console.log("================================================================================\n");

const startTime = Date.now();
const suites = [
    { name: "Application Integrity & Syntax Validation", path: "./test_integrity.js" },
    { name: "Deduplication Rules", path: "./test_dedup.js" },
    { name: "Date Parser", path: "./test_dates.js" },
    { name: "Numeric Normalization", path: "./test_numbers.js" },
    { name: "Excel Schema & Parser Resilience", path: "./test_parser.js" },
    { name: "Worker vs Fallback Parity", path: "./test_processing_equivalence.js" },
    { name: "Party Order Month Selection", path: "./test_party_month_selection.js" },
    { name: "Storage Migrations & Versioning", path: "./test_storage_migrations.js" },
    { name: "Security & Path Traversal Checks", path: "./test_security.js" },
    { name: "Large-Scale Performance Benchmarks", path: "./test_perf.js" }
];

let totalPassed = 0;
let totalFailed = 0;
const results = [];

for (const suite of suites) {
    try {
        console.log(`▶ Running Suite: ${suite.name}`);
        const result = require(suite.path);
        results.push({ name: suite.name, passed: result.passed, failed: result.failed || 0 });
        totalPassed += result.passed;
        totalFailed += (result.failed || 0);
        console.log(`✔ Finished: ${suite.name} (${result.passed} passed)\n`);
    } catch (err) {
        console.error(`\n❌ Error running suite ${suite.name}:`, err.message);
        results.push({ name: suite.name, passed: 0, failed: 1, error: err.message });
        totalFailed += 1;
    }
}

const duration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log("================================================================================");
console.log("📊 TEST RESULTS SUMMARY");
console.log("================================================================================");
results.forEach(r => {
    const status = r.failed === 0 ? "✅ PASSED" : "❌ FAILED";
    console.log(`  ${status.padEnd(10)} | ${r.name.padEnd(40)} | ${r.passed} passed, ${r.failed} failed`);
});
console.log("--------------------------------------------------------------------------------");
console.log(`Total Passed: ${totalPassed} | Total Failed: ${totalFailed} | Duration: ${duration}s`);
console.log("================================================================================\n");

if (totalFailed > 0) {
    console.error("💥 FAILED: One or more test suites failed!");
    process.exit(1);
} else {
    console.log("🌟 SUCCESS: All test suites passed with 100% verification!");
    process.exit(0);
}
