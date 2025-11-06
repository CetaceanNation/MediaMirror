from quart import (
    Blueprint,
    request,
    Response,
    session
)
from logging import getLogger

from mediamirror.views import permissions_required
from mediamirror.services.browser import (
    make_browser
)


vnc_routes = Blueprint("vnc_pages", __name__, url_prefix="/vnc")
web_browser = None


@vnc_routes.route("/iframe", methods=["POST"])
@permissions_required(["vnc"])
async def browser_frame() -> Response:
    """
    Create a VNC-driven browser and return an iframe embedding URL.
    """
    log.debug(f"VNC browser requested by user '{session["user_id"]}'")
    global web_browser
    if web_browser:
        return "VNC currently in use, cannot create another browser."
    web_browser = True
    data = await request.get_json()
    log.debug(f"Creating VNC browser with data: {data}")
    domain_whitelist = data.get("domain_whitelist", [])
    initial_page = data.get("initial_page_url", "")
    try:
        web_browser = await make_browser(data.get("browser_width", 1366), data.get("browser_height", 768), True)
        if len(domain_whitelist) > 0:
            web_browser.limit_domains(domain_whitelist)
        if initial_page:
            await web_browser.browser.get(initial_page)
        log.debug(f"Created VNC browser for user '{session["user_id"]}'")
        return f"""<iframe class="remote-frame" src="{web_browser.get_iframe_url()}"></iframe>"""
    except Exception:
        log.exception("Error creating VNC browser")
        return "An error was encountered while trying to create the browser, check the logs for more details."


@vnc_routes.route("/close")
@permissions_required(["vnc"])
async def close_browser() -> None:
    global web_browser
    web_browser.close()
    web_browser = None

log = getLogger("mediamirror.vnc")
