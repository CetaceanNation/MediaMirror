from flask import (
    Blueprint,
    current_app as app,
    g,
    render_template,
    request,
    session
)
import logging

import auth
from database_manager import get_db_session, close_db_session

default_pages = Blueprint("default_pages", __name__)


@default_pages.before_request
def start_request():
    g.app_name = app.name
    get_db_session()


@default_pages.after_request
def after_request(response):
    close_db_session()
    return response


@default_pages.route("/")
def index():
    return render_template("home.j2")


@default_pages.route("/login")
def login():
    return render_template("login.j2")


@default_pages.route("/management")
def admin_page():
    g.app_name = f"{g.app_name} Settings"
    admin_sections = [
        ("Site", "general"),
        ("Users", "users"),
        ("Plugins", "plugins"),
        ("Logs", "logs")
    ]
    return render_template("admin.j2", admin_sections=admin_sections)
