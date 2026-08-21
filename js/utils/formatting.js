/**
 * Prime-Pending-Pro Number and Text Formatting Utilities
 */

/**
 * Format number as Indian Currency (₹ 1,23,456.78)
 */
function formatIndianCurrency(val) {
    const num = typeof val === 'number' ? val : (parseFloat(String(val).replace(/,/g, '')) || 0);
    return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

/**
 * Format number with Indian numbering system
 */
function formatIndianNumber(val) {
    const num = typeof val === 'number' ? val : (parseFloat(String(val).replace(/,/g, '')) || 0);
    return num.toLocaleString('en-IN');
}

/**
 * Format bytes to readable size (e.g. 120.5 KB, 2.4 MB)
 */
function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    const mb = kb / 1024;
    return mb.toFixed(2) + ' MB';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatIndianCurrency,
        formatIndianNumber,
        formatFileSize
    };
}
