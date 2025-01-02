from flask import (
    Blueprint,
    g,
    render_template
)

from . import (
    login_required
)


default_routes = Blueprint("default_pages", __name__)


@default_routes.route("/")
def index():
    return render_template("home.j2")


@default_routes.route("/management")
@login_required
def admin():
    g.app_name = f"{g.app_name} Management Panel"
    return render_template("admin_panel.j2")
