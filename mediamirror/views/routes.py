from flask import (
    Blueprint,
    current_app as app,
    g,
    redirect,
    render_template,
    request,
    session,
    url_for
)

from views.auth import (
    login_required,
    permissions_required
)


default_routes = Blueprint("default_pages", __name__)


@default_routes.route("/")
def index():
    return render_template(
        "home.j2",
        session=session
    )


@default_routes.route("/management")
@login_required
def admin():
    g.app_name = f"{g.app_name} Management Panel"
    admin_sections = [
        ("Site", "general"),
        ("Users", "users"),
        ("Plugins", "plugins"),
        ("Logs", "logs")
    ]
    return render_template(
        "admin_panel.j2",
        admin_sections=admin_sections,
        session=session
    )
