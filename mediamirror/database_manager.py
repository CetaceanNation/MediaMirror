from alembic.config import Config as AlembicConfig
from alembic.runtime.environment import EnvironmentContext
from alembic.script import ScriptDirectory as AlembicDirectory
from flask import g, request
import logging
import os
from sqlalchemy import (
    create_engine,
    inspect,
    URL
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()


def run_updates(module_name, schema_dir):
    log = logging.getLogger(__name__)
    log.debug("Beginning database schema update")
    abs_schema_dir = os.path.abspath(schema_dir)
    if not os.path.isdir(abs_schema_dir):
        log.error("Could not find schema directory, skipping updates...")
        return None, None
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
                log.warn("Could not determine latest database revision from schema directory")
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


def create_db_engine(db_config):
    global engine
    driver = db_config["dialect"]
    if db_config["driver"]:
        driver += f"+{db_config['driver']}"
    db_url = URL.create(driver,
                        username=db_config["username"],
                        password=db_config["password"],
                        host=db_config["db_host"] if db_config["db_host"] else "localhost",
                        port=db_config["db_port"],
                        database=db_config["database_name"]
                        )
    engine = create_engine(db_url)
    return engine


def init_db(db_config):
    log = logging.getLogger(__name__)
    log.debug(f"Creating db engine for '{db_config['database_name']}'")
    create_db_engine(db_config)


def get_db_inspector():
    inspector = inspect(engine)
    if request and hasattr(request, "method"):
        if not hasattr(g, "db_inspector"):
            g.db_inspector = inspector
        return g.db_inspector
    return inspector


def get_db_session():
    db_session = sessionmaker(bind=engine)
    if request and hasattr(request, "method"):
        if not hasattr(g, "db_session"):
            g.db_session = db_session()
        return g.db_session
    return db_session()


def close_db_session(db_session=None):
    if db_session:
        db_session.close()
    elif request and hasattr(request, "method"):
        if hasattr(g, "db_session"):
            g.db_session.close()


engine = None
