from flask import (
    jsonify,
    request,
    session
)
from functools import wraps
import logging
from marshmallow import (
    fields,
    Schema
)
from typing import Optional

from services.auth import (
    check_api_key_exists,
    check_request_permissions
)


API_KEY_HEADER = "X-API-KEY"

# Schema needs to be alphabetically sorted for
# dependencies because of Python dir implementation


class UserSchema(Schema):
    id = fields.UUID(required=True)
    username = fields.Str(required=True)
    last_seen = fields.DateTime(required=True)


class UserDetailSchema(Schema):
    id = fields.UUID(required=True)
    username = fields.Str(required=True)
    created = fields.DateTime(required=True)
    last_seen = fields.DateTime(required=True)
    last_updated = fields.DateTime(required=True)


def get_api_key() -> Optional[str]:
    """
    Get value of header for API key

    :return: API Key header value if it exists
    """
    return request.headers.get(API_KEY_HEADER)


def check_api_key(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        api_key = get_api_key()
        if not api_key:
            return jsonify({"error": "Missing authorization"}), 401
        elif not check_api_key_exists(api_key):
            return jsonify({"error": "Not authorized"}), 403
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
                return jsonify({"error": "Missing authorization"}), 401
            if not perms_met:
                return jsonify({"error": "Not authorized"}), 403
            return f(*args, **kwargs)
        return wrap
    return decorator_function


log = logging.getLogger(__name__)
