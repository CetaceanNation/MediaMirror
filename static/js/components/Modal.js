/**
 * Modal Component - Standardized modal dialogs
 * 
 * Usage:
 *   const modal = new Modal({
 *     title: 'Confirm Action',
 *     content: '<p>Are you sure?</p>',
 *     footer: '<button class="btn btn-primary" data-action="confirm">Yes</button>'
 *   });
 *   modal.show();
 *   
 *   // Or use static methods for common patterns
 *   Modal.confirm('Delete item?', 'This cannot be undone.')
 *     .then(confirmed => { if (confirmed) deleteItem(); });
 */

export class Modal {
    static _defaultOptions = {
        title: '',
        content: '',
        footer: '',
        size: '', // 'sm', 'lg', 'xl'
        backdrop: true,
        keyboard: true,
        focus: true,
    };

    constructor(options = {}) {
        this.options = { ...Modal._defaultOptions, ...options };
        this.$modal = $('#modalOverlay');
        this._resolvePromise = null;
        this._rejectPromise = null;

        if (this.$modal.length === 0) {
            throw new Error('Modal overlay element (#modalOverlay) not found in DOM');
        }

        this._bindEvents();
    }

    _bindEvents() {
        // Clean up on hide
        this.$modal.off('hidden.bs.modal.modal').on('hidden.bs.modal.modal', () => {
            this._cleanup();
            if (this._rejectPromise) {
                this._rejectPromise(new Error('Modal dismissed'));
            }
        });

        // Handle button actions
        this.$modal.off('click.modal', '[data-action]').on('click.modal', '[data-action]', (e) => {
            const action = $(e.currentTarget).data('action');
            this._handleAction(action, e.currentTarget);
        });

        // Enter key on focused button
        this.$modal.off('keydown.modal').on('keydown.modal', (e) => {
            if (e.key === 'Enter' && $(e.target).is('[data-action]')) {
                $(e.target).trigger('click');
            }
        });
    }

    _handleAction(action, button) {
        switch (action) {
            case 'confirm':
                this._resolvePromise(true);
                this.hide();
                break;
            case 'cancel':
            case 'close':
                this._resolvePromise(false);
                this.hide();
                break;
            default:
                // Custom action - resolve with action name
                this._resolvePromise(action);
                this.hide();
        }
    }

    _cleanup() {
        $('#modalTitle').text('');
        $('#modalContent').empty();
        $('#modalFooter').empty();
        this.$modal.off('.modal');
    }

    /**
     * Show the modal and return a promise
     * @returns {Promise<any>} Resolves with action result
     */
    show() {
        return new Promise((resolve, reject) => {
            this._resolvePromise = resolve;
            this._rejectPromise = reject;

            $('#modalTitle').text(this.options.title);
            $('#modalContent').html(this.options.content);
            $('#modalFooter').html(this.options.footer);

            // Apply size class
            this.$modal.find('.modal-dialog').removeClass('modal-sm modal-lg modal-xl');
            if (this.options.size) {
                this.$modal.find('.modal-dialog').addClass(`modal-${this.options.size}`);
            }

            this.$modal.modal({
                backdrop: this.options.backdrop,
                keyboard: this.options.keyboard,
                focus: this.options.focus,
            });
        });
    }

    /**
     * Hide the modal
     */
    hide() {
        this.$modal.modal('hide');
    }

    /**
     * Update modal content
     * @param {Object} options - New options
     */
    update(options) {
        this.options = { ...this.options, ...options };
        $('#modalTitle').text(this.options.title);
        $('#modalContent').html(this.options.content);
        $('#modalFooter').html(this.options.footer);
    }

    /**
     * Set content directly
     * @param {string|HTMLElement|jQuery} content 
     */
    setContent(content) {
        $('#modalContent').html(content);
    }

    /**
     * Set footer directly
     * @param {string|HTMLElement|jQuery} footer 
     */
    setFooter(footer) {
        $('#modalFooter').html(footer);
    }

    /**
     * Show a loading spinner in the modal
     */
    showSpinner() {
        $('#modalContent').html(`
            <div id="spinner">
                <div class="spinner-border">
                    <span class="sr-only">Loading...</span>
                </div>
            </div>
        `);
    }

    /**
     * Static method: Confirmation dialog
     * @param {string} title - Dialog title
     * @param {string} message - Confirmation message
     * @param {Object} options - Additional options
     * @returns {Promise<boolean>} True if confirmed
     */
    static confirm(title, message, options = {}) {
        const modal = new Modal({
            title,
            content: `<div class="alert alert-warning"><i class="fas fa-exclamation-triangle"></i> ${message}</div>`,
            footer: `
                <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
                <button type="button" class="btn btn-${options.danger ? 'danger' : 'primary'}" data-action="confirm">
                    ${options.confirmText || 'Confirm'}
                </button>
            `,
            ...options,
        });
        return modal.show();
    }

    /**
     * Static method: Alert dialog
     * @param {string} title - Dialog title
     * @param {string} message - Alert message
     * @param {Object} options - Additional options
     * @returns {Promise<void>}
     */
    static alert(title, message, options = {}) {
        const modal = new Modal({
            title,
            content: `<div class="alert alert-info">${message}</div>`,
            footer: `<button type="button" class="btn btn-primary" data-action="close">${options.okText || 'OK'}</button>`,
            ...options,
        });
        return modal.show();
    }

    /**
     * Static method: Prompt dialog
     * @param {string} title - Dialog title
     * @param {string} message - Prompt message
     * @param {string} defaultValue - Default input value
     * @param {Object} options - Additional options
     * @returns {Promise<string|null>} Input value or null if cancelled
     */
    static prompt(title, message, defaultValue = '', options = {}) {
        const inputId = `modal-prompt-${Date.now()}`;
        const modal = new Modal({
            title,
            content: `
                <p>${message}</p>
                <input type="${options.type || 'text'}" id="${inputId}" class="form-input form-control" value="${defaultValue}">
            `,
            footer: `
                <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
                <button type="button" class="btn btn-primary" data-action="confirm">OK</button>
            `,
            ...options,
        });

        return modal.show().then(result => {
            if (result === true) {
                return $(`#${inputId}`).val();
            }
            return null;
        });
    }

    /**
     * Static method: Form modal with custom content
     * @param {string} title - Dialog title
     * @param {string} contentHtml - Form HTML
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Form data or null if cancelled
     */
    static form(title, contentHtml, options = {}) {
        const modal = new Modal({
            title,
            content: contentHtml,
            footer: `
                <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
                <button type="button" class="btn btn-primary" data-action="submit">${options.submitText || 'Submit'}</button>
            `,
            size: options.size || 'lg',
            ...options,
        });

        return modal.show().then(result => {
            if (result === true || result === 'submit') {
                // Collect form data
                const formData = {};
                $('#modalContent input, #modalContent select, #modalContent textarea').each(function () {
                    const $el = $(this);
                    if ($el.attr('name')) {
                        formData[$el.attr('name')] = $el.val();
                    }
                });
                return formData;
            }
            return null;
        });
    }
}

/**
 * Backward compatibility function
 * @param {string} title 
 * @param {string} contentHtml 
 * @param {string} footerHtml 
 */
export function displayModal(title, contentHtml, footerHtml) {
    const modal = new Modal({ title, content: contentHtml, footer: footerHtml });
    return modal.show();
}

/**
 * Backward compatibility function
 */
export function closeModal() {
    $('#modalOverlay').modal('hide');
}