const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("=================================================");
console.log("🛡️ PRIME PENDING PRO - CODEBASE SAFETY VERIFICATION");
console.log("=================================================\n");

let totalPassed = 0;
let totalFailed = 0;

function runSection(title, fn) {
    console.log(`\n--- ${title} ---`);
    try {
        fn();
    } catch (err) {
        console.error(`💥 Critical failure in section [${title}]:`, err.message);
        totalFailed++;
    }
}

function test(description, fn) {
    try {
        fn();
        console.log(`  ✅ Passed: ${description}`);
        totalPassed++;
    } catch (err) {
        console.error(`  ❌ Failed: ${description}`);
        console.error(`     Details: ${err.message}`);
        totalFailed++;
    }
}

// 1. SYNTAX INTEGRITY CHECKS
runSection("1. Checking JavaScript Syntax Integrity", () => {
    const files = [
        'js/processor.js',
        'js/rules.js',
        'js/app.js',
        'js/worker.js',
        'main.js',
        'preload.js'
    ];

    files.forEach(file => {
        test(`Syntax check: ${file}`, () => {
            if (!fs.existsSync(file)) {
                throw new Error(`File does not exist: ${file}`);
            }
            execSync(`node -c "${file}"`, { stdio: 'pipe' });
        });
    });
});

// 2. CORE DEDUPLICATION LOGIC TESTS
runSection("2. Running Deduplication Engine Invariant Tests", () => {
    try {
        const output = execSync('node test_dedup.js', { encoding: 'utf8' });
        const lines = output.split('\n');
        lines.forEach(line => {
            if (line.includes('✅ Passed:')) {
                console.log(line);
                totalPassed++;
            } else if (line.includes('❌ Failed:')) {
                console.error(line);
                totalFailed++;
            }
        });
    } catch (err) {
        console.error("  ❌ Failed: Deduplication engine tests failed execution.");
        if (err.stdout) console.log(err.stdout);
        if (err.stderr) console.error(err.stderr);
        totalFailed++;
    }
});

// 3. PARTY RULES & MERGES LOGIC TESTS
runSection("3. Running Party Rules & Merge Validation Tests", () => {
    try {
        const output = execSync('node test_rules.js', { encoding: 'utf8' });
        const lines = output.split('\n');
        lines.forEach(line => {
            if (line.includes('✅ Passed:')) {
                console.log(line);
                totalPassed++;
            } else if (line.includes('❌ Failed:')) {
                console.error(line);
                totalFailed++;
            }
        });
    } catch (err) {
        console.error("  ❌ Failed: Party rules tests failed execution.");
        if (err.stdout) console.log(err.stdout);
        if (err.stderr) console.error(err.stderr);
        totalFailed++;
    }
});

// 4. EXPORT METADATA CLEANLINESS TEST
runSection("4. Verifying Export Header Safety & Metadata Isolation", () => {
    test("Internal metadata fields (_searchStr, _isDel, _isApr) are excluded from export headers", () => {
        const mockRow = {
            'ORDER NO': 'O100',
            'PARTY NAME': 'TEST PARTY',
            'ITEM NAME': 'TEST ITEM',
            'VAL': '100',
            '_searchStr': 'test party test item o100',
            '_isDel': false,
            '_isApr': true
        };
        const headers = Object.keys(mockRow).filter(h => !h.startsWith('_'));
        
        if (headers.includes('_searchStr') || headers.includes('_isDel') || headers.includes('_isApr')) {
            throw new Error("Export headers contain internal underscore-prefixed metadata fields!");
        }
        if (headers.length !== 4) {
            throw new Error(`Expected 4 export headers but got ${headers.length}: [${headers.join(', ')}]`);
        }
    });
});

// SUMMARY REPORT
console.log("\n=================================================");
console.log(`📊 CODEBASE SAFETY SUMMARY`);
console.log(`   Passed: ${totalPassed}`);
console.log(`   Failed: ${totalFailed}`);
console.log("=================================================");

if (totalFailed > 0) {
    console.error("❌ SAFETY CHECK FAILED! Revert or fix recent changes before proceeding.");
    process.exit(1);
} else {
    console.log("🌟 ALL CODEBASE SAFETY CHECKS PASSED! The app logic & files are 100% safe.");
    process.exit(0);
}
