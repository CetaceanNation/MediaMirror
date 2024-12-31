$(document).ready(function () {
    let isSidebarToggleHovered = false;
    // Function to expand sidebar
    function expandSidebar() {
        $('.sidebar-collapsed').addClass('sidebar-expanded');
        $('.sidebar-expanded').removeClass('sidebar-collapsed');
    }

    // Function to collapse sidebar
    function collapseSidebar() {
        $('.sidebar-expanded').addClass('sidebar-collapsed');
        $('.sidebar-collapsed').removeClass('sidebar-expanded');
    }

    // Expand sidebar on hover over toggle button
    $('.sidebar').hover(
        function () {
            isSidebarToggleHovered = true;
            setTimeout(function () {
                if (isSidebarToggleHovered) {
                    expandSidebar();
                }
            }, 60);
        },
        function () {
            isSidebarToggleHovered = false;
            setTimeout(function () {
                if (!isSidebarToggleHovered) {
                    collapseSidebar();
                }
            }, 300);
        }
    );

    // Collapse sidebar after timeout
    setTimeout(function () {
        if (!isSidebarToggleHovered) {
            collapseSidebar();
        }
    }, 600);
});
