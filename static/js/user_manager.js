let pageSize = 15;
let permissionDict = {};
const addUserContent = `
<div class="form-group">
    <label for="addUserUsername">Username</label>
    <input type="text" id="addUserUsername" class="form-input form-control" title="Username" placeholder="Enter username">
</div>
<div class="form-group">
    <label for="addUserPassword">Password</label>
    <input type="password" id="addUserPassword" class="form-input form-control" title="Password" placeholder="Enter password">
</div>
<div class="form-group">
    <label for="confirmUserPassword">Confirm Password</label>
    <input type="password" id="confirmUserPassword" class="form-input form-control" title="Confirm Password" placeholder="Confirm password">
</div>
`;
const addUserFooter = `
<span id="modalError"></span>
<button class="item-btn color-hoverable" id="submitUserButton" title="Add user" onclick="submitAddUser()">Add</button>
`;

$(document).ready(() => {
    updateUserList();
});

$("#userSearch").on("input", () => {
    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(() => {
        updateUserList();
    }, 500);
});

function updateUserList() {
    const userUrl = new URL("/api/manage/users", window.location.origin);
    const filter = $("#userSearch").val().trim();
    if (filter.length > 0) {
        userUrl.searchParams.append("username_filter", filter);
    }
    userUrl.searchParams.append("page", listPage);
    userUrl.searchParams.append("page_size", pageSize);
    fetch(userUrl)
        .then((response) => response.json())
        .then((data) => {
            if ("error" in data) {
                throw new Error(data["error"]);
            }
            let html = `
            <ul class="item-list">
            `;
            const users = data["users"]
            let pageNumber = data["page"]
            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                html += `
                    <li class="text-hoverable back-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == users.length - 1 ? ` item-row-bottom` : ``}" data-uid="${user.id}" onclick="editUser(this)" tabindex="0">
                        <div class="item-content">
                            <span class="username">${user.username}</span>
                            <span class="rounded-circle online-status" style="background-color: 
                `;
                if ("last_seen" in user && user["last_seen"]) {
                    const lastSeen = getDayJS(user["last_seen"]);
                    if (dayjs.utc().diff(lastSeen, "minute") < 15) {
                        html += `var(--bs-teal)" title="Last seen ${lastSeen.fromNow()}"`;
                    } else {
                        html += `var(--bs-dark)" title="Last seen ${lastSeen.local().format("llll")}"`;
                    }
                } else {
                    html += `var(--bs-red)" title="Awaiting first login"`;
                }
                html += `
                ></span>
                        <span class="secondary-text">(</span>
                        <span class="secondary-text">&nbsp;${user.id}&nbsp;</span>
                        <button class="clipboard-btn icon-btn inverted" title="Copy user ID" onclick="copyToClipboard('${user.id}', this, event)">
                            <i class="far fa-clipboard fadeable"></i>
                            <i class="fas fa-check fadeable fadeable-faded"></i>
                        </button>
                        <span class="secondary-text">&nbsp;)</span>
                        ${checkPermission("modify-users") ? `<i class="far fa-edit hover-hidden" style="position: absolute; right: 1rem;"></i>` : ``}
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
        .catch((error) => {
            console.error("Error fetching content:", error);
            $("#userList").html(`<p>Failed to load users: ${error.message}</p>`);
        });
}

function displayAddUser() {
    displayModal("Add User", addUserContent, addUserFooter);
    $("#addUserUsername").focus();
}

function submitAddUser() {
    const username = $("#addUserUsername").val().trim();
    const password = $("#addUserPassword").val();
    const confirmPassword = $("#confirmUserPassword").val();

    if (!username) {
        modalError(`Missing required field "Username".`, ["#addUserUsername"]);
        return;
    } else if (!password) {
        modalError(`Missing required field "Password".`, ["#addUserPassword"]);
        return;
    } else if (!confirmPassword) {
        modalError(`Missing required field "Confirm Password".`, ["#confirmUserPassword"]);
        return;
    } else if (password !== confirmPassword) {
        modalError("Passwords do not match.", ["#addUserPassword", "#confirmUserPassword"]);
        return;
    }

    let requestData = {
        username: username,
        password: password,
        confirm_password: confirmPassword
    };

    const userUrl = new URL("/api/manage/users", window.location.origin);
    fetch(userUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestData)
    })
        .then(async (response) => {
            const data = await response.json();
            if (!response.ok) {
                if ("error" in data) {
                    switch (response.status) {
                        case 400:
                            modalError(data["error"], ["#addUserPassword", "#confirmUserPassword"]);
                            return;
                        case 409:
                            modalError(data["error"], ["#addUserUsername"]);
                            return;
                        default:
                            throw new Error(data["error"]);
                    }
                } else {
                    throw new Error("Got bad response from the server.");
                }
            }
            updateUserList();
            closeModal();
            sendToast("User added successfully", "ID: " + data["user_id"], 5, "var(--bs-green)");
        })
        .catch((error) => modalError(error.message));
}

function submitDeleteUser(userId) {
    const userUrl = new URL(`/api/manage/users/${userId}`, window.location.origin);
    fetch(userUrl, {
        method: "DELETE"
    })
        .then(async (response) => {
            if (!response.ok) {
                const data = await response.json();
                if ("error" in data) {
                    modalError(data["error"], ["#deleteUserButton"]);
                } else {
                    throw new Error("Got bad response from the server.");
                }
            }
            updateUserList();
            closeModal();
            sendToast("User deleted successfully", "ID: " + userId, 5, "var(--bs-red)");
        })
        .catch((error) => modalError(error.message));
}

async function editUser(element) {
    const userId = $(element).data("uid");
    const userUrl = new URL(`/api/manage/users/${userId}`, window.location.origin);
    fetch(userUrl)
        .then((response) => response.json())
        .then(async (data) => {
            if ("error" in data) {
                throw new Error(data["error"]);
            }
            let footerHtml = ``;
            if (checkPermission("manage-users")) {
                footerHtml += `<button class="item-btn color-hoverable" id="deleteUserButton" title="Delete user" onclick="submitDeleteUser('${userId}')">Delete</button>`
            }
            displayModal(data["username"], spinnerHtml, footerHtml);
            const created = getDayJS(data["created"]);
            let userHtml = `
            <span>
                Created: <time class="secondary-text" datetime="${created.format(ISOTIME)}">${created.local().format("llll")}</time>
                <br/>
            `;
            if ("last_seen" in data && data["last_seen"]) {
                const lastSeen = getDayJS(data["last_seen"]);
                userHtml += `Last seen: <time class="secondary-text" datetime="${lastSeen.format(ISOTIME)}" title="${lastSeen.local().format("llll")}">${lastSeen.fromNow()}</time>`;
            } else {
                userHtml += `Last seen: <span class="secondary-text">Never</span>`;
            }
            const lastUpdated = getDayJS(data["last_updated"]);
            userHtml += `
                <br/>
                Last updated: <time class="secondary-text" datetime="${lastUpdated.format(ISOTIME)}" title="${lastUpdated.local().format("llll")}">${lastUpdated.fromNow()}</time>
            </span>
            `;
            let userBody = $(userHtml);
            if (checkPermission("modify-users")) {
                const permissionsUrl = new URL(`/api/manage/users/${userId}/permissions`, window.location.origin);
                await fetch(permissionsUrl)
                    .then((response) => response.json())
                    .then(async (data) => {
                        if ("error" in data) {
                            throw new Error(data["error"]);
                        }
                        const validPerms = await fetch(new URL("/api/manage/permissions", window.location.origin))
                            .then((response) => response.json())
                            .then((data) => {
                                data["permissions"].forEach(function (kvp) {
                                    permissionDict[kvp["key"]] = kvp["description"];
                                });
                                return permissionDict;
                            });
                        userBody.append(`
                        <br/><br/>
                        <span>Permissions:</span>
                        `);
                        let immutablePerms = [];
                        let editablePerms = data["permissions"];
                        const permBox = createPillbox("userPerms", true, validPerms, addPermissionPopovers, undefined, addPermission, removePermission);
                        if (editablePerms.includes("admin")) {
                            editablePerms = editablePerms.filter((v) => v !== "admin");
                            immutablePerms.push("admin");
                        }
                        try {
                            addPillboxValues(permBox, false, immutablePerms);
                        } catch (error) { }
                        try {
                            addPillboxValues(permBox, true, editablePerms);
                        } catch (error) { }
                        permBox.data("uid", userId);
                        userBody.append(permBox);
                    })
                    .catch((error) => modalError(error.message));
            }
            $("#modalContent").html(userBody);
        })
        .catch((error) => {
            sendToast("Error", error.message, 5, "#ef184a", "fa-times");
        });
}

function addPermissionPopovers(pillbox) {
    pillbox.find(".pillbox-item").each(function (i, pill) {
        pill = $(pill);
        const perm = pill.data("val");
        const description = permissionDict[perm];
        if (description) {
            pill.popover({
                content: description,
                trigger: "focus",
                placement: "top",
                container: "body",
                html: true
            });
        }
    });
}

async function addPermission(inputPill) {
    const perm = inputPill.children("input").val();
    const userId = inputPill.closest(".pillbox").data("uid");
    const url = new URL(`/api/manage/users/${userId}/permissions`, window.location.origin);
    return await fetch(url, {
        method: "PUT",
        headers: {
            "Content-type": "application/json; charset=UTF-8"
        },
        body: JSON.stringify({
            "permissions": [
                perm
            ]
        })
    }).then((response) => {
        return response.ok;
    }).catch((error) => {
        return false;
    });
}

async function removePermission(pill) {
    const perm = pill.data("val");
    const userId = pill.closest(".pillbox").data("uid");
    const url = new URL(`/api/manage/users/${userId}/permissions`, window.location.origin);
    return await fetch(url, {
        method: "DELETE",
        headers: {
            "Content-type": "application/json; charset=UTF-8"
        },
        body: JSON.stringify({
            "permissions": [
                perm
            ]
        })
    }).then((response) => {
        pill.popover("dispose");
        return response.ok;
    }).catch((error) => {
        return false;
    });
}