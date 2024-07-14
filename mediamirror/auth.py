from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from datetime import datetime
from flask.sessions import SessionInterface, SessionMixin
from hashlib import sha3_256
import logging
import os
import re
from sqlalchemy import func, select
from user_agents import parse as parse_user_agent
from werkzeug.datastructures import CallbackDict

from database_manager import get_db_session
from database_model import (
    PermissionModel,
    UserModel,
    UserPermModel,
    UserSessionModel
)
import logs as logs


VALID_PERMISSION = r"^[a-z-]{,60}$"


class UserSession(CallbackDict, SessionMixin):

    def __init__(self, session_id, device_identifier, initial_data=None):
        def on_update(user_session):
            user_session.modified = True

        super().__init__(initial_data, on_update)
        self.sid = session_id
        self.did = device_identifier
        self.modified = False
        self.permanent = True
        self.new = True


class UserSessionInterface(SessionInterface):
    cookie_name = None

    def __init__(self, cookie_name):
        global log
        self.cookie_name = cookie_name
        log = logging.getLogger(__name__)
        log.setLevel(logging.DEBUG)
        log = logs.app_log_manager.configure_logging(
            logging.getLogger(__name__), True, True, console_level=logging.DEBUG)
        return

    def open_session(self, app, request):
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
                            log.debug(f"Session {session_id} was invalidated, deleting")
                            db_session.delete(saved_session)
                            db_session.commit()
                        except Exception:
                            log.exception(f"Failed to delete invalid session {session_id}")
                    else:
                        try:
                            # Load session with saved data
                            return UserSession(session_id, ua_string, initial_data=saved_session.data)
                        except Exception:
                            log.exception(f"Failed to restore session {session_id}")
        except Exception:
            log.exception(f"Could not retrieve session {session_id}")
        # New session
        return UserSession(self.new_session_id(request), ua_string)

    def save_session(self, app, session, response):
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
                                log.debug(f"Deleting saved session {session_id}")
                                db_session.delete(saved_session)
                                db_session.commit()
                            except Exception:
                                log.exception(f"Failed to delete removed session {session_id}")
                    return
                if not self.should_set_cookie(app, session):
                    log.debug(f"Not setting cookie for session {session_id}")
                    return
                updated_expiration = self.get_expiration_time(app, session)
                if saved_session:
                    try:
                        # Update saved session
                        saved_session.expires_at = updated_expiration
                        saved_session.data = dict(session)
                        db_session.commit()
                    except Exception:
                        log.exception(f"Failed to update saved session {session_id}")
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
                        log.exception(f"Failed to save new session {session_id}")
                else:
                    # Cookie doesn't correspond to a saved session, remove it
                    self.remove_cookie(app, response)
                    return
        except Exception:
            log.exception(f"Failed to save session {session_id}")
        # Set session cookie
        self.add_cookie(app, response, session_id, updated_expiration)

    def new_session_id(self, request):
        h = sha3_256()
        h.update(
            f"{request.remote_addr}|{request.headers.get('User-Agent')}|{datetime.utcnow().timestamp()}".encode("utf-8")
        )
        return h.hexdigest()

    def get_device_identifier(self, request):
        ua = parse_user_agent(request.headers.get("User-Agent"))
        device_browser = ua.browser.family
        device_os = f"{ua.os.family} ({ua.os.version_string})"
        device = f"{ua.device.family} ({ua.device.brand} {ua.device.model})"
        return f"{device_browser}|{device_os}|{device}"

    def remove_cookie(self, app, response):
        response.delete_cookie(
            self.cookie_name,
            domain=self.get_cookie_domain(app),
            path=self.get_cookie_path(app)
        )

    def add_cookie(self, app, response, session_id, expires):
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


def check_user_exists(user_id=None, username=None):
    user_exists = False
    with get_db_session() as db_session:
        if user_id:
            try:
                existing_user = db_session.get(UserModel, user_id)
                if existing_user:
                    user_exists = True
            except Exception:
                log.exception(f"Failed to lookup user by user id '{user_id}'")
        elif username:
            try:
                existing_user_stmt = select(
                    UserModel
                ).where(
                    UserModel.username == username
                )
                existing_user = db_session.execute(existing_user_stmt).first()
                if existing_user:
                    user_exists = True
            except Exception:
                log.exception(f"Failed to lookup user by username '{username}'")
    return user_exists


def create_user(username, password):
    if check_user_exists(username=username):
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
            log.exception(f"Failed to add new user '{username}'")
            db_session.rollback()
    return False


def delete_user(user_id):
    if not check_user_exists(user_id=user_id):
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


def check_permission_exists(application, key):
    with get_db_session() as db_session:
        try:
            return db_session.get(PermissionModel, (application, key))
        except Exception:
            log.exception(f"Could not complete lookup for permission '{application}.{key}'")
    return False


def create_permission(application, key, description):
    if not re.match(VALID_PERMISSION, key):
        log.error(f"Permission not added, key '{key}' is not valid")
        return False
    if check_permission_exists(application, key):
        return False
    try:
        with get_db_session() as db_session:
            new_permission = PermissionModel(
                application=application,
                key=key,
                description=description
            )
            db_session.add(new_permission)
            db_session.commit()
            log.info(f"Created new permission '{application}.{key}'")
            return True
    except Exception:
        log.exception(f"Failed to add permission '{application}.{key}'")
    return False


def get_user_permissions(user_id):
    with get_db_session() as db_session:
        try:
            user_perms_stmt = select(
                UserPermModel.application + "." + UserPermModel.key
            ).where(
                UserPermModel.user_id == user_id
            )
            return db_session.scalars(user_perms_stmt).all()
        except Exception:
            log.exception(f"Failed to lookup user permissions for user ({user_id})")
    return []


def add_user_permissions(user_id, application, permissions_list):
    if not check_user_exists(user_id=user_id):
        return False
    with get_db_session() as db_session:
        try:
            for key in permissions_list:
                if not check_permission_exists(application, key):
                    log.warn(f"Permission '{application}.{key}' does not exist, not adding to user ({user_id})")
                    continue
                new_user_perm = UserPermModel(
                    user_id=user_id,
                    application=application,
                    key=key
                )
                log.info(f"Added permission '{application}.{key}' to user ({user_id})")
                db_session.add(new_user_perm)
            db_session.commit()
            return True
        except Exception:
            log.exception(f"Failed adding permissions to user ({user_id})")
            db_session.rollback()
    return False


def check_credentials(username, password):
    if not check_user_exists(username=username):
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
log = None
