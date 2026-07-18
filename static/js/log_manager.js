// Templates
const logsDirHtml = `
<div class="panel-controls panel-controls-top">
    <input type="text" id="logSearch" class="form-input" placeholder="Search log name..." />
</div>
<div style="position: relative">
    <div class="scroll-shadow shadow-top-gradient"></div>
    <div id="logList">
        <div id="spinner">
            <div class="spinner-border">
                <span class="sr-only">Loading...</span>
            </div>
        </div>
    </div>
    <div class="scroll-shadow shadow-bottom-gradient"></div>
</div>
`;

const logFileHtml = `
<div class="panel-controls">
    <a class="circle-icon-btn color-hoverable" href="#">
        <i class="fas fa-arrow-left"></i>
    </a>
    <input type="text" id="logSearch" class="form-input" placeholder="Search log message contents..."/>
    <button class="circle-icon-btn color-hoverable" id="logFilterBtn" title="Display log entry filters" onclick="displayLogFilters()">
        <i class="fas fa-filter"></i>
    </button>
</div>
<div id="logFilterPanel" class="panel-controls panel-controls-top collapsed">
    <div id="levelFilter" style="width: 49%"></div>
    <div id="componentFilter" style="width: 49%"></div>
</div>
<div id="logList">
    <div class="scroll-shadow shadow-top-gradient"></div>
    <table class="log-table">
        <thead id="logTableHead">
            <tr style="border-bottom-left-radius: var(--corner-rounding); border-bottom-right-radius: var(--corner-rounding)">
                <th class="log-time" style="border-bottom-left-radius: var(--corner-rounding)">Time</th>
                <th class="log-component">Component</th>
                <th class="log-message" style="border-bottom-right-radius: var(--corner-rounding)">Message</th>
            </tr>
        </thead>
        <tbody id="logTableBody">
        </tbody>
    </table>
    <div class="scroll-shadow shadow-bottom-gradient"></div>
</div>
`;

const rowResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
        const rowNum = $(entry.target).data('row-num');
        const newHeight = $(entry.target).outerHeight();
        $(entry.target).closest('.log-message-wrapper').find(`.line-number-display div[data-row-num="${rowNum}"]`).css('height', newHeight + 'px');
    });
});

// Initialize
$(() => {
    $(window).on('hashchange', function () {
        loadContent();
    });
    loadContent();

    $(document).on('mouseenter', '.log-num-row, .log-line-row', function (e) {
        const rowNum = $(e.target).data('row-num');
        $(e.target).closest('.log-message-wrapper').find(`div[data-row-num="${rowNum}"]`).addClass('hovered-line');
    });

    $(document).on('mouseleave', '.log-num-row, .log-line-row', function (e) {
        const rowNum = $(e.target).data('row-num');
        $(e.target).closest('.log-message-wrapper').find(`div[data-row-num="${rowNum}"]`).removeClass('hovered-line');
    });

    $(document).on('mouseenter', '.log-subtree', function (e) {
        $(e.target).parent('.item-list').parent('.log-subtree').parent('.log-folder').removeClass('text-hoverable back-hoverable');
    });

    $(document).on('mouseleave', '.log-subtree', function (e) {
        $(e.target).parent('.item-list').parent('.log-subtree').parent('.log-folder').addClass('text-hoverable back-hoverable');
    });

    $(document).on('click', '.log-folder', function (e) {
        e.stopPropagation();
        const folder = $(e.target);
        const subtree = folder.children('.log-subtree');
        const isExpanded = folder.data('expanded') === 'true';
        if (isExpanded) {
            folder.data('expanded', String(!isExpanded));
            subtree.find('.log-folder').data('expanded', 'false');
            subtree.find('.log-subtree').addClass('hidden');
            subtree.addClass('hidden');
        } else {
            folder.data('expanded', String(!isExpanded));
            subtree.removeClass('hidden');
        }
        updateScrollShadows($('#logList'));
    });
});

async function loadContent() {
    const fragment = window.location.hash.slice(1);
    if (fragment.length > 0) {
        await displayLogFile(fragment);
    } else {
        await displayLogsDir();
    }
}

async function displayLogsDir() {
    $('#adminDisplay').html(logsDirHtml);
    const logsUrl = buildUrl(API_ENDPOINTS.LOGS);

    try {
        window.logResultData = await apiGet(logsUrl);
        const logList = $('#logList');

        logList.html(generateLogTreeHTML(logResultData));
        startScrollShadows(logList);
        $('#logSearch').off('input').on('input', function (e) {
            clearTimeout(window.inputTimeout);
            window.inputTimeout = setTimeout(() => {
                const filter = $(e.target).val().trim().toLowerCase();
                if (window.logResultData) {
                    if (filter.length > 0) {
                        $('#logList').html(generateLogSearchResultsHTML(window.logResultData, filter));
                    } else {
                        $('#logList').html(generateLogTreeHTML(window.logResultData));
                    }
                    updateScrollShadows($('#logList'));
                }
            }, 500);
        });
    } catch (error) {
        console.error('Error fetching content:', error);
        $('#adminDisplay').html(`<p>Failed to load logs: ${error.message}</p>`);
    }
}

function generateLogTreeHTML(logTree, parentPath = '') {
    const treeKeys = Object.keys(logTree).filter((key) => key !== '_type');
    let html = '<ul class="item-list">';

    for (let i = 0; i < treeKeys.length; i++) {
        const key = treeKeys[i];
        const value = logTree[key];
        const fullPath = parentPath ? `${parentPath}/${key}` : key;
        if (value._type === 'directory') {
            html += `
            <li class="item-row log-folder text-hoverable back-hoverable" data-expanded="false">
                <i class="fas fa-folder"></i> ${key}
                <ul class="log-subtree hidden">
                    ${generateLogTreeHTML(value, fullPath)}
                </ul>
            </li>
            `;
        } else if (value._type === 'file') {
            html += `
            <li class="item-row log-file text-hoverable back-hoverable" onclick="window.location.hash = '${value.path}'">
                <i class="far fa-file"></i> ${key} <span class="log-size">(${formatFileSize(value.size)})</span>
            </li>
            `;
        }
    }

    html += '</ul>';
    return html;
}

function generateLogSearchResultsHTML(logTree, filterValue, parentPath = '') {
    let matchingFiles = [];
    function findMatchingFiles(tree, currentPath = '') {
        Object.keys(tree).filter((key) => key !== '_type').forEach((key, i) => {
            const value = tree[key];
            let fullPath = currentPath ? `${currentPath}/${key}` : key;
            if (value._type === 'file' && value.path.toLowerCase().includes(filterValue)) {
                matchingFiles.push({
                    name: key,
                    path: value.path,
                    size: value.size
                });
            } else if (value._type === 'directory') {
                findMatchingFiles(value, fullPath);
            }
        });
    }
    findMatchingFiles(logTree, parentPath);
    let html = '<ul class="item-list">';
    matchingFiles.forEach((file, i) => {
        html += `
        <li class="text-hoverable back-hoverable item-row log-file" onclick="window.location.hash = '${file.path}'">
            <i class="far fa-file"></i> ${file.path} <span class="log-size">(${formatFileSize(file.size)})</span>
        </li>
        `;
    });
    html += '</ul>';
    return html;
}

async function displayLogFile(path) {
    $('#adminDisplay').html(logFileHtml);
    const logTableBody = $('#logTableBody');
    startScrollShadows(logTableBody);
    $('#logSearch').off('input').on('input', function () {
        clearTimeout(window.inputTimeout);
        window.inputTimeout = setTimeout(() => {
            filterLogs();
        }, 500);
    });

    window.levelFilter = createMultiselect('levelFilter', 'Level', false, filterLogs, LOG_LEVELS);
    window.componentFilter = createMultiselect('componentFilter', 'Component', false, filterLogs, []);
    const logsUrl = buildUrl(API_ENDPOINTS.LOG_FILE(path));

    try {
        const response = await fetch(logsUrl);

        function appendLogRow(logEntry) {
            if (!response.body) {
                logTableBody.append('<tr style="background-color: #8B0000"><td class="log-display" colspan="3">Did not receive data, log may be empty.</td></tr>');
                updateLogTableBorders();
                updateScrollShadows(logTableBody);
                return;
            } else if ('error' in logEntry) {
                logTableBody.append(`<tr style="background-color: #8B0000"><td class="log-display" colspan="3">Error: ${logEntry.error}</td></tr>`);
                updateLogTableBorders();
                updateScrollShadows(logTableBody);
                return;
            }

            window.componentFilter.addOptions(logEntry.name);
            const levelClass = `log-level-${logEntry.levelname.toLowerCase()}`;
            const truncatedMessage = logEntry.message.length > 100
                ? logEntry.message.substring(0, 100) + '...'
                : logEntry.message;
            const messageLines = logEntry.message.split(/\r\n|\r|\n/g);
            const messageLineCount = messageLines.length;
            const rowId = crypto.randomUUID();
            let rowHtml = `
            <tr id="row-${rowId}" data-level="${logEntry.levelname}" data-component="${logEntry.name}" class="log-row ${levelClass}">
                <td class="log-display log-time">${logEntry.asctime}</td>
                <td class="log-display log-component">${logEntry.name}</td>
                <td class="log-display log-message-trunc">${truncatedMessage}</td>
            </tr>
            <tr class="log-full-message collapsed">
                <td colspan="3">
            `;
            if (logEntry.user) {
                rowHtml += `
                    <div class="log-user-info">
                        <label>User:</label>
                        <span>${logEntry.user.username} (${logEntry.user.id})</span>
                        <br/>
                        <label>Permissions:</label>
                        <span>${logEntry.user.permissions.join(', ')}</span>
                    </div>
                `;
            }
            rowHtml += `
                    <div class="log-message-wrapper">
                        <div class="line-number-display" style="max-width: ${messageLineCount.toString().length}.5rem"></div>
                        <div class="log-message-display" style="width: calc(100% - ${messageLineCount.toString().length / 2}rem)"></div>
                    </div>
                </td>
            </tr>
            `;
            logTableBody.append(rowHtml);
            const fullMessageRow = $(`#row-${rowId}`).next();
            const lineDisplay = fullMessageRow.find('.line-number-display');
            const messageDisplay = fullMessageRow.find('.log-message-display');
            messageLines.forEach((logMessage, index) => {
                const messageLineNumber = $(`<div class="log-num-row" data-row-num="${index}">${index + 1}</div>`);
                const messageHtml = $(`<div class="log-line-row" data-row-num="${index}">${textToHtml(logMessage)}</div>`);
                lineDisplay.append(messageLineNumber);
                messageDisplay.append(messageHtml);
                rowResizeObserver.observe(messageHtml[0]);
            });
            $(document).on('click', `#row-${rowId}`, function (e) {
                const row = $(e.target).hasClass('log-row') ? $(e.target) : $(e.target).parent('.log-row');
                const fullMessageRow = row.next('.log-full-message');
                fullMessageRow.removeClass('last');
                const logTableHead = $('#logTableHead');
                let middleOfTableBody = logTableHead.offset().top + logTableHead.height() + (logTableBody.height() / 2);
                let scrollOffset = logTableBody.scrollTop() + row.offset().top + (row.height() * 3.5) - middleOfTableBody;
                if (fullMessageRow.hasClass('collapsed')) {
                    fullMessageRow.removeClass('collapsed');
                    logTableBody.animate({
                        scrollTop: scrollOffset
                    }, 350, () => {
                        row.trigger('focus');
                        updateScrollShadows(logTableBody);
                    });
                } else {
                    fullMessageRow.addClass('collapsed');
                    updateScrollShadows(logTableBody);
                }
                updateLogTableBorders();
            });
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        function processChunk({ done, value }) {
            if (done) {
                updateLogTableBorders();
                updateScrollShadows(logTableBody);
                return;
            };
            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split('\n');
            buffer = lines.pop();
            for (let line of lines) {
                if (line.trim() === '') continue;
                try {
                    let logEntry = JSON.parse(line);
                    appendLogRow(logEntry);
                } catch (e) {
                    console.error('Error parsing log entry:', e);
                }
            }
            return reader.read().then(processChunk);
        }
        const result = await reader.read();
        return processChunk(result);
    } catch (error) {
        console.error('Error fetching log entries:', error);
        logTableBody.append('<tr style="background-color: #8B0000"><td colspan="3">Encountered error while fetching log data.</td></tr>');
        updateLogTableBorders();
        updateScrollShadows(logTableBody);
    }
}

function updateLogTableBorders() {
    const headRow = $('#logTableHead tr');
    headRow.css({
        'border-bottom-left-radius': '',
        'border-bottom-right-radius': ''
    });
    headRow.find('th').css({
        'border-bottom-left-radius': '',
        'border-bottom-right-radius': ''
    });
    $('#logTableBody tr').css({
        'border-bottom-left-radius': '',
        'border-bottom-right-radius': '',
    });
    $('#logTableBody tr td').css({
        'border-bottom-left-radius': '',
        'border-bottom-right-radius': '',
        'border-bottom': '1px solid var(--main-background)'
    });
    $('tr.log-full-message').removeClass('last');

    const lastVisibleRow = $('#logTableBody tr').not('.collapsed').not('.log-hidden').last();
    if (lastVisibleRow.length > 0) {
        const potentialLogMessage = lastVisibleRow.next('tr.log-full-message');
        if (potentialLogMessage.length > 0) {
            potentialLogMessage.addClass('last');
            potentialLogMessage.css({
                'border-bottom-left-radius': '',
                'border-bottom-right-radius': ''
            });
            potentialLogMessage.find('td').css('border-bottom', '');
            potentialLogMessage.find('td:first-of-type').css('border-bottom-left-radius', '');
            potentialLogMessage.find('td:last-of-type').css('border-bottom-right-radius', '');
        }
        lastVisibleRow.css({
            'border-bottom-left-radius': 'var(--corner-rounding)',
            'border-bottom-right-radius': 'var(--corner-rounding)'
        });
        lastVisibleRow.find('td').css('border-bottom', '0.2rem solid var(--main-background)');
        lastVisibleRow.find('td:first-of-type').css('border-bottom-left-radius', 'var(--corner-rounding)');
        lastVisibleRow.find('td:last-of-type').css('border-bottom-right-radius', 'var(--corner-rounding)');
    } else {
        headRow.css({
            'border-bottom-left-radius': 'var(--corner-rounding)',
            'border-bottom-right-radius': 'var(--corner-rounding)'
        });
        headRow.find('th:first-of-type').css('border-bottom-left-radius', 'var(--corner-rounding)');
        headRow.find('th:last-of-type').css('border-bottom-right-radius', 'var(--corner-rounding)');
    }
}

function displayLogFilters() {
    $('#logFilterPanel').toggleClass('collapsed');
}

function filterLogs() {
    const logTableBody = $('#logTableBody');
    $('.show-shadow').removeClass('show-shadow');
    logTableBody.find('tr').removeClass('log-hidden');

    const levelFilterActive = window.levelFilter && window.levelFilter.getValue().length > 0;
    const componentFilterActive = window.componentFilter && window.componentFilter.getValue().length > 0;
    const selectFilterActive = levelFilterActive || componentFilterActive;

    if (selectFilterActive) {
        $('#logFilterBtn').addClass('active');
        logTableBody.find('tr.log-row').each(function () {
            const $this = $(this);
            const levelMatch = !levelFilterActive || window.levelFilter.getValue().includes($this.data('level'));
            const componentMatch = !componentFilterActive || window.componentFilter.getValue().includes($this.data('component'));

            if (!levelMatch || !componentMatch) {
                $this.addClass('log-hidden');
                $this.next('tr.log-full-message').addClass('collapsed log-hidden');
            }
        });
    } else {
        $('#logFilterBtn').removeClass('active');
    }

    const textFilter = $('#logSearch').val().trim().toLowerCase();
    if (textFilter.length > 0) {
        logTableBody.find('tr.log-full-message').not('.log-hidden').each(function () {
            if (!$(this).text().toLowerCase().includes(textFilter)) {
                $(this).addClass('collapsed log-hidden');
                $(this).prev('tr.log-row').addClass('log-hidden');
            }
        });
    }
    updateLogTableBorders();
    updateScrollShadows(logTableBody);
}

// Make functions globally available for backward compatibility
window.loadContent = loadContent;
window.displayLogsDir = displayLogsDir;
window.displayLogFile = displayLogFile;
window.generateLogTreeHTML = generateLogTreeHTML;
window.generateLogSearchResultsHTML = generateLogSearchResultsHTML;
window.updateLogTableBorders = updateLogTableBorders;
window.displayLogFilters = displayLogFilters;
window.filterLogs = filterLogs;
