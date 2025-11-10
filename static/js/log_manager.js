const logsDirHtml = `
<div class="panel-controls panel-controls-top">
    <input type="text" id="logSearch" class="form-input" placeholder="Search log name..." />
</div>
<div style="position: relative">
    <div class="scroll-shadow shadow-top-gradient"></div>
    <div id="logList">
        ${spinnerHtml}
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
        let rowNum = $(entry.target).data("row-num");
        let newHeight = $(entry.target).outerHeight();
        $(entry.target).closest(".log-message-wrapper").find(`.line-number-display div[data-row-num="${rowNum}"]`).css("height", newHeight + "px");
    });
});

$(() => {
    loadContent()
    $(document).on("mouseenter", ".log-num-row, .log-line-row", function (e) {
        let rowNum = $(e.target).data("row-num");
        $(e.target).closest(".log-message-wrapper").find(`div[data-row-num="${rowNum}"]`).addClass("hovered-line");
    });
    $(document).on("mouseleave", ".log-num-row, .log-line-row", function (e) {
        let rowNum = $(e.target).data("row-num");
        $(e.target).closest(".log-message-wrapper").find(`div[data-row-num="${rowNum}"]`).removeClass("hovered-line");
    });
});

$(window).on("hashchange", function () {
    loadContent();
});

function loadContent() {
    const fragment = window.location.hash.slice(1);
    if (fragment.length > 0) {
        displayLogFile(fragment);
    } else {
        displayLogsDir();
    }
}

function displayLogsDir() {
    $("#adminDisplay").html(logsDirHtml);
    const logsUrl = new URL("/api/manage/logs", window.location.origin);
    fetch(logsUrl)
        .then((response) => response.json())
        .then((data) => {
            const logList = $("#logList");
            logList.html(generateLogTreeHTML(data));
            startScrollShadows(logList);
            $("#logSearch").on("input", function () {
                clearTimeout(inputTimeout);
                inputTimeout = setTimeout(() => {
                    const filter = $(this).val().trim().toLowerCase();
                    if (filter.length > 0) {
                        logList.html(generateLogSearchResultsHTML(data, filter));
                    } else {
                        logList.html(generateLogTreeHTML(data));
                    }
                }, 500);
            });
            $(".log-subtree").on("mouseenter", function () {
                $(this).parent(".log-folder").removeClass("text-hoverable back-hoverable");
            })
            $(".log-subtree").on("mouseleave", function () {
                $(this).parent(".log-folder").addClass("text-hoverable back-hoverable");
            });
            logList.on("click", ".log-folder", function (event) {
                event.stopPropagation();
                const folder = $(this);
                const subtree = folder.children(".log-subtree");
                const isExpanded = folder.data("expanded") === "true"
                if (isExpanded) {
                    folder.data("expanded", String(!isExpanded));
                    subtree.find(".log-folder").data("expanded", "false");
                    subtree.find(".log-subtree").addClass("hidden");
                    subtree.addClass("hidden");
                } else {
                    folder.data("expanded", String(!isExpanded));
                    subtree.removeClass("hidden")
                }
                updateScrollShadows(logList);
            });
        })
        .catch((error) => {
            console.error("Error fetching content:", error);
            $("#adminDisplay").html(`<p>Failed to load logs: ${error.message}</p>`);
        });
}

function generateLogTreeHTML(logTree, parentPath = "") {
    let html = `<ul class="item-list">`;
    const treeKeys = Object.keys(logTree).filter((key) => key !== "_type");
    for (let i = 0; i < treeKeys.length; i++) {
        const key = treeKeys[i];
        const value = logTree[key];
        const fullPath = parentPath ? `${parentPath}/${key}` : key;
        if (value._type === "directory") {
            html += `
            <li class="text-hoverable back-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == treeKeys.length - 1 ? ` item-row-bottom` : ``} log-folder" data-expanded="false">
                <i class="fas fa-folder"></i> ${key}
                <ul class="log-subtree hidden">
                    ${generateLogTreeHTML(value, fullPath)}
                </ul>
            </li>
            `;
        } else if (value._type === "file") {
            html += `
            <li class="text-hoverable back-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == treeKeys.length - 1 ? ` item-row-bottom` : ``} log-file" onclick="window.location.hash = '${value.path}'">
                <i class="far fa-file"></i> ${key} <span class="log-size">(${formatFileSize(value.size)})</span>
            </li>
            `;
        }
    }
    html += `</ul>`;
    return html;
}

function generateLogSearchResultsHTML(logTree, filterValue, parentPath = "") {
    let matchingFiles = [];
    function findMatchingFiles(tree, currentPath = "") {
        const treeKeys = Object.keys(tree).filter((key) => key !== "_type");
        for (let i = 0; i < treeKeys.length; i++) {
            const key = treeKeys[i];
            const value = tree[key];
            let fullPath = currentPath ? `${currentPath}/${key}` : key;
            if (value._type === "file" && value.path.toLowerCase().includes(filterValue)) {
                matchingFiles.push({
                    name: key,
                    path: value.path,
                    size: value.size
                });
            } else if (value._type === "directory") {
                findMatchingFiles(value, fullPath);
            }
        }
    }
    findMatchingFiles(logTree, parentPath);
    let html = `<ul class="item-list">`;
    matchingFiles.forEach((file, i) => {
        html += `
        <li class="text-hoverable back-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == matchingFiles.length - 1 ? ` item-row-bottom` : ``} log-file" onclick="window.location.hash = '${file.path}'">
            <i class="far fa-file"></i> ${file.path} <span class="log-size">(${formatFileSize(file.size)})</span>
        </li>
        `;
    });
    html += `</ul>`;
    return html;
}

function displayLogFile(path) {
    $("#adminDisplay").html(logFileHtml);
    const logTableBody = $("#logTableBody");
    startScrollShadows(logTableBody);
    $("#logSearch").on("input", function () {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(() => {
            filterLogs();
        }, 500);
    });
    createMultiselect("levelFilter", "Level", "filterLogs", [["DEBUG", "DEBUG"], ["INFO", "INFO"], ["WARNING", "WARNING"], ["ERROR", "ERROR"], ["CRITICAL", "CRITICAL"]]);
    createMultiselect("componentFilter", "Component", "filterLogs", []);
    const logsUrl = new URL(`/api/manage/logs/${path}`, window.location.origin);
    fetch(logsUrl)
        .then(async (response) => {
            function appendLogRow(logEntry) {
                if (!response.body) {
                    logTableBody.append(`<tr style="background-color: #8B0000"><td class="log-display" colspan="3">Did not receive data, log may be empty.</td></tr>`);
                    updateLogTableBorders();
                    updateScrollShadows(logTableBody);
                    return;
                } else if ("error" in logEntry) {
                    logTableBody.append(`<tr style="background-color: #8B0000"><td class="log-display" colspan="3">Error: ${logEntry.error}</td></tr>`);
                    updateLogTableBorders();
                    updateScrollShadows(logTableBody);
                    return;
                }
                addMultiselectOptions("componentFilter", "filterLogs", [[logEntry.name, logEntry.name]]);
                const levelClass = `log-level-${logEntry.levelname.toLowerCase()}`;
                const truncatedMessage = logEntry.message.length > 100
                    ? logEntry.message.substring(0, 100) + "..."
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
                        <div class="log-message-wrapper">
                            <div class="line-number-display" style="max-width: ${messageLineCount.toString().length}.5rem"></div>
                            <div class="log-message-display" style="width: calc(100% - ${messageLineCount.toString().length / 2}rem)"></div>
                        </div>
                    </td>
                </tr>
                `;
                logTableBody.append(rowHtml);
                const fullMessageRow = $(`#row-${rowId}`).next();
                const lineDisplay = fullMessageRow.find(".line-number-display");
                const messageDisplay = fullMessageRow.find(".log-message-display");
                for (var n = 0; n < messageLineCount; n++) {
                    let messageLineNumber = $(`<div class="log-num-row" data-row-num="${n}">${n + 1}</div>`);
                    let messageHtml = $(`<div class="log-line-row" data-row-num="${n}">${textToHtml(messageLines[n])}</div>`);
                    lineDisplay.append(messageLineNumber);
                    messageDisplay.append(messageHtml);
                    rowResizeObserver.observe(messageHtml[0]);
                }
                $(document).on("click", `#row-${rowId}`, function () {
                    let row = $(this);
                    let fullMessageRow = row.next(".log-full-message");
                    let fullMessageHeight = fullMessageRow.height();
                    fullMessageRow.removeClass("last");
                    let rowBottom = row.offset().top + row.height();
                    let middleOfTableBody = $("#logTableHead").offset().top + $("#logTableHead").height() + (logTableBody.height() / 2);
                    let scrollOffset = logTableBody.scrollTop() + rowBottom - middleOfTableBody;
                    if (fullMessageRow.hasClass("collapsed")) {
                        fullMessageRow.removeClass("collapsed");
                        logTableBody.animate({
                            scrollTop: scrollOffset
                        }, 350, () => {
                            row.trigger("focus");
                            updateScrollShadows(logTableBody);
                        });
                    } else {
                        fullMessageRow.addClass("collapsed");
                        logTableBody.animate({
                            scrollTop: logTableBody.scrollTop() - fullMessageHeight + 2
                        }, 350, () => {
                            updateScrollShadows(logTableBody);
                        });
                    }
                    updateLogTableBorders();
                });
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            function processChunk({ done, value }) {
                if (done) {
                    updateLogTableBorders();
                    updateScrollShadows(logTableBody);
                    return;
                };
                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split("\n");
                buffer = lines.pop();
                for (let line of lines) {
                    if (line.trim() === "") continue;
                    try {
                        let logEntry = JSON.parse(line);
                        appendLogRow(logEntry);
                    } catch (e) {
                        console.error("Error parsing log entry:", e);
                    }
                }
                return reader.read().then(processChunk);
            }
            const result = await reader.read();
            return processChunk(result);
        })
        .catch((error) => {
            console.error("Error fetching log entries:", error);
            logTableBody.append(`<tr style="background-color: #8B0000"><td colspan='3'>Encountered error while fetching log data.</td></tr>`);
            updateLogTableBorders();
            updateScrollShadows(logTableBody);
        });
}

function updateLogTableBorders() {
    const headRow = $("#logTableHead tr");
    headRow.css({
        "border-bottom-left-radius": "",
        "border-bottom-right-radius": ""
    });
    headRow.find("th").css({
        "border-bottom-left-radius": "",
        "border-bottom-right-radius": ""
    });
    $("#logTableBody tr").css({
        "border-bottom-left-radius": "",
        "border-bottom-right-radius": "",
    });
    $("#logTableBody tr td").css({
        "border-bottom-left-radius": "",
        "border-bottom-right-radius": "",
        "border-bottom": "1px solid var(--main-background)"
    });
    $("tr.log-full-message").removeClass("last");

    const lastVisibleRow = $("#logTableBody tr").not(".collapsed").not(".log-hidden").last();
    if (lastVisibleRow.length > 0) {
        const potentialLogMessage = lastVisibleRow.next("tr.log-full-message");
        if (potentialLogMessage.length > 0) {
            potentialLogMessage.addClass("last");
            potentialLogMessage.css({
                "border-bottom-left-radius": "",
                "border-bottom-right-radius": ""
            });
            potentialLogMessage.find("td").css("border-bottom", "");
            potentialLogMessage.find("td:first-of-type").css("border-bottom-left-radius", "");
            potentialLogMessage.find("td:last-of-type").css("border-bottom-right-radius", "");
        }
        lastVisibleRow.css({
            "border-bottom-left-radius": "var(--corner-rounding)",
            "border-bottom-right-radius": "var(--corner-rounding)"
        });
        lastVisibleRow.find("td").css("border-bottom", "0.2rem solid var(--main-background)");
        lastVisibleRow.find("td:first-of-type").css("border-bottom-left-radius", "var(--corner-rounding)");
        lastVisibleRow.find("td:last-of-type").css("border-bottom-right-radius", "var(--corner-rounding)");
    } else {
        headRow.css({
            "border-bottom-left-radius": "var(--corner-rounding)",
            "border-bottom-right-radius": "var(--corner-rounding)"
        });
        headRow.find("th:first-of-type").css("border-bottom-left-radius", "var(--corner-rounding)");
        headRow.find("th:last-of-type").css("border-bottom-right-radius", "var(--corner-rounding)");
    }
}

function displayLogFilters() {
    $("#logFilterPanel").toggleClass("collapsed");
}

function filterLogs() {
    const logTableBody = $("#logTableBody");
    $(".show-shadow").removeClass("show-shadow");
    logTableBody.find("tr").removeClass("log-hidden");
    const selectFilterActive = multiselectFilter("#levelFilter", "level") | multiselectFilter("#componentFilter", "component");
    selectFilterActive ? $("#logFilterBtn").addClass("active") : $("#logFilterBtn").removeClass("active");
    const filter = $("#logSearch").val().trim().toLowerCase();
    if (filter.length > 0) {
        logTableBody.find("tr.log-full-message").not("log-hidden").each(function () {
            if (!$(this).text().toLowerCase().includes(filter)) {
                $(this).addClass("collapsed log-hidden");
                $(this).prev("tr.log-row").addClass("log-hidden");
            }
        });
    }
    updateLogTableBorders();
    updateScrollShadows(logTableBody);
}

function multiselectFilter(id, datakey) {
    let filterActive = false;
    const selectedValues = $(id).data("selected");
    if (selectedValues.length > 0) {
        filterActive = true;
        $("#logTableBody").find("tr.log-row").each(function () {
            if (!selectedValues.includes($(this).data(datakey))) {
                $(this).addClass("log-hidden");
                $(this).next("tr.log-full-message").addClass("collapsed log-hidden");
            }
        });
    }
    return filterActive;
}