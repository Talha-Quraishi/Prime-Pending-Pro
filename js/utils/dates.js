/**
 * Prime-Pending-Pro Date Utilities
 */

/**
 * Format Date object as YYYY-MM-DD local string
 */
function getLocalDateString(dateObj) {
    if (!dateObj || dateObj.getTime() === 0) return '';
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getLocalDateString
    };
}
