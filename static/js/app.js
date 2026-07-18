/**
 * Main Application Entry Point
 * Initializes shared utilities and provides backward compatibility
 */

import { displayModal, closeModal, sendToast, badInput, modalError, checkPermission, checkElementPermissions, startScrollShadows, updateScrollShadows, toggleDrawer, formatFileSize, textToHtml, copyToClipboard, getDayJS, getCssVar, getShadeForText } from './utils/ui.js';
import { createMultiselect, Multiselect } from './components/Multiselect.js';
import { createPillbox, Pillbox } from './components/Pillbox.js';
import { Modal } from './components/Modal.js';
import { LOG_LEVELS, HANDLER_TYPES, PAGE_SIZE, ISOTIME } from './utils/constants.js';
import { apiGet, apiPost, apiPut, apiDelete, apiRequest, buildUrl, API_ENDPOINTS } from './utils/api.js';

// Make utilities globally available for backward compatibility
window.displayModal = displayModal;
window.closeModal = closeModal;
window.sendToast = sendToast;
window.badInput = badInput;
window.modalError = modalError;
window.checkPermission = checkPermission;
window.checkElementPermissions = checkElementPermissions;
window.startScrollShadows = startScrollShadows;
window.updateScrollShadows = updateScrollShadows;
window.toggleDrawer = toggleDrawer;
window.formatFileSize = formatFileSize;
window.textToHtml = textToHtml;
window.copyToClipboard = copyToClipboard;
window.getDayJS = getDayJS;
window.getCssVar = getCssVar;
window.getShadeForText = getShadeForText;

// Make components globally available
window.createMultiselect = createMultiselect;
window.Multiselect = Multiselect;
window.createPillbox = createPillbox;
window.Pillbox = Pillbox;
window.Modal = Modal;

// Make API utilities globally available
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.apiDelete = apiDelete;
window.apiRequest = apiRequest;
window.buildUrl = buildUrl;
window.API_ENDPOINTS = API_ENDPOINTS;
window.LOG_LEVELS = LOG_LEVELS;
window.HANDLER_TYPES = HANDLER_TYPES;
window.PAGE_SIZE = PAGE_SIZE;
window.ISOTIME = ISOTIME;

// Initialize dayjs plugins
dayjs.extend(dayjs_plugin_localizedFormat);
dayjs.extend(dayjs_plugin_relativeTime);
dayjs.extend(dayjs_plugin_utc);

// Global state (will be moved to modules gradually)
window.listPage = 1;
window.isSidebarToggleHovered = true;
window.inputTimeout = 0;

// Initialize on DOM ready
$(() => {
    // Initialize sidebar behavior
    function expandSidebar() {
        $('.sidebar-collapsed').addClass('sidebar-expanded').removeClass('sidebar-collapsed');
    }

    function collapseSidebar() {
        $('.sidebar-expanded').addClass('sidebar-collapsed').removeClass('sidebar-expanded');
    }

    $(".sidebar").on("mouseenter", function () {
        window.isSidebarToggleHovered = true;
        setTimeout(() => {
            if (window.isSidebarToggleHovered) {
                expandSidebar();
            }
        }, 60);
    }).on("mouseleave", function () {
        window.isSidebarToggleHovered = false;
        setTimeout(() => {
            if (!window.isSidebarToggleHovered) {
                collapseSidebar();
            }
        }, 200);
    });

    // Modal cleanup
    $("#modalOverlay").on("hidden.bs.modal", function () {
        $("#modalTitle").text("");
        $("#modalContent").empty();
        $("#modalFooter").empty();
    });

    // Close multiselects on outside click
    $(document).on("click", function (event) {
        if (!$(event.target).closest(".multiselect").length) {
            closeMultiselects();
        }
    });

    // Keyboard support for item rows and pillbox options
    $(document).on("keypress", ".item-row, .pillbox-input-opts label", (e) => {
        if (e.which === 13) {
            $(e.target).trigger("click");
        }
    });

    // Initial sidebar state
    setTimeout(() => {
        if (!window.isSidebarToggleHovered) {
            collapseSidebar();
        }
    }, 600);

    // Permission observer
    const observer = new MutationObserver(() => {
        checkElementPermissions();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
});

// Backward compatibility functions
function closeMultiselects() {
    $(".multiselect-head").removeClass("focus");
    $(".multiselect-opts").fadeOut(50);
}

function prevListPage(func) {
    window.listPage--;
    func();
}

function nextListPage(func) {
    window.listPage++;
    func();
}

// Export for modules
export {
    displayModal,
    closeModal,
    sendToast,
    badInput,
    modalError,
    checkPermission,
    checkElementPermissions,
    startScrollShadows,
    updateScrollShadows,
    toggleDrawer,
    formatFileSize,
    textToHtml,
    copyToClipboard,
    getDayJS,
    getCssVar,
    getShadeForText,
    createMultiselect,
    Multiselect,
    createPillbox,
    Pillbox,
    Modal,
    apiGet,
    apiPost,
    apiPut,
    apiDelete,
    apiRequest,
    buildUrl,
    API_ENDPOINTS,
    LOG_LEVELS,
    HANDLER_TYPES,
    PAGE_SIZE,
    ISOTIME,
    closeMultiselects,
    prevListPage,
    nextListPage,
};