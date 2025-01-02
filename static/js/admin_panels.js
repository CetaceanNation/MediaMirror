$(document).ready(function () {
    loadFragmentContent();
    $(window).on("hashchange", function () {
        loadFragmentContent();
    });
});

function expandRow(element) {
    $(element).find(".collapsed").toggleClass("expanded");
}

function loadFragmentContent() {
    var fragment = window.location.hash.slice(1);
    var $panel = $("#adminDisplay");
    if (fragment.length > 0) {
        var url = "/api/manage/" + fragment;
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (fragment === "users") {
                    $panel.html(generateUserList(data));
                } else {
                    $panel.html(`<p>Content could not be loaded.</p>`);
                }
            })
            .catch(error => {
                console.error("Error fetching content:", error);
                $panel.html(`<p>Content could not be loaded.</p>`);
            });
    } else {
        $panel.html(`<p>Choose a section</p>`);
    }
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

function generateUserList(data) {
    let html = `<ul class="item-list">`;

    for (let i = 0; i < data.length; i++) {
        var user = data[i];

        html += `
            <li class="hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == data.length - 1 ? ` item-row-bottom` : ``}" onclick="expandRow(this)">
                <span class="username">${user.username}</span> <span class="secondary-text" style="margin-left: 10px;">( ${user.id} 
                    <button class="icon-btn inverted" onclick="copyToClipboard(this, event, '${user.id}')">
                        <i class="far fa-clipboard fadeable"></i>
                        <i class="fas fa-check fadeable fadeable-faded"></i>
                    </button>
                )</span>
                <ul class="collapsed tag-list">
                    ${user.permissions.map(perm => `
                        <li class="tag" onclick="event.stopPropagation()">
                            <span>${perm}</span>
                            <button class="icon-btn" onclick="removePermission(this, event, '${user.id}', '${perm}')">
                                <i class="fas fa-times-circle"></i>
                            </button>
                        </li>
                    `).join("")}
                </ul>
            </li>
        `;
    }

    html += `</ul>`;
    return html;
}

function copyToClipboard(element, event, userId) {
    event.stopPropagation();
    navigator.clipboard.writeText(userId).then(() => {
        $(element).prop("disabled", true);
        $(element).children().toggleClass("fadeable-faded");
        setTimeout(function () {
            $(element).children().toggleClass("fadeable-faded");
            $(element).prop("disabled", false);
        }, 3000);
    }).catch(function (error) {
        console.error("Error copying to clipboard: ", error);
        alert("Failed to copy User ID to clipboard.");
    });
}
