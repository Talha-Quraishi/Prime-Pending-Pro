/**
 * Prime-Pending-Pro Styled Modal Dialog System
 * Promise-based confirm dialogs that match the app's glassmorphism design,
 * replacing jarring native window.confirm() popups.
 */

/**
 * Shows an in-app styled confirmation dialog.
 * @param {Object} options
 * @param {string} [options.title] - Dialog heading
 * @param {string} [options.message] - Body text (newlines preserved)
 * @param {string} [options.confirmLabel] - Confirm button text
 * @param {string} [options.cancelLabel] - Cancel button text
 * @param {boolean} [options.danger] - Renders the confirm button in destructive red
 * @returns {Promise<boolean>} Resolves true on confirm, false on cancel/dismiss
 */
function showConfirmDialog(options = {}) {
    return new Promise((resolve) => {
        const {
            title = 'Are you sure?',
            message = '',
            confirmLabel = 'Confirm',
            cancelLabel = 'Cancel',
            danger = false
        } = options;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const card = document.createElement('div');
        card.className = 'ms-card modal-card springy-hover p-5 max-w-sm w-full flex flex-col gap-3 scale-95 opacity-0 transition-all duration-150';

        const heading = document.createElement('h3');
        heading.className = 'text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider';
        heading.textContent = title;

        const body = document.createElement('p');
        body.className = 'text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line leading-relaxed';
        if (message) body.textContent = message;

        const buttonRow = document.createElement('div');
        buttonRow.className = 'grid grid-cols-2 gap-3 mt-1';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'py-2 rounded font-semibold text-xs bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-800 dark:text-gray-200 border border-gray-200/50 dark:border-gray-800/50 transition-all focus:outline-none';
        cancelBtn.textContent = cancelLabel;

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = danger
            ? 'modal-btn-confirm-danger py-2 rounded font-bold text-xs bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all focus:outline-none'
            : 'modal-btn-confirm-primary py-2 rounded font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all focus:outline-none';
        confirmBtn.textContent = confirmLabel;

        buttonRow.appendChild(cancelBtn);
        buttonRow.appendChild(confirmBtn);
        card.appendChild(heading);
        if (message) card.appendChild(body);
        card.appendChild(buttonRow);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function close(result) {
            document.removeEventListener('keydown', onKeydown, true);
            card.classList.add('scale-95', 'opacity-0');
            setTimeout(() => overlay.remove(), 130);
            resolve(result);
        }

        function onKeydown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close(false);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                close(true);
            }
        }

        cancelBtn.addEventListener('click', () => close(false));
        confirmBtn.addEventListener('click', () => close(true));
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) close(false);
        });
        document.addEventListener('keydown', onKeydown, true);

        // Animate in, then hand focus to the primary action
        requestAnimationFrame(() => {
            card.classList.remove('scale-95', 'opacity-0');
            confirmBtn.focus();
        });
    });
}

if (typeof self !== 'undefined') {
    self.showConfirmDialog = showConfirmDialog;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showConfirmDialog };
}
