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
