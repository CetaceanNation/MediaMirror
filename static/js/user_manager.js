// State
let permissionDict = {};
const PAGE_SIZE = 15;

// Templates
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

// Initialize
$(() => {
    updateUserList();
});

$('#userSearch').on('input', () => {
    clearTimeout(window.inputTimeout);
    window.inputTimeout = setTimeout(() => {
        updateUserList();
    }, 500);
});

async function updateUserList() {
    const userUrl = buildUrl(API_ENDPOINTS.USERS, {
        page: window.listPage,
        page_size: PAGE_SIZE,
    });

    const filter = $('#userSearch').val().trim();
    if (filter.length > 0) {
        userUrl.searchParams.append('username_filter', filter);
    }

    try {
        const data = await apiGet(userUrl);

        const pageNumber = data.page;
        let html = '<ul class="item-list">';

        data.users.forEach((user, i) => {
            html += `
                <li class="text-hoverable back-hoverable item-row" data-uid="${user.id}" onclick="editUser(this)" tabindex="0">
                    <div class="item-content">
                        <span class="username">${user.username}</span>
                        <span class="rounded-circle online-status" style="background-color: 
            `;

            if ('last_seen' in user && user.last_seen) {
                const lastSeen = getDayJS(user.last_seen);
                if (dayjs.utc().diff(lastSeen, 'minute') < 15) {
                    html += `var(--bs-teal)" title="Last seen ${lastSeen.fromNow()}"`;
                } else {
                    html += `var(--bs-dark)" title="Last seen ${lastSeen.local().format('llll')}"`;
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
                        ${checkPermission('modify-users') ? `<i class="far fa-edit hover-hidden" style="position: absolute; right: 1rem;"></i>` : ``}
                    </div>
                </li>
            `;
        });

        html += '</ul>';
        $('#userList').html(html);
        $('#prevPage').prop('disabled', pageNumber == 1);
        $('#nextPage').prop('disabled', !data.next_page);
        $('#currentPage').text(pageNumber);
    } catch (error) {
        console.error('Error fetching content:', error);
        $('#userList').html(`<p>Failed to load users: ${error.message}</p>`);
    }
}

function displayAddUser() {
    displayModal('Add User', addUserContent, addUserFooter);
    $('#addUserUsername').trigger('focus');
}

async function submitAddUser() {
    const username = $('#addUserUsername').val().trim();
    const password = $('#addUserPassword').val();
    const confirmPassword = $('#confirmUserPassword').val();

    if (!username) {
        modalError('Missing required field "Username".', ['#addUserUsername']);
        return;
    } else if (!password) {
        modalError('Missing required field "Password".', ['#addUserPassword']);
        return;
    } else if (!confirmPassword) {
        modalError('Missing required field "Confirm Password".', ['#confirmUserPassword']);
        return;
    } else if (password !== confirmPassword) {
        modalError('Passwords do not match.', ['#addUserPassword', '#confirmUserPassword']);
        return;
    }

    const requestData = {
        username,
        password,
        confirm_password: confirmPassword,
    };

    try {
        const data = await apiPost(API_ENDPOINTS.USERS, requestData);
        updateUserList();
        closeModal();
        sendToast('User added successfully', 'ID: ' + data.user_id, 5, 'var(--bs-green)');
    } catch (error) {
        if (error.message.includes('400')) {
            modalError(error.message, ['#addUserPassword', '#confirmUserPassword']);
        } else if (error.message.includes('409')) {
            modalError(error.message, ['#addUserUsername']);
        } else {
            modalError(error.message);
        }
    }
}

async function submitDeleteUser(userId) {
    try {
        await apiDelete(API_ENDPOINTS.USER_BY_ID(userId));
        updateUserList();
        closeModal();
        sendToast('User deleted successfully', 'ID: ' + userId, 5, 'var(--bs-red)');
    } catch (error) {
        modalError(error.message, ['#deleteUserButton']);
    }
}

async function editUser(element) {
    const userId = $(element).data('uid');

    try {
        const userData = await apiGet(API_ENDPOINTS.USER_BY_ID(userId));

        let footerHtml = '';
        if (checkPermission('manage-users') && window.currentUserId !== userId) {
            footerHtml += `<button class="item-btn color-hoverable" id="deleteUserButton" title="Delete user" onclick="submitDeleteUser('${userId}')">Delete</button>`;
        }

        displayModal(userData.username, '<div id="spinner" style="display: flex; justify-content: center"><div class="spinner-border"><span class="sr-only">Loading...</span></div></div>', footerHtml);

        const created = getDayJS(userData.created);
        let userHtml = `
            <span>
                Created: <time class="secondary-text" datetime="${created.format(ISOTIME)}">${created.local().format('llll')}</time>
                <br/>
        `;

        if ('last_seen' in userData && userData.last_seen) {
            const lastSeen = getDayJS(userData.last_seen);
            userHtml += `Last seen: <time class="secondary-text" datetime="${lastSeen.format(ISOTIME)}" title="${lastSeen.local().format('llll')}">${lastSeen.fromNow()}</time>`;
        } else {
            userHtml += `Last seen: <span class="secondary-text">Never</span>`;
        }

        const lastUpdated = getDayJS(userData.last_updated);
        userHtml += `
            <br/>
            Last updated: <time class="secondary-text" datetime="${lastUpdated.format(ISOTIME)}" title="${lastUpdated.local().format('llll')}">${lastUpdated.fromNow()}</time>
        </span>
        <br/><br/>
        <span>Permissions:</span>
        <div id="userPerms"></div>
        `;

        $('#modalContent').html(userHtml);

        try {
            const permsData = await apiGet(API_ENDPOINTS.USER_PERMISSIONS(userId));

            // Fetch all valid permissions
            const allPermsData = await apiGet(API_ENDPOINTS.PERMISSIONS);
            permissionDict = {};
            allPermsData.permissions.forEach(kvp => {
                permissionDict[kvp.key] = kvp.description;
            });

            let immutablePerms = [];
            let editablePerms = permsData.permissions;

            const permBox = createPillbox('userPerms', checkPermission('modify-users'), permissionDict, undefined, undefined, addPermission, removePermission);

            if (editablePerms.includes('admin')) {
                editablePerms = editablePerms.filter(v => v !== 'admin');
                immutablePerms.push('admin');
            }

            try {
                permBox.addValues(immutablePerms, false);
            } catch (e) { }

            try {
                permBox.addValues(editablePerms, true);
            } catch (e) { }

            permBox.data('uid', userId);
        } catch (error) {
            modalError(error.message);
        }
    } catch (error) {
        sendToast('Error', error.message, 5, 'var(--error-cancel)', 'fa-times');
    }
}

async function addPermission(pillbox, perm) {
    const userId = pillbox.data('uid');

    await apiPut(API_ENDPOINTS.USER_PERMISSIONS(userId), { permissions: [perm] });
    sendToast('Success', `Permission ${perm} successfully added.`, 3);
}

async function removePermission(pillbox, perm) {
    const userId = pillbox.data('uid');

    await apiDelete(API_ENDPOINTS.USER_PERMISSIONS(userId), { permissions: [perm] });
    sendToast('Success', `Permission ${perm} successfully removed.`, 3);
}
