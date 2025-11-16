let pageSize = 15;
const testVNC = ``;

$(() => {
    getDomainFilters();
    updateAccountList();
});

$("#accountSearch").on("input", () => {
    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(() => {
        updateAccountList();
    }, 500);
});

function getDomainFilters() {
    createMultiselect("domainFilter", "Domain", true, "updateAccountList", ["youtube.com", "google.com"]);
}

function updateAccountList() {
    const accountUrl = new URL("/api/accounts", window.location.origin);
    const name_filter = $("#accountSearch").val().trim();
    if (name_filter.length > 0) {
        accountUrl.searchParams.append("name_filter", name_filter);
    }
    const domain_filter = $("#domainFilter").data("selected");
    if (domain_filter.length > 0) {
        accountUrl.searchParams.append("domain", domain_filter[0])
    }
    accountUrl.searchParams.append("page", listPage);
    accountUrl.searchParams.append("page_size", pageSize);
    console.log(accountUrl)
    fetch(accountUrl)
        .then((response) => response.json())
        .then((data) => {
            if ("error" in data) {
                throw new Error(data["error"]);
            }
            let html = `
            <ul class="item-list">
            `;
            const accounts = data["accounts"]
            let pageNumber = data["page"]
            for (let i = 0; i < accounts.length; i++) {
                const account = accounts[i];
                html += `
                    <li class="text-hoverable back-hoverable item-row${i == 0 ? ` item-row-top` : ``}${i == accounts.length - 1 ? ` item-row-bottom` : ``}" data-domain="${account.domain}" data-name="${account.name}" tabindex="0">
                        <div class="item-content">
                            <span class="username">${account.name}</span>
                            <span class="secondary-text">&nbsp;(&nbsp;</span>
                            <span class="secondary-text">${account.domain}</span>
                            <span class="secondary-text">&nbsp;)</span>
                            ${checkPermission("manage-accounts") ? `<i class="far fa-edit hover-hidden" style="position: absolute; right: 1rem;"></i>` : ``}
                        </div>
                    </li>
                `;
            }
            html += `
            </ul>
            `;
            $("#accountList").html(html);
            $("#prevPage").prop("disabled", pageNumber == 1);
            $("#nextPage").prop("disabled", !data["next_page"]);
            $("#currentPage").text(pageNumber);
        })
        .catch((error) => {
            console.error("Error fetching content:", error);
            $("#accountList").html(`<p>Failed to load accounts: ${error.message}</p>`);
        });
}