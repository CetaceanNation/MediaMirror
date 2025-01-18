let searchTimeout;
let pageSize = 15;

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
                    <li class="text-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == users.length - 1 ? ` item-row-bottom` : ``}" data-uid="${user.id}" onclick="editUser()">
                        <div class="item-content">
                            <span class="username">${user.username}</span> 
                            <span class="secondary-text" style="margin-left: 0.5rem;">(</span>
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
    <span id="modalError"></span>
    <button class="item-btn color-hoverable" id="submitUserButton" title="Add user" onclick="submitAddUser()">Add</button>
    `;
    displayModal("Add User", content, footer);
}

function submitAddUser() {
    let username = $("#addUserUsername").val().trim();
    let password = $("#addUserPassword").val();
    let confirmPassword = $("#confirmUserPassword").val();

    if (!username || !password || !confirmPassword) {
        modalError("All fields are required");
        return;
    }
    if (password !== confirmPassword) {
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

function removePermission(element, event, userId) {
    event.stopPropagation();
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