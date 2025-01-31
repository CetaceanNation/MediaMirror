from flask import (
    Blueprint,
    jsonify,
    request,
    Response
)
import json
import logging
import os

from . import (
    api_wrapper,
    permissions_required,
    PermissionSchema,
    UserDetailSchema,
    UserSchema
)
import services.auth as auth
from services.logs import app_log_manager
from uuid import uuid4


manage_routes = Blueprint("manage_routes", __name__, url_prefix="/api/manage")


@manage_routes.route("/users", methods=["GET"])
@api_wrapper
@permissions_required(["view-users"])
def user_list() -> Response:
    """
    View all users, with paging/filtering.
    ---
    get:
        tags:
          - Users
        description: Retrieve a list of users.
        security:
          - ApiKeyAuth: []
        parameters:
          - name: page
            description: Page offset to return.
            in: query
            required: false
            schema:
                type: integer
                minimum: 1
                default: 1
          - name: page_size
            description: Number of users to return per page.
            in: query
            required: false
            schema:
                type: integer
                minimum: 1
                default: 15
          - name: username_filter
            description: Filter users by username (partial match).
            in: query
            required: false
            schema:
                type: string
        responses:
            200:
                description: Return a paginated list of users and metadata.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                page:
                                    type: integer
                                    description: Current page number.
                                next_page:
                                    type: boolean
                                    description: Whether there are more results to fetch.
                                users:
                                    type: array
                                    items:
                                        $ref: "#/components/schemas/UserSchema"
            400:
                description: Invalid query parameters
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: Parameter 'parameter_name' must be at least #
    """
    username_filter = request.args.get("username_filter", type=str)
    page_size = request.args.get("page_size", 15, type=int)
    page = request.args.get("page", 1, type=int)

    if page_size is not None and page_size < 1:
        return jsonify({"error": "Parameter 'page_size' must be at least 1"}), 400
    elif page is not None and page < 1:
        return jsonify({"error": "Parameter 'offset' must be at least 0"}), 400
    user_data, has_next_page = auth.get_users(page_size=page_size, page=page, username_filter=username_filter)
    response_data = {
        "page": page,
        "next_page": has_next_page,
        "users": UserSchema(many=True).dump(user_data),
    }
    return jsonify(response_data)


@manage_routes.route("/users", methods=["POST"])
@api_wrapper
@permissions_required(["manage-users"])
def add_user() -> Response:
    """
    Add a new user.
    ---
    post:
        tags:
          - Users
        description: Creates a new user.
        security:
          - ApiKeyAuth: []
        requestBody:
            required: true
            content:
                application/json:
                    schema:
                        type: object
                        properties:
                            username:
                                type: string
                                example: "ValidUsername"
                            password:
                                type: string
                                example: "SecureP@ssword!"
                            confirm_password:
                                type: string
                                example: "SecureP@ssword!"
        responses:
            201:
                description: User created successfully.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                user_id:
                                    type: string
                                    format: uuid
                                    example: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
            400:
                description: Validation error (e.g., passwords do not match).
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: "Passwords do not match"
            409:
                description: User with submitted username already exists.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: "User with the username 'Username' already exists"
    """
    try:
        data = request.get_json()
        username = data.get("username", "").strip()
        password = data.get("password", None)
        confirm_password = data.get("confirm_password", None)

        if password != confirm_password:
            return jsonify({"error": "Passwords do not match"}), 400
        try:
            user_id = auth.create_user(username, password)
            if user_id:
                return jsonify({"user_id": str(user_id)}), 201
            else:
                return jsonify({"error": "Could not add user"}), 500
        except auth.DuplicateUserException:
            return jsonify({"error": f"User with the username '{username}' already exists"}), 409
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@manage_routes.route("/users/<uuid:user_id>", methods=["GET"])
@api_wrapper
@permissions_required(["view-users"])
def get_user_details(user_id: uuid4) -> Response:
    """
    User details.
    ---
    get:
        tags:
          - Users
        description: Retrieve detailed information about a specific user.
        security:
          - ApiKeyAuth: []
        parameters:
          - name: user_id
            description: User ID for the user being requested.
            in: path
            required: true
            schema:
                type: string
                format: uuid
        responses:
            200:
                description: Detailed user information.
                content:
                    application/json:
                        schema:
                            $ref: "#/components/schemas/UserDetailSchema"
            404:
                description: User not found.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: User not found
    """
    user_data = auth.get_user(user_id=user_id)
    if not user_data:
        return jsonify({"error": "User not found"}), 404
    return jsonify(UserDetailSchema().dump(user_data))


@manage_routes.route("/users/<uuid:user_id>", methods=["DELETE"])
@api_wrapper
@permissions_required(["manage-users"])
def delete_user(user_id: uuid4) -> Response:
    """
    Delete a user.
    ---
    get:
        tags:
          - Users
        description: Deletes a specific user
        security:
          - ApiKeyAuth: []
        parameters:
          - name: user_id
            description: User ID for the user being deleted.
            in: path
            required: true
            schema:
                type: string
                format: uuid
        responses:
            204:
                description: User deleted successfully.
            400:
                description: Failed to delete user.
            404:
                description: User not found.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: User not found
    """
    try:
        if auth.delete_user(user_id):
            return "", 204
    except auth.MissingUserException as mue:
        return jsonify({"error": mue.message}), 404
    return "", 400


@manage_routes.route("/users/<uuid:user_id>/permissions", methods=["GET", "PUT", "DELETE"])
@api_wrapper
@permissions_required(["modify-users"])
def permissions(user_id: uuid4) -> Response:
    """
    View and modify permissions for a user.
    ---
    get:
        tags:
          - Users
          - Permissions
        description: Retrieve a list of permissions currently on a user.
        security:
          - ApiKeyAuth: []
        parameters:
          - name: user_id
            description: User ID for the user whose permissions are being requested.
            in: path
            required: true
            schema:
                type: string
                format: uuid
        responses:
            200:
                description: Return a list of permissions on the user.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                permissions:
                                    type: array
                                    items:
                                        type: string
                                        example: "perm-key"
            404:
                description: User not found.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: User not found
    put:
        tags:
          - Users
          - Permissions
        description: Add permissions to a user.
        security:
          - ApiKeyAuth: []
        parameters:
          - name: user_id
            description: User ID for the user whose permissions are being requested.
            in: path
            required: true
            schema:
                type: string
                format: uuid
        requestBody:
            required: true
            content:
                application/json:
                    schema:
                        type: object
                        properties:
                            permissions:
                                type: array
                                items:
                                    type: string
                                    example: "perm-key"
        responses:
            204:
                description: Successfully added permissions.
            400:
                description: Failed to add permissions.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: Permission does not exist
            404:
                description: User not found.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: User not found
    delete:
        tags:
          - Users
          - Permissions
        description: Delete permissions from a user.
        security:
          - ApiKeyAuth: []
        parameters:
          - name: user_id
            description: User ID for the user whose permissions are being deleted.
            in: path
            required: true
            schema:
                type: string
                format: uuid
        requestBody:
            required: true
            content:
                application/json:
                    schema:
                        type: object
                        properties:
                            permissions:
                                type: array
                                items:
                                    type: string
                                    example: "perm-key"
        responses:
            204:
                description: Successfully removed permissions.
            400:
                description: Failed to remove permissions.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: Permission does not exist
            404:
                description: User not found.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: User not found
    """
    match request.method:
        case "GET":
            try:
                permissions_list = auth.get_user_permissions(user_id)
                response_data = {
                    "permissions": permissions_list
                }
                return jsonify(response_data)
            except auth.MissingUserException as mue:
                return jsonify({"error": mue.message}), 404
        case "PUT":
            data = request.get_json()
            try:
                if auth.add_user_permissions(user_id, data["permissions"]):
                    return "", 204
            except auth.MissingPermissionException as mpe:
                return jsonify({"error": mpe.message}), 400
            except auth.DuplicatePermissionException as dpe:
                return jsonify({"error": dpe.message}), 400
            except auth.MissingUserException as mue:
                return jsonify({"error": mue.message}), 404
            return "", 400
        case "DELETE":
            data = request.get_json()
            try:
                if auth.delete_user_permissions(user_id, data["permissions"]):
                    return "", 204
            except auth.MissingPermissionException:
                return jsonify({"error": "Permission does not exist or does not exist on user"}), 400
            except auth.MissingUserException as mue:
                return jsonify({"error": mue.message}), 404
            return "", 400


@manage_routes.route("/permissions", methods=["GET"])
@api_wrapper
@permissions_required("modify-users")
def get_all_permissions() -> Response:
    """
    Retrieve all permissions with keys and descriptions.
    ---
    get:
        tags:
          - Permissions
        description: Retrieve a list of all permissions.
        security:
          - ApiKeyAuth: []
        responses:
            200:
                description: List of permission keys and their descriptions.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                permissions:
                                    type: array
                                    items:
                                        $ref: "#/components/schemas/PermissionSchema"
    """
    permissions = auth.get_permissions()
    response_data = {
        "permissions": PermissionSchema(many=True).dump(permissions)
    }
    return jsonify(response_data)


@manage_routes.route("/logs", methods=["GET"])
@api_wrapper
@permissions_required(["view-logs"])
def get_log_tree() -> Response:
    """
    Log directory tree.
    ---
    get:
        tags:
          - Logs
        description: Retrieve a hierarchical JSON representation of all log files in the log directory.
        security:
          - ApiKeyAuth: []
        responses:
            200:
                description: Returns a nested dictionary representing the file structure of the logs directory.
                content:
                    application/json:
                        schema:
                            type: object
                            additionalProperties:
                                oneOf:
                                  - $ref: "#/components/schemas/DirectorySchema"
                                  - $ref: "#/components/schemas/FileSchema"
    """
    log_tree = app_log_manager.index_log_dir()
    return Response(
        json.dumps(log_tree, indent=2, sort_keys=False),
        mimetype="application/json"
    )


@manage_routes.route("/logs/<path:log_path>", methods=["GET"])
@api_wrapper
@permissions_required(["view-logs"])
def get_log_contents(log_path: str) -> Response:
    """
    Log file contents.
    ---
    get:
        tags:
          - Logs
        description: Retrieve the contents of a log file.
        security:
          - ApiKeyAuth: []
        parameters:
          - name: log_path
            description: The path to the log file, as returned from the `/api/manage/logs` API.
            in: path
            required: true
            schema:
                type: string
        responses:
            200:
                description: The log file contents as a JSONL stream.
                content:
                    application/x-ndjson:
                        schema:
                            type: string
                            description: Each line is a separate JSON log entry.
            400:
                description: Invalid log path.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: Invalid log path
            404:
                description: Log file not found.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: Log file not found
    """
    abs_log_path = os.path.abspath(os.path.join(app_log_manager.log_dir, log_path))

    if not abs_log_path.startswith(app_log_manager.log_dir):
        return jsonify({"error": "Invalid log path"}), 400
    elif not os.path.exists(abs_log_path) or not os.path.isfile(abs_log_path):
        return jsonify({"error": "Log file not found"}), 404
    return Response(app_log_manager.read_log(abs_log_path), mimetype="application/x-ndjson")


log = logging.getLogger("API")
