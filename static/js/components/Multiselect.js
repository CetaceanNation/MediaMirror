/**
 * Multiselect Component - Reusable dropdown with checkboxes/radios
 * 
 * Usage:
 *   const multiselect = new Multiselect('#elementId', {
 *     placeholder: 'Select options',
 *     exclusive: false,
 *     options: ['Option 1', 'Option 2'],
 *     onChange: (selected) => console.log(selected)
 *   });
 */

export class Multiselect {
    /**
     * @param {string|HTMLElement|jQuery} element - Container element or selector
     * @param {Object} options - Configuration options
     * @param {string} options.placeholder - Placeholder text
     * @param {boolean} options.exclusive - Single selection (radio) vs multiple (checkbox)
     * @param {string[]} options.options - Initial options array
     * @param {Function} options.onChange - Callback when selection changes
     * @param {string[]} options.initialValue - Pre-selected values
     */
    constructor(element, options = {}) {
        this.$container = $(element);
        if (this.$container.length === 0) {
            throw new Error(`Multiselect container not found: ${element}`);
        }

        this.placeholder = options.placeholder || 'Select...';
        this.exclusive = options.exclusive === true;
        this.onChange = options.onChange || (() => { });
        this.options = new Set(options.options || []);
        this.selected = new Set(options.initialValue || []);

        this._render();
        this._bindEvents();

        if (options.initialValue) {
            this.setValue(options.initialValue);
        }
    }

    _render() {
        this.$container.addClass('multiselect').empty();

        const html = `
            <button class="multiselect-head" title="${this.placeholder} select" type="button">
                <div>
                    <label data-text="${this.placeholder}">${this.placeholder}</label>
                    <i class="fas fa-chevron-down"></i>
                </div>
            </button>
            <div class="multiselect-opts"></div>
        `;

        this.$container.html(html);
        this.$head = this.$container.find('.multiselect-head');
        this.$opts = this.$container.find('.multiselect-opts');
        this.$label = this.$head.find('label');

        this._renderOptions();
    }

    _renderOptions() {
        this.$opts.empty();
        this.options.forEach(opt => {
            const isSelected = this.selected.has(opt);
            const inputType = this.exclusive ? 'radio' : 'checkbox';
            const $label = $(`
                <label>
                    <input type="${inputType}" value="${this._escapeHtml(opt)}" ${isSelected ? 'checked' : ''}>
                    ${this._escapeHtml(opt)}
                </label>
            `);
            this.$opts.append($label);
        });
    }

    _bindEvents() {
        // Toggle dropdown
        this.$head.on('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Option selection
        this.$opts.on('change', 'input', (e) => {
            this._handleSelectionChange(e.target);
        });

        // Close on outside click
        $(document).on('click.multiselect', (e) => {
            if (!this.$container.is(e.target) && this.$container.has(e.target).length === 0) {
                this.close();
            }
        });

        // Keyboard support
        this.$container.on('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === 'Enter' || e.key === ' ') {
                if (e.target === this.$head[0]) {
                    e.preventDefault();
                    this.toggle();
                }
            }
        });
    }

    _handleSelectionChange(input) {
        const value = input.value;

        if (this.exclusive) {
            // Radio behavior - only one selected
            this.selected.clear();
            if (input.checked) {
                this.selected.add(value);
            }
            // Uncheck all other radios
            this.$opts.find('input').not(input).prop('checked', false);
        } else {
            // Checkbox behavior - toggle
            if (input.checked) {
                this.selected.add(value);
            } else {
                this.selected.delete(value);
            }
        }

        this._updateDisplay();
        this.onChange(Array.from(this.selected));
    }

    _updateDisplay() {
        const selectedArray = Array.from(this.selected);

        if (selectedArray.length > 0) {
            this.$head.addClass('active');
            this.$label.text(selectedArray.join(', '));
        } else {
            this.$head.removeClass('active');
            this.$label.text(this.$label.data('text'));
        }
    }

    /**
     * Add new options
     * @param {string|string[]} newOptions - Option(s) to add
     */
    addOptions(newOptions) {
        const optionsArray = Array.isArray(newOptions) ? newOptions : [newOptions];
        let changed = false;

        optionsArray.forEach(opt => {
            if (!this.options.has(opt)) {
                this.options.add(opt);
                changed = true;
            }
        });

        if (changed) {
            this._renderOptions();
        }
    }

    /**
     * Remove options
     * @param {string|string[]} optionsToRemove - Option(s) to remove
     */
    removeOptions(optionsToRemove) {
        const removeArray = Array.isArray(optionsToRemove) ? optionsToRemove : [optionsToRemove];
        let changed = false;

        removeArray.forEach(opt => {
            if (this.options.delete(opt)) {
                this.selected.delete(opt);
                changed = true;
            }
        });

        if (changed) {
            this._renderOptions();
            this._updateDisplay();
        }
    }

    /**
     * Get current selected values
     * @returns {string[]}
     */
    getValue() {
        return Array.from(this.selected);
    }

    /**
     * Set selected values
     * @param {string|string[]} values - Value(s) to select
     */
    setValue(values) {
        const valueArray = Array.isArray(values) ? values : [values];
        this.selected.clear();
        valueArray.forEach(v => {
            if (this.options.has(v)) {
                this.selected.add(v);
            }
        });
        this._updateDisplay();
        this.$opts.find('input').each(function (i, checkbox) {
            checkbox = $(checkbox);
            checkbox.prop('checked', this.selected.has(checkbox.val()));
        }.bind(this));
    }

    /**
     * Clear all selections
     */
    clear() {
        this.selected.clear();
        this.$opts.find('input').prop('checked', false);
        this._updateDisplay();
    }

    /**
     * Open the dropdown
     */
    open() {
        $('.multiselect-opts').hide();
        this.$head.addClass('focus');
        this.$opts.fadeIn(50);
    }

    /**
     * Close the dropdown
     */
    close() {
        this.$head.removeClass('focus');
        this.$opts.fadeOut(50);
    }

    /**
     * Toggle dropdown visibility
     */
    toggle() {
        if (this.$opts.is(':visible')) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Destroy the component and clean up event listeners
     */
    destroy() {
        $(document).off('click.multiselect');
        this.$container.removeClass('multiselect').empty();
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

/**
 * Factory function for creating multiselects (backward compatibility)
 * @param {string} elementId - Element ID
 * @param {string} defaultText - Placeholder text
 * @param {boolean} exclusive - Single select mode
 * @param {Function|string} updateFunction - Callback or function name string
 * @param {string[]} initialData - Initial options
 * @returns {Multiselect}
 */
export function createMultiselect(elementId, defaultText, exclusive, updateFunction, initialOptions = [], initialValue = []) {
    const callback = typeof updateFunction === 'function' ? updateFunction :
        (updateFunction ? window[updateFunction] : null);

    return new Multiselect(`#${elementId}`, {
        placeholder: defaultText,
        exclusive,
        options: initialOptions,
        onChange: callback,
        initialValue: initialValue
    });
}