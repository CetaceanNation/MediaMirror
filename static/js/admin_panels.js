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
        if (fragment === "users") {
            displayUserList()
        } else {
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
        <input type="text" id="userSearch" class="search-box" placeholder="Search users..." style="height: 2.5rem; width: 73%;"/>
        <button class="item-button color-hoverable" id="addUserButton" onclick="displayAddUser()" style="height: 2.5rem; width: 25%;">Add User</button>
    </div>
    <div id="userList">
    </div>
    <div class="panel-controls panel-controls-bottom">
        <button class="pagination-btn color-hoverable" id="prevPage" onclick="prevListPage(updateUserList)">
            <i class="fas fa-chevron-left"></i>
        </button>
        <span class="page-number" id="currentPage">${listPage}</span>
        <button class="pagination-btn color-hoverable" id="nextPage" onclick="nextListPage(updateUserList)">
            <i class="fas fa-chevron-right"></i>
        </button>
    </div>
    `;
    $("#adminDisplay").html(html);
    listPage = 1;
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
                                <button class="icon-btn inverted" onclick="copyToClipboard(this, event, '${user.id}')">
                                    <i class="far fa-clipboard fadeable" style="left: -0.3rem; top: -0.9rem;"></i>
                                    <i class="fas fa-check fadeable fadeable-faded" style="left: -0.3rem; top: -0.9rem;"></i>
                                </button>
                            )</span>
                            <i class="far fa-edit hover-hidden" style="position: absolute; top: 0.3rem; right: 1rem;"></i>
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