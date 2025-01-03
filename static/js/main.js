$(document).ready(function () {
    let isSidebarToggleHovered = true;
    function expandSidebar() {
        $('.sidebar-collapsed').addClass('sidebar-expanded').removeClass('sidebar-collapsed');
    }
    function collapseSidebar() {
        $('.sidebar-expanded').addClass('sidebar-collapsed').removeClass('sidebar-expanded');
    }

    $('.sidebar').hover(
        function () {
            isSidebarToggleHovered = true;
            setTimeout(() => {
                if (isSidebarToggleHovered) {
                    expandSidebar();
                }
            }, 60);
        },
        function () {
            isSidebarToggleHovered = false;
            setTimeout(() => {
                if (!isSidebarToggleHovered) {
                    collapseSidebar();
                }
            }, 200);
        }
    );

    setTimeout(() => {
        if (!isSidebarToggleHovered) {
            collapseSidebar();
        }
    }, 600);
});

function checkPermissions() {
    $("[data-permission]").each(function () {
        const requiredPermission = $(this).data("permission");
        if (!userPermissions.includes(requiredPermission) && !userPermissions.includes("admin")) {
            $(this).prop("disabled", true);
        }
    });
}

function displayModal(title = "Modal Title", contentHtml = "", footerHtml = "") {
    $("#modalTitle").text(title);
    $("#modalContent").html(contentHtml);
    $("#modalFooter").html(footerHtml

    );
    $("#modalOverlay").modal("show");
}

function closeModal() {
    $("#modalOverlay").modal("hide");
}

function copyToClipboard(element, event, value) {
    event.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
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

const observer = new MutationObserver(() => {
    checkPermissions();
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
});