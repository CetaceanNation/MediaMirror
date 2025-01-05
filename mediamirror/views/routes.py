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


@default_routes.route("/management")
@login_required
def manage() -> Response:
    """
    Application management panel.
    """
    return render_template("admin_panel.j2")
