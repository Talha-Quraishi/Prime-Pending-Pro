/**
 * Prime-Pending-Pro Dashboard & Insights UI Module
 * Handles KPI metric counters, lazy chunk row rendering, Chart.js visualizations, and pricing modes.
 */

let chartPartiesInstance = null;
let chartItemsInstance = null;
let chartTrendInstance = null;
let chartDistributionInstance = null;
let chartAgingInstance = null;

// Full (untruncated) labels for tooltip callbacks
let fullPartyLabels = [];
let fullItemLabels = [];

let dashboardTableRows = [];
let loadedRowCount = 0;
const TABLE_CHUNK_SIZE = 50;
let currentFilterType = 'ALL';
let currentDiscount = 0;
let activePriceMode = 'MRP';

function setFilterType(type) {
    currentFilterType = type;
    const filterAll = document.getElementById('filterAll');
    const filterDel = document.getElementById('filterDel');
    const filterApr = document.getElementById('filterApr');

    [filterAll, filterDel, filterApr].forEach(btn => {
        if (btn) btn.className = "px-3 py-1 text-sm font-semibold rounded text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all";
    });
    const activeBtn = type === 'ALL' ? filterAll : (type === 'DEL' ? filterDel : filterApr);
    if (activeBtn) {
        activeBtn.className = "px-3 py-1 text-sm font-semibold rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm transition-all";
    }
    applyDashboardFilters(true);
}

function applyDashboardFilters(immediateCharts = false) {
    if (typeof finalDeduplicatedData === 'undefined' || !finalDeduplicatedData) return;
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    currentFilteredData = finalDeduplicatedData.filter(row => {
        let matchesType = true;
        if (currentFilterType === 'DEL') matchesType = row._isDel;
        else if (currentFilterType === 'APR') matchesType = row._isApr;
        
        let matchesSearch = true;
        if (query) {
            matchesSearch = row._searchStr && row._searchStr.includes(query);
        }
        return matchesType && matchesSearch;
    });
    updateDashboardUI(currentFilteredData, immediateCharts);
}

/**
 * Pure aggregation of deduplicated rows into dashboard metrics.
 * No DOM access - safe to unit test in Node.
 * @param {Array<Object>} data - Deduplicated pending order rows
 * @param {number} discountRate - Discount fraction applied to rate (0 - 1, e.g. 0.61)
 * @param {Date} [today] - Reference date for aging analysis (defaults to now)
 * @returns {Object} Aggregated metrics for KPIs, charts, and the detailed table
 */
function computeDashboardMetrics(data, discountRate = 0, today) {
    const parseNum = typeof safeParseFloat === 'function' ? safeParseFloat : (v) => parseFloat(v) || 0;
    const parseDateFn = typeof parseDMY === 'function' ? parseDMY : (d) => new Date(d || 0);
    const refDate = today instanceof Date ? today : new Date();
    refDate.setHours(0, 0, 0, 0);

    const result = {
        totalValue: 0,
        totalQty: 0,
        uniqueItems: [],
        uniqueParties: [],
        partiesValueMap: {},
        itemsQtyMap: {},
        dateCountMap: {},
        delCount: 0,
        aprCount: 0,
        agingBuckets: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
        tableRows: []
    };

    if (!data || !Array.isArray(data) || data.length === 0) return result;

    const uniqueItemsSet = new Set();
    const uniquePartiesSet = new Set();

    for (const row of data) {
        if (!row || typeof row !== 'object') continue;

        const orderNo = row['ORDER NO'] || '';
        const dateRaw = row['DATE'] || '';
        const pName = row['PARTY NAME'] || '';
        const iName = row['ITEM NAME'] || '';
        const qty = parseNum(row['BALANCE']);

        let rate = parseNum(row['RATE']);
        if (discountRate > 0) {
            rate = rate * (1 - discountRate);
        }
        const val = qty * rate;

        result.totalValue += val;
        result.totalQty += qty;
        if (iName) uniqueItemsSet.add(iName);
        if (pName) uniquePartiesSet.add(pName);

        if (pName) result.partiesValueMap[pName] = (result.partiesValueMap[pName] || 0) + val;
        if (iName) result.itemsQtyMap[iName] = (result.itemsQtyMap[iName] || 0) + qty;

        const upperOrder = String(orderNo).toUpperCase();
        if (upperOrder.startsWith('DEL')) result.delCount++;
        else if (upperOrder.startsWith('APR')) result.aprCount++;

        let diffDays = 0;
        const dateObj = parseDateFn(dateRaw);
        if (dateObj && !isNaN(dateObj.getTime()) && dateObj.getTime() !== 0) {
            const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
            result.dateCountMap[dateKey] = (result.dateCountMap[dateKey] || 0) + 1;

            const diffTime = Math.abs(refDate - dateObj);
            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 30) result.agingBuckets['0-30']++;
            else if (diffDays <= 60) result.agingBuckets['31-60']++;
            else if (diffDays <= 90) result.agingBuckets['61-90']++;
            else result.agingBuckets['90+']++;
        }

        result.tableRows.push({ orderNo, dateRaw, diffDays, pName, iName, qty, val });
    }

    result.uniqueItems = [...uniqueItemsSet];
    result.uniqueParties = [...uniquePartiesSet];
    return result;
}

function loadNextRowChunk() {
    const dataTableBody = document.getElementById('dataTableBody');
    if (!dataTableBody || loadedRowCount >= dashboardTableRows.length) return;
    
    const nextChunk = dashboardTableRows.slice(loadedRowCount, loadedRowCount + TABLE_CHUNK_SIZE);
    const fragment = document.createDocumentFragment();
    
    nextChunk.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600";
        
        tr.appendChild(createTableCell(item.orderNo, "px-4 py-3 font-medium text-gray-900 dark:text-white truncate", item.orderNo));
        tr.appendChild(createTableCell(item.dateRaw || 'N/A', "px-4 py-3"));
        tr.appendChild(createTableCell(String(item.diffDays), "px-4 py-3 text-red-500 font-semibold"));
        tr.appendChild(createTableCell(item.pName, "px-4 py-3 truncate", item.pName));
        tr.appendChild(createTableCell(item.iName, "px-4 py-3 truncate", item.iName));
        tr.appendChild(createTableCell(String(item.qty), "px-4 py-3 text-right"));
        tr.appendChild(createTableCell(`₹${item.val.toLocaleString('en-IN')}`, "px-4 py-3 text-right"));
        
        fragment.appendChild(tr);
    });
    
    dataTableBody.appendChild(fragment);
    loadedRowCount += nextChunk.length;
}

function updateDashboardUI(data, immediateCharts = false) {
    if (!data) return;
    const dataTableBody = document.getElementById('dataTableBody');
    const tableEmptyState = document.getElementById('tableEmptyState');
    const dashTotalValueDisplay = document.getElementById('dashTotalValueDisplay');
    const dashTotalQtyDisplay = document.getElementById('dashTotalQtyDisplay');
    const dashUniqueItemsDisplay = document.getElementById('dashUniqueItemsDisplay');
    const dashUniquePartiesDisplay = document.getElementById('dashUniquePartiesDisplay');

    const emptyState = document.getElementById('dashboardEmptyState');
    const dashSkeleton = document.getElementById('dashboardSkeletonState');
    const dashContent = document.getElementById('dashboardContent');

    if (emptyState) emptyState.classList.add('hidden');
    if (dashSkeleton) dashSkeleton.classList.add('hidden');
    if (dashContent) dashContent.classList.remove('hidden');
    
    let totalValue, totalQty;
    const uniqueItems = new Set();
    const uniqueParties = new Set();
    const partiesValueMap = {};
    const itemsQtyMap = {};
    const dateCountMap = {};
    let delCount, aprCount;
    
    const agingBuckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const today = new Date();
    today.setHours(0,0,0,0);

    dashboardTableRows = [];
    loadedRowCount = 0;
    if (dataTableBody) dataTableBody.innerHTML = '';

    if (data.length === 0) {
        if (tableEmptyState) tableEmptyState.classList.remove('hidden');
        if (typeof animateValue === 'function') {
            animateValue(dashTotalValueDisplay, 0, {
                format: (v) => v.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' })
            });
            animateValue(dashTotalQtyDisplay, 0);
            animateValue(dashUniqueItemsDisplay, 0);
            animateValue(dashUniquePartiesDisplay, 0);
        }
        if (immediateCharts) {
            debouncedRenderCharts.cancel();
            renderCharts([], [], [], [], 0, 0, agingBuckets);
        } else {
            debouncedRenderCharts([], [], [], [], 0, 0, agingBuckets);
        }
        return;
    }

    if (tableEmptyState) tableEmptyState.classList.add('hidden');

    const metrics = computeDashboardMetrics(data, currentDiscount, today);
    totalValue = metrics.totalValue;
    totalQty = metrics.totalQty;
    metrics.uniqueItems.forEach(i => uniqueItems.add(i));
    metrics.uniqueParties.forEach(p => uniqueParties.add(p));
    Object.assign(partiesValueMap, metrics.partiesValueMap);
    Object.assign(itemsQtyMap, metrics.itemsQtyMap);
    Object.assign(dateCountMap, metrics.dateCountMap);
    delCount = metrics.delCount;
    aprCount = metrics.aprCount;
    Object.assign(agingBuckets, metrics.agingBuckets);
    dashboardTableRows = metrics.tableRows;

    loadNextRowChunk();

    if (typeof animateValue === 'function') {
        animateValue(dashTotalValueDisplay, totalValue, {
            format: (v) => v.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' })
        });
        animateValue(dashTotalQtyDisplay, totalQty);
        animateValue(dashUniqueItemsDisplay, uniqueItems.size);
        animateValue(dashUniquePartiesDisplay, uniqueParties.size);
    }

    const sortedParties = Object.entries(partiesValueMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sortedItems = Object.entries(itemsQtyMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sortedDates = Object.keys(dateCountMap).sort();
    const trendData = sortedDates.map(d => dateCountMap[d]);
    const trendLabels = sortedDates.map(d => { const p = d.split('-'); return `${p[2]}-${p[1]}`; });

    if (immediateCharts) {
        debouncedRenderCharts.cancel();
        renderCharts(sortedParties, sortedItems, trendLabels, trendData, delCount, aprCount, agingBuckets);
    } else {
        debouncedRenderCharts(sortedParties, sortedItems, trendLabels, trendData, delCount, aprCount, agingBuckets);
    }
}

const debouncedRenderCharts = (typeof debounce === 'function' ? debounce : (fn) => fn)((sortedParties, sortedItems, trendLabels, trendData, delCount, aprCount, agingBuckets) => {
    renderCharts(sortedParties, sortedItems, trendLabels, trendData, delCount, aprCount, agingBuckets);
}, 350);

function renderCharts(parties, items, dates, trendCounts, delC, aprC, aging) {
    const elParties = document.getElementById('chartParties');
    const elItems = document.getElementById('chartItems');
    const elTrend = document.getElementById('chartTrend');
    const elDist = document.getElementById('chartDistribution');
    const elAging = document.getElementById('chartAging');

    if (!elParties || !elItems || !elTrend || !elDist || !elAging) return;
    if (typeof Chart === 'undefined') return;

    const ctxParties = elParties.getContext('2d');
    const ctxItems = elItems.getContext('2d');
    const ctxTrend = elTrend.getContext('2d');
    const ctxDist = elDist.getContext('2d');
    const ctxAging = elAging.getContext('2d'); 

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e5e7eb' : '#374151';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    // Themed tooltip shared by all charts
    const tooltipTheme = {
        backgroundColor: isDark ? 'rgba(23, 23, 33, 0.96)' : 'rgba(255, 255, 255, 0.98)',
        titleColor: textColor,
        bodyColor: textColor,
        borderColor: gridColor,
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        titleFont: { family: "'Segoe UI', Inter, sans-serif", weight: '600' },
        bodyFont: { family: "'Segoe UI', Inter, sans-serif" }
    };

    const partiesLabels = parties.map(d => d[0].substring(0, 15) + (d[0].length > 15 ? '...' : ''));
    const partiesData = parties.map(d => d[1]);
    fullPartyLabels = parties.map(d => d[0]);
    if (chartPartiesInstance) {
        chartPartiesInstance.data.labels = partiesLabels;
        chartPartiesInstance.data.datasets[0].data = partiesData;
        chartPartiesInstance.options.scales.y.ticks.color = textColor;
        chartPartiesInstance.options.scales.y.grid.color = gridColor;
        chartPartiesInstance.options.scales.x.ticks.color = textColor;
        chartPartiesInstance.update('none');
    } else {
        chartPartiesInstance = new Chart(ctxParties, {
            type: 'bar',
            data: {
                labels: partiesLabels,
                datasets: [{ label: 'Pending Value (₹)', data: partiesData, backgroundColor: 'rgba(34, 197, 94, 0.6)', borderColor: 'rgba(34, 197, 94, 1)', borderWidth: 1, borderRadius: 5, maxBarThickness: 34 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipTheme,
                        callbacks: {
                            label: (ctx) => ` ${fullPartyLabels[ctx.dataIndex] || ctx.label}: ₹${Number(ctx.parsed.y).toLocaleString('en-IN')}`
                        }
                    }
                },
                scales: { y: { ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { display: false } } }
            }
        });
    }

    const itemsLabels = items.map(d => d[0].substring(0, 15) + (d[0].length > 15 ? '...' : ''));
    const itemsData = items.map(d => d[1]);
    fullItemLabels = items.map(d => d[0]);
    if (chartItemsInstance) {
        chartItemsInstance.data.labels = itemsLabels;
        chartItemsInstance.data.datasets[0].data = itemsData;
        chartItemsInstance.options.scales.x.ticks.color = textColor;
        chartItemsInstance.options.scales.x.grid.color = gridColor;
        chartItemsInstance.options.scales.y.ticks.color = textColor;
        chartItemsInstance.update('none');
    } else {
        chartItemsInstance = new Chart(ctxItems, {
            type: 'bar',
            indexAxis: 'y',
            data: {
                labels: itemsLabels,
                datasets: [{ label: 'Qty', data: itemsData, backgroundColor: 'rgba(59, 130, 246, 0.6)', borderColor: 'rgba(59, 130, 246, 1)', borderWidth: 1, borderRadius: 5, maxBarThickness: 22 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipTheme,
                        callbacks: {
                            label: (ctx) => ` ${fullItemLabels[ctx.dataIndex] || ctx.label}: ${Number(ctx.parsed.x).toLocaleString('en-IN')} pcs`
                        }
                    }
                },
                scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { display: false } } }
            }
        });
    }

    if (chartTrendInstance) {
        chartTrendInstance.data.labels = dates;
        chartTrendInstance.data.datasets[0].data = trendCounts;
        chartTrendInstance.options.scales.y.ticks.color = textColor;
        chartTrendInstance.options.scales.y.grid.color = gridColor;
        chartTrendInstance.options.scales.x.ticks.color = textColor;
        chartTrendInstance.update('none');
    } else {
        // Gradient fade under the trend line
        const gradientFill = ctxTrend.createLinearGradient(0, 0, 0, elTrend.clientHeight || 180);
        gradientFill.addColorStop(0, 'rgba(168, 85, 247, 0.32)');
        gradientFill.addColorStop(1, 'rgba(168, 85, 247, 0.02)');
        chartTrendInstance = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{ label: 'Orders', data: trendCounts, borderColor: 'rgba(168, 85, 247, 1)', backgroundColor: gradientFill, fill: true, tension: 0.3, pointRadius: 3, pointHoverRadius: 5 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipTheme,
                        callbacks: {
                            label: (ctx) => ` ${Number(ctx.parsed.y).toLocaleString('en-IN')} orders`
                        }
                    }
                },
                scales: { y: { beginAtZero: true, ticks: { precision: 0, color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { display: false } } }
            }
        });
    }

    const totalOrdersCount = typeof finalDeduplicatedData !== 'undefined' && finalDeduplicatedData ? finalDeduplicatedData.length : 0;
    const distData = [delC, aprC, Math.max(0, totalOrdersCount - delC - aprC)];
    if (chartDistributionInstance) {
        chartDistributionInstance.data.datasets[0].data = distData;
        chartDistributionInstance.update('none');
    } else {
        chartDistributionInstance = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: ['DEL (Local)', 'APR (Outstation)', 'Other'],
                datasets: [{
                    data: distData,
                    backgroundColor: ['rgba(59, 130, 246, 0.7)', 'rgba(249, 115, 22, 0.7)', 'rgba(156, 163, 175, 0.5)'],
                    borderColor: ['rgba(59, 130, 246, 1)', 'rgba(249, 115, 22, 1)', 'rgba(156, 163, 175, 1)'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: { position: 'right', labels: { color: textColor } },
                    tooltip: {
                        ...tooltipTheme,
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0) || 1;
                                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                                return ` ${ctx.label}: ${Number(ctx.parsed).toLocaleString('en-IN')} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    const agingData = [aging['0-30'], aging['31-60'], aging['61-90'], aging['90+']];
    if (chartAgingInstance) {
        chartAgingInstance.data.datasets[0].data = agingData;
        chartAgingInstance.options.scales.y.ticks.color = textColor;
        chartAgingInstance.options.scales.y.grid.color = gridColor;
        chartAgingInstance.options.scales.x.ticks.color = textColor;
        chartAgingInstance.update('none');
    } else {
        chartAgingInstance = new Chart(ctxAging, {
            type: 'bar',
            data: {
                labels: ['0-30 Days', '31-60 Days', '61-90 Days', '90+ Days'],
                datasets: [{
                    label: 'Orders',
                    data: agingData,
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.6)',
                        'rgba(59, 130, 246, 0.6)',
                        'rgba(249, 115, 22, 0.6)',
                        'rgba(239, 68, 68, 0.6)'
                    ],
                    borderColor: [
                        'rgba(34, 197, 94, 1)',
                        'rgba(59, 130, 246, 1)',
                        'rgba(249, 115, 22, 1)',
                        'rgba(239, 68, 68, 1)'
                    ],
                    borderWidth: 1,
                    borderRadius: 5,
                    maxBarThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipTheme,
                        callbacks: {
                            label: (ctx) => ` ${Number(ctx.parsed.y).toLocaleString('en-IN')} orders`
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1, precision: 0 }, grid: { color: gridColor } },
                    x: { ticks: { color: textColor }, grid: { display: false } }
                }
            }
        });
    }
}

function setPriceMode(mode, customVal = null) {
    activePriceMode = mode;
    
    const btnMRP = document.getElementById('btnPriceMRP');
    const btn61 = document.getElementById('btnPrice61');
    const btn64 = document.getElementById('btnPrice64');
    const btnCustom = document.getElementById('btnPriceCustom');
    const customInput = document.getElementById('inputPriceCustom');
    
    const inactiveClass = "px-2.5 py-1 text-xs font-semibold rounded text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all";
    const activeClass = "px-2.5 py-1 text-xs font-semibold rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm transition-all";
    
    if (btnMRP) btnMRP.className = inactiveClass;
    if (btn61) btn61.className = inactiveClass;
    if (btn64) btn64.className = inactiveClass;
    if (btnCustom) btnCustom.className = inactiveClass;
    
    if (mode === 'MRP') {
        if (btnMRP) btnMRP.className = activeClass;
        if (customInput) customInput.classList.add('hidden');
        currentDiscount = 0;
    } else if (mode === '61') {
        if (btn61) btn61.className = activeClass;
        if (customInput) customInput.classList.add('hidden');
        currentDiscount = 0.61;
    } else if (mode === '64') {
        if (btn64) btn64.className = activeClass;
        if (customInput) customInput.classList.add('hidden');
        currentDiscount = 0.64;
    } else if (mode === 'custom') {
        if (btnCustom) btnCustom.className = activeClass;
        if (customInput) {
            customInput.classList.remove('hidden');
            if (customVal !== null) {
                customInput.value = customVal;
            } else if (!customInput.value) {
                customInput.value = '50';
            }
            const percent = parseFloat(customInput.value) || 0;
            currentDiscount = percent / 100;
        }
    }
    
    applyDashboardFilters(true);
}

/**
 * Re-colors all active chart instances after a light/dark theme switch.
 */
function updateChartsTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e5e7eb' : '#374151';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    const applyScales = (chart) => {
        if (!chart || !chart.options || !chart.options.scales) return;
        for (const axis of Object.values(chart.options.scales)) {
            if (axis.ticks) axis.ticks.color = textColor;
            if (axis.grid && axis.grid.color) axis.grid.color = gridColor;
        }
    };

    [chartPartiesInstance, chartItemsInstance, chartTrendInstance, chartDistributionInstance, chartAgingInstance].forEach(chart => {
        if (!chart) return;
        applyScales(chart);
        if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
            chart.options.plugins.legend.labels.color = textColor;
        }
        chart.update('none');
    });
}

function setupDiscountListeners() {
    const btnMRP = document.getElementById('btnPriceMRP');
    const btn61 = document.getElementById('btnPrice61');
    const btn64 = document.getElementById('btnPrice64');
    const btnCustom = document.getElementById('btnPriceCustom');
    const customInput = document.getElementById('inputPriceCustom');
    
    if (btnMRP) btnMRP.addEventListener('click', () => setPriceMode('MRP'));
    if (btn61) btn61.addEventListener('click', () => setPriceMode('61'));
    if (btn64) btn64.addEventListener('click', () => setPriceMode('64'));
    if (btnCustom) {
        btnCustom.addEventListener('click', () => {
            setPriceMode('custom');
            if (customInput) {
                customInput.focus();
                customInput.select();
            }
        });
    }
    if (customInput) {
        customInput.addEventListener('input', () => {
            if (activePriceMode !== 'custom') return;
            let val = parseFloat(customInput.value) || 0;
            if (val < 0) val = 0;
            if (val > 100) val = 100;
            currentDiscount = val / 100;
            applyDashboardFilters();
        });
    }
}

function initializeDashboard() {
    const searchInput = document.getElementById('searchInput');
    const filterAll = document.getElementById('filterAll');
    const filterDel = document.getElementById('filterDel');
    const filterApr = document.getElementById('filterApr');
    const dataTableContainer = document.getElementById('dataTableContainer');
    // Empty-state CTA: jump to the Process File view
    const dashGoProcessBtn = document.getElementById('dashGoProcessBtn');
    if (dashGoProcessBtn) {
        dashGoProcessBtn.addEventListener('click', () => {
            if (typeof switchMainView === 'function') switchMainView('process');
        });
    }

    if (searchInput) searchInput.addEventListener('input', (typeof debounce === 'function' ? debounce : (fn) => fn)(applyDashboardFilters, 150));
    if (filterAll) filterAll.addEventListener('click', () => setFilterType('ALL'));
    if (filterDel) filterDel.addEventListener('click', () => setFilterType('DEL'));
    if (filterApr) filterApr.addEventListener('click', () => setFilterType('APR'));

    if (dataTableContainer) {
        dataTableContainer.addEventListener('scroll', () => {
            if (dataTableContainer.scrollTop + dataTableContainer.clientHeight >= dataTableContainer.scrollHeight - 40) {
                loadNextRowChunk();
            }
        });
    }

    setupDiscountListeners();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        computeDashboardMetrics,
        setFilterType,
        applyDashboardFilters,
        loadNextRowChunk,
        updateDashboardUI,
        renderCharts,
        updateChartsTheme,
        setPriceMode,
        initializeDashboard
    };
}
