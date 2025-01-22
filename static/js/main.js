let listPage = 1;
let isSidebarToggleHovered = true;

const ISOTIME = "YYYY-MM-DDTHH:mm:ss.SSSZ[Z]";

$(document).ready(function () {
    dayjs.extend(dayjs_plugin_localizedFormat);
    dayjs.extend(dayjs_plugin_relativeTime);
    dayjs.extend(dayjs_plugin_utc);

    function expandSidebar() {
        $('.sidebar-collapsed').addClass('sidebar-expanded').removeClass('sidebar-collapsed');
    }

    function collapseSidebar() {
        $('.sidebar-expanded').addClass('sidebar-collapsed').removeClass('sidebar-expanded');
    }

    $(".sidebar").hover(
        function () {
            isSidebarToggleHovered = true;
            setTimeout(() => {
                if (isSidebarToggleHovered) {
                    expandSidebar();
                }
            }, 60);
        },
        function () {
            isSidebarToggleHovered = false;
            setTimeout(() => {
                if (!isSidebarToggleHovered) {
                    collapseSidebar();
                }
            }, 200);
        }
    );

    $(document).click(function (event) {
        if (!$(event.target).closest(".multiselect").length) {
            $(".multiselect-head").removeClass("focus");
            $(".multiselect-opts").fadeOut(50);
        }
    });

    setTimeout(() => {
        if (!isSidebarToggleHovered) {
            collapseSidebar();
        }
    }, 600);
});

function getDayJS(dateString) {
    return dayjs.utc(dateString.substring(0, 23));
}

function getShadeForText(bgColor) {
    let color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor;
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
    return L <= 0.179 ? "var(--main-foreground)" : "var(--main-background)";
}

function checkPermission(permKey) {
    return userPermissions.includes(permKey) || userPermissions.includes("admin")
}

function checkElementPermissions() {
    $("[data-permission]").each(function () {
        const requiredPermission = $(this).data("permission");
        if (!checkPermission(requiredPermission)) {
            if ($(this).is("button")) {
                $(this).prop("disabled", true);
            }
        }
    });
}

function displayModal(title, contentHtml, footerHtml) {
    $("#modalTitle").text(title);
    $("#modalContent").html(contentHtml);
    $("#modalFooter").html(footerHtml);
    $("#modalOverlay").modal("show");
}

function closeModal() {
    $("#modalOverlay").modal("hide");
}

function modalError(text) {
    $("#modalError").text(text);
}

function sendToast(title, message, durationSecs = 5, headerHex = "#72b9ec", icon = "fa-check") {
    const toastId = `toast-${Date.now()}`;
    const textColor = getShadeForText(headerHex);
    const toastHtml = `
    <div id="${toastId}" class="toast" role="alert">
        <div class="toast-header" style="background-color: ${headerHex}; color: ${textColor}">
            <i class="fas ${icon}" style="margin-right: 0.5rem"></i>
            <strong class="mr-auto">${title}</strong>
            <button type="button" class="close icon-btn" data-bs-dismiss="toast" style="margin-left: auto">
                <i class="fas fa-times-circle" style="color: ${textColor}"></i>
            </button>
        </div>
        ${durationSecs ? `<div class="toast-timer-bar"></div>` : ""}
        <div class="toast-body">
            ${message}
        </div>
    </div>
    `
    $("#toastContainer").append(toastHtml);
    const toastElement = $(`#${toastId}`);
    let toast;
    if (durationSecs) {
        toast = new bootstrap.Toast(toastElement, { delay: durationSecs * 1000 });
        toastElement.on("shown.bs.toast", function () {
            $(this).find(".toast-timer-bar").css("transition", `max-width ${durationSecs - 0.01}s linear`).css("max-width", "100%");
            $(this).css("left", "0");
        });
    } else {
        toast = new bootstrap.Toast(toastElement, { autohide: false });
        toastElement.on("shown.bs.toast", function () {
            $(this).css("left", "0");
        });
    }
    toast.show();
    toastElement.on("hide.bs.toast", function () {
        $(this).css("left", "");
    });
    toastElement.on("hidden.bs.toast", function () {
        $(this).remove();
    });
}

function copyToClipboard(value, btn = null, event = null) {
    if (event) {
        event.stopPropagation();
    }
    navigator.clipboard.writeText(value).then(() => {
        if (btn) {
            btn = $(btn);
            btn.prop("disabled", true);
            btn.find(".fadeable").toggleClass("fadeable-faded");
            setTimeout(function () {
                btn.find(".fadeable").toggleClass("fadeable-faded");
                btn.prop("disabled", false);
            }, 3000);
        }
    }).catch(function (error) {
        console.error("Error copying to clipboard: ", error);
        alert("Failed to copy User ID to clipboard.");
    });
}

function formatFileSize(bytes) {
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function textToHtml(text) {
    formattedText = text.replace(/^( +|\t)/gm, (match) => {
        return match.replace(/ /g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
    });
    formattedText = formattedText.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/(?:\r\n|\r|\n)/g, "<br/>");
    return formattedText.trim();
}

function createMultiselect(elementId, defaultText, updateFunction, optionsData) {
    const multi = $(`#${elementId}`);
    if (multi) {
        multi.addClass("multiselect");
        const dropHtml = `
        <button class="multiselect-head" title="${defaultText} select" onclick="toggleMultiselect(this)">
            <div>
                <label data-text="${defaultText}">${defaultText}</label><i class="fas fa-chevron-down"></i>
            </div>
        </button>
        <div class="multiselect-opts">
        </div>
        `;
        multi.append(dropHtml);
        addMultiselectOptions(elementId, updateFunction, optionsData);
    }
}

function addMultiselectOptions(elementId, updateFunction, optionsData) {
    const multiOpts = $(`#${elementId} .multiselect-opts`);
    let existingOpts = [];
    if (multiOpts.data("csv")) {
        existingOpts = multiOpts.data("csv").split(",");
    }
    optionsData.forEach(textValuePair => {
        const text = textValuePair[0];
        const data = textValuePair[1];
        if (!existingOpts.includes(data)) {
            multiOpts.append(`<label><input type="checkbox" onchange="updateMultiselect(this, ${updateFunction})" value="${data}"/>${text}</label>`);
            existingOpts.push(data);
        }
    });
    multiOpts.data("csv", existingOpts.join(","));
}

function toggleMultiselect(element) {
    $(".multiselect-head").removeClass("focus");
    const multidiv = $(element).parents(".multiselect");
    const multiopts = multidiv.find(".multiselect-opts");
    if (multiopts.is(":visible")) {
        multiopts.fadeOut(50);
    } else {
        $(".multiselect-opts").hide();
        $(element).toggleClass("focus");
        multiopts.fadeIn(50);
    }
}

function updateMultiselect(element, onUpdate) {
    const selected = [];
    const multidiv = $(element).parents(".multiselect");
    multidiv.find(".multiselect-opts label input[type='checkbox']:checked").each(function () {
        selected.push($(this).val());
    });

    const multihead = multidiv.find(".multiselect-head");
    const multiheadLabel = multihead.find("div label");
    if (selected.length > 0) {
        multihead.addClass("active")
        multidiv.data("csv", selected.join(","));
        multiheadLabel.text(selected.join(", "));
    } else {
        multihead.removeClass("active")
        multidiv.data("csv", null);
        multiheadLabel.text(multiheadLabel.data("text"));
    }
    onUpdate();
}

function prevListPage(func) {
    listPage--;
    func();
}

function nextListPage(func) {
    listPage++;
    func();
}

const observer = new MutationObserver(() => {
    checkElementPermissions();
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
});