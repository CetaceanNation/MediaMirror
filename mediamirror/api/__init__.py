from flask import (
    abort,
    request,
    session
)
from functools import wraps
import logging
from marshmallow import (
    fields,
    post_dump,
    Schema
)

from services.auth import (
    check_api_key_exists,
    check_request_permissions
)

# Schema needs to be alphabetically sorted for
# dependencies because of Python dir implementation


class UserSchema(Schema):
    id = fields.UUID(required=True)
    username = fields.Str(required=True)
    permissions = fields.List(fields.Str(), required=True)


def get_api_key():
    return request.headers.get("X-API-KEY")


def check_api_key(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        api_key = get_api_key()
        if not api_key:
            abort(401, description="Missing authorization")
        elif not check_api_key_exists(api_key):
            abort(403, description="Not authorized")
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
                abort(401, description="Missing authorization")
            if not perms_met:
                abort(403, description="Not authorized")
            return f(*args, **kwargs)
        return wrap
    return decorator_function


log = logging.getLogger(__name__)
