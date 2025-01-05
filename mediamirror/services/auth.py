from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from datetime import datetime
from flask import (
    Flask,
    Request,
    Response
)
from flask.sessions import (
    SessionInterface,
    SessionMixin
)
from hashlib import sha3_256
import logging
import re
from sqlalchemy import select
from user_agents import parse as parse_user_agent
from werkzeug.datastructures import CallbackDict

from models.api import (
    ApiKey
)
from models.users import (
    PermissionModel,
    UserModel,
    UserPermModel,
    UserSessionModel
)
from services.database_manager import get_db_session
from typing import (
    Optional,
    Tuple
)
from uuid import uuid4


VALID_PERMISSION = r"^[a-z-]{,60}$"


class UserSession(CallbackDict, SessionMixin):

    def __init__(self, session_id: str, device_identifier: str, initial_data: Optional[dict] = None):
        def on_update(user_session: SessionMixin) -> None:
            user_session.modified = True

        super().__init__(initial_data, on_update)
        self.sid = session_id
        self.did = device_identifier
        self.modified = False
        self.permanent = True
        self.new = True


class UserSessionInterface(SessionInterface):
    cookie_name = None

    def __init__(self, cookie_name: str) -> None:
        global log
        log.debug("Started Session Interface")
        self.cookie_name = cookie_name

    def open_session(self, app: Flask, request: Request) -> UserSession:
        """
        Open user session.

        :param app: Flask app
        :param request: Request opening the session
        :return: Opened user session
        """
        session_id = request.cookies.get(self.cookie_name)
        ua_string = self.get_device_identifier(request)
        # Check session cookie value
        if not session_id:
            # Anonymous session
            session_id = self.new_session_id(request)
            return UserSession(session_id, ua_string)
        try:
            with get_db_session() as db_session:
                # Check if session is in database
                saved_session = db_session.get(UserSessionModel, session_id)
                if saved_session:
                    # Invalidate session if expired or if session device doesn't match
                    if (
                        saved_session.expires_at and
                        saved_session.expires_at <= datetime.utcnow()
                    ) or saved_session.device_identifier != ua_string:
                        try:
                            log.debug(f"Session ({session_id}) was invalidated, deleting")
                            db_session.delete(saved_session)
                            db_session.commit()
                        except Exception:
                            log.exception(f"Failed to delete invalid session ({session_id})")
                    else:
                        try:
                            # Load session with saved data
                            return UserSession(session_id, ua_string, initial_data=saved_session.data)
                        except Exception:
                            log.exception(f"Failed to restore session ({session_id})")
        except Exception:
            log.exception(f"Could not retrieve session ({session_id})")
        # New session
        return UserSession(self.new_session_id(request), ua_string)

    def save_session(self, app: Flask, session: SessionMixin, response: Response) -> None:
        """
        Save user session.

        :param app: Flask app
        :param session: User session
        :param response: Response returning the session
        :return: Formatted exception
        """
        session_id = session.sid
        try:
            with get_db_session() as db_session:
                saved_session = db_session.get(UserSessionModel, session_id)
                if not session:
                    if session.modified:
                        # Remove cookie for invalid session
                        self.remove_cookie(app, response)
                        if saved_session:
                            try:
                                # Delete session that's been removed
                                log.debug(f"Deleting saved session ({session_id})")
                                db_session.delete(saved_session)
                                db_session.commit()
                            except Exception:
                                log.exception(f"Failed to delete removed session ({session_id})")
                    return
                if not self.should_set_cookie(app, session):
                    log.debug(f"Not setting cookie for session ({session_id})")
                    return
                updated_expiration = self.get_expiration_time(app, session)
                if saved_session:
                    try:
                        # Update saved session
                        saved_session.expires_at = updated_expiration
                        saved_session.data = dict(session)
                        db_session.commit()
                    except Exception:
                        log.exception(f"Failed to update saved session ({session_id})")
                elif "user_id" in session:
                    try:
                        # Save new session if it belongs to a user
                        log.debug(f"Saving new session {session_id}")
                        new_session = UserSessionModel(
                            id=session_id,
                            expires_at=updated_expiration,
                            device_identifier=session.did,
                            user_id=session["user_id"],
                            data=dict(session)
                        )
                        db_session.add(new_session)
                        db_session.commit()
                    except Exception:
                        log.exception(f"Failed to save new session ({session_id})")
                else:
                    # Cookie doesn't correspond to a saved session, remove it
                    self.remove_cookie(app, response)
                    return
        except Exception:
            log.exception(f"Failed to save session ({session_id})")
        # Set session cookie
        self.add_cookie(app, response, session_id, updated_expiration)

    def new_session_id(self, request: Request) -> str:
        """
        Create a session ID based on the request IP, User-Agent, and the current time.

        :param request: Request to create the session id for
        :return: Session ID
        """
        h = sha3_256()
        h.update(
            f"{request.remote_addr}|{request.headers.get('User-Agent')}|{datetime.utcnow().timestamp()}".encode("utf-8")
        )
        return h.hexdigest()

    def get_device_identifier(self, request: Request) -> str:
        """
        Create a string from the User-Agent.

        :param request: Request to build the identifier from
        :return: Device ID string
        """
        ua = parse_user_agent(request.headers.get("User-Agent", ""))
        device_browser = ua.browser.family
        device_os = f"{ua.os.family} ({ua.os.version_string})"
        device = f"{ua.device.family} ({ua.device.brand} {ua.device.model})"
        return f"{device_browser}|{device_os}|{device}"

    def remove_cookie(self, app: Flask, response: Response) -> None:
        """
        Instruct sender to delete cookie in response.

        :param app: Flask app
        :param response: Response to delete the cookie in
        """
        response.delete_cookie(
            self.cookie_name,
            domain=self.get_cookie_domain(app),
            path=self.get_cookie_path(app)
        )

    def add_cookie(self, app: Flask, response: Response, session_id: str, expires: datetime) -> None:
        """
        Instruct sender to add cookie in response.

        :param app: Flask app
        :param response: Response to add the cookie to
        :param session_id: Session ID value for the cookie
        :param expires: When the cookie expires
        """
        response.set_cookie(
            self.cookie_name,
            session_id,
            expires=expires,
            httponly=self.get_cookie_httponly(app),
            domain=self.get_cookie_domain(app),
            path=self.get_cookie_path(app),
            secure=self.get_cookie_secure(app),
            samesite=app.config.get("SESSION_COOKIE_SAMESITE", "Strict"),
        )


def create_user(username: str, password: str) -> Optional[uuid4]:
    """
    Create a user in the database.

    :param username: Username
    :param password: Password
    :return: User UUID if creation was successful
    """
    if get_user(username=username):
        return None
    with get_db_session() as db_session:
        try:
            passhash = ph.hash(password)
            new_user = UserModel(
                username=username,
                passhash=passhash
            )
            db_session.add(new_user)
            db_session.commit()
            log.debug(f"Created new user '{username}' ({new_user.id})")
            return new_user.id
        except Exception:
            log.exception(f"Failed to create new user '{username}'")
            db_session.rollback()
    return None


def delete_user(user_id: uuid4) -> bool:
    """
    Delete a user from the database.

    :param user_id: ID of the user to delete
    :return: If deletion was successful
    """
    if not get_user(user_id=user_id):
        return False
    with get_db_session() as db_session:
        try:
            user = db_session.get(UserModel, user_id)
            deleted_username = user.username
            db_session.delete(user)
            db_session.commit()
            log.debug(f"Deleted user '{deleted_username}' ({user_id})")
            return True
        except Exception:
            log.exception(f"Failed to delete user ({user_id})")
            db_session.rollback()
    return False


def get_user(user_id: Optional[uuid4] = None, username: Optional[str] = None) -> Optional[UserModel]:
    """
    Retrieve a user.

    :param user_id: ID of the user
    :param username: Username of the user
    :return: User if they exist
    """
    with get_db_session() as db_session:
        existing_user_stmt = select(UserModel)
        if user_id:
            existing_user_stmt = existing_user_stmt.where(UserModel.id == user_id)
        elif username:
            existing_user_stmt = existing_user_stmt.where(UserModel.username == username)
        else:
            return None
        try:
            existing_user = db_session.scalars(existing_user_stmt).first()
            return existing_user
        except Exception:
            log.exception(f"Failed to lookup user by user id ({user_id})")
    return None


def get_users(page_size: Optional[int] = None, page: Optional[int] = 1,
              username_filter: Optional[str] = None) -> Tuple[list[UserModel], bool]:
    """
    Retrieve a list of users.

    :param page_size: Pagination page size
    :param page: Pagination starting index
    :param username_filter: Partial match text for usernames
    :return: List of users that match conditions, whether or not pagination continues with these conditions
    """
    with get_db_session() as db_session:
        try:
            user_list_stmt = select(UserModel.id, UserModel.username).order_by(UserModel.created)
            if username_filter:
                user_list_stmt = user_list_stmt.where(UserModel.username.ilike(f"%{username_filter}%"))
            if page_size:
                user_list_stmt = user_list_stmt.limit(page_size + 1).offset(page_size * (page - 1))
            results = db_session.execute(user_list_stmt).all()
            has_next_page = len(results) > page_size if page_size else False
            return results[:page_size], has_next_page
        except Exception:
            log.exception("Failed to retrieve users")
    return [], False


def create_api_key(user_id: uuid4, expires_at: Optional[datetime] = None) -> Optional[uuid4]:
    """
    Create an API key for a user.

    :param user_id: ID of the user the API key is for
    :param expires_at: When the API key should expire
    :return: API key if successful
    """
    with get_db_session() as db_session:
        try:
            new_key = ApiKey(
                user_id=user_id,
                expires_at=expires_at
            )
            db_session.add(new_key)
            db_session.commit()
            log.debug(f"Created API key ({new_key.id}) for user ({user_id})")
            return new_key.id
        except Exception:
            log.exception(f"Failed to create new API key for user ({user_id})")
            db_session.rollback()
    return None


def delete_api_key(api_key: uuid4) -> bool:
    """
    Delete an API key.

    :param api_key: API key to delete
    :return: If deletion was successful
    """
    with get_db_session() as db_session:
        try:
            existing_key = db_session.get(ApiKey, api_key)
            db_session.delete(existing_key)
            db_session.commit()
            log.debug(f"Deleted API key ({api_key})")
            return True
        except Exception:
            log.exception(f"Failed to delete API key ({api_key})")
            db_session.rollback()
    return False


def check_api_key_exists(api_key: uuid4) -> bool:
    """
    Verify status of API key.

    :param api_key: API key to check
    :return: If API key is valid
    """
    with get_db_session() as db_session:
        try:
            existing_key = db_session.get(ApiKey, api_key)
            if existing_key:
                if (
                    existing_key.expires_at and
                    existing_key.expires_at <= datetime.utcnow()
                ):
                    log.debug(f"API key ({api_key}) has expired")
                    delete_api_key(api_key)
                    return False
                return True
        except Exception:
            log.exception(f"Failed to lookup API key ({api_key})")
    return False


def create_permission(key: str, description: str) -> bool:
    """
    Create a permission.

    :param key: Permission key
    :param description: Description of what the permission is used for
    :return: If the permission was created
    """
    if not re.match(VALID_PERMISSION, key):
        log.error(f"Permission not added, key ({key}) is not valid")
        return False
    if get_permission(key):
        log.error(f"Permission not added, key ({key}) already exists")
        return False
    try:
        with get_db_session() as db_session:
            new_permission = PermissionModel(
                key=key,
                description=description
            )
            db_session.add(new_permission)
            db_session.commit()
            log.info(f"Created new permission ({key})")
            return True
    except Exception:
        log.exception(f"Failed to add permission ({key})")
    return False


def get_permission(key: str) -> Optional[PermissionModel]:
    """
    Retrieve a permission.

    :param key: Permission key
    :return: Permission if it exists
    """
    with get_db_session() as db_session:
        try:
            return db_session.get(PermissionModel, key)
        except Exception:
            log.exception(f"Could not complete lookup for permission ({key})")
    return None


def get_user_permissions(user_id: uuid4) -> list[str]:
    """
    Retrieve list of permissions for a user.

    :param user_id: ID of user
    :return: List of permission keys for the user
    """
    with get_db_session() as db_session:
        try:
            user_perms_stmt = select(UserPermModel.key).where(UserPermModel.user_id == user_id)
            return db_session.scalars(user_perms_stmt).all()
        except Exception:
            log.exception(f"Failed to lookup user permissions for user ({user_id})")
    return []


def get_api_permissions(api_key: uuid4) -> list[str]:
    """
    Retrieve list of permissions for user API key was created for.

    :param api_key: API key
    :return: List of permission keys for the API key
    """
    with get_db_session() as db_session:
        try:
            api_perms_stmt = select(UserPermModel.key).join(ApiKey).where(ApiKey.key == api_key)
            return db_session.scalars(api_perms_stmt).all()
        except Exception:
            log.exception(f"Failed to lookup permissions associated with API key ({api_key})")
    return []


def check_request_permissions(permissions_list: list[str], user_id: Optional[uuid4] = None,
                              api_key: Optional[uuid4] = None) -> bool:
    """
    Check if a set of permissions are satisfied by a user or API key.

    :param permissions_list: List of permissions required for an action
    :param user_id: ID of the user making the request
    :param api_key: API key associated with the request
    :return: If the required permissions were met
    """
    current_perms = []
    if user_id:
        current_perms = get_user_permissions(user_id)
    elif api_key:
        current_perms = get_api_permissions(api_key)
    return set(permissions_list).issubset(set(current_perms)) or "admin" in current_perms


def add_user_permissions(user_id: uuid4, permissions_list: list[str]) -> bool:
    """
    Add permissions to a user. If one fails, all fail.

    :param user_id: ID of the user permissions are added to
    :param permissions_list: List of permission keys to add
    :return: If the permissions were added to the user
    """
    if not get_user(user_id=user_id):
        return False
    with get_db_session() as db_session:
        try:
            for key in permissions_list:
                if not get_permission(key):
                    log.warn(f"Permission ({key}) does not exist, not adding to user ({user_id})")
                    continue
                new_user_perm = UserPermModel(
                    user_id=user_id,
                    key=key
                )
                log.info(f"Added permission ({key}) to user ({user_id})")
                db_session.add(new_user_perm)
            db_session.commit()
            return True
        except Exception:
            log.exception(f"Failed adding permissions to user ({user_id})")
            db_session.rollback()
    return False


def check_credentials(username: str, password: str) -> Optional[str]:
    """
    Validate login for a user.

    :param username: Username
    :param password: Password
    :return: User ID if successful
    """
    if not get_user(username=username):
        return None
    with get_db_session() as db_session:
        try:
            passhash_stmt = select(
                UserModel.id,
                UserModel.passhash
            ).where(
                UserModel.username == username
            )
            check_user = db_session.execute(passhash_stmt).first()
            if not check_user:
                return None
            try:
                ph.verify(check_user.passhash, password)
            except VerifyMismatchError:
                return None
            if ph.check_needs_rehash(check_user.passhash):
                check_user.passhash = ph.hash(password)
                db_session.commit()
            return str(check_user.id)
        except Exception:
            log.exception(f"Error while verifying credentials for user '{username}'")
            db_session.rollback()
    return None


ph = PasswordHasher(memory_cost=262144, hash_len=64, salt_len=32)
log = logging.getLogger(__name__)
