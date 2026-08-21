/**
 * Prime-Pending-Pro Processing Pipeline Module
 * Coordinates end-to-end transformation, worker orchestration, fallback recovery, progress updates, and cancellation.
 */

let isProcessingActive = false;

/**
 * Executes full workbook transformation with automatic fallback.
 * @param {Object} params - Processing parameters
 * @param {Uint8Array} params.fileData - Raw file binary data
 * @param {Object} params.rules - Deduplication rules (excluded, latest, marka, fullyExcluded, partyMerges)
 * @param {boolean} params.enableExcelStyling - Whether to apply ExcelJS formatting
 * @param {Function} params.onProgress - Progress callback (percent, statusText)
 * @returns {Promise<Object>} Normalized transformation result
 */
async function processWorkbook(params) {
    const {
        fileData,
        rules = {},
        enableExcelStyling = true,
        onProgress
    } = params;

    isProcessingActive = true;

    const payload = {
        fileData,
        excludedParties: rules.excludedParties || [],
        deduplicateParties: rules.deduplicateParties || [],
        specialParties: rules.specialParties || [],
        partyMerges: rules.partyMerges || {},
        fullyExcludedParties: rules.fullyExcludedParties || [],
        enableExcelStyling
    };

    const reportProgress = (pct, msg) => {
        if (typeof onProgress === 'function') {
            onProgress(pct, msg);
        }
    };

    try {
        // 1. Attempt execution in background Web Worker
        if (typeof runWorkerProcessing === 'function' && typeof Worker !== 'undefined') {
            try {
                const result = await runWorkerProcessing(payload, {
                    onProgress: reportProgress
                });
                isProcessingActive = false;
                return result;
            } catch (workerErr) {
                console.warn("Worker processing failed, seamlessly switching to main-thread fallback:", workerErr);
            }
        }

        // 2. Main-thread fallback path
        if (typeof runFallbackProcessing === 'function') {
            const fallbackResult = await runFallbackProcessing(payload, {
                onProgress: reportProgress
            });
            isProcessingActive = false;
            return fallbackResult;
        }

        throw new Error("No available processing engine (Worker or Fallback) could be initialized.");
    } catch (pipelineErr) {
        isProcessingActive = false;
        throw pipelineErr;
    }
}

/**
 * Cancels any active processing task (terminates worker).
 */
function cancelProcessing() {
    isProcessingActive = false;
    if (typeof cancelActiveWorker === 'function') {
        cancelActiveWorker();
    }
}

/**
 * Returns whether processing is currently running.
 * @returns {boolean}
 */
function isProcessing() {
    return isProcessingActive;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        processWorkbook,
        cancelProcessing,
        isProcessing
    };
}
