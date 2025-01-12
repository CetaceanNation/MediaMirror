var listPage = 1;
var pageSize = 15;

$(document).ready(function () {
    updateUserList();
});

$(document).on("input", "#userSearch", function () {
    updateUserList();
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
                    <li class="text-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == users.length - 1 ? ` item-row-bottom` : ``}" onclick="editUser('${user.id}')">
                        <div class="item-content">
                            <span class="username">${user.username}</span> <span class="secondary-text" style="margin-left: 0.5rem;">( ${user.id} 
                                <button class="clipboard-btn icon-btn inverted" onclick="copyToClipboard(event, '${user.id}')">
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