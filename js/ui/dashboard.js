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
let activeDrilldown = null; // { type: 'party'|'item'|'aging'|'type', value: string, label: string }

function setDrilldownFilter(type, value, label) {
    activeDrilldown = { type, value, label };
    const banner = document.getElementById('drilldownBanner');
    const labelEl = document.getElementById('drilldownLabel');
    if (banner && labelEl) {
        labelEl.textContent = label;
        banner.classList.remove('hidden');
    }
    applyDashboardFilters(false);
    const tableContainer = document.getElementById('dataTableContainer');
    if (tableContainer) {
        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (typeof showToast === 'function') {
        showToast(`Filtered by ${label}`, 'info', 1500);
    }
}

function clearDrilldownFilter() {
    activeDrilldown = null;
    const banner = document.getElementById('drilldownBanner');
    if (banner) banner.classList.add('hidden');
    applyDashboardFilters(false);
    if (typeof showToast === 'function') {
        showToast('Drill-down filter cleared', 'info', 1200);
    }
}

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

        let matchesDrilldown = true;
        if (activeDrilldown) {
            if (activeDrilldown.type === 'party') {
                matchesDrilldown = String(row['PARTY NAME'] || '').trim().toUpperCase() === String(activeDrilldown.value).trim().toUpperCase();
            } else if (activeDrilldown.type === 'item') {
                matchesDrilldown = String(row['ITEM NAME'] || '').trim().toUpperCase() === String(activeDrilldown.value).trim().toUpperCase();
            } else if (activeDrilldown.type === 'aging') {
                const parseDateFn = typeof parseDMY === 'function' ? parseDMY : (d) => new Date(d || 0);
                const refDate = new Date();
                refDate.setHours(0, 0, 0, 0);
                const dObj = parseDateFn(row['DATE'] || '');
                let diffDays = 0;
                if (dObj && !isNaN(dObj.getTime()) && dObj.getTime() !== 0) {
                    diffDays = Math.ceil(Math.abs(refDate - dObj) / (1000 * 60 * 60 * 24));
                }
                if (activeDrilldown.value === '0-30') matchesDrilldown = diffDays <= 30;
                else if (activeDrilldown.value === '31-60') matchesDrilldown = diffDays > 30 && diffDays <= 60;
                else if (activeDrilldown.value === '61-90') matchesDrilldown = diffDays > 60 && diffDays <= 90;
                else if (activeDrilldown.value === '90+') matchesDrilldown = diffDays > 90;
            } else if (activeDrilldown.type === 'type') {
                if (activeDrilldown.value === 'DEL') matchesDrilldown = row._isDel;
                else if (activeDrilldown.value === 'APR') matchesDrilldown = row._isApr;
            }
        }

        return matchesType && matchesSearch && matchesDrilldown;
    });
    updateDashboardUI(currentFilteredData, immediateCharts);
}

/**
 * Pure aggregation of deduplicated rows into dashboard metrics including Pareto classification.
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
        paretoParties: [],
        paretoSummary: {
            catACount: 0,
            catAVal: 0,
            catAPct: 0,
            catBCount: 0,
            catBVal: 0,
            catBPct: 0,
            catCCount: 0,
            catCVal: 0,
            catCPct: 0
        },
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

    // Pareto (80/20) Revenue Classification
    const sortedPartiesArray = Object.entries(result.partiesValueMap)
        .sort((a, b) => b[1] - a[1]);
    
    let runningVal = 0;
    let catACount = 0, catAVal = 0;
    let catBCount = 0, catBVal = 0;
    let catCCount = 0, catCVal = 0;

    for (let i = 0; i < sortedPartiesArray.length; i++) {
        const [pName, pVal] = sortedPartiesArray[i];
        runningVal += pVal;
        const pctOfTotal = result.totalValue > 0 ? (pVal / result.totalValue) * 100 : 0;
        const cumPct = result.totalValue > 0 ? (runningVal / result.totalValue) * 100 : 0;
        
        let category;
        if (cumPct <= 80 || i === 0) {
            category = 'A';
            catACount++;
            catAVal += pVal;
        } else if (cumPct <= 95) {
            category = 'B';
            catBCount++;
            catBVal += pVal;
        } else {
            category = 'C';
            catCCount++;
            catCVal += pVal;
        }

        result.paretoParties.push({
            name: pName,
            value: pVal,
            pctOfTotal,
            cumPct,
            category
        });
    }

    result.paretoSummary = {
        catACount,
        catAVal,
        catAPct: result.totalValue > 0 ? (catAVal / result.totalValue) * 100 : 0,
        catBCount,
        catBVal,
        catBPct: result.totalValue > 0 ? (catBVal / result.totalValue) * 100 : 0,
        catCCount,
        catCVal,
        catCPct: result.totalValue > 0 ? (catCVal / result.totalValue) * 100 : 0
    };

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
    const dashParetoDisplay = document.getElementById('dashParetoDisplay');

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
            if (dashParetoDisplay) dashParetoDisplay.textContent = '0 Parties';
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
    if (dashParetoDisplay) {
        const catA = metrics.paretoSummary?.catACount || 0;
        dashParetoDisplay.textContent = `${catA} Part${catA === 1 ? 'y' : 'ies'}`;
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
                onHover: (event, chartElement) => {
                    if (event.native && event.native.target) {
                        event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
                    }
                },
                onClick: (evt, elements) => {
                    if (elements && elements.length > 0) {
                        const index = elements[0].index;
                        const pName = fullPartyLabels[index] || parties[index]?.[0];
                        if (pName) setDrilldownFilter('party', pName, `Party: ${pName}`);
                    }
                },
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
                onHover: (event, chartElement) => {
                    if (event.native && event.native.target) {
                        event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
                    }
                },
                onClick: (evt, elements) => {
                    if (elements && elements.length > 0) {
                        const index = elements[0].index;
                        const iName = fullItemLabels[index] || items[index]?.[0];
                        if (iName) setDrilldownFilter('item', iName, `Item: ${iName}`);
                    }
                },
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
                onHover: (event, chartElement) => {
                    if (event.native && event.native.target) {
                        event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
                    }
                },
                onClick: (evt, elements) => {
                    if (elements && elements.length > 0) {
                        const index = elements[0].index;
                        const type = index === 0 ? 'DEL' : (index === 1 ? 'APR' : null);
                        if (type) setDrilldownFilter('type', type, `Order Type: ${type}`);
                    }
                },
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
                onHover: (event, chartElement) => {
                    if (event.native && event.native.target) {
                        event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
                    }
                },
                onClick: (evt, elements) => {
                    if (elements && elements.length > 0) {
                        const index = elements[0].index;
                        const bucketKeys = ['0-30', '31-60', '61-90', '90+'];
                        const bucket = bucketKeys[index];
                        if (bucket) setDrilldownFilter('aging', bucket, `Age: ${bucket} Days`);
                    }
                },
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

/**
 * Generates and downloads a multi-tab executive summary Excel workbook.
 */
async function exportExecutiveReport() {
    if (typeof finalDeduplicatedData === 'undefined' || !finalDeduplicatedData || finalDeduplicatedData.length === 0) {
        if (typeof showToast === 'function') showToast("No data to export. Please process a file first.", "warning");
        return;
    }

    const btn = document.getElementById('exportExecutiveReportBtn');
    const originalContent = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i><span>Generating...</span>`;
    }

    try {
        const metrics = computeDashboardMetrics(finalDeduplicatedData, currentDiscount, new Date());
        
        if (typeof ExcelJS === 'undefined') {
            throw new Error("ExcelJS engine is not loaded.");
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Prime Pending Pro";
        workbook.lastModifiedBy = "Prime Pending Pro";
        workbook.created = new Date();
        workbook.modified = new Date();

        // ----------------------------------------------------
        // SHEET 1: EXECUTIVE SUMMARY
        // ----------------------------------------------------
        const wsSummary = workbook.addWorksheet('Executive Summary', {
            views: [{ showGridLines: true }]
        });

        // Header Title
        wsSummary.mergeCells('A1:F1');
        const titleCell = wsSummary.getCell('A1');
        titleCell.value = 'PRIME PENDING PRO - EXECUTIVE ORDER SUMMARY';
        titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        wsSummary.getRow(1).height = 36;

        // Subtitle
        wsSummary.mergeCells('A2:F2');
        const subCell = wsSummary.getCell('A2');
        subCell.value = `Generated: ${new Date().toLocaleString()} | Valuation: ${activePriceMode === 'MRP' ? 'MRP (Gross)' : (currentDiscount * 100).toFixed(0) + '% Discounted'}`;
        subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF4B5563' } };
        subCell.alignment = { horizontal: 'center', vertical: 'middle' };
        wsSummary.getRow(2).height = 20;

        wsSummary.addRow([]); // Blank line

        // KPI Highlights Header
        const kpiHeaderRow = wsSummary.addRow(['KEY METRICS', 'VALUE']);
        kpiHeaderRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        kpiHeaderRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });

        const kpis = [
            ['Total Pending Value (₹)', metrics.totalValue],
            ['Total Pending Quantity (Pcs)', metrics.totalQty],
            ['Active Unique Parties', metrics.uniqueParties.length],
            ['Unique Pending Items', metrics.uniqueItems.length],
            ['Local Orders (DEL)', metrics.delCount],
            ['Outstation Orders (APR)', metrics.aprCount]
        ];

        kpis.forEach(([k, v], idx) => {
            const r = wsSummary.addRow([k, v]);
            r.getCell(1).font = { bold: true };
            if (idx === 0) {
                r.getCell(2).numFmt = '₹#,##0.00';
            } else if (idx === 1) {
                r.getCell(2).numFmt = '#,##0';
            }
            r.eachCell(cell => {
                cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
            });
        });

        wsSummary.addRow([]); // Blank line

        // Aging Breakdown Section
        const agingHeaderRow = wsSummary.addRow(['AGING BRACKET', 'ORDERS COUNT', 'EST. PERCENTAGE']);
        agingHeaderRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        agingHeaderRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });

        const totalOrders = finalDeduplicatedData.length || 1;
        const agingData = [
            ['0 - 30 Days (Fresh)', metrics.agingBuckets['0-30'], (metrics.agingBuckets['0-30'] / totalOrders)],
            ['31 - 60 Days (Aging)', metrics.agingBuckets['31-60'], (metrics.agingBuckets['31-60'] / totalOrders)],
            ['61 - 90 Days (Critical)', metrics.agingBuckets['61-90'], (metrics.agingBuckets['61-90'] / totalOrders)],
            ['90+ Days (Overdue)', metrics.agingBuckets['90+'], (metrics.agingBuckets['90+'] / totalOrders)]
        ];

        agingData.forEach(([bracket, count, pct]) => {
            const r = wsSummary.addRow([bracket, count, pct]);
            r.getCell(3).numFmt = '0.0%';
            r.eachCell(cell => {
                cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
            });
        });

        wsSummary.addRow([]); // Blank line

        // Pareto 80/20 Summary Section
        const paretoHeaderRow = wsSummary.addRow(['PARETO CATEGORY', 'PARTY COUNT', 'PENDING VALUE', '% OF TOTAL']);
        paretoHeaderRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        paretoHeaderRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });

        const paretoRows = [
            ['Category A (Top 80% Key Accounts)', metrics.paretoSummary.catACount, metrics.paretoSummary.catAVal, metrics.paretoSummary.catAPct / 100],
            ['Category B (Next 15% Steady Accounts)', metrics.paretoSummary.catBCount, metrics.paretoSummary.catBVal, metrics.paretoSummary.catBPct / 100],
            ['Category C (Remaining 5% Tail Accounts)', metrics.paretoSummary.catCCount, metrics.paretoSummary.catCVal, metrics.paretoSummary.catCPct / 100]
        ];

        paretoRows.forEach(([cat, count, val, pct]) => {
            const r = wsSummary.addRow([cat, count, val, pct]);
            r.getCell(3).numFmt = '₹#,##0.00';
            r.getCell(4).numFmt = '0.0%';
            r.eachCell(cell => {
                cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
            });
        });

        wsSummary.columns = [
            { width: 38 },
            { width: 22 },
            { width: 22 },
            { width: 18 },
            { width: 15 },
            { width: 15 }
        ];

        // ----------------------------------------------------
        // SHEET 2: PARETO & TOP PARTIES
        // ----------------------------------------------------
        const wsPareto = workbook.addWorksheet('Pareto & Top Parties', {
            views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }]
        });

        const pHeader = wsPareto.addRow(['Rank', 'Party Name', 'Pending Value (₹)', '% of Total', 'Cumulative %', 'Category (A/B/C)']);
        pHeader.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        pHeader.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        wsPareto.getRow(1).height = 26;

        metrics.paretoParties.forEach((p, idx) => {
            const r = wsPareto.addRow([
                idx + 1,
                p.name,
                p.value,
                p.pctOfTotal / 100,
                p.cumPct / 100,
                `Category ${p.category}`
            ]);

            r.getCell(1).alignment = { horizontal: 'center' };
            r.getCell(3).numFmt = '₹#,##0.00';
            r.getCell(4).numFmt = '0.0%';
            r.getCell(5).numFmt = '0.0%';
            r.getCell(6).alignment = { horizontal: 'center' };

            // Subtle category styling
            if (p.category === 'A') {
                r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
                r.getCell(6).font = { bold: true, color: { argb: 'FF166534' } };
            } else if (p.category === 'B') {
                r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
                r.getCell(6).font = { bold: true, color: { argb: 'FF1E40AF' } };
            }

            r.eachCell(cell => {
                cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
            });
        });

        wsPareto.columns = [
            { width: 8 },
            { width: 42 },
            { width: 22 },
            { width: 14 },
            { width: 16 },
            { width: 18 }
        ];

        // ----------------------------------------------------
        // SHEET 3: DETAILED ORDERS LIST
        // ----------------------------------------------------
        const wsOrders = workbook.addWorksheet('Pending Orders List', {
            views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }]
        });

        const oHeader = wsOrders.addRow(['Order No', 'Date', 'Age (Days)', 'Party Name', 'Item Name', 'Pending Qty', 'Rate (₹)', 'Pending Value (₹)']);
        oHeader.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        oHeader.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        wsOrders.getRow(1).height = 26;

        metrics.tableRows.forEach((item) => {
            const unitRate = item.qty > 0 ? (item.val / item.qty) : 0;
            const r = wsOrders.addRow([
                item.orderNo,
                item.dateRaw || '',
                item.diffDays,
                item.pName,
                item.iName,
                item.qty,
                unitRate,
                item.val
            ]);

            r.getCell(3).alignment = { horizontal: 'center' };
            r.getCell(6).numFmt = '#,##0';
            r.getCell(7).numFmt = '₹#,##0.00';
            r.getCell(8).numFmt = '₹#,##0.00';

            r.eachCell(cell => {
                cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
            });
        });

        wsOrders.columns = [
            { width: 18 },
            { width: 14 },
            { width: 12 },
            { width: 38 },
            { width: 38 },
            { width: 14 },
            { width: 14 },
            { width: 18 }
        ];

        // Save File
        const dateStr = new Date().toISOString().split('T')[0];
        const defaultFilename = `Executive_Pending_Summary_${dateStr}.xlsx`;
        const buffer = await workbook.xlsx.writeBuffer();

        if (window.electronAPI && typeof window.electronAPI.saveFile === 'function') {
            const result = await window.electronAPI.saveFile({
                title: 'Save Executive Summary Report',
                defaultPath: defaultFilename,
                filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
                data: Array.from(new Uint8Array(buffer))
            });

            if (result && result.success) {
                if (typeof showToast === 'function') {
                    showToast(`Executive Report exported successfully! 📊`, 'success');
                }
            }
        } else {
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (typeof showToast === 'function') {
                showToast(`Executive Report downloaded! 📊`, 'success');
            }
        }
    } catch (err) {
        console.error("Export Executive Report failed:", err);
        if (typeof showToast === 'function') {
            showToast(`Export failed: ${err.message}`, 'error');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
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
    const exportExecBtn = document.getElementById('exportExecutiveReportBtn');
    const clearDrilldownBtn = document.getElementById('clearDrilldownBtn');

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

    if (exportExecBtn) exportExecBtn.addEventListener('click', exportExecutiveReport);
    if (clearDrilldownBtn) clearDrilldownBtn.addEventListener('click', clearDrilldownFilter);

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
        setDrilldownFilter,
        clearDrilldownFilter,
        applyDashboardFilters,
        loadNextRowChunk,
        updateDashboardUI,
        renderCharts,
        updateChartsTheme,
        exportExecutiveReport,
        setPriceMode,
        initializeDashboard
    };
}

