from flask import (
    Blueprint,
    render_template,
    Response
)

from . import (
    login_required
)


default_routes = Blueprint("default_pages", __name__)


@default_routes.route("/")
def index() -> Response:
    """
    Application homepage.
    """
    return render_template("home.j2")


@default_routes.route("/management", defaults={"component": None})
@default_routes.route("/management/<component>")
@login_required
def manage(component) -> Response:
    """
    Application management panel.
    """
    match component:
        case "users":
            return render_template("user_manager.j2")
        case "logs":
            return render_template("log_manager.j2")
        case _:
            return render_template("admin_panel.j2")
