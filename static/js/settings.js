// State
let currentSettings = {};
let settingUpdates = {};

// Initialize
$(() => {
    $(window).on('beforeunload', (event) => {
        if (Object.keys(settingUpdates).length > 0) {
            const stopMessage = 'Your unsaved changes will be lost if you navigate away, continue?';
            event.preventDefault();
            event.returnValue = stopMessage;
            return stopMessage;
        }
    });
    startScrollShadows($('#settingsList'));
    fetchSettings();
});

$('#settingsSearch').on('input', () => {
    clearTimeout(window.inputTimeout);
    window.inputTimeout = setTimeout(() => {
        renderSettings();
    }, 500);
});

async function fetchSettings() {
    try {
        const data = await apiGet(API_ENDPOINTS.SETTINGS);
        currentSettings = {};
        for (const setting of data) {
            currentSettings[`${setting.component}.${setting.key}`] = setting;
        }
        renderSettings();
    } catch (error) {
        console.error('Error fetching settings:', error);
        $('#settingsList').html(`<p class="text-center mt-4">Failed to load settings: ${error.message}</p>`);
    }
}

function renderSettings() {
    const searchTerm = $('#settingsSearch').val().toLowerCase();
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

    let html = '<ul class="item-list settings-component-list">';
    const sortedComponents = Object.keys(groups).sort();

    for (const component of sortedComponents) {
        const capitalizedComponent = component.charAt(0).toUpperCase() + component.slice(1);
        const isExpanded = searchTerm.length > 0;
        const displayExpanded = isExpanded ? 'display: block' : 'display: none';
        const iconClass = isExpanded ? 'fa-chevron-up' : 'fa-chevron-down';

        html += `
        <li class="item-row${isExpanded ? ' item-row-expanded' : ''} text-hoverable back-hoverable" 
            onclick="toggleDrawer(this, '${component}', '#settingsList')" tabindex="0">
            <div class="item-content">
                <span class="account-name">${capitalizedComponent}</span>
                <i class="fas ${iconClass} item-chevron"></i>
            </div>
        </li>
            <div class="item-drawer settings-drawer" id="drawer-${component}" style="${displayExpanded}">
                <table class="settings-table">
                    <tbody>
        `;

        groups[component].sort((a, b) => a.key.localeCompare(b.key)).forEach(s => {
            html += renderSettingRow(component, s);
        });

        html += `
                    </tbody>
                </table>
            </div>
        </li>
        `;
    }

    html += '</ul>';

    if (filtered.length === 0) {
        html = '<p class="text-center mt-4">No settings found.</p>';
    }

    $('#settingsList').html(html);
}

function renderSettingRow(component, settingData, additionalClasses = null) {
    let valueDisplay = settingData.value;

    if (settingData.type === 'json') {
        try {
            const parsed = JSON.parse(valueDisplay);
            valueDisplay = JSON.stringify(parsed, null, 2);
        } catch { }
    }

    const hasDefault = settingData.default_value !== null && settingData.default_value !== undefined;
    let html = `
    <tr class="settings-row back-hoverable form-switch${additionalClasses ? ' ' + additionalClasses.join(' ') : ''}" data-component="${component}" data-key="${settingData.key}" data-type="${settingData.type}">
        <td class="settings-col-key">
            <span class="settings-key">${settingData.key}</span>
            ${settingData.description ? `<i class="fas fa-info-circle" title="${settingData.description}"></i>` : ''}
        </td>
        <td class="settings-col-value">
    `;

    if (settingData.type === 'json') {
        if (component === 'logging' && settingData.key.startsWith('loggers')) {
            html += `
            <button class="btn btn-sm btn-outline-secondary json-edit-btn" 
                onclick="openLogSettingModal('${component}', '${settingData.key}')" 
                title="Edit Setting">
                <i class="fas fa-code"></i>
                Edit
            </button>
            `;
        } else {
            html += `<span class="settings-value-display">${textToHtml(valueDisplay)}</span>`;
        }
    } else if (settingData.type === 'bool') {
        const valueBool = settingData.value.toLowerCase() === 'true';
        html += `
        <label class="settings-value-label">${valueBool ? 'Enabled' : 'Disabled'}</label>
        <input type="checkbox" class="form-check-input settings-value-checkbox" 
            role="switch" 
            ${valueBool ? 'checked' : ''} 
            onchange="stageSettingUpdate('${component}', '${settingData.key}')">
        `;
    } else {
        html += `
        <input type="text" class="form-input settings-value-input" 
            value="${textToHtml(settingData.value)}" 
            onchange="stageSettingUpdate('${component}', '${settingData.key}')">
        `;
    }

    html += `
            <button class="btn btn-sm btn-outline-warning reset-btn" 
                onclick="openResetModal('${component}', '${settingData.key}')" 
                title="Reset to default"
                ${!hasDefault ? 'disabled' : ''}>
                <i class="fas fa-undo"></i>
                Reset
            </button>
        </td>
    </tr>
    `;
    return html;
}

function markSettingUpdated(component, key, value) {
    const fullKey = `${component}.${key}`;
    settingUpdates[fullKey] = value;
    const row = $(`.settings-row[data-component="${component}"][data-key="${key}"]`);
    if (row.find('.unsaved-indicator').length == 0) {
        const rowKeyCol = row.find('.settings-col-key');
        rowKeyCol.html(rowKeyCol.html() + '<label class="settings-key unsaved-indicator" title="Unsaved changes"><b>*</b></label>');
    }
    updateSaveButton();
}

function clearSettingUpdated(component, key) {
    const fullKey = `${component}.${key}`;
    delete settingUpdates[fullKey];
    const row = $(`.settings-row[data-component="${component}"][data-key="${key}"]`);
    row.find('.unsaved-indicator').remove();
    updateSaveButton();
}

function updateSaveButton() {
    const saveButton = $('#saveSettingsButton');
    if (Object.keys(settingUpdates).length == 0) {
        saveButton.prop('disabled', true);
    } else if (Object.keys(settingUpdates).length > 0 && saveButton.prop('disabled')) {
        saveButton.prop('disabled', false);
    }
}

function stageSettingUpdate(component, key, value = null) {
    const row = $(`.settings-row[data-component="${component}"][data-key="${key}"]`);
    const input = row.find('input');

    if (value === null) {
        if (row.data('type') === 'bool') {
            value = input.is(':checked');
            row.find('.settings-value-label').text(value ? 'Enabled' : 'Disabled');
            value = value.toString().toLowerCase();
        } else if (input) {
            value = input.val();
        }
    }

    const fullKey = `${component}.${key}`;
    if (value !== currentSettings[fullKey].value) {
        markSettingUpdated(component, key, value);
    } else {
        clearSettingUpdated(component, key);
    }
}

async function saveSettings() {
    const requestBody = Object.entries(settingUpdates).map(([fullKey, value]) => {
        const component = fullKey.split('.', 1)[0];
        const key = fullKey.slice(component.length + 1);
        return { component, key, value };
    });

    try {
        const data = await apiPut(API_ENDPOINTS.SETTINGS, requestBody);

        for (const updated_setting of data.updated) {
            currentSettings[`${updated_setting.component}.${updated_setting.key}`] = updated_setting;
            const row = $(`.settings-row[data-component="${updated_setting.component}"][data-key="${updated_setting.key}"]`);
            row.replaceWith(renderSettingRow(updated_setting.component, updated_setting, ['save-success']));
            setTimeout(() => $(`.settings-row[data-component="${updated_setting.component}"][data-key="${updated_setting.key}"]`).removeClass('save-success'), 1000);
        }

        if (data.failed.length > 0) {
            sendToast('Warning', `Failed to update ${data.failed.length} settings.`, null, 'var(--warning-partial)', 'fa-times');
        } else {
            $('#saveSettingsButton').prop('disabled', true);
            settingUpdates = {};
        }

        sendToast('Settings Updated', data.message);
    } catch (error) {
        console.error(error);
        sendToast('Error', 'Something went wrong while saving updated settings.', 5, 'var(--error-cancel)', 'fa-times');
    }
}

function openLogSettingModal(component, key) {
    const contentHtml = `
        <div class="form-group">
            <div id="logLevelSelect" class="admin-search-half"></div>
        </div>
        <div class="form-group">
            <label class="form-label">Handlers</label>
            <div id="handlerPillbox"></div>
        </div>
    `;

    const logKey = `${component}.${key}`;
    const logSettings = logKey in settingUpdates
        ? JSON.parse(settingUpdates[logKey])
        : JSON.parse(currentSettings[logKey].value);

    displayModal(`Update logging for ${key}`, contentHtml, '');

    const updateLogLevel = function (levels) {
        const level = levels[0];
        const currentObject = JSON.parse(currentSettings[logKey].value);
        if (logKey in settingUpdates) {
            const updateObject = JSON.parse(settingUpdates[logKey]);
            updateObject.level = level;
            if (updateObject.level === currentObject.level && updateObject.handlers.sort().join(',') === currentObject.handlers.sort().join(',')) {
                clearSettingUpdated(component, key);
            } else {
                markSettingUpdated(component, key, JSON.stringify(updateObject));
            }
        } else {
            markSettingUpdated(component, key, JSON.stringify({
                ...currentObject,
                level: level
            }));
        }
    };
    const levelSelect = createMultiselect('logLevelSelect', 'Level', true, updateLogLevel, LOG_LEVELS, logSettings.level);
    const updateLogHandlers = function (pill, handler) {
        const currentObject = JSON.parse(currentSettings[logKey].value);
        if (logKey in settingUpdates) {
            const updateObject = JSON.parse(settingUpdates[logKey]);
            if (updateObject.handlers.includes(handler)) {
                updateObject.handlers = updateObject.handlers.filter(h => h !== handler);
            } else {
                updateObject.handlers.push(handler);
            }
            if (updateObject.level === currentObject.level && updateObject.handlers.sort().join(',') === currentObject.handlers.sort().join(',')) {
                clearSettingUpdated(component, key);
            } else {
                markSettingUpdated(component, key, JSON.stringify(updateObject));
            }
        } else {
            let handlers = [...currentObject.handlers];
            if (handlers.includes(handler)) {
                handlers = handlers.filter(h => h !== handler);
            } else {
                handlers.push(handler);
            }
            markSettingUpdated(component, key, JSON.stringify({
                ...currentObject,
                handlers: handlers
            }));
        }
    };
    const handlerBox = createPillbox('handlerPillbox', checkPermission('admin'), HANDLER_TYPES, undefined, undefined, updateLogHandlers, updateLogHandlers);
    handlerBox.addValues(logSettings.handlers, checkPermission('admin'));
}

function updateLogSetting(component, key) {
    const handlersList = [];
    $('#handlerPillbox').find('.pillbox-item').each((i, element) => {
        handlersList.push($(element).data('val'));
    });

    const logKey = `${component}.${key}`;
    const currentValue = logKey in settingUpdates
        ? JSON.parse(settingUpdates[logKey])
        : JSON.parse(currentSettings[logKey].value);

    settingUpdates[logKey] = JSON.stringify({
        ...currentValue,
        level: $('#logLevelSelect').data('selected'),
        handlers: handlersList
    });

    stageSettingUpdate(component, key);
}

function openResetModal(component, key) {
    const contentHtml = `
        <div class="form-group">
            <label class="form-label">Current Value</label>
            <pre class="form-control-plaintext settings-value-pre">${textToHtml(currentSettings[`${component}.${key}`].value)}</pre>
        </div>
        <div class="form-group">
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
    try {
        await apiPost(API_ENDPOINTS.SETTINGS_RESET(component, key), {});

        const setting = currentSettings[`${component}.${key}`];
        setting.value = setting.default_value;

        closeModal();
        const row = $(`.settings-row[data-component="${component}"][data-key="${key}"]`);
        row.replaceWith(renderSettingRow(component, setting));
        setTimeout(() => row.removeClass('save-success'), 1000);

        sendToast('Success', `Setting ${component}.${key} reset to its default value`);
    } catch (error) {
        sendToast('Error', `Error resetting setting: ${error.message}`, 5, 'var(--error-cancel)', 'fa-times');
    }
}
