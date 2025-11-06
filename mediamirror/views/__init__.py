from quart import (
    abort,
    redirect,
    request,
    session,
    url_for
)
from functools import wraps

from mediamirror.services.auth import check_request_permissions


def login_required(f):
    @wraps(f)
    async def wrap(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("auth_pages.login", next=request.url))
        return await f(*args, **kwargs)
    return wrap


def permissions_required(permissions_list):
    def decorator_function(f):
        @wraps(f)
        async def wrap(*args, **kwargs):
            if "user_id" not in session:
                abort(401, description="Missing authorization")
            elif not await check_request_permissions(permissions_list, user_id=session.get("user_id")):
                abort(403, description="Not authorized")
            return await f(*args, **kwargs)
        return wrap
    return decorator_function
