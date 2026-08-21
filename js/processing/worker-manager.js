/**
 * Prime-Pending-Pro Web Worker Manager Module
 * Manages background Web Worker lifecycle, message passing, progress dispatch, error handling, and termination.
 */

let activeWorkerInstance = null;

/**
 * Runs the Excel transformation in a background Web Worker.
 * @param {Object} payload - Processing configuration and file data
 * @param {Object} options - Callbacks for progress, status, and abort signals
 * @returns {Promise<Object>} Processed result containing originalJson, transformed, finalDeduplicated, and wbout
 */
function runWorkerProcessing(payload, options = {}) {
    const { onProgress, onStatus } = options;

    return new Promise((resolve, reject) => {
        try {
            // Terminate any stale existing worker
            cancelActiveWorker();

            const worker = new Worker('js/worker.js');
            activeWorkerInstance = worker;

            worker.onmessage = function(event) {
                const result = event.data;
                if (!result) return;

                if (result.action === 'status') {
                    if (typeof onProgress === 'function') {
                        onProgress(result.progress, result.message);
                    }
                    if (typeof onStatus === 'function') {
                        onStatus(result);
                    }
                    return;
                }

                // Process finished, cleanup
                cancelActiveWorker();

                if (result.success) {
                    resolve(result);
                } else {
                    reject(new Error(result.error || "Unknown worker processing failure"));
                }
            };

            worker.onerror = function(err) {
                cancelActiveWorker();
                reject(err instanceof Error ? err : new Error(err.message || "Worker crashed unexpectedly"));
            };

            // Pass cloned binary buffer so main thread data is never detached
            const clonedPayload = { ...payload };
            if (payload.fileData instanceof Uint8Array) {
                clonedPayload.fileData = payload.fileData.slice(0);
            }
            worker.postMessage(clonedPayload);
        } catch (err) {
            cancelActiveWorker();
            reject(err);
        }
    });
}

/**
 * Terminates the currently active worker if one is running.
 */
function cancelActiveWorker() {
    if (activeWorkerInstance) {
        try {
            activeWorkerInstance.terminate();
        } catch (e) {
            console.warn("Error terminating worker:", e);
        }
        activeWorkerInstance = null;
    }
}

/**
 * Checks if a worker task is actively running.
 * @returns {boolean}
 */
function isWorkerActive() {
    return activeWorkerInstance !== null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runWorkerProcessing,
        cancelActiveWorker,
        isWorkerActive
    };
}
