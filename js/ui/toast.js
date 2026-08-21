/**
 * Prime-Pending-Pro Toast Notification System
 */

function showToast(message, type = "success", ttl = 4000) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    const span = document.createElement("span");
    span.textContent = message;
    
    const btn = document.createElement("button");
    btn.className = "close";
    btn.textContent = "×";
    btn.setAttribute("aria-label", "Close notification");
    btn.onclick = () => toast.remove();
    
    toast.appendChild(span);
    toast.appendChild(btn);
    toastContainer.appendChild(toast);
    
    if (ttl > 0) {
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, ttl);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showToast };
}
