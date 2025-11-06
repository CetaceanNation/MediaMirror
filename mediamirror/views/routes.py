from quart import (
    Blueprint,
    render_template,
    Response
)

from . import (
    login_required
)


default_routes = Blueprint("default_pages", __name__)


@default_routes.route("/")
async def index() -> Response:
    """
    Application homepage.
    """
    return await render_template("home.j2")


@default_routes.route("/management", defaults={"component": None})
@default_routes.route("/management/<component>")
@login_required
async def manage(component) -> Response:
    """
    Application management panel.
    """
    match component:
        case "general":
            return await render_template("settings.j2")
        case "users":
            return await render_template("user_manager.j2")
        case "plugins":
            return await render_template("plugin_manager.j2")
        case "accounts":
            return await render_template("account_manager.j2")
        case "logs":
            return await render_template("log_manager.j2")
        case _:
            return await render_template("admin_panel.j2")
