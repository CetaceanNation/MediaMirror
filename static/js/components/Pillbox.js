/**
 * Pillbox Component - Tag/token input with validation
 * 
 * Usage:
 *   const pillbox = new Pillbox('#elementId', {
 *     editable: true,
 *     validValues: ['option1', 'option2'],
 *     validValuesMap: { 'key': 'description' },
 *     onAdd: async (value) => { await apiCall(value); return true; },
 *     onRemove: async (value) => { await apiCall(value); return true; },
 *     onUpdate: (pillbox) => { console.log('Updated:', pillbox.getValues()); },
 *     onClick: (value) => { console.log('Clicked:', value); }
 *   });
 */

export class Pillbox {
    /**
     * @param {string|HTMLElement|jQuery} element - Container element or selector
     * @param {Object} options - Configuration options
     * @param {boolean} options.editable - Allow adding/removing values
     * @param {string[]} options.validValues - Array of valid values (optional)
     * @param {Object} options.validValuesMap - Object mapping values to descriptions (optional)
     * @param {Function} options.onAdd - Async function(value) returning boolean
     * @param {Function} options.onRemove - Async function(value) returning boolean
     * @param {Function} options.onUpdate - Function(pillbox) called after changes
     * @param {Function} options.onClick - Function(value) called on pill click
     * @param {string[]} options.initialEditable - Initial editable values
     * @param {string[]} options.initialImmutable - Initial immutable values
     */
    constructor(element, options = {}) {
        this.$container = $(element);
        if (this.$container.length === 0) {
            throw new Error(`Pillbox container not found: ${element}`);
        }

        this.editable = options.editable === true;
        this.validValues = options.validValues || null;
        this.validValuesMap = options.validValuesMap || null;
        this.onAdd = options.onAdd || null;
        this.onRemove = options.onRemove || null;
        this.onUpdate = options.onUpdate || null;
        this.onClick = options.onClick || null;

        this.values = {
            editable: new Set(options.initialEditable || []),
            immutable: new Set(options.initialImmutable || []),
        };

        this._render();
        this._bindEvents();
        this._updateDisplay();
    }

    _render() {
        this.$container.addClass('pillbox').html(`
            <div class="pillbox-items"></div>
            <div class="pillbox-controls"></div>
        `);

        this.$items = this.$container.find('.pillbox-items');
        this.$controls = this.$container.find('.pillbox-controls');

        if (this.editable) {
            this.$controls.append(`
                <span class="pillbox-input color-hoverable">
                    <button class="pillbox-input-toggle icon-btn" title="Add value" type="button">
                        <i class="fas fa-plus"></i>
                    </button>
                </span>
            `);
            this.$inputWrapper = this.$controls.find('.pillbox-input');
            this.$toggleBtn = this.$inputWrapper.find('.pillbox-input-toggle');
        }
    }

    _bindEvents() {
        if (!this.editable) return;

        // Toggle input expansion
        this.$toggleBtn.on('click', (e) => {
            e.stopPropagation();
            this._expandInput();
        });

        // Handle input submission
        this.$container.on('click', '.pillbox-input-submit', (e) => {
            e.stopPropagation();
            this._submitInput();
        });

        // Handle input keypress
        this.$container.on('keypress', '.pillbox-input input', (e) => {
            if (e.which === 13) {
                e.preventDefault();
                this._submitInput();
            }
        });

        // Handle input focus/typing for autocomplete
        this.$container.on('focus input', '.pillbox-input input', (e) => {
            this._updateAutocomplete($(e.target));
        });

        // Handle autocomplete selection
        this.$container.on('click', '.pillbox-input-opts label', (e) => {
            e.stopPropagation();
            const value = $(e.currentTarget).data('val');
            this.$inputWrapper.find('input').val(value).trigger('input');
            this.$inputWrapper.find('.pillbox-input-submit').trigger('focus');
        });

        // Handle pill removal
        this.$container.on('click', '.pillbox-item.editable button', async (e) => {
            e.stopPropagation();
            const $pill = $(e.currentTarget).closest('.pillbox-item');
            $pill.popover('dispose');
            const value = $pill.data('val');
            await this.removeValue(value);
        });

        // Handle pill click
        if (this.onClick) {
            this.$container.on('click', '.pillbox-item', (e) => {
                if (!$(e.target).is('button')) {
                    const value = $(e.currentTarget).data('val');
                    this.onClick(value);
                }
            });
        }
    }

    _expandInput() {
        this.$toggleBtn
            .prop('disabled', true)
            .attr('title', 'Cancel')
            .off('click')
            .on('click', (e) => {
                e.stopPropagation();
                this._collapseInput();
            });

        this.$inputWrapper.addClass('expanded').removeClass('color-hoverable');
        this.$controls.css('padding', '0');

        this.$inputWrapper.prepend(`
            <input type="text" style="display: none">
            <button class="pillbox-input-submit icon-btn" title="Submit" type="button">
                <i class="fas fa-check"></i>
            </button>
        `);

        const $input = this.$inputWrapper.find('input');
        $input.css({ 'max-width': '50%', 'min-width': '50%' });
        $input.fadeIn(300, () => $input.trigger('focus'));

        setTimeout(() => {
            this.$toggleBtn.prop('disabled', false);
        }, 500);
    }

    _collapseInput() {
        this.$toggleBtn
            .prop('disabled', true)
            .attr('title', 'Add value')
            .off('click')
            .on('click', (e) => {
                e.stopPropagation();
                this._expandInput();
            });

        this.$inputWrapper.removeClass('expanded').addClass('color-hoverable');
        this.$controls.css('padding', '');

        const $toRemove = this.$inputWrapper.find('input, .pillbox-input-submit, .pillbox-input-opts');
        $toRemove.css('margin-right', '-1rem');
        $toRemove.fadeOut(500, () => {
            $toRemove.remove();
            this.$toggleBtn.prop('disabled', false).trigger('focus');
        });
    }

    _updateAutocomplete($input) {
        const val = $input.val().trim();
        const existingValues = [...this.values.editable, ...this.values.immutable];
        const validOptions = this._getValidOptions();

        clearTimeout(this._autocompleteTimeout);
        this._autocompleteTimeout = setTimeout(() => {
            let $opts = this.$inputWrapper.find('.pillbox-input-opts');
            if ($opts.length === 0) {
                $opts = $('<div class="pillbox-input-opts" tabindex="-1"></div>');
                $input.after($opts);
            }

            $opts.empty();
            let hasMatches = false;

            validOptions.forEach(opt => {
                if (existingValues.includes(opt)) return;
                if (val.length === 0 || opt.toLowerCase().includes(val.toLowerCase())) {
                    const description = this.validValuesMap ? this.validValuesMap[opt] : null;
                    const $label = $(`<label data-val="${this._escapeHtml(opt)}" tabindex="0">
                        ${this._escapeHtml(opt)}
                        ${description ? `<p>${this._escapeHtml(description)}</p>` : ''}
                    </label>`);
                    $opts.append($label);
                    hasMatches = true;
                }
            });

            if (hasMatches) {
                $opts.fadeIn(300);
            } else {
                $opts.fadeOut(300);
            }
        }, 200);
    }

    _getValidOptions() {
        if (Array.isArray(this.validValues)) {
            return this.validValues;
        } else if (this.validValuesMap && typeof this.validValuesMap === 'object') {
            return Object.keys(this.validValuesMap);
        }
        return [];
    }

    async _submitInput() {
        const $input = this.$inputWrapper.find('input');
        const value = $input.val().trim();

        if (!value) {
            this._showError($input);
            return;
        }

        if (this.values.editable.has(value)) {
            sendToast('Error', `Value "${value}" already exists.`, 5, 'var(--error-cancel)', 'fa-times');
            this._showError($input);
            return;
        }

        // Validate against allowed values
        const validOptions = this._getValidOptions();
        if (validOptions.length > 0 && !validOptions.includes(value)) {
            sendToast('Error', `Value "${value}" is not valid.`, 5, 'var(--error-cancel)', 'fa-times');
            this._showError($input);
            return;
        }

        $input.prop('disabled', true);

        try {
            // Add to local state
            this.values.editable.add(value);
            this._updateDisplay();

            // Callback if provided
            if (this.onAdd) {
                await this.onAdd(this, value);
            }

            this._collapseInput();
        } catch (error) {
            this.values.editable.delete(value);
            this._updateDisplay();
            sendToast('Error', `Could not add "${value}": ${error.message}`, 5, 'var(--error-cancel)', 'fa-times');
            this._showError($input);
        } finally {
            $input.prop('disabled', false).trigger('focus');
        }
    }

    _showError($inputWrapper) {
        $inputWrapper.addClass('bad-value');
        setTimeout(() => $inputWrapper.removeClass('bad-value'), 500);
    }

    async removeValue(value) {
        if (!this.values.editable.has(value)) {
            sendToast('Error', `Can't find value "${value}" to remove`, 5, 'var(--error-cancel)', 'fa-times');
            return;
        }

        try {
            // Callback if provided
            if (this.onRemove) {
                await this.onRemove(this, value);
            }

            // Remove from local state
            this.values.editable.delete(value);
            this._updateDisplay();
        } catch (error) {
            // Re-add on failure
            this.values.editable.add(value);
            this._updateDisplay();
            sendToast('Error', `Could not remove "${value}": ${error.message}`, 5, 'var(--error-cancel)', 'fa-times');
        }
    }

    _updateDisplay() {
        this.$items.find('.pillbox-item').remove();

        // Render editable pills (newest first)
        [...this.values.editable].reverse().forEach(value => {
            const $pill = $(`
                <span class="pillbox-item badge rounded-pill editable" data-val="${this._escapeHtml(value)}" tabindex="0">
                    ${this._escapeHtml(value)}
                    <button class="icon-btn" title="Remove ${this._escapeHtml(value)}" type="button" style="margin-left: 0.2rem">
                        <i class="fas fa-times"></i>
                    </button>
                </span>
            `);
            this.$items.prepend($pill);
        });

        // Render immutable pills
        [...this.values.immutable].reverse().forEach(value => {
            const $pill = $(`
                <span class="pillbox-item badge rounded-pill immutable" data-val="${this._escapeHtml(value)}" tabindex="0">
                    ${this._escapeHtml(value)}
                </span>
            `);
            this.$items.prepend($pill);
        });

        // Add popovers for values
        this._addPopovers();

        // Call update callback
        if (this.onUpdate) {
            this.onUpdate(this);
        }
    }

    _closeAutocomplete() {
        this.$inputWrapper.find('.pillbox-input-opts').fadeOut(300);
    }

    /**
     * Add values programmatically
     * @param {string|string[]} values - Value(s) to add
     * @param {boolean} editable - Whether values are editable
     */
    addValues(values, editable = true) {
        const valueArray = Array.isArray(values) ? values : [values];
        const key = editable ? 'editable' : 'immutable';

        valueArray.forEach(v => {
            if (this.values[key].has(v)) {
                throw new Error(`Value "${v}" already exists.`);
            }

            const validOptions = this._getValidOptions();
            if (validOptions.length > 0 && !validOptions.includes(v)) {
                throw new Error(`Submitted value "${v}" was not valid for this field.`);
            }

            this.values[key].add(v);
        });

        this._updateDisplay();
    }

    /**
     * Remove values programmatically
     * @param {string|string[]} values - Value(s) to remove
     */
    removeValues(values) {
        const valueArray = Array.isArray(values) ? values : [values];

        valueArray.forEach(value => {
            if (this.values.editable.has(value)) {
                this.values.editable.delete(value);
                this.$items.find(`.pillbox-item[data-val="${this._escapeHtml(value)}"]`).fadeOut(400, function () {
                    $(this).remove();
                });
            }
        });

        if (this.onUpdate) {
            this.onUpdate(this);
        }
    }

    /**
     * Add popover displays to pills
     */
    _addPopovers() {
        const popovers = this.validValuesMap;
        if (popovers !== null) {
            this.$items.find('.pillbox-item').each(function (i, pill) {
                pill = $(pill);
                const val = pill.data('val');
                if (val in popovers) {
                    pill.popover({
                        content: popovers[val],
                        trigger: 'focus',
                        placement: 'top',
                        container: 'body',
                        html: true
                    });
                }
            });
        }
    }

    /**
     * Get all values
     * @returns {Object} { editable: string[], immutable: string[] }
     */
    getValues() {
        return {
            editable: [...this.values.editable],
            immutable: [...this.values.immutable],
        };
    }

    /**
     * Get all values as flat array
     * @returns {string[]}
     */
    getAllValues() {
        return [...this.values.editable, ...this.values.immutable];
    }

    /**
     * Destroy the component
     */
    destroy() {
        $(document).off('click.pillbox');
        this.$container.removeClass('pillbox').empty();
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

/**
 * Factory function for backward compatibility
 * @param {string} elementId - Element ID
 * @param {boolean} canEdit - Allow editing
 * @param {string[]|Object} validValues - Valid values array or map
 * @param {Function} onUpdateFunc - Update callback
 * @param {Function} onClickFunc - Click callback
 * @param {Function} onAddFunc - Add callback
 * @param {Function} onRemoveFunc - Remove callback
 * @returns {Pillbox}
 */
export function createPillbox(elementId, canEdit, validValues, onUpdateFunc, onClickFunc, onAddFunc, onRemoveFunc) {
    return new Pillbox(`#${elementId}`, {
        editable: canEdit,
        validValues: Array.isArray(validValues) ? validValues : null,
        validValuesMap: !Array.isArray(validValues) && validValues ? validValues : null,
        onUpdate: onUpdateFunc,
        onClick: onClickFunc,
        onAdd: onAddFunc,
        onRemove: onRemoveFunc,
    });
}