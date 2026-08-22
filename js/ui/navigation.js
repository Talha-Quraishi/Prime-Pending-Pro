/**
 * Prime-Pending-Pro Navigation & View System
 * Handles tab transitions, command bar title updates, sidebar toggle, theme switching, and titlebar controls.
 */

function switchMainView(viewName) {
    const mainTabProcess = document.getElementById('mainTabProcess');
    const mainTabInsights = document.getElementById('mainTabInsights');
    const mainTabHistory = document.getElementById('mainTabHistory');
    const mainTabSettings = document.getElementById('mainTabSettings');

    const viewProcessContainer = document.getElementById('viewProcessContainer');
    const viewInsightsContainer = document.getElementById('viewInsightsContainer');
    const viewHistoryContainer = document.getElementById('viewHistoryContainer');
    const viewSettingsContainer = document.getElementById('viewSettingsContainer');
    const viewTitle = document.getElementById('viewTitle');

    const tabs = {
        process: { btn: mainTabProcess, view: viewProcessContainer, title: "Process File" },
        insights: { btn: mainTabInsights, view: viewInsightsContainer, title: "Data Insights Dashboard" },
        history: { btn: mainTabHistory, view: viewHistoryContainer, title: "Processed File History" },
        settings: { btn: mainTabSettings, view: viewSettingsContainer, title: "Rules & Settings" }
    };
    
    Object.keys(tabs).forEach(k => {
        const item = tabs[k];
        if (!item.btn || !item.view) return;
        if (k === viewName) {
            item.btn.classList.add('active');
            item.view.classList.remove('hidden');
            if (viewTitle) viewTitle.textContent = item.title;
        } else {
            item.btn.classList.remove('active');
            item.view.classList.add('hidden');
        }
    });

    if (viewName === 'history' && typeof loadHistoryTable === 'function') {
        loadHistoryTable();
    }
}

function applyTheme(themeName) {
    const htmlElement = document.documentElement;
    const themeToggleSwitch = document.getElementById('themeToggleSwitch');
    const themeIconLight = document.getElementById('themeIconLight');
    const themeIconDark = document.getElementById('themeIconDark');

    if (themeName === 'dark') {
        htmlElement.classList.add('dark');
        if (themeToggleSwitch) themeToggleSwitch.checked = true;
        if (themeIconDark) themeIconDark.classList.remove('hidden');
        if (themeIconLight) themeIconLight.classList.add('hidden');
    } else {
        htmlElement.classList.remove('dark');
        if (themeToggleSwitch) themeToggleSwitch.checked = false;
        if (themeIconLight) themeIconLight.classList.remove('hidden');
        if (themeIconDark) themeIconDark.classList.add('hidden');
    }
}

function toggleTheme() {
    const htmlElement = document.documentElement;
    const isDark = htmlElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    if (window.electronAPI && typeof persistConfiguration === 'function') {
        persistConfiguration({ theme: newTheme });
    } else {
        localStorage.setItem('theme', newTheme);
    }
    if (typeof updateChartsTheme === 'function') {
        updateChartsTheme();
    }
    return newTheme;
}

function initializeNavigation() {
    const mainTabProcess = document.getElementById('mainTabProcess');
    const mainTabInsights = document.getElementById('mainTabInsights');
    const mainTabHistory = document.getElementById('mainTabHistory');
    const mainTabSettings = document.getElementById('mainTabSettings');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebar = document.getElementById('sidebar');
    const themeToggleSwitch = document.getElementById('themeToggleSwitch');
    const themeToggle = document.getElementById('themeToggle');

    if (mainTabProcess) mainTabProcess.addEventListener('click', () => switchMainView('process'));
    if (mainTabInsights) mainTabInsights.addEventListener('click', () => switchMainView('insights'));
    if (mainTabHistory) mainTabHistory.addEventListener('click', () => switchMainView('history'));
    if (mainTabSettings) mainTabSettings.addEventListener('click', () => switchMainView('settings'));

    if (hamburgerBtn && sidebar) {
        hamburgerBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            if (window.electronAPI && typeof persistConfiguration === 'function') {
                persistConfiguration({ sidebarCollapsed: isCollapsed });
            } else {
                localStorage.setItem('sidebarCollapsed', String(isCollapsed));
            }
        });
    }

    if (themeToggleSwitch) {
        themeToggleSwitch.addEventListener('change', () => {
            const newTheme = themeToggleSwitch.checked ? 'dark' : 'light';
            applyTheme(newTheme);
            if (window.electronAPI && typeof persistConfiguration === 'function') {
                persistConfiguration({ theme: newTheme });
            } else {
                localStorage.setItem('theme', newTheme);
            }
            if (typeof updateChartsTheme === 'function') {
                updateChartsTheme();
            }
        });
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            toggleTheme();
        });
    }

    // Titlebar window buttons
    const winMin = document.getElementById('winMin');
    const winMax = document.getElementById('winMax');
    const winClose = document.getElementById('winClose');

    if (window.electronAPI) {
        if (winMin) winMin.addEventListener('click', () => window.electronAPI.minimize());
        if (winMax) winMax.addEventListener('click', () => window.electronAPI.maximize());
        if (winClose) winClose.addEventListener('click', () => window.electronAPI.close());
    } else {
        if (winMin) winMin.style.display = 'none';
        if (winMax) winMax.style.display = 'none';
        if (winClose) winClose.style.display = 'none';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        switchMainView,
        applyTheme,
        toggleTheme,
        initializeNavigation
    };
}
