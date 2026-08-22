/**
 * Prime-Pending-Pro Settings & Diagnostics UI System
 * Handles settings tabs, rule export/import, auto-updater renderer bindings, and diagnostic log collection.
 */

function setupSettingsTabs() {
    const settingsNavItems = document.querySelectorAll('.settings-nav-item');
    const settingsPanes = document.querySelectorAll('.settings-pane');

    settingsNavItems.forEach(item => {
        item.addEventListener('click', () => {
            settingsNavItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            const tabName = item.dataset.settingsTab;
            settingsPanes.forEach(pane => {
                if (pane.id === `settingsPane${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`) {
                    pane.classList.remove('hidden');
                } else {
                    pane.classList.add('hidden');
                }
            });
        });
    });
}

function exportRulesConfig() {
    const payload = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        excludedParties: (typeof excludedParties !== 'undefined' ? excludedParties : []),
        deduplicateParties: (typeof deduplicateParties !== 'undefined' ? deduplicateParties : []),
        specialParties: (typeof specialParties !== 'undefined' ? specialParties : []),
        fullyExcludedParties: (typeof fullyExcludedParties !== 'undefined' ? fullyExcludedParties : []),
        partyMerges: (typeof partyMerges !== 'undefined' ? partyMerges : {})
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `prime_rules_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    if (typeof showToast === 'function') {
        showToast("Rules configuration exported! 💾", "success");
    }
}

function importRulesConfig(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const data = JSON.parse(event.target.result);
            if (typeof data !== 'object' || data === null) throw new Error("Invalid format");

            if (typeof excludedParties !== 'undefined' && Array.isArray(data.excludedParties)) {
                excludedParties = data.excludedParties.map(p => String(p).toUpperCase());
            }
            if (typeof deduplicateParties !== 'undefined' && Array.isArray(data.deduplicateParties)) {
                deduplicateParties = data.deduplicateParties.map(p => String(p).toUpperCase());
            }
            if (typeof specialParties !== 'undefined' && Array.isArray(data.specialParties)) {
                specialParties = data.specialParties.map(p => String(p).toUpperCase());
            }
            if (typeof fullyExcludedParties !== 'undefined' && Array.isArray(data.fullyExcludedParties)) {
                fullyExcludedParties = data.fullyExcludedParties.map(p => String(p).toUpperCase());
            }
            if (typeof partyMerges !== 'undefined' && typeof data.partyMerges === 'object') {
                partyMerges = {};
                for (const k in data.partyMerges) {
                    partyMerges[k.toUpperCase()] = data.partyMerges[k];
                }
            }

            if (typeof partyRulesMap !== 'undefined') {
                partyRulesMap = {};
                if (typeof excludedParties !== 'undefined') excludedParties.forEach(p => partyRulesMap[p] = 'keep-all');
                if (typeof deduplicateParties !== 'undefined') deduplicateParties.forEach(p => partyRulesMap[p] = 'keep-latest');
                if (typeof specialParties !== 'undefined') specialParties.forEach(p => partyRulesMap[p] = 'marka');
                if (typeof fullyExcludedParties !== 'undefined') fullyExcludedParties.forEach(p => partyRulesMap[p] = 'exclude');
            }

            if (typeof persistRulesToStorage === 'function') {
                persistRulesToStorage();
            }
            if (typeof renderChipsInUI === 'function') {
                renderChipsInUI();
            }
            if (typeof renderPartyRulesList === 'function') {
                renderPartyRulesList();
            }

            if (typeof showToast === 'function') {
                showToast("Rules imported successfully! 📥", "success");
            }
        } catch (err) {
            console.error("Failed to import rules config:", err);
            if (typeof showToast === 'function') {
                showToast("Failed to parse rules backup file.", "error");
            }
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

function setupDiagnosticListeners() {
    const copyDiagnosticBtn = document.getElementById('copyDiagnosticBtn');
    const diagnosticStatusText = document.getElementById('diagnosticStatusText');

    if (copyDiagnosticBtn) {
        copyDiagnosticBtn.addEventListener('click', async () => {
            const diagInfo = [
                `--- PRIME PENDING PRO DIAGNOSTIC REPORT ---`,
                `Generated: ${new Date().toISOString()}`,
                `App Version: ${document.getElementById('aboutVersionLabel')?.textContent || '3.30.22'}`,
                `User Agent: ${navigator.userAgent}`,
                `Platform: ${navigator.platform}`,
                `Online: ${navigator.onLine}`,
                `Configured Rules: KeepAll=${(typeof excludedParties !== 'undefined' ? excludedParties.length : 0)}, LatestDate=${(typeof deduplicateParties !== 'undefined' ? deduplicateParties.length : 0)}, Marka=${(typeof specialParties !== 'undefined' ? specialParties.length : 0)}, Excluded=${(typeof fullyExcludedParties !== 'undefined' ? fullyExcludedParties.length : 0)}`,
                `\n--- RECENT LOGS (Last 50) ---`,
                ...(window._diagnosticLogs || []).slice(-50)
            ].join('\n');

            const copied = typeof safeCopyToClipboard === 'function' ? await safeCopyToClipboard(diagInfo) : false;
            if (copied) {
                if (diagnosticStatusText) {
                    diagnosticStatusText.classList.remove('hidden');
                    setTimeout(() => diagnosticStatusText.classList.add('hidden'), 2500);
                }
                if (typeof showToast === 'function') {
                    showToast("Diagnostic logs copied to clipboard! 📋", "success");
                }
            } else {
                if (typeof showToast === 'function') {
                    showToast("Failed to copy diagnostic logs.", "error");
                }
            }
        });
    }
}

function initializeSettingsUI() {
    setupSettingsTabs();
    setupDiagnosticListeners();

    const exportRulesBtn = document.getElementById('exportRulesBtn');
    const importRulesBtn = document.getElementById('importRulesBtn');
    const importRulesInput = document.getElementById('importRulesInput');
    const excelStylingToggle = document.getElementById('excelStylingToggle');
    const performanceModeToggle = document.getElementById('performanceModeToggle');
    const htmlElement = document.documentElement;

    if (exportRulesBtn) exportRulesBtn.addEventListener('click', exportRulesConfig);
    if (importRulesBtn && importRulesInput) importRulesBtn.addEventListener('click', () => importRulesInput.click());
    if (importRulesInput) importRulesInput.addEventListener('change', importRulesConfig);

    if (excelStylingToggle) {
        excelStylingToggle.addEventListener('change', () => {
            if (typeof persistConfigValue === 'function') {
                persistConfigValue('enableExcelStyling', excelStylingToggle.checked);
            }
        });
    }

    if (performanceModeToggle) {
        performanceModeToggle.addEventListener('change', () => {
            if (typeof persistConfigValue === 'function') {
                persistConfigValue('performanceMode', performanceModeToggle.checked);
            }
            if (performanceModeToggle.checked) {
                htmlElement.classList.add('low-spec');
            } else {
                htmlElement.classList.remove('low-spec');
            }
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        setupSettingsTabs,
        exportRulesConfig,
        importRulesConfig,
        setupDiagnosticListeners,
        initializeSettingsUI
    };
}
