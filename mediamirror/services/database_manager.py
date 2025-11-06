from alembic.config import Config as AlembicConfig
from alembic.runtime.environment import EnvironmentContext
from alembic.script import ScriptDirectory as AlembicDirectory
from quart import (
    g,
    request
)
from logging import getLogger
import os
from sqlalchemy import (
    create_engine,
    Engine,
    URL
)
from sqlalchemy.ext.asyncio import (
    async_sessionmaker,
    AsyncEngine,
    AsyncSession,
    create_async_engine
)
from sqlalchemy.orm import sessionmaker
from typing import (
    Optional,
    Tuple
)


class DatabaseInitException(Exception):
    pass


class DatabaseConnectionException(Exception):
    pass


class DatabaseUpdateException(Exception):
    pass


async def run_updates(schema_dir: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Use Alembic to run schema revision updates using the configured
    schema directory and database engine.

    :return: Revision prior to update, revision after update
    """
    log.debug("Beginning database schema update")
    abs_schema_dir = os.path.abspath(schema_dir)
    if not os.path.isdir(abs_schema_dir):
        log.error("Could not find schema directory, skipping updates...")
        return None, None
    if not engine:
        raise DatabaseUpdateException("Database engine has not yet been configured, cannot proceed.")
    script_dir = AlembicDirectory(abs_schema_dir)
    try:
        async with engine.connect() as db_connection:
            def sync_update(sync_connection):
                def alembic_upgrade(rev, context):
                    return script_dir._upgrade_revs("head", rev)
                alembic_context = EnvironmentContext(AlembicConfig(), script_dir)
                alembic_context.configure(
                    connection=sync_connection,
                    target_metadata=None,
                    fn=alembic_upgrade
                )
                start_rev = alembic_context.get_context().get_current_revision()
                log.debug(f"Database schema rev {start_rev}")
                latest_rev = alembic_context.get_head_revision()
                log.debug(f"Latest schema rev {latest_rev}")
                if not start_rev:
                    log.info("Database is uninitialized, running updates...")
                elif not latest_rev:
                    log.warn(("Could not determine latest database revision from schema directory, ",
                              "attempting to run updates anyways..."))
                elif start_rev != latest_rev:
                    log.info(f"Updating schema from rev {start_rev} to rev {latest_rev}")
                else:
                    log.info("No updates for database schema")
                    return start_rev, start_rev
                with alembic_context.begin_transaction():
                    alembic_context.run_migrations()
                updated_rev = alembic_context.get_context().get_current_revision()
                if updated_rev:
                    log.info(f"Database migrations finished, schema updated to rev {updated_rev}")
                return start_rev, updated_rev
            return await db_connection.run_sync(
                lambda sync_conn: sync_update(sync_conn)
            )
    except Exception:
        log.exception("Failed to execute schema updates")


def create_sync_db_engine(db_config: dict) -> Engine:
    """
    Create a synchronous postgres database engine from provided configuration

    :return: Database engine
    :raises DatabaseInitException: Missing a required configuration variable for creating the database engine
    """
    for var in ["USERNAME", "PASSWORD", "NAME"]:
        if var not in db_config:
            raise DatabaseInitException(f"Missing required configuration variable '{var}'")
    db_url = URL.create("postgresql+psycopg2",
                        username=db_config["USERNAME"],
                        password=db_config["PASSWORD"],
                        host=db_config.get("HOST", "localhost"),
                        port=db_config.get("PORT", 5432),
                        database=db_config["NAME"]
                        )
    return create_engine(db_url)


def create_async_db_engine(db_config: dict) -> AsyncEngine:
    """
    Create an asychronous postgres database engine from provided configuration

    :return: Database engine
    :raises DatabaseInitException: Missing a required configuration variable for creating the database engine
    """
    for var in ["USERNAME", "PASSWORD", "NAME"]:
        if var not in db_config:
            raise DatabaseInitException(f"Missing required configuration variable '{var}'")
    db_url = URL.create("postgresql+asyncpg",
                        username=db_config["USERNAME"],
                        password=db_config["PASSWORD"],
                        host=db_config.get("HOST", "localhost"),
                        port=db_config.get("PORT", 5432),
                        database=db_config["NAME"]
                        )
    return create_async_engine(db_url)


def init_db(db_config: dict, is_async=True) -> AsyncEngine:
    """
    Create a user in the database.

    :param db_config: Dict of database configuration values
    :raises DatabaseConnectionException: Could not connect to the database with the provided configuration
    """
    if is_async:
        global engine
        engine = create_async_db_engine(db_config)
    else:
        engine = create_sync_db_engine(db_config)
    try:
        engine.connect()
    except Exception as e:
        raise DatabaseConnectionException("Could not connect to the database", e)
    if is_async:
        global async_session_factory
        async_session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    else:
        global sync_session_factory
        sync_session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    return engine


def get_db_session() -> AsyncSession:
    """
    Create or retrieve database session in context.

    :return: Database session
    """
    if request and hasattr(request, "method"):
        if not hasattr(g, "db_session"):
            g.db_session = async_session_factory()
        return g.db_session
    return async_session_factory()


async def close_db_session(db_session: Optional[AsyncSession] = None) -> None:
    """
    Close database session

    :param db_session: Session if it exists
    """
    if db_session:
        await db_session.close()
    elif request and hasattr(request, "method"):
        if hasattr(g, "db_session"):
            await g.db_session.close()


engine = None
sync_session_factory = None
async_session_factory = None
log = getLogger(__name__)
