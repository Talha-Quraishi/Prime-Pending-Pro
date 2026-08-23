/**
 * Prime-Pending-Pro Toast Notification System
 */

function showToast(message, type = "success", ttl = 4000) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    // Dedupe: rapid repeated actions refresh the existing toast instead of stacking duplicates
    const lastToast = toastContainer.lastElementChild;
    if (lastToast && lastToast._toastMsg === message && lastToast._toastType === type && ttl > 0) {
        clearTimeout(lastToast._toastTimer);
        lastToast._toastTimer = setTimeout(() => {
            if (lastToast.parentNode) lastToast.remove();
        }, ttl);
        return;
    }
    
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast._toastMsg = message;
    toast._toastType = type;
    
    const span = document.createElement("span");
    span.textContent = message;
    
    const btn = document.createElement("button");
    btn.className = "close";
    btn.textContent = "×";
    btn.setAttribute("aria-label", "Close notification");
    btn.onclick = () => {
        clearTimeout(toast._toastTimer);
        toast.remove();
    };
    
    toast.appendChild(span);
    toast.appendChild(btn);
    toastContainer.appendChild(toast);
    
    if (ttl > 0) {
        toast._toastTimer = setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, ttl);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showToast };
}
