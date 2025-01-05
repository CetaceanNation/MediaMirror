var listPage = 1;
var pageSize = 15;

$(document).ready(function () {
    loadFragmentContent();
    $(window).on("hashchange", function () {
        loadFragmentContent();
    });
});

function loadFragmentContent() {
    let fragment = window.location.hash.slice(1);
    if (fragment.length > 0) {
        switch (fragment) {
            case "users":
                displayUserList();
                break;
            case "logs":
                displayLogsDir();
                break;
            default:
                $("#adminDisplay").html(`<h3>Content could not be loaded.</h3>`);
        }
    } else {
        $("#adminDisplay").html(`<h3>Choose a section</h3>`);
    }
}

function displayUserList() {
    listPage = 1;
    let html = `
    <div class="panel-controls panel-controls-top">
        <input type="text" id="userSearch" class="search-box" placeholder="Search users..."/>
        <button class="item-btn color-hoverable" id="addUserButton" data-permission="manage-users" onclick="displayAddUser()">Add User</button>
    </div>
    <div id="userList">
        <p>Loading...</p>
    </div>
    <div class="panel-controls panel-controls-bottom">
        <button class="pagination-btn color-hoverable" id="prevPage" onclick="prevListPage(updateUserList)" disabled="">
            <i class="fas fa-chevron-left"></i>
        </button>
        <span class="page-number" id="currentPage">${listPage}</span>
        <button class="pagination-btn color-hoverable" id="nextPage" onclick="nextListPage(updateUserList)" disabled="">
            <i class="fas fa-chevron-right"></i>
        </button>
    </div>
    `;
    $("#adminDisplay").html(html);
    updateUserList();
    $(document).on("input", "#userSearch", function () {
        updateUserList();
    });
}

function updateUserList() {
    const userUrl = new URL("/api/manage/users", window.location.origin);
    let filter = $("#userSearch").val().trim();
    if (filter.length > 0) {
        userUrl.searchParams.append("username_filter", filter);
    }
    userUrl.searchParams.append("page", listPage);
    userUrl.searchParams.append("page_size", pageSize);
    fetch(userUrl)
        .then(response => response.json())
        .then(data => {
            if ("error" in data) {
                throw new Error(data["error"])
            }
            let html = `
            <ul class="item-list">
            `
            let users = data["users"]
            let pageNumber = data["page"]
            for (let i = 0; i < users.length; i++) {
                let user = users[i];
                html += `
                    <li class="text-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == users.length - 1 ? ` item-row-bottom` : ``}" onclick="editUser('${user.id}')">
                        <div class="item-content">
                            <span class="username">${user.username}</span> <span class="secondary-text" style="margin-left: 0.5rem;">( ${user.id} 
                                <button class="clipboard-btn icon-btn inverted" onclick="copyToClipboard(this, event, '${user.id}')">
                                    <i class="far fa-clipboard fadeable"></i>
                                    <i class="fas fa-check fadeable fadeable-faded"></i>
                                </button>
                            )</span>
                            ${checkPermission("modify-users") ? `<i class="far fa-edit hover-hidden" style="position: absolute; top: 0.3rem; right: 1rem;"></i>` : ``}
                        </div>
                    </li>
                `;
            }
            html += `
            </ul>
            `;
            $("#userList").html(html);
            $("#prevPage").prop("disabled", pageNumber == 1);
            $("#nextPage").prop("disabled", !data["next_page"]);
            $("#currentPage").text(pageNumber);
        })
        .catch(error => {
            console.error("Error fetching content:", error);
            $("#userList").html(`<p>Failed to load users: ${error.message}</p>`);
        });
}

function prevListPage(func) {
    listPage--;
    func();
}

function nextListPage(func) {
    listPage++;
    func();
}

function displayAddUser() {
    let content = `
    <div class="form-group">
        <label for="addUserUsername">Username</label>
        <input type="text" id="addUserUsername" class="form-control" placeholder="Enter username">
    </div>
    <div class="form-group">
        <label for="addUserPassword">Password</label>
        <input type="password" id="addUserPassword" class="form-control" placeholder="Enter password">
    </div>
    <div class="form-group">
        <label for="confirmUserPassword">Confirm Password</label>
        <input type="password" id="confirmUserPassword" class="form-control" placeholder="Confirm password">
    </div>
    `;
    let footer = `
    <button class="item-btn color-hoverable" id="submitUserButton" onclick="submitAddUser()">Add</button>
    `;
    displayModal("Add User", content, footer);
}

function submitAddUser() {

}

function removePermission(element, event, userId, perm) {
    event.stopPropagation();
    const url = "/api/manage/permissions";
    fetch(url, {
        method: "DELETE",
        data: {
            "user": userId,
            "key": perm
        }
    }).then(response => response.json()).then(data => {
        if (data.success) {
            $(element).closest('.tag').fadeOut(400, function () {
                $(this).remove();
            });
        } else {
            console.error("Failed to remove permission: ", data.error);
        }
    }).catch(error => {
        console.error("Error removing permission: ", error);
        alert("Failed to remove permission.");
    });
}

function displayLogsDir() {
    const logsUrl = new URL("/api/manage/logs", window.location.origin);
    let html = `
    <div class="panel-controls panel-controls-top">
        <input type="text" id="logSearch" class="search-box" placeholder="Search log name..."/>
    </div>
    <div id="logList">
        <p>Loading...</p>
    </div>
    `
    $("#adminDisplay").html(html);
    fetch(logsUrl)
        .then(response => response.json())
        .then(data => {
            $("#logList").html(generateLogTreeHTML(data));
            $("#logSearch").on("input", function () {
                let filter = $(this).val().trim().toLowerCase();
                if (filter.length > 0) {
                    $("#logList").html(generateLogSearchResultsHTML(data, filter));
                } else {
                    $("#logList").html(generateLogTreeHTML(data));
                }
            });
            $(".log-subtree").on("mouseenter", function () {
                $(this).parent(".log-folder").removeClass("text-hoverable");
            })
            $(".log-subtree").on("mouseleave", function () {
                $(this).parent(".log-folder").addClass("text-hoverable");
            });
            $("#adminDisplay").on("click", ".log-folder", function (event) {
                event.stopPropagation();
                let $folder = $(this);
                let $subtree = $folder.children(".log-subtree");

                if ($folder.hasClass("expanded")) {
                    $folder.removeClass("expanded");
                    $subtree.find(".log-folder").removeClass("expanded");
                    $subtree.find(".log-subtree").hide();
                    $subtree.hide();
                } else {
                    $folder.addClass("expanded");
                    $subtree.show();
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
            <li class="text-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == treeKeys.length - 1 ? ` item-row-bottom` : ``} log-folder">
                <i class="fas fa-folder"></i> ${key}
                <ul class="log-subtree" style="display: none;">
                    ${generateLogTreeHTML(value, fullPath)}
                </ul>
            </li>
            `;
        } else if (value._type === "file") {
            html += `
            <li class="text-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == treeKeys.length - 1 ? ` item-row-bottom` : ``} log-file" data-path="${value.path}" onclick="viewLogFile(this, event)">
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
        <li class="text-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == matchingFiles.length - 1 ? ` item-row-bottom` : ``} log-file" data-path="${file.path}" onclick="viewLogFile(this, event)">
            <i class="far fa-file"></i> ${file.path} <span class="log-size">(${formatFileSize(file.size)})</span>
        </li>
        `;
    });
    html += `</ul>`;
    return html;
}

function viewLogFile(element, event) {
    event.stopPropagation();
    let path = $(element).data("path");
    console.log("Get path " + path);
}