from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from datetime import (
    datetime,
    timezone
)
from quart import (
    Quart,
    Request,
    Response
)
from quart.sessions import (
    SessionInterface,
    SessionMixin
)
from hashlib import sha3_256
from logging import getLogger
import re
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from user_agents import parse as parse_user_agent
from werkzeug.datastructures import CallbackDict
from typing import (
    Optional,
    Tuple
)
from uuid import (
    UUID,
    uuid4
)

from mediamirror.models.api import (
    ApiKey
)
from mediamirror.models.users import (
    PermissionModel,
    UserModel,
    UserPermModel,
    UserSessionModel
)
from mediamirror.services.database_manager import get_db_session


VALID_PERMISSION = r"^[a-z-]{,60}$"


class DuplicateUserException(Exception):
    pass


class DuplicatePermissionException(Exception):
    pass


class MissingUserException(Exception):
    pass


class MissingPermissionException(Exception):
    pass


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

    def __init__(self, cookie_name: str):
        global log
        log.debug("Started Session Interface")
        self.cookie_name = cookie_name

    async def open_session(self, app: Quart, request: Request) -> UserSession:
        """
        Open user session.

        :param app: Quart app
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
            async with get_db_session() as db_session:
                # Check if session is in database
                saved_session = await db_session.get(UserSessionModel, session_id)
                if saved_session:
                    # Invalidate session if expired or if session device doesn't match
                    if (
                        saved_session.expires_at and
                        saved_session.expires_at <= datetime.utcnow().replace(tzinfo=timezone.utc)
                    ) or saved_session.device_identifier != ua_string:
                        try:
                            log.debug(f"Session '{session_id}' was invalidated, deleting.")
                            db_session.delete(saved_session)
                            await db_session.commit()
                        except Exception:
                            log.exception(f"Failed to delete invalid session '{session_id}'.")
                    else:
                        try:
                            # Load session with saved data
                            return UserSession(session_id, ua_string, initial_data=saved_session.data)
                        except Exception:
                            log.exception(f"Failed to restore session '{session_id}'.")
        except Exception:
            log.exception(f"Could not retrieve session '{session_id}'.")
        # New session
        return UserSession(self.new_session_id(request), ua_string)

    async def save_session(self, app: Quart, session: SessionMixin, response: Response) -> None:
        """
        Save user session.

        :param app: Quart app
        :param session: User session
        :param response: Response returning the session
        :return: Formatted exception
        """
        session_id = session.sid
        try:
            async with get_db_session() as db_session:
                saved_session = await db_session.get(UserSessionModel, session_id)
                if not session:
                    if session.modified:
                        # Remove cookie for invalid session
                        self.remove_cookie(app, response)
                        if saved_session:
                            try:
                                # Delete session that's been removed
                                log.debug(f"Deleting saved session '{session_id}'.")
                                db_session.delete(saved_session)
                                await db_session.commit()
                            except Exception:
                                log.exception(f"Failed to delete removed session '{session_id}'.")
                    return
                if not self.should_set_cookie(app, session):
                    log.debug(f"Not setting cookie for session '{session_id}'.")
                    return
                updated_expiration = self.get_expiration_time(app, session)
                if saved_session:
                    try:
                        # Update saved session
                        saved_session.expires_at = updated_expiration
                        saved_session.data = dict(session)
                        await db_session.commit()
                    except Exception:
                        log.exception(f"Failed to update saved session '{session_id}'.")
                elif "user_id" in session:
                    try:
                        # Save new session if it belongs to a user
                        log.debug(f"Saving new session '{session_id}'.")
                        new_session = UserSessionModel(
                            id=session_id,
                            expires_at=updated_expiration,
                            device_identifier=session.did,
                            user_id=UUID(session["user_id"]),
                            data=dict(session)
                        )
                        db_session.add(new_session)
                        await db_session.commit()
                    except Exception:
                        log.exception(f"Failed to save new session '{session_id}'.")
                else:
                    # Cookie doesn't correspond to a saved session, remove it
                    self.remove_cookie(app, response)
                    return
        except Exception:
            log.exception(f"Failed to save session '{session_id}'.")
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

    def remove_cookie(self, app: Quart, response: Response) -> None:
        """
        Instruct sender to delete cookie in response.

        :param app: Quart app
        :param response: Response to delete the cookie in
        """
        response.delete_cookie(
            self.cookie_name,
            domain=self.get_cookie_domain(app),
            path=self.get_cookie_path(app)
        )

    def add_cookie(self, app: Quart, response: Response, session_id: str, expires: datetime) -> None:
        """
        Instruct sender to add cookie in response.

        :param app: Quart app
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


async def create_user(username: str, password: str) -> Optional[uuid4]:
    """
    Create a user in the database.

    :param username: Username
    :param password: Password
    :return: User UUID if creation was successful
    :raises DuplicateUserException: Username specified is already in use
    :raises Exception: Issue committing to database
    """
    if await get_user(username=username):
        raise DuplicateUserException(f"A user with the name '{username}' already exists.")
    passhash = ph.hash(password)
    new_user = UserModel(
        username=username,
        passhash=passhash
    )
    try:
        async with get_db_session() as db_session:
            db_session.add(new_user)
            await db_session.commit()
            log.info(f"Created new user '{username}' '{new_user.id}'.")
            return new_user.id
    except Exception as e:
        log.exception(f"Failed to create new user '{username}'.")
        await db_session.rollback()
        raise e
    return None


async def delete_user(user_id: uuid4) -> bool:
    """
    Delete a user from the database.

    :param user_id: ID of the user to delete
    :return: If deletion was successful
    :raises MissingUserException: A user with the specified ID could not be found
    :raises Exception: Issue committing to database
    """
    if not await get_user(user_id=user_id):
        raise MissingUserException(f"No user found with the ID '{user_id}'.")
    try:
        async with get_db_session() as db_session:
            user = await db_session.get(UserModel, user_id)
            deleted_username = user.username
            await db_session.delete(user)
            await db_session.commit()
            log.info(f"Deleted user '{deleted_username}' '{user_id}'.")
            return True
    except Exception as e:
        log.exception(f"Failed to delete user '{user_id}'.")
        await db_session.rollback()
        raise e
    return False


async def get_user(user_id: Optional[uuid4] = None, username: Optional[str] = None) -> Optional[UserModel]:
    """
    Retrieve a user.

    :param user_id: ID of the user
    :param username: Username of the user
    :return: User if they exist
    :raises TypeError: No value specified for user_id or username
    :raises Exception: Issue querying database
    """
    existing_user_stmt = select(UserModel)
    if user_id:
        existing_user_stmt = existing_user_stmt.where(UserModel.id == user_id)
    elif username:
        existing_user_stmt = existing_user_stmt.where(UserModel.username == username)
    else:
        raise TypeError("Missing a necessary parameter ('user_id', 'username').")
    try:
        async with get_db_session() as db_session:
            existing_user = (await db_session.execute(existing_user_stmt)).first()
            return existing_user
    except Exception as e:
        param = f"user_id '{user_id}'" if user_id else f"username '{username}'"
        log.exception(f"Failed to lookup user by {param}")
        raise e
    return None


async def get_users(page_size: Optional[int] = None, page: Optional[int] = 1,
                    username_filter: Optional[str] = None) -> Tuple[list[UserModel], bool]:
    """
    Retrieve a list of users.

    :param page_size: Pagination page size
    :param page: Pagination starting index
    :param username_filter: Partial match text for usernames
    :return: List of users that match conditions, whether or not pagination continues with these conditions
    :raises Exception: Issue querying database
    """
    user_list_stmt = select(UserModel.id, UserModel.username, UserModel.last_seen).order_by(UserModel.created)
    if username_filter:
        user_list_stmt = user_list_stmt.where(UserModel.username.ilike(f"%{username_filter}%"))
    if page_size:
        user_list_stmt = user_list_stmt.limit(page_size + 1).offset(page_size * (page - 1))
    try:
        async with get_db_session() as db_session:
            results = (await db_session.execute(user_list_stmt)).all()
            has_next_page = len(results) > page_size if page_size else False
            return results[:page_size], has_next_page
    except Exception as e:
        log.exception("Failed to retrieve users list.")
        raise e
    return [], False


async def seen_user(user_id: uuid4) -> None:
    """
    Update "last seen" date for a user

    :param user_id: ID of the user
    :raises Exception: Issue committing to database
    """
    async with get_db_session() as db_session:
        try:
            user = await db_session.get(UserModel, user_id)
            user.last_seen = datetime.utcnow()
            await db_session.commit()
        except Exception as e:
            log.exception(f"Failed to update last seen time for user '{user_id}'.")
            raise e


async def create_api_key(user_id: uuid4, expires_at: Optional[datetime] = None) -> Optional[uuid4]:
    """
    Create an API key for a user.

    :param user_id: ID of the user the API key is for
    :param expires_at: When the API key should expire
    :return: API key if successful
    :raises Exception: Issue committing to database
    """
    new_key = ApiKey(
        user_id=user_id,
        expires_at=expires_at
    )
    try:
        async with get_db_session() as db_session:
            db_session.add(new_key)
            await db_session.commit()
            log.info(f"Created API key '{new_key.id}' for user '{user_id}'.")
            return new_key.id
    except Exception as e:
        log.exception(f"Failed to create new API key for user '{user_id}'.")
        await db_session.rollback()
        raise e
    return None


async def delete_api_key(api_key: uuid4) -> bool:
    """
    Delete an API key.

    :param api_key: API key to delete
    :return: If deletion was successful
    :raises Exception: Issue committing to database
    """
    try:
        async with get_db_session() as db_session:
            existing_key = await db_session.get(ApiKey, api_key)
            db_session.delete(existing_key)
            await db_session.commit()
            log.info(f"Deleted API key '{api_key}'.")
            return True
    except Exception as e:
        log.exception(f"Failed to delete API key '{api_key}'.")
        await db_session.rollback()
        raise e
    return False


async def check_api_key_valid(api_key: uuid4) -> bool:
    """
    Verify status of API key.

    :param api_key: API key to check
    :return: If API key is valid
    :raises Exception: Issue querying database
    """
    try:
        async with get_db_session() as db_session:
            existing_key = await db_session.get(ApiKey, api_key)
            if existing_key:
                if (
                    existing_key.expires_at and
                    existing_key.expires_at <= datetime.utcnow()
                ):
                    log.debug(f"API key '{api_key}' has expired.")
                    await delete_api_key(api_key)
                    return False
                return True
    except Exception as e:
        log.exception(f"Failed to lookup API key '{api_key}'.")
        raise e
    return False


async def create_permission(key: str, description: str) -> bool:
    """
    Create a permission.

    :param key: Permission key
    :param description: Description of what the permission is used for
    :return: If the permission was created
    :raises TypeError: Key does not match valid permission pattern
    :raises ValueError: Permission with key already exists
    :raises Exception: Issue committing to database
    """
    if not re.match(VALID_PERMISSION, key):
        raise TypeError(f"Permission key '{key}' is not of a valid format.")
    if await get_permission(key):
        raise ValueError(f"Permission key '{key}' already exists.")
    try:
        async with get_db_session() as db_session:
            new_permission = PermissionModel(
                key=key,
                description=description
            )
            db_session.add(new_permission)
            await db_session.commit()
            log.info(f"Created new permission '{key}'.")
            return True
    except Exception as e:
        log.exception(f"Failed to add permission '{key}'.")
        raise e
    return False


async def get_permission(key: str) -> Optional[PermissionModel]:
    """
    Retrieve a permission.

    :param key: Permission key
    :return: Permission if it exists
    :raises Exception: Issue querying database
    """
    try:
        async with get_db_session() as db_session:
            return await db_session.get(PermissionModel, key)
    except Exception as e:
        log.exception(f"Failed to lookup permission '{key}'.")
        raise e
    return None


async def get_permissions() -> list[PermissionModel]:
    """
    Retrieve all permissions in the database.

    :return: All permissions with keys and descriptions
    :raises Exception: Issue querying database
    """
    permissions = select(PermissionModel)
    try:
        async with get_db_session() as db_session:
            return (await db_session.scalars(permissions)).all()
    except Exception as e:
        log.exception("Failed to lookup all permissions.")
        raise e
    return []


async def get_user_permissions(user_id: uuid4) -> Optional[list[str]]:
    """
    Retrieve list of permissions for a user.

    :param user_id: ID of user
    :return: List of permission keys for the user
    :raises MissingUserException: A user with the specified ID could not be found
    :raises Exception: Issue querying database
    """
    if not await get_user(user_id=user_id):
        raise MissingUserException(f"No user found with the ID '{user_id}'.")
    user_perms_stmt = select(UserPermModel.key).where(UserPermModel.user_id == user_id)
    try:
        async with get_db_session() as db_session:
            return (await db_session.scalars(user_perms_stmt)).all()
    except Exception as e:
        log.exception(f"Failed to lookup user permissions for user '{user_id}'.")
        raise e
    return []


async def get_api_permissions(api_key: uuid4) -> list[str]:
    """
    Retrieve list of permissions for user API key was created for.

    :param api_key: API key
    :return: List of permission keys for the API key
    :raises Exception: Issue querying database
    """
    api_perms_stmt = select(UserPermModel.key).join(ApiKey).where(ApiKey.key == api_key)
    try:
        async with get_db_session() as db_session:
            return (await db_session.scalars(api_perms_stmt)).all()
    except Exception as e:
        log.exception(f"Failed to lookup permissions associated with API key '{api_key}'.")
        raise e
    return []


async def check_request_permissions(permissions_list: list[str], user_id: Optional[uuid4] = None,
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
        current_perms = await get_user_permissions(user_id)
    elif api_key:
        current_perms = await get_api_permissions(api_key)
    return current_perms and (set(permissions_list).issubset(set(current_perms)) or "admin" in current_perms)


async def add_user_permissions(user_id: uuid4, permissions_list: list[str]) -> bool:
    """
    Add permissions to a user. All or nothing, ignores invalid keys.

    :param user_id: ID of the user permissions are added to
    :param permissions_list: List of permission keys to add
    :return: If the permissions were added to the user
    :raises MissingUserException: A user with the specified ID could not be found
    :raises DuplicatePermissionException: The user already has the permission specified
    :raises Exception: Issue committing to database
    """
    if not await get_user(user_id=user_id):
        raise MissingUserException(f"No user found with the ID '{user_id}'.")
    try:
        async with get_db_session() as db_session:
            for key in permissions_list:
                if not await get_permission(key):
                    raise MissingPermissionException(
                        f"Permission '{key}' does not exist, can't add to user '{user_id}'.")
                new_user_perm = UserPermModel(
                    user_id=user_id,
                    key=key
                )
                db_session.add(new_user_perm)
                log.info(f"Added permission '{key}' to user '{user_id}'.")
            await db_session.commit()
            return True
    except IntegrityError:
        raise DuplicatePermissionException(f"User already has permission '{key}'.")
    except Exception as e:
        log.exception(f"Failed adding permissions to user '{user_id}'.")
        await db_session.rollback()
        raise e
    return False


async def delete_user_permissions(user_id: uuid4, permissions_list: list[str]) -> bool:
    """
    Removes permissions from a user. All or nothing, ignores invalid keys.

    :param user_id: ID of the user permissions are being removed from
    :param permissions_list: List of permission keys to remove
    :return: If the permissions were removed from the user
    :raises MissingUserException: A user with the specified ID could not be found
    :raises Exception: Issue committing to database
    """
    if not await get_user(user_id=user_id):
        raise MissingUserException(f"No user found with the ID '{user_id}'.")
    try:
        async with get_db_session() as db_session:
            for key in permissions_list:
                if not await get_permission(key):
                    raise MissingPermissionException(
                        f"Permission '{key}' does not exist, can't remove from user '{user_id}'.")
                    continue
                user_perm = await db_session.get(UserPermModel, (user_id, key))
                if not user_perm:
                    raise MissingPermissionException(
                        f"Permission '{key}' does not exist on user '{user_id}', cannot remove.")
                db_session.delete(user_perm)
                log.info(f"Removed permission '{key}' from user '{user_id}'.")
            await db_session.commit()
            return True
    except Exception as e:
        log.exception(f"Failed removing permissions from user '{user_id}'.")
        await db_session.rollback()
        raise e
    return False


async def check_credentials(username: str, password: str) -> Optional[str]:
    """
    Validate login for a user.

    :param username: Username
    :param password: Password
    :return: User ID if successful
    :raises MissingUserException: A user with the specified ID could not be found
    :raises VerifyMismatchError: The password provided did not match the stored hash
    :raises Exception: Issue committing to database
    """
    if not await get_user(username=username):
        raise MissingUserException(f"No user found with the username '{username}'.")
    passhash_stmt = select(
        UserModel.id,
        UserModel.passhash
    ).where(
        UserModel.username == username
    )
    try:
        async with get_db_session() as db_session:
            check_user = (await db_session.execute(passhash_stmt)).first()
            if not check_user:
                raise MissingUserException(
                    f"User with the username '{username}' was supposed to exist, but could not be found.")
            try:
                ph.verify(check_user.passhash, password)
            except VerifyMismatchError as e:
                log.exception(f"Password validation for user '{check_user.id}' failed.")
                raise e
            if ph.check_needs_rehash(check_user.passhash):
                log.debug(f"Updating password hash for user '{check_user.id}'.")
                check_user.passhash = ph.hash(password)
                await db_session.commit()
            return check_user.id
    except Exception as e:
        log.exception(f"Error while verifying credentials for user '{username}'.")
        await db_session.rollback()
        raise e
    return None


ph = PasswordHasher(memory_cost=262144, hash_len=64, salt_len=32)
log = getLogger(__name__)
