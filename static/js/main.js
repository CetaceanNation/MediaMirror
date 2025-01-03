$(document).ready(function () {
    let isSidebarToggleHovered = true;
    // Function to expand sidebar
    function expandSidebar() {
        $('.sidebar-collapsed').addClass('sidebar-expanded').removeClass('sidebar-collapsed');
    }

    // Function to collapse sidebar
    function collapseSidebar() {
        $('.sidebar-expanded').addClass('sidebar-collapsed').removeClass('sidebar-expanded');
    }

    // Expand sidebar on hover over toggle button
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

    // Collapse sidebar after timeout
    setTimeout(() => {
        if (!isSidebarToggleHovered) {
            collapseSidebar();
        }
    }, 600);
});

function displayModal(title = "Modal Title", contentHtml = "") {
    document.getElementById("modalTitle").innerText = title;
    document.getElementById("modalContent").innerHTML = contentHtml;
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
