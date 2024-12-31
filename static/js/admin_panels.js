window.addEventListener('hashchange', function () {
    var fragment = window.location.hash.slice(1);
    loadFragmentContent(fragment);
});

// Initialize content on page load based on the current fragment
document.addEventListener('DOMContentLoaded', function () {
    var fragment = window.location.hash.slice(1);
    loadFragmentContent(fragment);
});

function loadFragmentContent(fragment) {
    var panel = document.getElementById('adminDisplay');
    if (fragment.length > 0) {
        var url = '/content/' + fragment;

        // Fetch HTML from the Flask route (API)
        fetch(url)
            .then(response => response.json())
            .then(data => {
                // Inject the HTML returned from the server into the content container
                panel.innerHTML = data.html;
            })
            .catch(error => {
                console.error('Error fetching content:', error);
                panel.innerHTML = '<p>Content could not be loaded.</p>';
            });
    } else {
        panel.innerHTML = '<p>Choose a section</p>'
    }
}