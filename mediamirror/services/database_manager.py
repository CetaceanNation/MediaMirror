from alembic.config import Config as AlembicConfig
from alembic.runtime.environment import EnvironmentContext
from alembic.script import ScriptDirectory as AlembicDirectory
from flask import (
    g,
    request
)
import logging
import os
from sqlalchemy import (
    create_engine,
    Engine,
    inspect,
    Inspector,
    URL
)
from sqlalchemy.orm import (
    Session,
    sessionmaker
)
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


def run_updates() -> Tuple[Optional[str], Optional[str]]:
    """
    Use Alembic to run schema revision updates using the configured
    schema directory and database engine.

    :return: Revision prior to update, revision after update
    """
    log.debug("Beginning database schema update")
    abs_schema_dir = os.path.abspath(config.get("SCHEMA_DIR", "schema_revisions"))
    if not os.path.isdir(abs_schema_dir):
        log.error("Could not find schema directory, skipping updates...")
        return None, None
    if not engine:
        raise DatabaseUpdateException("Database engine has not yet been configured, cannot proceed.")
    script_dir = AlembicDirectory(abs_schema_dir)
    try:
        with engine.connect() as db_connection:
            def alembic_upgrade(rev, context):
                return script_dir._upgrade_revs("head", rev)
            alembic_context = EnvironmentContext(AlembicConfig(), script_dir)
            alembic_context.configure(
                connection=db_connection,
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
    except Exception:
        log.exception("Failed to execute schema updates")
    return start_rev, updated_rev


def create_db_engine() -> Engine:
    """
    Create a postgres database engine from existing configuration

    :return: Database engine
    :raises DatabaseInitException: Missing a required configuration variable for creating the database engine
    :raises DatabaseConnectionException: Could not connect to the database with the provided configuration
    """
    for var in ["USERNAME", "PASSWORD", "NAME"]:
        if var not in config:
            raise DatabaseInitException(f"Missing required configuration variable '{var}'")
    for var in ["HOST", "PORT"]:
        if var not in config:
            log.warn(f"Configuration is missing variable '{var}', will use default value")
    db_url = URL.create("postgresql+psycopg2",
                        username=config["USERNAME"],
                        password=config["PASSWORD"],
                        host=config.get("HOST", "localhost"),
                        port=config.get("PORT", 5432),
                        database=config["NAME"]
                        )
    log.debug(f"Creating db engine for '{config['NAME']}'")
    return create_engine(db_url)


def init_db(db_config: dict) -> None:
    """
    Create a user in the database.

    :param db_config: Dict of database configuration values
    """
    global engine
    config.update(db_config)
    engine = create_db_engine()
    try:
        engine.connect()
    except Exception as e:
        raise DatabaseConnectionException("Could not connect to the database", e)


def get_db_inspector() -> Inspector:
    """
    Create or delete database inspector in context.

    :return: Database inspector
    """
    inspector = inspect(engine)
    if request and hasattr(request, "method"):
        if not hasattr(g, "db_inspector"):
            g.db_inspector = inspector
        return g.db_inspector
    return inspector


def get_db_session() -> Session:
    """
    Create or retrieve database session in context.

    :return: Database session
    """
    db_session = sessionmaker(bind=engine)
    if request and hasattr(request, "method"):
        if not hasattr(g, "db_session"):
            g.db_session = db_session()
        return g.db_session
    return db_session()


def close_db_session(db_session: Optional[Session] = None) -> None:
    """
    Close database session

    :param db_session: Session if it exists
    """
    if db_session:
        db_session.close()
    elif request and hasattr(request, "method"):
        if hasattr(g, "db_session"):
            g.db_session.close()


config = {}
engine = None
log = logging.getLogger(__name__)
