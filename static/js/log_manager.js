let searchTimeout;

$(document).ready(function () {
    loadContent()
});

$(window).on("hashchange", function () {
    loadContent();
});

function loadContent() {
    let fragment = window.location.hash.slice(1);
    if (fragment.length > 0) {
        displayLogFile(fragment);
    } else {
        displayLogsDir();
    }
}

function displayLogsDir() {
    let html = `
    <div class="panel-controls panel-controls-top">
        <input type="text" id="logSearch" class="search-box" placeholder="Search log name..." />
    </div>
    <div id="logList">
        <p>Loading...</p>
    </div>
    `
    $("#adminDisplay").html(html);
    const logsUrl = new URL("/api/manage/logs", window.location.origin);
    fetch(logsUrl)
        .then(response => response.json())
        .then(data => {
            $("#logList").html(generateLogTreeHTML(data));
            $("#logSearch").on("input", function () {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    let filter = $(this).val().trim().toLowerCase();
                    if (filter.length > 0) {
                        $("#logList").html(generateLogSearchResultsHTML(data, filter));
                    } else {
                        $("#logList").html(generateLogTreeHTML(data));
                    }
                }, 500);
            });
            $(".log-subtree").on("mouseenter", function () {
                $(this).parent(".log-folder").removeClass("text-hoverable");
            })
            $(".log-subtree").on("mouseleave", function () {
                $(this).parent(".log-folder").addClass("text-hoverable");
            });
            $("#logList").on("click", ".log-folder", function (event) {
                event.stopPropagation();
                let folder = $(this);
                let subtree = folder.children(".log-subtree");
                let isExpanded = folder.data("expanded") === "true"
                if (isExpanded) {
                    folder.data("expanded", String(!isExpanded));
                    subtree.find(".log-folder").data("expanded", "false");
                    subtree.find(".log-subtree").addClass("hidden");
                    subtree.addClass("hidden");
                } else {
                    folder.data("expanded", String(!isExpanded));
                    subtree.removeClass("hidden")
                }
            });
        })
        .catch(error => {
            console.error("Error fetching content:", error);
            $("#adminDisplay").html(`<p>Failed to load logs: ${error.message}</p>`);
        });
}

function generateLogTreeHTML(logTree, parentPath = "") {
    let html = `<ul class="item-list">`;
    const treeKeys = Object.keys(logTree).filter(key => key !== "_type");
    for (let i = 0; i < treeKeys.length; i++) {
        const key = treeKeys[i];
        const value = logTree[key];
        let fullPath = parentPath ? `${parentPath}/${key}` : key;
        if (value._type === "directory") {
            html += `
            <li class="text-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == treeKeys.length - 1 ? ` item-row-bottom` : ``} log-folder" data-expanded="false">
                <i class="fas fa-folder"></i> ${key}
                <ul class="log-subtree hidden">
                    ${generateLogTreeHTML(value, fullPath)}
                </ul>
            </li>
            `;
        } else if (value._type === "file") {
            html += `
            <li class="text-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == treeKeys.length - 1 ? ` item-row-bottom` : ``} log-file" onclick="window.location.hash = '${value.path}'">
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
        const treeKeys = Object.keys(tree).filter(key => key !== "_type");
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
        <li class="text-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == matchingFiles.length - 1 ? ` item-row-bottom` : ``} log-file" onclick="window.location.hash = '${file.path}'">
            <i class="far fa-file"></i> ${file.path} <span class="log-size">(${formatFileSize(file.size)})</span>
        </li>
        `;
    });
    html += `</ul>`;
    return html;
}

function displayLogFile(path) {
    let html = `
    <div class="panel-controls panel-controls-top">
        <a class="circle-icon-btn color-hoverable" href="#">
            <i class="fas fa-arrow-left"></i>
        </a>
        <input type="text" id="logSearch" class="search-box" placeholder="Search log messages..."/>
    </div>
    <div id="logList" class="scroll-shadow-wrapper">
        <table class="log-table">
            <thead id="logTableHead">
                <tr>
                    <th class="log-time">Time</th>
                    <th class="log-component">Component</th>
                    <th class="log-message">Message</th>
                </tr>
            </thead>
            <div class="scroll-shadow">
                <tbody id="logTableBody">
                </tbody>
            </div>
        </table>
    </div>
    `
    $("#adminDisplay").html(html);
    $("#logTableBody").on("scroll", function () {
        updateScrollShadows();
    });
    const logsUrl = new URL(`/api/manage/logs/${path}`, window.location.origin);
    fetch(logsUrl)
        .then(async response => {

            function appendLogRow(logEntry) {
                if (!response.body) {
                    $("#logTableBody").append(`<tr style="background-color: #8B0000;"><td class="log-display" colspan="3">Did not receive data, log may be empty.</td></tr>`);
                    return;
                } else if ("error" in logEntry) {
                    $("#logTableBody").append(`<tr style="background-color: #8B0000;"><td class="log-display" colspan="3">Error: ${logEntry.error}</td></tr>`);
                    return;
                }
                const levelClass = `log-level-${logEntry.levelname.toLowerCase()}`;
                const truncatedMessage = logEntry.message.length > 100
                    ? logEntry.message.substring(0, 100) + "..."
                    : logEntry.message;
                let htmlFriendlyMessage = textToHtml(logEntry.message);
                let rowId = crypto.randomUUID();
                let rowHtml = `
                <tr id="row-${rowId}" class="log-row ${levelClass}">
                    <td class="log-display log-time">${logEntry.asctime}</td>
                    <td class="log-display log-component">${logEntry.name}</td>
                    <td class="log-display log-message">${truncatedMessage}</td>
                </tr>
                <tr class="log-full-message collapsed">
                    <td colspan="3">
                        <div class="log-message-display">${htmlFriendlyMessage}</div>
                    </td>
                </tr>
                `;
                $("#logTableBody").append(rowHtml);
                $(document).on("click", `#row-${rowId}`, function () {
                    let row = $(this);
                    let fullMessageRow = row.next(".log-full-message");
                    fullMessageRow.removeClass("last");
                    let rowBottom = row.offset().top + row.height();
                    let middleOfTableBody = $("#logTableHead").offset().top + $("#logTableHead").height() + ($("#logTableBody").height() / 2);
                    let scrollOffset = $("#logTableBody").scrollTop() + rowBottom - middleOfTableBody;
                    if (fullMessageRow.hasClass("collapsed")) {
                        fullMessageRow.removeClass("collapsed");
                        $("#logTableBody").animate({
                            scrollTop: scrollOffset
                        }, 800, function () {
                            row.focus();
                        });
                    } else {
                        fullMessageRow.addClass("collapsed");
                    }
                    updateLogRowBorders();
                });
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            function processChunk({ done, value }) {
                if (done) {
                    updateLogRowBorders();
                    updateScrollShadows();
                    return
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
        .catch(error => {
            console.error("Error fetching log entries:", error);
            $("#logTableBody").append("<tr><td colspan='3'>Encountered error while fetching log data.</td></tr>");
        });
}

function updateLogRowBorders() {
    $("#logTableBody tr td.log-display").css({
        "border-bottom-left-radius": "0",
        "border-bottom-right-radius": "0",
        "border-bottom": "1px solid var(--main-background)"
    });
    let lastVisibleRow = $("#logTableBody tr").not(".collapsed").not(".log-hidden").last();
    let potentialLogMessage = lastVisibleRow.next("tr")
    if (potentialLogMessage) {
        potentialLogMessage.addClass("last");
        potentialLogMessage.css({
            "border-bottom-left-radius": "",
            "border-bottom-right-radius": ""
        });
        potentialLogMessage.find("td").css("border-bottom", "")
        potentialLogMessage.find("td:first-of-type").css("border-bottom-left-radius", "");
        potentialLogMessage.find("td:last-of-type").css("border-bottom-right-radius", "");
    }
    lastVisibleRow.css({
        "border-bottom-left-radius": "var(--corner-rounding)",
        "border-bottom-right-radius": "var(--corner-rounding)"
    });
    lastVisibleRow.find("td").css("border-bottom", "0.2rem solid var(--main-background)")
    lastVisibleRow.find("td:first-of-type").css("border-bottom-left-radius", "var(--corner-rounding)");
    lastVisibleRow.find("td:last-of-type").css("border-bottom-right-radius", "var(--corner-rounding)");
}

function updateScrollShadows() {
    let tableBody = $("#logTableBody");
    let wrapper = tableBody.parents(".scroll-shadow-wrapper");
    let scrollTop = tableBody.scrollTop();
    let maxScroll = tableBody[0].scrollHeight - tableBody.outerHeight() - 2;
    wrapper.toggleClass("show-top-gradient", scrollTop > 0);
    wrapper.toggleClass("show-bottom-gradient", scrollTop < maxScroll);
}