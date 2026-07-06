let currentSettings = {};
let settingUpdates = {};

$(() => {
    startScrollShadows($("#settingsList"));
    fetchSettings();
});

$("#settingsSearch").on("input", () => {
    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(() => {
        renderSettings();
    }, 500);
});

function fetchSettings() {
    fetch("/api/manage/settings")
        .then(response => response.json())
        .then(data => {
            if ("error" in data) throw new Error(data["error"]);
            for (const setting of data) {
                currentSettings[`${setting.component}.${setting.key}`] = setting;
            }
            renderSettings();
        })
        .catch(error => {
            console.error("Error fetching settings:", error);
            $("#settingsList").html(`<p class="text-center mt-4">Failed to load settings: ${error.message}</p>`);
        });
}

function renderSettings() {
    const searchTerm = $("#settingsSearch").val().toLowerCase();
    const filtered = Object.values(currentSettings).filter(s =>
        s.component.toLowerCase().includes(searchTerm) ||
        s.key.toLowerCase().includes(searchTerm) ||
        (s.description && s.description.toLowerCase().includes(searchTerm))
    );
    const groups = {};
    filtered.forEach(s => {
        if (!groups[s.component]) groups[s.component] = [];
        groups[s.component].push(s);
    });
    let html = `
    <ul class="item-list settings-component-list">
    `;
    const sortedComponents = Object.keys(groups).sort();
    for (let i = 0; i < sortedComponents.length; i++) {
        const component = sortedComponents[i];
        const capitalizedComponent = component.charAt(0).toUpperCase() + component.slice(1);
        const isExpanded = searchTerm.length > 0;
        const displayExpanded = isExpanded ? "display: block" : "display: none";
        const iconClass = isExpanded ? "fa-chevron-up" : "fa-chevron-down";
        html += `
        <li class="item-row${isExpanded ? ` item-row-expanded` : ``} text-hoverable back-hoverable" onclick="toggleDrawer(this, '${component}', '#settingsList')" tabindex="0">
            <div class="item-content">
                <span class="account-name">${capitalizedComponent}</span>
                <i class="fas ${iconClass} item-chevron"></i>
            </div>
        </li>
            <div class="item-drawer settings-drawer" id="drawer-${component}" style="${displayExpanded}">
                <table class="settings-table">
                    <tbody>
        `;
        groups[component].forEach((s, index) => {
            html += renderSettingRow(component, s);
        });
        html += `
                    </tbody>
                </table>
            </div>
        </li>
        `;
    }
    html += `
    </ul>
    `;
    if (filtered.length === 0) {
        html = `<p class="text-center mt-4">No settings found.</p>`;
    }
    $("#settingsList").html(html);
}

function renderSettingRow(component, setting_data) {
    const valueDisplay = setting_data.value;
    if (setting_data.type === "json") {
        try {
            const parsed = JSON.parse(valueDisplay);
            valueDisplay = JSON.stringify(parsed, null, 2);
        } catch { }
    }
    const hasDefault = setting_data.default_value !== null && setting_data.default_value !== undefined;
    let html = `
    <tr class="settings-row back-hoverable" data-component="${component}" data-key="${setting_data.key}" data-type="${setting_data.type}">
        <td class="settings-col-key">
            <span class="settings-key">${setting_data.key}</span>
        </td>
        <td class="settings-col-description">
            <span class="secondary-text settings-description">${setting_data.description || ""}</span>
        </td>
        <td class="settings-col-value">
    `;
    if (setting_data.type === "json") {
        html += `
        <span class="settings-value-display">${valueDisplay}</span>
        `;
    } else if (setting_data.type === "bool") {
        valueBool = setting_data.value.toLowerCase() === "true";
        html += `
        <input type="checkbox" class="form-checkbox settings-value-checkbox" 
                            ${valueBool ? "checked" : ""} 
                            onchange="stageSettingUpdate('${component}', '${setting_data.key}')">
        <label class="settings-value-label">${valueBool ? "Enabled" : "Disabled"}</label>
        `;
    } else {
        html += `
        <input type="text" class="form-input settings-value-input" 
                            value="${textToHtml(setting_data.value)}" 
                            onchange="stageSettingUpdate('${component}', '${setting_data.key}')">
        `;
    }
    html += `
        </td>
        <td class="settings-col-actions">
            <div class="settings-actions">
    `;
    if (setting_data.type === "json") {
        html += `
        <button class="btn btn-sm btn-outline-secondary json-edit-btn" 
                            onclick="openJsonEditor('${component}', '${setting_data.key}')" 
                            title="Edit JSON">
            <i class="fas fa-code"></i>
            Edit JSON
        </button>
        `;
    }
    html += `
                <button class="btn btn-sm btn-outline-warning reset-btn" 
                                    onclick="openResetModal('${component}', '${setting_data.key}')" 
                                    title="Reset to default"
                                    ${!hasDefault ? 'disabled' : ''}>
                                    <i class="fas fa-undo"></i>
                                    Reset
                </button>
            </div>
        </td>
    </tr>
    `;
    return html;
}

function stageSettingUpdate(component, key, value = null) {
    const row = $(`.settings-row[data-component="${component}"][data-key="${key}"]`);
    const input = row.find("input");
    if (value === null) {
        if (row.data("type") === "bool") {
            value = input.is(":checked");
            if (value) {
                row.find(".settings-value-label").text("Enabled");
            } else {
                row.find(".settings-value-label").text("Disabled");
            }
        } else {
            value = input.val();
        }
    }
    if (`${component}.${key}` in settingUpdates === false) {
        row.find(".settings-col-key").html(row.find(".settings-col-key").html() + `<label class="settings-key unsaved-indicator" title="Unsaved changes">*</label>`);
    }
    settingUpdates[`${component}.${key}`] = value;
    const saveButton = $("#saveSettingsButton")
    if (saveButton.prop("disabled")) {
        saveButton.prop("disabled", false);
        saveButton.addClass("")
    }
}

async function saveSettings() {
    const url = new URL(`/api/manage/settings`, window.location.origin);
    requestBody = Object.entries(settingUpdates).map(([fullKey, value]) => {
        const [component, key] = fullKey.split(".");
        return {
            "component": component,
            "key": key,
            "value": value
        };
    });
    try {
        const response = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Failed to update changed settings");
        }
        for (updated_setting of data.updated) {
            const row = $(`.settings-row[data-component="${updated_setting.component}"][data-key="${updated_setting.key}"]`);
            row.replaceWith(renderSettingRow(updated_setting.component, updated_setting));
            row.addClass("save-success");
            setTimeout(() => row.removeClass("save-success"), 1000);
        }
        if (data.failed.length > 0) {
            sendToast("Warning", `Failed to update ${data.failed.length} settings.`, null, "var(--warning-partial)", "fa-times");
        } else {
            $("#saveSettingsButton").prop("disabled", true);
        }
        sendToast("Settings Updated", data.message);
    } catch (error) {
        console.log(error);
        sendToast("Error", "Something went wrong while saving updated settings.", 5, "var(--error-cancel)", "fa-times");
        fetchSettings();
    }
}

function openResetModal(component, key) {
    const contentHtml = `
        <div class="mb-3">
            <label class="form-label">Current Value</label>
            <pre class="form-control-plaintext settings-value-pre">${textToHtml(currentSettings[`${component}.${key}`].value)}</pre>
        </div>
        <div class="mb-3">
            <label class="form-label">Default Value</label>
            <pre class="form-control-plaintext settings-value-pre">${textToHtml(currentSettings[`${component}.${key}`].default_value)}</pre>
        </div>
        <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle"></i> This will reset the setting to its default value. This action cannot be undone.
        </div>
    `;
    const footerHtml = `
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-warning" onclick="confirmReset('${component}', '${key}')">
            <i class="fas fa-undo"></i> Reset to Default
        </button>
    `;
    displayModal(`Reset Setting: ${component}.${key}`, contentHtml, footerHtml);
}

async function confirmReset(component, key) {
    const url = new URL(`/api/manage/settings/${component}/${key}/reset`, window.location.origin);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to reset setting");
        }
        setting = currentSettings[`${component}.${key}`];
        setting.value = setting.default_value;
        closeModal();
        const row = $(`.settings-row[data-component="${component}"][data-key="${key}"]`);
        row.replaceWith(renderSettingRow(component, setting));
        setTimeout(() => row.removeClass("save-success"), 1000);
        sendToast("Success", `Setting ${component}.${key} reset to it's default value`);
    } catch (error) {
        sendToast("Error", `Error resetting setting: ${error.message}`, 5, "var(--error-cancel)", "fa-times");
    }
}