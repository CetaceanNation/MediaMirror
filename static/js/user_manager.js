let searchTimeout;
let pageSize = 15;
const addUserContent = `
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
const addUserFooter = `
<span id="modalError"></span>
<button class="item-btn color-hoverable" id="submitUserButton" title="Add user" onclick="submitAddUser()">Add</button>
`;

$(document).ready(function () {
    updateUserList();
});

$("#userSearch").on("input", function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
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
        .then(response => response.json())
        .then(data => {
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
                    <li class="text-hoverable back-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == users.length - 1 ? ` item-row-bottom` : ``}" data-uid="${user.id}" onclick="editUser(this)">
                        <div class="item-content">
                            <span class="username">${user.username}</span>
                            <span class="rounded-circle online-status" style="background-color: 
                `;
                if ("last_seen" in user && user["last_seen"]) {
                    const lastSeen = getDayJS(user["last_seen"]);
                    if (dayjs.utc().diff(lastSeen, "minute") < 15) {
                        html += `var(--success-highlight)" title="Last seen ${lastSeen.fromNow()}"`;
                    } else {
                        html += `var(--offline)" title="Last seen ${lastSeen.local().format("llll")}"`;
                    }
                } else {
                    html += `var(--main-background)" title="Awaiting first login"`;
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
        .catch(error => {
            console.error("Error fetching content:", error);
            $("#userList").html(`<p>Failed to load users: ${error.message}</p>`);
        });
}

function displayAddUser() {
    displayModal("Add User", addUserContent, addUserFooter);
}

function submitAddUser() {
    let username = $("#addUserUsername").val().trim();
    let password = $("#addUserPassword").val();
    let confirmPassword = $("#confirmUserPassword").val();

    if (!username || !password || !confirmPassword) {
        modalError("All fields are required");
        return;
    } else if (password !== confirmPassword) {
        modalError("Passwords do not match");
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
        .then(response => response.json())
        .then(data => {
            if ("error" in data) {
                throw new Error(data["error"])
            }
            copyToClipboard(data["user_id"]);
            updateUserList();
            closeModal();
            sendToast("User added successfully", "ID: " + data["user_id"], 5, "#008000");
        })
        .catch(error => modalError(error.message));
}

async function editUser(element) {
    const userId = $(element).data("uid");
    const userUrl = new URL(`/api/manage/users/${userId}`, window.location.origin);
    fetch(userUrl)
        .then(response => response.json())
        .then(async data => {
            if ("error" in data) {
                throw new Error(data["error"]);
            }
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
            if (checkPermission("modify-users")) {
                const permissionsUrl = new URL(`/api/manage/users/${userId}/permissions`, window.location.origin);
                await fetch(permissionsUrl)
                    .then(response => response.json())
                    .then(data => {
                        if ("error" in data) {
                            throw new Error(data["error"]);
                        }
                        const permsList = data["permissions"];
                        userHtml += `
                        <br/><br/>
                        <span>Permissions:</span>
                        <div class="pillbox">
                            <button class="badge pillbox-btn color-hoverable">
                                <i class="fas fa-plus"></i>
                            </button>
                        `;
                        permsList.forEach(permKey => {
                            userHtml += `<span class="badge rounded-pill">${permKey}</span>`;
                        });
                        userHtml += `
                        </div>
                        `;
                    })
                    .catch(error => modalError(error.message));
            }
            displayModal(data["username"], userHtml, null);
        })
        .catch(error => {
            sendToast("Error", error.message, 5, "#8b0000", "fa-times");
        });
}

function removePermission(element, userId) {
    const perm = $(this).data("uid")
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