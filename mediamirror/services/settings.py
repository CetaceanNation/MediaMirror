from functools import wraps
from logging import getLogger
from sqlalchemy import select

from mediamirror.models.settings import Setting
from mediamirror.services.database_manager import get_db_session


COMPONENT_HANDLERS = {}


class SettingAlreadyExistsException(Exception):
    def __init__(self, component: str, key: str):
        super().__init__(f"Setting {component}.{key} already exists")


class SettingNotFoundException(Exception):
    def __init__(self, component: str, key: str):
        super().__init__(f"Setting {component}.{key} not found")


def run_component_handler(f):
    @wraps(f)
    async def wrap(component: str, key: str, value: str = None, *args, **kwargs):
        result = await f(component, key, value, *args, **kwargs)
        if component in COMPONENT_HANDLERS:
            try:
                await COMPONENT_HANDLERS[component](key, value)
            except Exception as e:
                log.exception(f"Error running component handler for {component} after {f.__name__}: {e}")
                raise e
        return result
    return wrap


async def register_component_handler(component: str, handler):
    """
    Register a handler for a specific component.

    :param component: The component name
    :param handler: The handler function
    """
    COMPONENT_HANDLERS[component] = handler


@run_component_handler
async def create_setting(component: str, key: str, value: str,
                         description: str = None, default_value: str = None) -> None:
    """
    Create a new setting in the database.

    :param component: The component name
    :param key: The setting key
    :param value: The setting value
    :param description: Optional description of the setting
    :param default_value: Optional default value of the setting
    :return: None
    :raises SettingAlreadyExistsException: If the setting already exists
    :raises Exception: If the setting already exists or if there is an error during creation
    """
    async with get_db_session() as db_session:
        try:
            await get_setting(component, key)
        except SettingNotFoundException:
            pass
        else:
            raise SettingAlreadyExistsException(component, key)
        try:
            new_setting = Setting(
                component=component,
                key=key,
                value=value,
                description=description,
                default_value=default_value if default_value is not None else value
            )
            db_session.add(new_setting)
            await db_session.commit()
        except Exception as e:
            log.exception(f"Error creating setting {component}.{key}: {e}")
            raise Exception(f"Error creating setting {component}.{key}")
    log.info(f"Created new setting {component}.{key} with value: {value}")


async def get_setting(component: str, key: str) -> Setting:
    """
    Retrieve a setting value from the database.

    :param component: The component name
    :param key: The setting key
    :return: The setting value or None if not found
    :raises SettingNotFoundException: If the setting does not exist
    :raises Exception: If there is an error during retrieval
    """
    async with get_db_session() as db_session:
        try:
            result = await db_session.execute(
                select(Setting).where(
                    Setting.component == component,
                    Setting.key == key
                )
            )
            setting = result.scalar_one_or_none()
        except Exception as e:
            log.exception(f"Error retrieving setting {component}.{key}: {e}")
            raise Exception(f"Error retrieving setting {component}.{key}")
        if setting is None:
            raise SettingNotFoundException(component, key)
    return setting


async def get_all_settings(component: str = None) -> list[Setting]:
    """
    Retrieve all settings from the database.

    :param component: Optional component name to filter settings
    :return: List of all settings
    :raises Exception: If there is an error during retrieval
    """
    async with get_db_session() as db_session:
        try:
            select_stmt = select(Setting)
            if component:
                select_stmt = select_stmt.where(Setting.component == component)
            result = await db_session.execute(select_stmt)
            settings = result.scalars().all()
        except Exception as e:
            log.exception(f"Error retrieving settings: {e}")
            raise Exception("Error retrieving settings")
    return settings


@run_component_handler
async def update_setting(component: str, key: str, value: str,
                         description: str = None, default_value: str = None) -> None:
    """
    Update a setting value in the database.

    :param component: The component name
    :param key: The setting key
    :param value: The new setting value
    :param description: Optional new description of the setting
    :param default_value: Optional new default value of the setting
    :raises SettingNotFoundException: If the setting does not exist
    :raises Exception: If there is an error during the update
    """
    async with get_db_session() as db_session:
        try:
            setting = await db_session.execute(
                select(Setting).where(
                    Setting.component == component,
                    Setting.key == key
                )
            )
            setting = setting.scalar_one_or_none()
            if setting is None:
                raise SettingNotFoundException(component, key)
            setting.value = value
            if description is not None:
                setting.description = description
            if default_value is not None:
                setting.default_value = default_value
            await db_session.commit()
        except Exception as e:
            log.exception(f"Error updating setting {component}.{key}: {e}")
            raise Exception(f"Error updating setting {component}.{key}")
    log.info(f"Updated setting {component}.{key} with value: {value}")


@run_component_handler
async def reset_setting(component: str, key: str) -> None:
    """
    Reset a setting to its default value in the database.

    :param component: The component name
    :param key: The setting key
    :raises SettingNotFoundException: If the setting does not exist
    :raises Exception: If there is an error during the reset
    """
    async with get_db_session() as db_session:
        try:
            setting = await db_session.execute(
                select(Setting).where(
                    Setting.component == component,
                    Setting.key == key
                )
            )
            setting = setting.scalar_one_or_none()
            if setting is None:
                raise SettingNotFoundException(component, key)
            setting.value = setting.default_value
            await db_session.commit()
        except Exception as e:
            log.exception(f"Error resetting setting {component}.{key}: {e}")
            raise Exception(f"Error resetting setting {component}.{key}")
    log.info(f"Reset setting {component}.{key} to default value: {setting.default_value}")


@run_component_handler
async def delete_setting(component: str, key: str) -> None:
    """
    Delete a setting from the database.

    :param component: The component name
    :param key: The setting key
    :raises SettingNotFoundException: If the setting does not exist
    :raises Exception: If there is an error during deletion
    """
    async with get_db_session() as db_session:
        try:
            setting = await db_session.execute(
                select(Setting).where(
                    Setting.component == component,
                    Setting.key == key
                )
            )
            setting = setting.scalar_one_or_none()
            if setting is None:
                raise SettingNotFoundException(component, key)
            await db_session.delete(setting)
            await db_session.commit()
        except Exception as e:
            log.exception(f"Error deleting setting {component}.{key}: {e}")
            raise Exception(f"Error deleting setting {component}.{key}")
    log.info(f"Deleted setting {component}.{key}, value was: {setting.value}")

log = getLogger(__name__)
