$(document).ready(function () {
    let isSidebarToggleHovered = true;
    function expandSidebar() {
        $('.sidebar-collapsed').addClass('sidebar-expanded').removeClass('sidebar-collapsed');
    }
    function collapseSidebar() {
        $('.sidebar-expanded').addClass('sidebar-collapsed').removeClass('sidebar-expanded');
    }

    $(".sidebar").hover(
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

    $(document).click(function (event) {
        if (!$(event.target).closest(".multiselect").length) {
            $(".multiselect-head").removeClass("focus");
            $(".multiselect-opts").fadeOut(50);
        }
    });

    setTimeout(() => {
        if (!isSidebarToggleHovered) {
            collapseSidebar();
        }
    }, 600);
});

function checkPermission(permKey) {
    return userPermissions.includes(permKey) || userPermissions.includes("admin")
}

function checkElementPermissions() {
    $("[data-permission]").each(function () {
        const requiredPermission = $(this).data("permission");
        if (!checkPermission(requiredPermission)) {
            if ($(this).is("button")) {
                $(this).prop("disabled", true);
            }
        }
    });
}

function displayModal(title, contentHtml, footerHtml) {
    $("#modalTitle").text(title);
    $("#modalContent").html(contentHtml);
    $("#modalFooter").html(footerHtml);
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

function formatFileSize(bytes) {
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function textToHtml(text) {
    formattedText = text.replace(/^( +|\t)/gm, (match) => {
        return match.replace(/ /g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
    });
    formattedText = formattedText.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/(?:\r\n|\r|\n)/g, "<br/>");
    return formattedText.trim();
}

function toggleMultiselect(element) {
    $(element).toggleClass("focus");
    const multidiv = $(element).parents(".multiselect");
    const multiopts = multidiv.find(".multiselect-opts");
    if (multiopts.is(":visible")) {
        multiopts.fadeOut(50);
    } else {
        $(".multiselect-opts").hide();
        multiopts.fadeIn(50);
    }
}

function updateMultiselect(element, onUpdate) {
    const selected = [];
    const multidiv = $(element).parents(".multiselect");
    multidiv.find(".multiselect-opts label input[type='checkbox']:checked").each(function () {
        selected.push($(this).val());
    });

    const multihead = multidiv.find(".multiselect-head");
    const multiheadLabel = multihead.find("div label");
    if (selected.length > 0) {
        multihead.addClass("active")
        multidiv.data("csv", selected.join(","));
        multiheadLabel.text(selected.join(", "));
    } else {
        multihead.removeClass("active")
        multidiv.data("csv", null);
        multiheadLabel.text(multiheadLabel.data("text"));
    }
    onUpdate();
}

const observer = new MutationObserver(() => {
    checkElementPermissions();
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
});