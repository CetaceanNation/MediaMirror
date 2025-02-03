from apispec import APISpec
from apispec.ext.marshmallow import MarshmallowPlugin
from apispec_webframeworks.flask import FlaskPlugin
from flask import (
    Blueprint,
    Flask,
    g,
    jsonify,
    request,
    Response,
    session
)
from flask_swagger_ui import get_swaggerui_blueprint
import importlib
import logging
from marshmallow import Schema
import os
import sys
import threading
import time
from typing import (
    Optional,
    Tuple,
    Type
)

import api
from api import API_KEY_HEADER
from services.auth import (
    add_user_permissions,
    create_user,
    create_permission,
    get_user_permissions,
    seen_user,
    UserSessionInterface
)
import services.database_manager as database_manager
import services.logs as logs


APP_VERSION = "0.1.0"
API_VERSION = "0.1.0"
GITHUB_URL = "https://github.com/CetaceanNation/MediaMirror"


def main_exception_logger(exc_type: Type[BaseException], exc_value: BaseException, exc_traceback:  Optional[object]):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    app.logger.exception("Uncaught exception")


def thread_exception_logger(exc_info: Optional[Tuple[Type[BaseException], BaseException, Optional[object]]]):
    app.logger.exception("Uncaught exception in thread")


def env_dict(prefix: str) -> dict:
    """
    Get a dict of environment variables with a specific prefix.

    :param prefix: Environment variable prefix
    :return: Dict of environment variables with prefix removed
    """
    return {
        key.replace(f"{prefix}_", ""): (
            val if val != "true" or val != "false" else val == "true"
        ) for key, val in os.environ.items() if key.startswith(f"{prefix}_")
    }


def register_routes(packages: list[str]) -> None:
    """
    Dynamically register all blueprints in packages.

    :param packages: List of packages to search for blueprints
    """
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
                except ImportError:
                    log.exception(f"Couldn't import {module_name}")


def document_api() -> None:
    """
    Dynamically add all API endpoints to the APISpec
    """
    spec.components.security_scheme("ApiKeyAuth", {
        "type": "apiKey",
        "in": "header",
        "name": API_KEY_HEADER
    })
    for attribute_name in dir(api):
        attribute = getattr(api, attribute_name)
        if isinstance(attribute, type) and issubclass(attribute, Schema) and attribute is not Schema:
            schema_name = attribute.__name__
            if (schema_name not in spec.components.schemas.keys() and
                    schema_name.replace("Schema", "") not in spec.components.schemas.keys()):
                spec.components.schema(attribute.__name__, schema=attribute)
                log.debug(f"Registered API schema '{schema_name}'")
    for rule in app.url_map.iter_rules():
        if rule.endpoint != "static" and rule.rule.startswith("/api"):
            with app.test_request_context():
                spec.path(view=app.view_functions[rule.endpoint])
            log.debug(f"Registered API endpoint '{rule.endpoint}'")
    spec.components.response(
        "UnauthorizedError",
        {
            "description": "Missing authorization.",
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "error": {
                                "type": "string",
                                "example": "Unauthorized"
                            }
                        }
                    }
                }
            }
        }
    )
    spec.components.response(
        "InternalServerError",
        {
            "description": "Internal server error."
        }
    )
    for path in spec._paths.values():
        for method in path.keys():
            if "responses" in path[method]:
                path[method]["responses"]["401"] = {
                    "$ref": "#/components/responses/UnauthorizedError"
                }
                path[method]["responses"]["500"] = {
                    "$ref": "#/components/responses/InternalServerError"
                }
    swagger_ui_blueprint = get_swaggerui_blueprint(
        "/api/docs",
        "/api/swagger",
        config={"app_name": app.name}
    )
    app.json.compact = True
    app.register_blueprint(swagger_ui_blueprint)


app = Flask("MediaMirror")

app.config.update(env_dict("FLASK"))
app.name = os.environ.get("APP_NAME", "MediaMirror")
APP_VERSION = os.environ.get("APP_VERSION", APP_VERSION)

logs.app_log_manager = logs.LogManager(app, env_dict("LOGS"), "flask")
log = app.logger

sys.excepthook = main_exception_logger
threading.excepthook = thread_exception_logger

is_debug = app.config.get("DEBUG", False)
if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN", "false") == "true":
    if not is_debug:
        log.setLevel(logging.INFO)
    log.info("=== APP START ===")
    if is_debug:
        log.warn("App is running in DEBUG mode, make sure you meant to do this")

    if not app.config["SECRET_KEY"]:
        log.warn("Missing SECRET_KEY in config, generating a new one.")
        app.config["SECRET_KEY"] = os.urandom(24).hex()

    try:
        database_manager.init_db(env_dict("DATABASE"))
        previous_rev, _ = database_manager.run_updates()
    except Exception:
        log.exception("Failed to start database connection")
        sys.exit(1)

    app.session_interface = UserSessionInterface(app.config.get("SESSION_COOKIE_NAME", "mm_session"))
    if not previous_rev:
        # First run, insert initial data
        # Default permissions
        # MOVE THIS TO DB REVS CLOSE TO FIRST VERSION
        initial_perms = [
            ("admin", "Permission for all functionality, including plugins"),
            ("view-users", "Access the users panel and view all users"),
            ("modify-users", "Modify permissions for existing users"),
            ("manage-users", "Create/delete users"),
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
        if os.environ.get("APP_DEFAULT_USER") and os.environ.get("APP_DEFAULT_USER_PASSWORD"):
            default_user_id = create_user(os.environ.get("APP_DEFAULT_USER"),
                                          os.environ.get("APP_DEFAULT_USER_PASSWORD"))
            add_user_permissions(default_user_id, ["admin"])
        else:
            log.warn(
                "NO DEFAULT USER CONFIGURED, your config might be messed up." +
                "Rollback your database and fix your config, or add an admin manually."
            )
    register_routes(["api", "views"])
    spec = APISpec(
        title=f"{app.name} API",
        version=API_VERSION,
        openapi_version="3.0.2",
        plugins=[FlaskPlugin(), MarshmallowPlugin()]
    )
    document_api()
else:
    log.debug("=== RELOADING FOR DEBUG MODE ===")


@app.before_request
def start_request() -> None:
    """
    Measure request time, make database session
    and make user permissions available in request.
    """
    g.start_time = time.time()
    g.request_time = lambda: "%.2fms" % ((time.time() - g.start_time) * 1000)
    if not request.path.startswith("/static"):
        database_manager.get_db_session()
        g.permissions = []
        if not request.path.startswith("/api"):
            if "user_id" in session:
                seen_user(session["user_id"])
                g.permissions = get_user_permissions(session["user_id"])


@app.after_request
def after_request(response: Response) -> Response:
    """
    Close database session for request.
    """
    if not request.path.startswith("/static"):
        database_manager.close_db_session()
    return response


@app.context_processor
def injects() -> dict:
    """
    Include app name, version, and user session in
    all requests.
    """
    return dict(
        app_name=app.name,
        app_version=APP_VERSION,
        project_url=GITHUB_URL,
        session=session
    )


@app.route("/api/swagger")
def swagger_json() -> Response:
    """
    Endpoint for retrieving the APISpec JSON.

    :return: APISpec JSON
    """
    return jsonify(spec.to_dict())
