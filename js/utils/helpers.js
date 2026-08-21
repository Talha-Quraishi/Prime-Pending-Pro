/**
 * Prime-Pending-Pro Helper Utilities
 * DOM helpers, safe clipboard, debounce, animations, IPC buffer conversion, and diagnostic logging.
 */

// Diagnostic Logging Buffer
const MAX_DIAGNOSTIC_LOGS = 200;
window._diagnosticLogs = window._diagnosticLogs || [];

(function setupDiagnosticLogging() {
    if (window._diagnosticLoggingInitialized) return;
    window._diagnosticLoggingInitialized = true;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    function pushLog(level, args) {
        const time = new Date().toISOString().substring(11, 19);
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        window._diagnosticLogs.push(`[${time}] [${level}] ${msg}`);
        if (window._diagnosticLogs.length > MAX_DIAGNOSTIC_LOGS) {
            window._diagnosticLogs.shift();
        }
    }

    console.log = function(...args) {
        pushLog('INFO', args);
        originalLog.apply(console, args);
    };
    console.warn = function(...args) {
        pushLog('WARN', args);
        originalWarn.apply(console, args);
    };
    console.error = function(...args) {
        pushLog('ERROR', args);
        originalError.apply(console, args);
    };
})();

/**
 * Safe clipboard copy with fallback
 */
async function safeCopyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            console.warn("navigator.clipboard failed, using fallback:", e);
        }
    }
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        document.body.removeChild(textArea);
        return false;
    }
}

/**
 * Debounce helper for high-frequency inputs
 */
function debounce(func, wait) {
    let timeout;
    const debounced = function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
    debounced.cancel = function() {
        clearTimeout(timeout);
    };
    return debounced;
}

/**
 * Numeric count-up animation helper using requestAnimationFrame
 */
function animateValue(element, target, options = {}) {
    if (!element) return;
    const duration = options.duration || 600;
    const format = options.format || ((val) => Math.floor(val).toLocaleString('en-IN'));
    
    let start = 0;
    if (element.textContent) {
        const numStr = element.textContent.replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(numStr);
        if (!isNaN(parsed)) start = parsed;
    }
    
    if (start === target) {
        element.textContent = format(target);
        return;
    }
    
    const currentAnimId = Symbol('animId');
    element._currentAnimId = currentAnimId;
    
    const startTime = performance.now();
    
    function update(currentTime) {
        if (element._currentAnimId !== currentAnimId) return;
        
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = progress * (2 - progress);
        const currentValue = start + (target - start) * easeProgress;
        element.textContent = format(currentValue);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = format(target);
        }
    }
    
    requestAnimationFrame(update);
}

/**
 * IPC Buffer converter (handles Uint8Array, ArrayBuffer, and Electron Buffer object serialization)
 */
function convertIpcBuffer(data) {
    if (!data) return null;
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
        return data;
    }
    if (data.type === 'Buffer' && Array.isArray(data.data)) {
        return new Uint8Array(data.data);
    }
    return data;
}

/**
 * Safe table cell DOM creator
 */
function createTableCell(text, className, title) {
    const td = document.createElement('td');
    if (className) td.className = className;
    if (title) td.title = title;
    td.textContent = text;
    return td;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        safeCopyToClipboard,
        debounce,
        animateValue,
        convertIpcBuffer,
        createTableCell
    };
}
