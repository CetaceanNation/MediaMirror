/**
 * Display a modal dialog
 * @param {string} title - Modal title
 * @param {string|HTMLElement|jQuery} content - Modal body content
 * @param {string|HTMLElement|jQuery} footer - Modal footer content
 * @returns {Promise<void>}
 */
export function displayModal(title, content, footer = '') {
    return new Promise((resolve) => {
        $('#modalTitle').text(title);
        $('#modalContent').empty().append(content);
        $('#modalFooter').empty().append(footer);
        $('#modalOverlay').modal('show');

        // Store resolve for potential use by confirmation buttons
        $('#modalOverlay').data('resolve', resolve);
    });
}

/**
 * Close the current modal
 */
export function closeModal() {
    $('#modalOverlay').modal('hide');
}

/**
 * Show an error in the modal
 * @param {string} text - Error message
 * @param {string[]} badValueInputs - Selector strings for inputs to highlight
 */
export function modalError(text, badValueInputs = []) {
    badValueInputs.forEach((input) => {
        badInput(input);
    });
    if (badValueInputs.length > 0) {
        $(badValueInputs[0]).trigger('select').trigger('focus');
    }
    $('#modalError').text(text);
}

/**
 * Highlight an input as having a bad value
 * @param {string|HTMLElement|jQuery} input - Input element or selector
 */
export function badInput(input) {
    const $input = $(input);
    $input.addClass('bad-value');
    setTimeout(() => {
        $input.removeClass('bad-value');
    }, 500);
}

/**
 * Send a toast notification
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {number} durationSecs - Duration in seconds (0 = no auto-hide)
 * @param {string} headerColor - Header background color
 * @param {string} icon - FontAwesome icon class
 */
export function sendToast(title, message, durationSecs = 5, headerColor = '#72b9ec', icon = 'fa-check') {
    const toastId = `toast-${Date.now()}`;
    const textColor = getShadeForText(headerColor);
    const toastHtml = `
    <div id="${toastId}" class="toast" role="alert">
        <div class="toast-header" style="background-color: ${headerColor}; color: ${textColor}">
            <i class="fas ${icon}" style="margin-right: 0.5rem"></i>
            <strong class="mr-auto">${title}</strong>
            <button class="close icon-btn" data-bs-dismiss="toast" style="margin-left: auto">
                <i class="fas fa-times-circle" style="color: ${textColor}"></i>
            </button>
        </div>
        ${durationSecs ? `<div class="toast-timer-bar"></div>` : ''}
        <div class="toast-body">
            ${message}
        </div>
    </div>
    `;
    $('#toastContainer').append(toastHtml);
    const toastElement = $(`#${toastId}`);
    let toast;
    if (durationSecs) {
        toast = new bootstrap.Toast(toastElement, { delay: durationSecs * 1000 });
        toastElement.on('shown.bs.toast', function () {
            $(this).find('.toast-timer-bar').css('transition', `max-width ${durationSecs - 0.01}s linear`).css('max-width', '100%');
            $(this).css('left', '0');
        });
    } else {
        toast = new bootstrap.Toast(toastElement, { autohide: false });
        toastElement.on('shown.bs.toast', function () {
            $(this).css('left', '0');
        });
    }
    toast.show();
    toastElement.on('hide.bs.toast', function () {
        $(this).css('left', '');
    });
    toastElement.on('hidden.bs.toast', function () {
        $(this).remove();
    });
}

/**
 * Calculate appropriate text color for a background color
 * @param {string} bgColor - Background color (hex, var(), etc.)
 * @returns {string} Text color CSS variable
 */
export function getShadeForText(bgColor) {
    let color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) :
        (bgColor.substring(0, 6) === 'var(') ? getCssVar(bgColor) : bgColor;
    let r = parseInt(color.substring(0, 2), 16);
    let g = parseInt(color.substring(2, 4), 16);
    let b = parseInt(color.substring(4, 6), 16);
    let uicolors = [r / 255, g / 255, b / 255];
    let c = uicolors.map((col) => {
        if (col <= 0.03928) {
            return col / 12.92;
        }
        return Math.pow((col + 0.055) / 1.055, 2.4);
    });
    let L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
    return L <= 0.179 ? 'var(--main-foreground)' : 'var(--main-background)';
}

/**
 * Get CSS variable value
 * @param {string} varName - Variable name (with or without var())
 * @returns {string} Computed value
 */
export function getCssVar(varName) {
    varName = (varName.substring(0, 4) === 'var(') ? varName.substring(4, varName.length - 1) : varName;
    return window.getComputedStyle(document.body).getPropertyValue(varName);
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Escape text for safe HTML insertion
 * @param {string} text - Text to escape
 * @returns {string} HTML-safe text
 */
export function textToHtml(text) {
    let formattedText = text
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/(?:\r\n|\r|\n)/g, '<br/>');
    formattedText = formattedText.replace(/^( +|\t)/gm, (match) => {
        return match.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
    });
    return formattedText.trim();
}

/**
 * Copy text to clipboard with visual feedback
 * @param {string} value - Text to copy
 * @param {HTMLElement|jQuery} btn - Button element for feedback
 * @param {Event} event - Click event
 */
export function copyToClipboard(value, btn = null, event = null) {
    if (event) {
        event.stopPropagation();
    }
    navigator.clipboard.writeText(value).then(() => {
        if (btn) {
            const $btn = $(btn);
            $btn.prop('disabled', true);
            $btn.find('.fadeable').toggleClass('fadeable-faded');
            setTimeout(function () {
                $btn.find('.fadeable').toggleClass('fadeable-faded');
                $btn.prop('disabled', false);
            }, 3000);
        }
    }).catch((error) => {
        console.error('Error copying to clipboard: ', error);
        alert('Failed to copy value to clipboard.');
    });
}

/**
 * Parse date string to dayjs object (UTC)
 * @param {string} dateString - ISO date string
 * @returns {dayjs.Dayjs} Dayjs object in UTC
 */
export function getDayJS(dateString) {
    return dayjs.utc(dateString.substring(0, 23));
}

/**
 * Check if current user has a permission
 * @param {string} permKey - Permission key
 * @returns {boolean}
 */
export function checkPermission(permKey) {
    return window.currentUserPermissions?.includes(permKey) || window.currentUserPermissions?.includes('admin');
}

/**
 * Check all elements with data-permission and disable if needed
 */
export function checkElementPermissions() {
    $('[data-permission]').each(function () {
        const requiredPermission = $(this).data('permission');
        if (!checkPermission(requiredPermission)) {
            if ($(this).is('button')) {
                $(this).prop('disabled', true);
            }
        }
    });
}

/**
 * Add scroll shadow indicators to an overflow element
 * @param {jQuery} overflowElement - jQuery element with overflow
 */
export function startScrollShadows(overflowElement) {
    overflowElement.on('scroll', function () {
        updateScrollShadows($(this));
    });
}

/**
 * Update scroll shadow visibility
 * @param {jQuery} overflowElement - jQuery element with overflow
 */
export function updateScrollShadows(overflowElement) {
    const scrollTop = overflowElement.scrollTop();
    const maxScroll = overflowElement[0].scrollHeight - overflowElement.outerHeight() - 2;
    const elementWidth = overflowElement.width();
    const shadowElements = $(document).find('.scroll-shadow');
    shadowElements.css('width', elementWidth);
    shadowElements.filter('.shadow-top-gradient').toggleClass('show-shadow', scrollTop > 0);
    shadowElements.filter('.shadow-bottom-gradient').toggleClass('show-shadow', scrollTop < maxScroll);
}

/**
 * Toggle a drawer element
 * @param {HTMLElement} element - The trigger element
 * @param {string} drawerName - Drawer ID suffix
 * @param {jQuery} overflowElement - Optional overflow element for scroll shadows
 */
export function toggleDrawer(element, drawerName, overflowElement = null) {
    const expanded = element.getAttribute('data-expanded') === 'true';
    element.setAttribute('data-expanded', !expanded);
    const drawer = $(`#drawer-${drawerName}`);
    const icon = drawer.prev().find('.item-chevron');
    drawer.slideToggle(300).promise().done(() => {
        if (overflowElement) {
            updateScrollShadows($(overflowElement));
        }
    });
    icon.toggleClass('fa-chevron-down fa-chevron-up');
    setTimeout(() => {
        $(element).toggleClass('item-row-expanded');
    }, expanded ? 300 : 0);
}
