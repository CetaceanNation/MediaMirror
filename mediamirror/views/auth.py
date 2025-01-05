from flask import (
    Blueprint,
    redirect,
    render_template,
    request,
    Response,
    session,
    url_for
)
from urllib.parse import urlparse

import services.auth as auth


auth_routes = Blueprint("auth_pages", __name__, url_prefix="/auth")


@auth_routes.route("/login", methods=['GET', 'POST'])
def login() -> Response:
    """
    Login page
    """
    next_url = request.args.get("next")
    if next_url:
        # Verify next_url is for this domain
        host_loc = urlparse(request.host_url).netloc
        next_loc = urlparse(next_url).netloc
        if next_loc != host_loc:
            next_url = url_for("default_pages.index")
    else:
        next_url = url_for("default_pages.index")
    if "user_id" in session:
        # Already logged in, just go to the url
        return redirect(next_url)
    if request.method == "POST":
        username = request.form["u"]
        password = request.form["p"]
        user_id = auth.check_credentials(username, password)
        if user_id:
            session["user_id"] = user_id
            session["username"] = username
            return redirect(next_url)
        else:
            return render_template(
                "login.j2",
                next=next_url,
                error_message="Incorrect Login Credentials"
            )
    return render_template(
        "login.j2",
        next=next_url
    )


@auth_routes.route("/logout")
def logout() -> Response:
    """
    Logout and redirect to homepage.
    """
    if "user_id" in session:
        session.clear()
    return redirect(url_for("default_pages.index"))
