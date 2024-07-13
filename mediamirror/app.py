from flask import Flask
import logging
import os
import sys
import threading

from auth import (
    add_user_permissions,
    create_user,
    create_permission,
    get_user_permissions,
    UserSessionInterface
)
from database_manager import init_db, run_updates
import logs
from logs import LogManager
from routes import default_pages
from utils import read_config_file


def main_exception_logger(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    app.logger.exception("Uncaught exception")


def thread_exception_logger(exc_info):
    app.logger.exception("Uncaught exception in thread")


def initialize_logging(logging_config):
    app.logger.name = "MediaMirror"
    sys.excepthook = main_exception_logger
    threading.excepthook = thread_exception_logger
    log_manager.set_root_path(app.root_path)
    log_manager.set_log_dir(logging_config.get("logging_directory", "./logs"))
    log_manager.set_compression(logging_config.get("use_compression", True))
    log_manager.disable_root_logger()
    log_manager.configure_logging(app.logger, True, True,
                                  console_level=logging.DEBUG)
    werkzeug_logger = logging.getLogger("werkzeug")
    log_manager.configure_logging(werkzeug_logger, False, True,
                                  console_level=logging.ERROR, logfile_level=logging.ERROR)
    werkzeug_logger.disabled = True
    sqlalchemy_logger = logging.getLogger("sqlalchemy")
    log_manager.configure_logging(sqlalchemy_logger, True, True,
                                  console_level=logging.WARN, logfile_level=logging.DEBUG)
    alembic_logger = logging.getLogger("alembic")
    log_manager.configure_logging(alembic_logger, True, True,
                                  console_level=logging.WARN, logfile_level=logging.DEBUG)
    jinja_logger = logging.getLogger("jinja2")
    log_manager.configure_logging(jinja_logger, True, True,
                                  console_level=logging.WARN, logfile_level=logging.WARN)
    return app.logger


log_manager = logs.app_log_manager = LogManager("flask")
app = Flask("MediaMirror")
with app.app_context():
    config = read_config_file()
log = initialize_logging(config.get("logging"))
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
            if not create_permission(*perm):
                log.error("Failed to insert all default permissions, database might be damaged.")
                break
        # Default user
        user_config = config.get("users", None)
        if user_config and user_config.get("default_username", None) and user_config.get("default_password", None):
            default_user_id = create_user(user_config["default_username"], user_config["default_password"])
            add_user_permissions(default_user_id, os.path.basename(os.path.dirname(__file__)), ["admin", "view-users"])
        else:
            log.error(
                "NO DEFAULT USER CONFIGURED, your config might be messed up." +
                "Rollback your database and fix your config, or add an admin manually."
            )
    app.register_blueprint(default_pages)
else:
    log.debug("=== RELOADING FOR DEBUG MODE ===")
