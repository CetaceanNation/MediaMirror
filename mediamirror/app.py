from apispec import APISpec
from contextlib import asynccontextmanager
import importlib
import logging
from marshmallow import Schema
import os
from quart import (
    Blueprint,
    g,
    jsonify,
    request,
    Quart,
    render_template,
    Response,
    session
)
import sys
import threading
import time
from typing import (
    Optional,
    Tuple,
    Type
)

from mediamirror import api
from mediamirror.api import API_KEY_HEADER
from mediamirror.services.auth import (
    add_user_permissions,
    create_user,
    get_user_permissions,
    seen_user,
    UserSessionInterface
)
import mediamirror.services.database_manager as database_manager
import mediamirror.services.logs as logs
import mediamirror.services.plugin_manager as plugins


APP_VERSION = "0.1.0"
API_VERSION = "0.1.0"
GITHUB_URL = "https://github.com/CetaceanNation/MediaMirror"


@asynccontextmanager
async def test_context(app, rule):
    ctx = app.test_request_context(rule)
    await ctx.push()
    try:
        yield
    finally:
        await ctx.pop()


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
                module_name = f"mediamirror.{package_name}.{os.path.splitext(filename)[0]}"
                try:
                    module = importlib.import_module(module_name)
                    for attribute_name in dir(module):
                        attribute = getattr(module, attribute_name)
                        if isinstance(attribute, Blueprint):
                            app.register_blueprint(attribute)
                            log.debug(f"Registered blueprint '{attribute.name}' from {module_name}")
                except ImportError:
                    log.exception(f"Couldn't import {module_name}")


async def document_api() -> None:
    """
    Dynamically add all API endpoints to the APISpec

    :param spec: Initialized APISpec object
    """
    flask_quart = importlib.import_module("quart")
    flask_quart.Flask = flask_quart.Quart
    sys.modules["flask"] = flask_quart
    from apispec_webframeworks.flask import FlaskPlugin
    from apispec.ext.marshmallow import MarshmallowPlugin
    global spec
    spec = APISpec(
        title=f"{app.name} API",
        version=API_VERSION,
        openapi_version="3.0.2",
        plugins=[FlaskPlugin(), MarshmallowPlugin()]
    )
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
    try:
        for rule in app.url_map.iter_rules():
            if rule.endpoint != "static" and rule.rule.startswith("/api"):
                async with test_context(app, rule.rule):
                    spec.path(view=app.view_functions[rule.endpoint])
                log.debug(f"Registered API endpoint '{rule.endpoint}'")
        # Add default 401 and 500 responses
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
    except Exception:
        log.exception("Failed to document API endpoints")
    app.json.compact = True


app = Quart("MediaMirror")
app.config.update(env_dict("QUART"))
app.name = os.environ.get("APP_NAME", "MediaMirror")
APP_VERSION = os.environ.get("APP_VERSION", APP_VERSION)
is_debug = app.debug or app.config.get("DEBUG", False)
log = app.logger
spec = None


@app.before_serving
async def startup_tasks():
    try:
        database_manager.init_db(env_dict("DATABASE"))
    except Exception as e:
        print(f"Failed to initialize database connection and logging: {e}", file=sys.stderr)
        sys.exit(1)

    logs.app_log_manager = logs.AppLogManager(app, env_dict("LOGS"), "quart")
    await logs.app_log_manager.initialize(app, env_dict("LOGS"))
    sys.excepthook = main_exception_logger
    threading.excepthook = thread_exception_logger
    log.info("=== APP START ===")
    if not is_debug:
        log.setLevel(logging.INFO)
    if is_debug:
        log.warn("App is running in DEBUG mode. Make sure this is on purpose!")
    previous_rev, _ = await database_manager.run_updates(env_dict("DATABASE").get("SCHEMA_DIR", "schema_revisions"))
    await logs.app_log_manager.save_logging_config_to_db()

    if not app.config["SECRET_KEY"]:
        log.warn("Missing SECRET_KEY in config, generating a random key for this instance")
        app.config["SECRET_KEY"] = os.urandom(24).hex()

    app.session_interface = UserSessionInterface(app.config.get("SESSION_COOKIE_NAME", "mm_session"))
    if not previous_rev:
        # Create default user on first run
        if os.environ.get("APP_DEFAULT_USER") and os.environ.get("APP_DEFAULT_USER_PASSWORD"):
            default_user_id = await create_user(os.environ.get("APP_DEFAULT_USER"),
                                                os.environ.get("APP_DEFAULT_USER_PASSWORD"))
            await add_user_permissions(default_user_id, ["admin"])
        else:
            log.warn(
                "NO DEFAULT USER CONFIGURED, your env file might be messed up." +
                "Rollback your database and fix your .env, or add an admin manually."
            )
    register_routes(["api", "views"])
    await document_api()
    plugins.plugin_manager = plugins.PluginManager()
    plugins.plugin_manager.load_all_plugins()


@app.before_request
async def start_request() -> None:
    """
    Measure request time, make database session
    and make user permissions available in request.
    """
    g.start_time = time.time()
    g.request_time = lambda: "%.2fms" % ((time.time() - g.start_time) * 1000)
    if not request.path.startswith("/static"):
        database_manager.get_db_session()
        g.user_id = session.get("user_id", None)
        g.permissions = []
        if not request.path.startswith("/api"):
            if g.user_id:
                await seen_user(g.user_id)
                g.permissions = await get_user_permissions(g.user_id)


@app.after_request
async def after_request(response: Response) -> Response:
    """
    Close database session for request.
    """
    if not request.path.startswith("/static"):
        await database_manager.close_db_session()
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
    global spec
    return jsonify(spec.to_dict())


@app.route("/api/docs")
async def swagger_ui() -> Response:
    """
    Endpoint for retrieving the Swagger UI.

    :return: Swagger UI HTML
    """
    return await render_template("swagger.j2")
