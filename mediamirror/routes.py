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
from functools import wraps
from urllib.parse import urlparse

import auth
from database_manager import (
    get_db_session,
    close_db_session
)

default_pages = Blueprint("default_pages", __name__)


def login_required(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("default_pages.login", next=request.url))
        return f(*args, **kwargs)
    return wrap


def permissions_required(permissions_list):
    def decorator_function(f):
        @wraps(f)
        def wrap(*args, **kwargs):
            if "user_id" not in session:
                return redirect(403)
            current_user_perms = auth.get_user_permissions(session["user_id"])
            if not set(permissions_list).issubset(set(current_user_perms)):
                return redirect(403)
            return f(*args, **kwargs)
        return wrap
    return decorator_function


@default_pages.before_request
def start_request():
    g.app_name = app.name
    get_db_session()


@default_pages.after_request
def after_request(response):
    close_db_session()
    return response


@default_pages.route("/login", methods=['GET', 'POST'])
def login():
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


@default_pages.route("/logout")
def logout():
    if "user_id" in session:
        session.clear()
    return redirect(url_for("default_pages.index"))


@default_pages.route("/")
def index():
    return render_template(
        "home.j2",
        session=session
    )


@default_pages.route("/management")
@login_required
def admin():
    g.app_name = f"{g.app_name} Settings"
    admin_sections = [
        ("Site", "general"),
        ("Users", "users"),
        ("Plugins", "plugins"),
        ("Logs", "logs")
    ]
    return render_template(
        "admin.j2",
        admin_sections=admin_sections,
        session=session
    )
