from flask import (
    jsonify,
    request,
    session
)
from functools import wraps
import logging
from marshmallow import (
    fields,
    Schema,
    validate
)
from typing import Optional

from services.auth import (
    check_api_key_valid,
    check_request_permissions
)


API_KEY_HEADER = "X-API-KEY"

# Schema needs to be alphabetically sorted for
# dependencies because of Python dir implementation


class DirectoryOrFileSchema(Schema):
    _type = fields.String(
        required=True,
        validate=validate.OneOf(["directory", "file"]),
        metadata={"description": "Indicates whether this is a directory or a file."}
    )


class DirectorySchema(DirectoryOrFileSchema):
    _type = fields.String(
        required=True,
        validate=validate.OneOf(["directory"]),
        metadata={"description": "Indicates this is a directory."}
    )
    nested = fields.Nested(lambda: DirectoryOrFileSchema())


class FileSchema(DirectoryOrFileSchema):
    _type = fields.String(
        required=True,
        validate=validate.OneOf(["file"]),
        metadata={"description": "Indicates this is a file."}
    )
    path = fields.String(
        required=True,
        metadata={
            "description": "Relative path to the file from the root directory.",
            "example": "Path/To/File.log"
        }
    )
    size = fields.Integer(
        required=True,
        metadata={"description": "File size in bytes."}
    )


class PermissionSchema(Schema):
    key = fields.Str(
        required=True,
        metadata={"example": "perm-key"}
    )
    description = fields.Str(
        required=True,
        metadata={"example": "What this permission is used for."}
    )


class UserSchema(Schema):
    id = fields.UUID(required=True)
    username = fields.Str(
        required=True,
        metadata={"example": "Username"}
    )
    last_seen = fields.DateTime(required=True)


class UserDetailSchema(Schema):
    id = fields.UUID(required=True)
    username = fields.Str(
        required=True,
        metadata={"example": "Username"}
    )
    created = fields.DateTime(required=True)
    last_seen = fields.DateTime(required=True)
    last_updated = fields.DateTime(required=True)


def get_api_key() -> Optional[str]:
    """
    Get value of header for API key

    :return: API Key header value if it exists
    """
    return request.headers.get(API_KEY_HEADER)


def api_wrapper(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception:
            log.exception("API request encountered an exception")
            return jsonify({"error": "Internal server error"}), 500
    return wrap


def check_api_key(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        api_key = get_api_key()
        if not api_key:
            return jsonify({"error": "Unauthorized"}), 401
        elif not check_api_key_valid(api_key):
            return jsonify({"error": "Forbidden"}), 403
        return f(*args, **kwargs)
    return wrap


def permissions_required(permissions_list):
    def decorator_function(f):
        @wraps(f)
        def wrap(*args, **kwargs):
            perms_met = False
            api_key = get_api_key()
            if "user_id" in session:
                perms_met = check_request_permissions(permissions_list, user_id=session.get("user_id"))
            elif api_key:
                perms_met = check_request_permissions(permissions_list, api_key=api_key)
            else:
                return jsonify({"error": "Unauthorized"}), 401
            if not perms_met:
                return jsonify({"error": "Forbidden"}), 403
            return f(*args, **kwargs)
        return wrap
    return decorator_function


log = logging.getLogger(__name__)
