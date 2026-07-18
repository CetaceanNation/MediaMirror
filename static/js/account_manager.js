// State
const PAGE_SIZE = 15;

// Initialize
$(() => {
    getDomainFilters();
});

$('#accountSearch').on('input', () => {
    clearTimeout(window.inputTimeout);
    window.inputTimeout = setTimeout(() => {
        updateAccountList();
    }, 500);
});

async function getDomainFilters() {
    try {
        const data = await apiGet(API_ENDPOINTS.ACCOUNT_DOMAINS);
        createMultiselect('domainFilter', 'Domain', true, updateAccountList, data);
        updateAccountList();
    } catch (error) {
        console.error('Error fetching content:', error);
        $('#domainFilterContainer').html(`<p>Failed to load domain filters: ${error.message}</p>`);
    }
}

async function updateAccountList() {
    const accountUrl = buildUrl(API_ENDPOINTS.ACCOUNTS, {
        page: window.listPage,
        page_size: PAGE_SIZE,
    });

    const name_filter = $('#accountSearch').val().trim();
    if (name_filter.length > 0) {
        accountUrl.searchParams.append('name_filter', name_filter);
    }

    const domain_filter = $('#domainFilter').data('selected');
    if (domain_filter && domain_filter.length > 0) {
        accountUrl.searchParams.append('domain', domain_filter[0]);
    }

    try {
        const data = await apiGet(accountUrl);

        let html = '<ul class="item-list">';
        const accounts = data.accounts;
        const pageNumber = data.page;

        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            html += `
                <li class="text-hoverable back-hoverable item-row" data-domain="${account.domain}" data-name="${account.name}" tabindex="0">
                    <div class="item-content">
                        <img class="account-icon" src="data:image/webp;base64,${account.icon}" alt="Icon"/>
                        <span class="account-name">${account.name}</span>
                        <span class="secondary-text">&nbsp;(&nbsp;</span>
                        <span class="secondary-text">${account.domain}</span>
                        <span class="secondary-text">&nbsp;)</span>
                        ${checkPermission('manage-accounts') ? `<i class="far fa-edit hover-hidden" style="position: absolute; right: 1rem;"></i>` : ``}
                    </div>
                </li>
            `;
        }

        html += '</ul>';
        $('#accountList').html(html);
        $('#prevPage').prop('disabled', pageNumber == 1);
        $('#nextPage').prop('disabled', !data.next_page);
        $('#currentPage').text(pageNumber);
    } catch (error) {
        console.error('Error fetching content:', error);
        $('#accountList').html(`<p>Failed to load accounts: ${error.message}</p>`);
    }
}
