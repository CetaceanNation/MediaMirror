from flask import (
    Blueprint,
    Flask,
    g,
    request
)
import importlib
import logging
import os
import sys
import threading

from services.auth import (
    add_user_permissions,
    create_user,
    create_permission,
    UserSessionInterface
)
from services.database_manager import (
    close_db_session,
    get_db_session,
    init_db,
    run_updates
)
import services.logs as logs
from services.utils import read_config_file


def main_exception_logger(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    app.logger.exception("Uncaught exception")


def thread_exception_logger(exc_info):
    app.logger.exception("Uncaught exception in thread")


def register_routes(packages):
    for package_name in packages:
        for filename in os.listdir(os.path.join(app.root_path, "mediamirror", package_name)):
            if filename.endswith(".py") and filename != "__init__.py":
                module_name = f"{package_name}.{os.path.splitext(filename)[0]}"
                try:
                    module = importlib.import_module(module_name)
                    for attribute_name in dir(module):
                        attribute = getattr(module, attribute_name)
                        if isinstance(attribute, Blueprint):
                            app.register_blueprint(attribute)
                            log.debug(f"Registered blueprint '{attribute.name}' from {module_name}")
                except ImportError as e:
                    log.error(f"Couldn't import {module_name}, blueprints will not be registered if they exist", e)


app = Flask("MediaMirror")
with app.app_context():
    config = read_config_file()
app.name = config.get("app", {}).get("name", "MediaMirror")
log_manager = logs.app_log_manager = logs.LogManager(app, config.get("logging"), config.get("log_config"), "flask")
log = app.logger
sys.excepthook = main_exception_logger
threading.excepthook = thread_exception_logger
is_debug = config.get("flask", {}).get("DEBUG", False)
if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
    if not is_debug:
        log.setLevel(logging.INFO)
    log.info("=== APP START ===")
    if is_debug:
        log.info("App is running in DEBUG mode")

    app.config.update(config.get("flask", {}))
    if not app.config["SECRET_KEY"]:
        log.warn("Missing SECRET_KEY in config, generating a new one...")
        app.config["SECRET_KEY"] = os.urandom(24).hex()

    init_db(config.get("database"))
    previous_rev, _ = run_updates(app.name, config.get("database", {}).get("schema_directory", "./schema"))

    app.session_interface = UserSessionInterface(app.config.get("SESSION_COOKIE_NAME", "mm_session"))
    if not previous_rev:
        # First run, insert initial data
        # Default permissions
        initial_perms = [
            ("admin", "Permission for all functionality, including plugins"),
            ("view-users", "Access the users panel and view all users"),
            ("manage-users", "Create/delete users"),
            ("modify-users", "Modify permissions for existing users"),
            ("view-logs", "Access the logs panel and view all logs"),
            ("view-plugins", "Access the plugins panel and view settings"),
            ("manage-plugins", "Add/remove plugins"),
            ("modify-plugins", "Modify settings for plugins")
        ]
        for perm in initial_perms:
            if not create_permission(app.name.lower(), *perm):
                log.error("Failed to insert all default permissions, database might be damaged.")
                break
        # Default user
        user_config = config.get("users", None)
        if user_config and user_config.get("default_username", None) and user_config.get("default_password", None):
            default_user_id = create_user(user_config["default_username"], user_config["default_password"])
            add_user_permissions(default_user_id, app.name.lower(), ["admin"])
        else:
            log.error(
                "NO DEFAULT USER CONFIGURED, your config might be messed up." +
                "Rollback your database and fix your config, or add an admin manually."
            )
    register_routes(["api", "views"])
else:
    log.debug("=== RELOADING FOR DEBUG MODE ===")


@app.before_request
def start_request():
    g.app_name = app.name
    if not request.path.startswith("/static"):
        get_db_session()


@app.after_request
def after_request(response):
    if not request.path.startswith("/static"):
        close_db_session()
    return response
