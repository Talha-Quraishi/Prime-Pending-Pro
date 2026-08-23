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

// NOTE: Rules backup/restore logic lives solely in js/rules.js (exportRulesConfig / importRulesConfig).
// It owns the full schema including partyMonthSelections; do not duplicate it here.

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

/**
 * Prime-Pending-Pro Updater UI Controller
 * Drives the Software Updates card states: idle -> checking -> available -> downloading -> downloaded,
 * plus post-download actions (Install / Open file location / Delete downloaded file).
 */

const UPDATER_IDLE_LABEL = 'Check for Updates';

function getUpdateEl(id) {
    return document.getElementById(id);
}

function setUpdaterCheckButton(label, disabled) {
    const btn = getUpdateEl('checkForUpdatesBtn');
    const text = getUpdateEl('updateBtnText');
    const spin = getUpdateEl('updateSpin');
    if (btn) btn.disabled = !!disabled;
    if (text) text.textContent = label;
    if (spin) spin.classList.toggle('hidden', !disabled);
}

function setUpdaterStatus(text, isError = false) {
    const el = getUpdateEl('updateStatusText');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('text-red-500', isError);
    el.classList.toggle('dark:text-red-400', isError);
}

function setUpdateActionsVisible(visible) {
    const row = getUpdateEl('updateActionsRow');
    if (row) row.classList.toggle('hidden', !visible);
}

function setUpdateProgress(percent) {
    const container = getUpdateEl('updateProgressContainer');
    const bar = getUpdateEl('updateProgressBar');
    const pct = getUpdateEl('updateProgressPercent');
    if (!container || !bar || !pct) return;
    container.classList.remove('hidden');
    bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    pct.textContent = `${Math.round(percent)}%`;
}

function hideUpdateProgress() {
    const container = getUpdateEl('updateProgressContainer');
    if (container) container.classList.add('hidden');
}

/**
 * Renders release notes as plain text only - notes originate from a remote
 * GitHub release and must never be interpreted as HTML (XSS surface).
 */
function renderWhatsNew(version, releaseNotes) {
    const container = getUpdateEl('whatsNewContainer');
    const versionEl = getUpdateEl('whatsNewVersion');
    const contentEl = getUpdateEl('whatsNewContent');
    if (!container || !contentEl) return;

    let notesText = '';
    if (typeof releaseNotes === 'string') {
        notesText = releaseNotes;
    } else if (releaseNotes && typeof releaseNotes === 'object') {
        try { notesText = JSON.stringify(releaseNotes); } catch (e) { notesText = ''; }
    }
    // Strip any markup, then normalize whitespace/newlines for plain-text display
    notesText = String(notesText)
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]*>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!notesText && !version) {
        container.classList.add('hidden');
        return;
    }

    if (versionEl) versionEl.textContent = version || '';
    contentEl.textContent = notesText || `Version ${version} is available.`;
    contentEl.classList.add('whitespace-pre-wrap');
    container.classList.remove('hidden');
}

function resetUpdaterToIdle(statusText) {
    setUpdateActionsVisible(false);
    hideUpdateProgress();
    const btn = getUpdateEl('checkForUpdatesBtn');
    if (btn) {
        btn.classList.remove('hidden');
        btn.disabled = false;
    }
    setUpdaterCheckButton(UPDATER_IDLE_LABEL, false);
    if (statusText !== undefined) setUpdaterStatus(statusText);
}

function handleUpdateMessage(status, payload) {
    switch (status) {
        case 'checking':
            setUpdaterStatus('Checking for updates...');
            setUpdaterCheckButton('Checking...', true);
            break;

        case 'available': {
            const version = payload && payload.version ? String(payload.version) : '';
            setUpdaterStatus(`Update ${version} is available. Download it now.`);
            setUpdaterCheckButton(`Download Update ${version}`, false);
            renderWhatsNew(version, payload ? payload.releaseNotes : '');
            break;
        }

        case 'not-available':
            resetUpdaterToIdle("You're running the latest version.");
            break;

        case 'dev':
            resetUpdaterToIdle('Updates apply to installed builds only (dev mode detected).');
            break;

        case 'progress':
            setUpdaterStatus('Downloading update...');
            setUpdaterCheckButton('Downloading...', true);
            setUpdateProgress(typeof payload === 'number' ? payload : 0);
            break;

        case 'downloaded': {
            hideUpdateProgress();
            const version = payload && payload.version ? String(payload.version) : '';
            setUpdaterStatus(`Update ${version} downloaded and ready to install.`);
            const checkBtn = getUpdateEl('checkForUpdatesBtn');
            if (checkBtn) checkBtn.classList.add('hidden');
            setUpdateActionsVisible(true);

            const pathLabel = getUpdateEl('downloadedFilePathLabel');
            if (pathLabel) {
                const paths = (payload && Array.isArray(payload.filePaths)) ? payload.filePaths : [];
                const firstPath = paths.find(Boolean) || '';
                const baseName = firstPath ? firstPath.split(/[\\/]/).pop() : 'installer';
                pathLabel.textContent = baseName;
                if (firstPath) pathLabel.title = firstPath;
            }
            renderWhatsNew(version, payload ? payload.releaseNotes : '');
            break;
        }

        case 'deleted':
            resetUpdaterToIdle('Downloaded update file removed.');
            if (typeof showToast === 'function') showToast('Downloaded update file deleted.', 'success');
            break;

        case 'error':
            resetUpdaterToIdle(`Update check failed: ${payload || 'unknown error'}`, true);
            break;

        default:
            // Unknown status - ignore silently
            break;
    }
}

function initializeUpdaterUI() {
    if (!window.electronAPI || typeof window.electronAPI.onUpdateMessage !== 'function') return;

    const checkBtn = getUpdateEl('checkForUpdatesBtn');
    const installBtn = getUpdateEl('installUpdateBtn');
    const openLocationBtn = getUpdateEl('openUpdateLocationBtn');
    const deleteFileBtn = getUpdateEl('deleteUpdateFileBtn');

    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            const text = getUpdateEl('updateBtnText');
            if (text && /^Download Update/i.test(text.textContent || '')) {
                window.electronAPI.downloadUpdate();
            } else {
                window.electronAPI.checkForUpdates();
            }
        });
    }

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            const ok = typeof showConfirmDialog === 'function'
                ? await showConfirmDialog({
                    title: 'Install update?',
                    message: 'The app will restart now to complete the installation.',
                    confirmLabel: 'Restart & Install'
                })
                : true;
            if (ok) {
                window.electronAPI.installUpdate();
            }
        });
    }

    if (openLocationBtn) {
        openLocationBtn.addEventListener('click', async () => {
            try {
                const opened = await window.electronAPI.openDownloadedUpdateLocation();
                if (!opened && typeof showToast === 'function') {
                    showToast('Downloaded installer not found on disk.', 'warning');
                }
            } catch (e) {
                console.error('Open update location failed:', e);
            }
        });
    }

    if (deleteFileBtn) {
        deleteFileBtn.addEventListener('click', async () => {
            const ok = typeof showConfirmDialog === 'function'
                ? await showConfirmDialog({
                    title: 'Delete downloaded file?',
                    message: 'The downloaded installer will be removed from disk without installing it.',
                    confirmLabel: 'Delete File',
                    danger: true
                })
                : true;
            if (!ok) return;
            try {
                await window.electronAPI.deleteDownloadedUpdate();
                // 'deleted' message drives the UI reset + toast
            } catch (e) {
                console.error('Delete downloaded update failed:', e);
                if (typeof showToast === 'function') showToast('Failed to delete the downloaded file.', 'error');
            }
        });
    }

    window.electronAPI.onUpdateMessage(handleUpdateMessage);
}

function initializeSettingsUI() {
    setupSettingsTabs();
    setupDiagnosticListeners();
    initializeUpdaterUI();

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
        setupDiagnosticListeners,
        initializeUpdaterUI,
        initializeSettingsUI
    };
}
