import aiohttp
from http.cookiejar import (
    Cookie,
    CookieJar,
    LoadError,
    MozillaCookieJar
)
from io import (
    BytesIO,
    StringIO
)
import json
from logging import getLogger
import os
from sqlalchemy import select
from typing import (
    Optional,
    Tuple
)
from uuid import (
    uuid4
)

from mediamirror.models.accounts import RemoteAccountModel
from mediamirror.services.database_manager import (
    get_db_session,
    paged_results
)


class DuplicateAccountException(Exception):
    pass


class IconFetchError(Exception):
    pass


class InvalidCookiesFormatException(Exception):
    pass


class MissingAccountException(Exception):
    pass


def get_cookiejar_from_txt(file_path: Optional[str] = None, file_handler: Optional[StringIO] = None) -> CookieJar:
    """
    Load CookieJar from a Netscape-format text file.

    :param file_path: Path to the cookie text file
    :param file_handler: Open file handler for the cookie text file
    :return: CookieJar with loaded cookies
    :raises FileNotFoundError: The specified path is not a file
    :raises InvalidCookiesFormatException: Cookies could not be loaded from the file
    """
    if file_path:
        file_path = os.path.abspath(file_path)
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"Cookie file '{file_path}' does not exist.")
        cookie_jar = MozillaCookieJar()
        try:
            cookie_jar.load(file_path, ignore_discard=True, ignore_expires=True)
        except LoadError as e:
            raise InvalidCookiesFormatException(
                f"Failed to load cookies from the provided file '{os.path.basename(file_path)}'.", e)
        except Exception:
            exception_message = "An unknown error occurred loading cookies from the provided file " + \
                f"'{os.path.basename(file_path)}'."
            log.exception(exception_message)
            raise InvalidCookiesFormatException(exception_message)
    elif file_handler:
        file_handler
        cookie_jar = MozillaCookieJar()
        try:
            cookie_jar._really_load(file_handler, file_handler.name, ignore_discard=True, ignore_expires=True)
        except LoadError as e:
            raise InvalidCookiesFormatException(
                f"Failed to load cookies from the provided file '{file_handler.name}'.", e)
        except Exception:
            exception_message = "An unknown error occurred loading cookies from the provided file " + \
                f"'{file_handler.name}'."
            log.exception(exception_message)
            raise InvalidCookiesFormatException(exception_message)
    else:
        raise ValueError("No value specified for 'file_path' or 'file_handler'.")
    return cookie_jar


def write_cookiejar_to_txt(cookie_jar: MozillaCookieJar, file_path: str) -> bool:
    """
    Write CookieJar to a Netscape-format text file.

    :param cookie_jar: CookieJar to write to file
    :param file_path: Path to the cookie text file
    :return: Whether or not the cookies were successfully written
    """
    file_path = os.path.abspath(file_path)
    if os.path.isfile(file_path):
        log.error(f"Cannot write cookies, a file already exists at the path '{file_path}'.")
        return False
    try:
        cookie_jar.save(file_path, ignore_discard=True, ignore_expires=True)
    except Exception:
        log.exception(f"Failed to write cookies to file '{file_path}'.")
        return False
    return True


async def fetch_favicon(domain: str) -> bytes:
    """
    Fetch favicon for domain.

    :param domain: Domain to fetch icon for
    :return: Icon byte data
    :raises IconFetchError: Any issue with retrieving the icon
    """
    favicon_url = f"https://{domain.split('/', 1)[0]}/favicon.ico"
    log.debug(f"Fetching favicon from '{favicon_url}'")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(favicon_url, timeout=10) as resp:
                if resp.status != 200:
                    raise IconFetchError(f"No favicon found for '{domain}'.")
                return await resp.content.read()
    except Exception as e:
        error_message = f"Failed to fetch favicon for '{domain}'."
        log.exception(error_message)
        raise IconFetchError(error_message, e)


def get_cookiejar_for_account(account: RemoteAccountModel) -> CookieJar:
    """
    Build CookieJar from account's stored cookies.

    :param account: RemoteAccountModel to use cookies from
    :return: CookieJar with the account's cookies
    :raises InvalidCookiesFormatException: Cookies could not be loaded from the database
    """
    cookie_jar = MozillaCookieJar()
    try:
        cookies_list = json.loads(account.cookies)
        for cookie_dict in cookies_list:
            new_cookie = Cookie()
            new_cookie.__dict__ = cookie_dict
            cookie_jar.set_cookie(new_cookie)
    except Exception as e:
        raise InvalidCookiesFormatException(
            f"Failed to load cookies for account '{account.name}' from the database.", e)
    return cookie_jar


async def save_account(domain: str, name: str, notes: str,
                       cookie_jar: CookieJar, icon: Optional[BytesIO] = None) -> Optional[uuid4]:
    """
    Save a new account with cookies to the database.

    :param name: Name for the account
    :param domain: Primary domain associated with the account
    :param notes: User notes for the account
    :param cookie_jar: CookieJar storing the relevant HTTP cookies
    :param icon: Optional icon image for the account
    :return: Whether or not the account was successfully saved
    :raises DuplicateAccountException: An account with the provided name already exists
    """
    if await get_account(domain, name):
        raise DuplicateAccountException(f"An account with the name '{name}' already exists for domain '{domain}'.")
    cookie_list = []
    for cookie in cookie_jar:
        cookie_list.append(vars(cookie))
    async with get_db_session() as db_session:
        try:
            new_account = RemoteAccountModel(
                name=name,
                domain=domain,
                notes=notes,
                icon=icon,
                cookies=cookie_list
            )
            db_session.add(new_account)
            await db_session.commit()
            log.info(f"Created new remote account '{name}' for domain '{domain}'.")
            return new_account.name
        except Exception as e:
            log.exception(f"Failed to create new remote account '{name}' for domain '{domain}'.")
            await db_session.rollback()
            raise e
    return None


async def get_account(domain: str, name: str) -> Optional[RemoteAccountModel]:
    """
    Retrieve an account from the database.

    :param domain: Domain of the account to retrieve
    :param name: Name of the account to retrieve
    :return: RemoteAccountModel if it exists
    :raises Exception: Issue querying database
    """
    async with get_db_session() as db_session:
        try:
            return await db_session.get(RemoteAccountModel, (domain, name))
        except Exception as e:
            log.exception("Failed to retrieve account from database.")
            raise e
    return None


async def delete_account(domain: str, name: str) -> bool:
    """
    Delete a remote account from the database.

    :param domain: Domain of the account to delete
    :param name: Name of the account to delete
    :return: If deletion was successful
    :raises MissingAccountException: An account with the specified ID could not be found
    :raises Exception: Issue committing to database
    """
    account = await get_account(domain, name)
    if not account:
        raise MissingAccountException(f"No account found with the name '{name}' for domain '{domain}'.")
    async with get_db_session() as db_session:
        try:
            await db_session.delete(account)
            await db_session.commit()
            log.info(f"Deleted remote account '{name}' for domain '{domain}'.")
            return True
        except Exception as e:
            log.exception(f"Failed to delete remote account '{name}' for domain '{domain}'.")
            await db_session.rollback()
            raise e
    return False


async def get_accounts(page_size: Optional[int] = None, page: Optional[int] = 1,
                       domain_filter: Optional[str] = None,
                       name_filter: Optional[str] = None) -> Tuple[list[RemoteAccountModel], bool]:
    """
    Retrieve a list of accounts.

    :param page_size: Pagination page size
    :param page: Pagination starting index
    :param domain_filter: Exact match text for domain
    :param name_filter: Partial match text for account names
    :return: List of accounts that match conditions, whether or not pagination continues with these conditions
    :raises Exception: Issue querying database
    """
    account_list_stmt = select(
        RemoteAccountModel.name, RemoteAccountModel.domain,
        RemoteAccountModel.icon, RemoteAccountModel.notes
    ).order_by(RemoteAccountModel.domain, RemoteAccountModel.name)
    if domain_filter:
        account_list_stmt = account_list_stmt.where(RemoteAccountModel.domain == domain_filter)
    if name_filter:
        account_list_stmt = account_list_stmt.where(RemoteAccountModel.name.ilike(f"%{name_filter}%"))
    try:
        return await paged_results(account_list_stmt, page_size, page)
    except Exception as e:
        log.exception("Failed to retrieve accounts list.")
        raise e
    return [], False

log = getLogger(__name__)
