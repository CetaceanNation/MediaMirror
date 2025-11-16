let listPage = 1;
let isSidebarToggleHovered = true;
let inputTimeout;
const spinnerHtml = `
<div id="spinner" style="display: flex; justify-content: center">
    <div class="spinner-border">
        <span class="sr-only">Loading...</span>
    </div>
</div>
`;
const pillboxContent = `
<div class="pillbox-items"></div><div class="pillbox-controls"></div>
`;

const ISOTIME = "YYYY-MM-DDTHH:mm:ss.SSSZ[Z]";

$(() => {
    dayjs.extend(dayjs_plugin_localizedFormat);
    dayjs.extend(dayjs_plugin_relativeTime);
    dayjs.extend(dayjs_plugin_utc);

    function expandSidebar() {
        $('.sidebar-collapsed').addClass('sidebar-expanded').removeClass('sidebar-collapsed');
    }

    function collapseSidebar() {
        $('.sidebar-expanded').addClass('sidebar-collapsed').removeClass('sidebar-expanded');
    }

    $(".sidebar").on("mouseenter", function () {
        isSidebarToggleHovered = true;
        setTimeout(() => {
            if (isSidebarToggleHovered) {
                expandSidebar();
            }
        }, 60)
    }).on("mouseleave", function () {
        isSidebarToggleHovered = false;
        setTimeout(() => {
            if (!isSidebarToggleHovered) {
                collapseSidebar();
            }
        }, 200);
    });

    $("#modalOverlay").on("hidden.bs.modal", function () {
        $("#modalTitle").text("");
        $("#modalContent").empty();
        $("#modalFooter").empty();
    })

    $(document).on("click", function (event) {
        if (!$(event.target).closest(".multiselect").length) {
            closeMultiselects();
        }
    });

    $(document).on("keypress", ".item-row, .pillbox-input-opts label", (e) => {
        if (e.which === 13) {
            $(e.target).trigger("click");
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

function getCssVar(varName) {
    varName = (varName.substring(0, 4) === "var(") ? varName.substring(4, varName.length - 1) : varName;
    return window.getComputedStyle(document.body).getPropertyValue(varName);
}

function getShadeForText(bgColor) {
    let color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : (bgColor.substring(0, 6) === "var(") ? getCssVar(bgColor) : bgColor;
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
    return currentUserPermissions.includes(permKey) || currentUserPermissions.includes("admin")
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

function badInput(input) {
    input = $(input);
    input.addClass("bad-value");
    setTimeout(() => {
        input.removeClass("bad-value");
    }, 500);
}

function startScrollShadows(overflowElement) {
    $(overflowElement).on("scroll", function () {
        updateScrollShadows($(this));
    });
}

function updateScrollShadows(overflowElement) {
    const scrollTop = overflowElement.scrollTop();
    const maxScroll = overflowElement[0].scrollHeight - overflowElement.outerHeight() - 2;
    const elementWidth = overflowElement.width();
    const shadowElements = $(document).find(".scroll-shadow");
    shadowElements.css("width", elementWidth);
    shadowElements.filter(".shadow-top-gradient").toggleClass("show-shadow", scrollTop > 0);
    shadowElements.filter(".shadow-bottom-gradient").toggleClass("show-shadow", scrollTop < maxScroll);
}

function displayModal(title, contentHtml, footerHtml) {
    $("#modalTitle").text(title);
    $("#modalContent").append(contentHtml);
    $("#modalFooter").append(footerHtml);
    $("#modalOverlay").modal("show");
}

function closeModal() {
    $("#modalOverlay").modal("hide");
}

function modalError(text, badValueInputs = []) {
    badValueInputs.forEach((input) => {
        badInput(input);
    });
    if (badValueInputs.length > 0) {
        $(badValueInputs[0]).trigger("select").trigger("focus");
    }
    $("#modalError").text(text);
}

function sendToast(title, message, durationSecs = 5, headerColor = "#72b9ec", icon = "fa-check") {
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
    }).catch((error) => {
        console.error("Error copying to clipboard: ", error);
        alert("Failed to copy value to clipboard.");
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

function createMultiselect(elementId, defaultText, exclusive, updateFunction, initialData) {
    let multi = $(`#${elementId}`);
    if (multi.length == 0) {
        multi = $(`<div id="${elementId}"></div>`);
    }
    multi.addClass("multiselect");
    multi.data("exclusive", exclusive === true);
    multi.data("selected", []);
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
    addMultiselectOptions(multi, updateFunction, initialData);
    return multi;
}

function addMultiselectOptions(multiselectJqOrId, updateFunction, data) {
    if (!(multiselectJqOrId instanceof jQuery)) {
        multiselectJqOrId = $(`#${multiselectJqOrId}`);
    }
    const multiOpts = multiselectJqOrId.find(".multiselect-opts");
    const exclusive = multiselectJqOrId.data("exclusive");
    let existingOpts = multiOpts.data("values") ? multiOpts.data("values") : [];
    data.forEach((data) => {
        if (!existingOpts.includes(data)) {
            multiOpts.append(`
            <label>
                <input type="${exclusive ? `radio` : `checkbox`}" onclick="updateMultiselect(this, ${updateFunction})" value="${data}"/>
                ${data}
            </label>`);
            existingOpts.push(data);
        }
    });
    multiOpts.data("values", existingOpts);
}

function toggleMultiselect(element) {
    $(".multiselect-head").removeClass("focus");
    const multidiv = $(element).closest(".multiselect");
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
    const multi = $(element).closest(".multiselect");
    const prevSelected = multi.data("selected");
    const exclusive = multi.data("exclusive");
    multi.find(".multiselect-opts label input").each(function () {
        const val = $(this).val();
        if (exclusive && val === prevSelected[0]) {
            $(this).prop("checked", false);
        } else if ($(this).prop("checked")) {
            selected.push(val);
        }
    });
    const multiHead = multi.find(".multiselect-head");
    const multiHeadLabel = multiHead.find("div label");
    multi.data("selected", selected);
    if (selected.length > 0) {
        multiHead.addClass("active");
        multiHeadLabel.text(selected.join(", "));
    } else {
        multiHead.removeClass("active");
        multiHeadLabel.text(multiHeadLabel.data("text"));
    }
    onUpdate();
}

function closeMultiselects() {
    $(".multiselect-head").removeClass("focus");
    $(".multiselect-opts").fadeOut(50);
}

function createPillbox(elementId, canEdit, validValues = null, onUpdateFunc = null, onClickFunc = null, onAddFunc = null, onRemoveFunc = null) {
    let pillbox = $(`#${elementId}`);
    if (pillbox.length == 0) {
        pillbox = $(`<div id="${elementId}"></div>`);
    }
    pillbox.addClass("pillbox");
    pillbox.html(pillboxContent);
    pillbox.data({
        "values": { "immutable": [], "editable": [] },
        "valid": validValues,
        "onupdate": onUpdateFunc,
        "onclick": onClickFunc,
        "onadd": onAddFunc,
        "onremove": onRemoveFunc,
        "edits": canEdit
    });
    return pillbox;
}

function addPillboxValues(pillboxJqOrId, editable, data) {
    let pillbox = pillboxJqOrId;
    if (!(pillboxJqOrId instanceof jQuery)) {
        pillbox = $(`#${pillboxJqOrId}`);
    }
    if (data.length == 0) {
        updatePillboxContents(pillbox);
        throw new Error("No new values submitted.");
    }
    let pillboxValues = pillbox.data("values");
    const newValuesKey = editable ? "editable" : "immutable";
    const validValues = pillbox.data("valid");
    data.forEach((v) => {
        if (validValues) {
            if ((Array.isArray(validValues) && !validValues.includes(v)) ||
                (typeof validValues === 'object' && validValues.constructor === Object && !Object.keys(validValues).includes(v))) {
                throw new Error(`Submitted value was not valid for this field.`);
            }
        }
        if (pillboxValues[newValuesKey].includes(v)) {
            throw new Error(`Value "${v}" already exists.`);
        }
    });
    pillboxValues[newValuesKey] = [...new Set(pillboxValues[newValuesKey].concat(data).sort())];
    pillbox.data("values", pillboxValues);
    updatePillboxContents(pillbox);
}

function removePillboxValues(pillboxJqOrId, data) {
    let pillbox = pillboxJqOrId;
    if (!(pillboxJqOrId instanceof jQuery)) {
        pillbox = $(`#${pillboxJqOrId}`);
    }
    let pillboxValues = pillbox.data("values");
    data.forEach(function (value) {
        if (pillboxValues["editable"].includes(value)) {
            pillboxValues["editable"] = pillboxValues["editable"].filter((v) => v !== value);
        }
        pill = pillbox.find(`.pillbox-items .pillbox-item[data-val="${value}"]`);
        pill.fadeOut(400, function () {
            $(this).remove();
        });
    });
    pillbox.data("values", pillboxValues);
}

function updatePillboxContents(pillboxJqOrId) {
    let pillbox = pillboxJqOrId;
    if (!(pillboxJqOrId instanceof jQuery)) {
        pillbox = $(`#${pillboxJqOrId}`);
    }
    const pillboxValues = pillbox.data("values");
    const onClickFunc = pillbox.data("onclick");
    const onRemoveFunc = pillbox.data("onremove");
    const pillboxItems = pillbox.find(".pillbox-items");
    pillboxItems.find(".pillbox-item").remove();
    pillboxValues["editable"].toReversed().forEach((value) => {
        pillboxItems.prepend(`
            <span class="pillbox-item badge rounded-pill editable" data-val="${value}"${onClickFunc ? `onclick="${onClickFunc.name}(this)"` : ``} tabindex="0">
                ${value}
                <button class="icon-btn" title="Remove ${value}" onclick="removePillboxValue(this, ${onRemoveFunc ? onRemoveFunc.name : "null"})"
                    style="margin-left: 0.2rem" tabindex="0">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `);
    });
    pillboxValues["immutable"].toReversed().forEach((value) => {
        pillboxItems.prepend(`
            <span class="pillbox-item badge rounded-pill immutable" data-val="${value}"${onClickFunc ? `onclick="${onClickFunc.name}(this)"` : ``} tabindex="0">
                ${value}
            </span>
        `);
    });
    const pillboxControls = pillbox.find(".pillbox-controls");
    if (pillbox.data("edits") && pillboxControls.find(".pillbox-input").length == 0) {
        pillboxControls.append(`
            <span class="pillbox-input color-hoverable">
                <button class="pillbox-input-toggle icon-btn" title="Add value" onclick="expandPillboxInput(this)">
                    <i class="fas fa-plus"></i>
                </button>
            </span>
        `);
    }
    const onUpdateFunc = pillbox.data("onupdate");
    if (onUpdateFunc) {
        onUpdateFunc(pillbox);
    }
}

function expandPillboxInput(button) {
    $(button).prop("disabled", true).attr("onclick", "closePillboxInput(this)").attr("title", "Cancel");
    const inputPill = $(button).parent(".pillbox-input");
    const controlPanel = inputPill.parent(".pillbox-controls");
    controlPanel.css("padding", "0");
    inputPill.addClass("expanded").removeClass("color-hoverable")
    inputPill.prepend(`
        <input type="text" style="display: none"></input>
        <button class="pillbox-input-submit icon-btn" title="Submit" onclick="addPillboxValue(this)">
            <i class="fas fa-check"></i>
        </button>
    `);
    const inputField = $(".pillbox-input input");
    inputField.css({ "max-width": "50%", "min-width": "50%" });
    inputField.fadeIn(300, () => {
        inputField.trigger("focus");
    });
    inputField.on("focus input", (e) => {
        const pillboxValues = inputField.closest(".pillbox").data("values");
        const existingValues = pillboxValues["immutable"].concat(pillboxValues["editable"]);
        const val = inputField.val().trim();
        const pillOpts = inputPill.find(".pillbox-input-opts");
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(function () {
            pillOpts.scrollTop(0);
            let isMatch = false;
            pillOpts.find("label").each((i, label) => {
                label = $(label);
                const text = label.data("val");
                if (existingValues.includes(text)) {
                    label.hide();
                } else if (val.length > 0) {
                    if (text === val) {
                        pillOpts.fadeOut(300);
                        isMatch = true;
                        return;
                    } else if (!text.includes(val)) {
                        label.hide();
                    }
                } else {
                    label.show();
                }
            });
            if (!isMatch) {
                pillOpts.fadeIn(300);
            }
        }, 200);
    });
    inputField.on("keypress", async (e) => {
        if (e.which === 13) {
            addPillboxValue(inputField);
        }
    });
    const validValues = inputPill.closest(".pillbox").data("valid");
    if (validValues) {
        const pillOpts = $(`<div class="pillbox-input-opts" tabindex="-1"></div>`);
        pillOpts.on("click focus", "label", function (event) {
            event.stopPropagation();
            if (event.type === "click") {
                pillOpts.fadeOut(300);
                inputField.val($(this).data("val"));
                inputField.trigger("input");
                inputPill.find(".pillbox-input-submit").trigger("focus");
            } else if (event.type === "focus") {
                pillOpts.scrollTop($(this).offset().top - pillOpts.offset().top);
            }
        });
        if (Array.isArray(validValues)) {
            validValues.forEach((value) => {
                pillOpts.append(`<label data-val="${value}" tabindex="0">${value}</label>`);
            });
        } else if (typeof validValues === 'object' && validValues.constructor === Object) {
            Object.keys(validValues).forEach((valueKey) => {
                pillOpts.append(`<label data-val="${valueKey}" tabindex="0">${valueKey}<p>${validValues[valueKey]}</p></label>`);
            });
        }
        inputField.after(pillOpts);
        setTimeout(function () {
            pillOpts.fadeIn(300);
        }, 200);

    }
    setTimeout(() => {
        $(button).prop("disabled", false);
    }, 500);
}

function closePillboxInput(button) {
    $(button).prop("disabled", true).attr("onclick", "expandPillboxInput(this)").attr("title", "Add value");
    const inputPill = $(button).parent(".pillbox-input");
    const controlPanel = inputPill.parent(".pillbox-controls");
    controlPanel.css("padding", "");
    inputPill.removeClass("expanded").addClass("color-hoverable")
    const inputField = inputPill.find("input");
    inputField.val("");
    inputPill.css("width", "");
    inputField.css({ "width": "0", "max-width": "0" });
    inputPill.find(".pillbox-input-opts").fadeOut(300);
    const toRemove = inputPill.find("input, .pillbox-input-submit, .pillbox-input-opts");
    toRemove.css("margin-right", "-1rem");
    toRemove.fadeOut(500, () => {
        toRemove.remove();
        $(button).prop("disabled", false).trigger("focus");
    });
}

async function addPillboxValue(inputElem) {
    inputPill = $(inputElem).parent(".pillbox-input");
    const inputField = inputPill.children("input");
    inputField.prop("disabled", true);
    const value = inputField.val().trim();
    const pillbox = inputPill.closest(".pillbox");
    const onAddFunc = pillbox.data("onadd");
    if (value.length == 0) {
        badInput(inputPill);
        return;
    }
    if (pillbox.data("values")["editable"].includes(value)) {
        sendToast("Error", `Value "${value}" already exists.`, 5, "#ef184a", "fa-times");
        badInput(inputPill);
        return;
    }
    try {
        addPillboxValues(pillbox, true, [value]);
        if (onAddFunc) {
            const addResult = await onAddFunc(inputPill);
            if (!addResult) {
                throw new Error("Encountered error while adding value.");
            }
        }
        sendToast("Success", `"${value}" successfully added.`, 3);
        closePillboxInput(inputPill.find("button"));
    } catch (error) {
        removePillboxValues(pillbox, [value]);
        sendToast("Error", `Could not add "${value}": ${error.message}`, 5, "#ef184a", "fa-times");
        badInput(inputPill);
    }
    inputField.prop("disabled", false).trigger("focus");
}

async function removePillboxValue(pillBtn, onRemoveFunc) {
    const pill = $(pillBtn).parent(".pillbox-item");
    const value = pill.data("val");
    const pillbox = pill.closest(".pillbox");
    if (!pillbox.data("values")["editable"].includes(value)) {
        sendToast("Error", `Can't find value "${value}" to remove`, 5, "#ef184a", "fa-times");
        badInput(inputPill);
        return;
    }
    try {
        if (onRemoveFunc) {
            const removeResult = await onRemoveFunc(pill);
            if (!removeResult) {
                throw new Error("Encountered error while removing value.");
            }
        }
        removePillboxValues(pillbox, [value]);
        sendToast("Success", `"${value}" successfully removed.`, 3);
    } catch (error) {
        addPillboxValues(pillbox, true, [value]);
        sendToast("Error", `Could not remove "${value}": ${error.message}`, 5, "#ef184a", "fa-times");
        badInput(inputPill);
    }
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