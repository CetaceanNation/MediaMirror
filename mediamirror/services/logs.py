from collections import OrderedDict
from colorama import (
    Fore as text_color,
    init as colorama_init,
    Style as text_style
)
from datetime import datetime
import glob
import json
import logging
from logging import LogRecord
import logging.config
from logging.handlers import TimedRotatingFileHandler
import os
from quart import (
    has_request_context,
    session
)
from sqlalchemy import select
import traceback
from typing import (
    Iterator,
    Optional,
    Tuple,
    Type
)
from uuid import UUID

from mediamirror.models.settings import Setting
from mediamirror.services import settings
from mediamirror.services.compression import ZstdWriter
from mediamirror.services.database_manager import get_db_session


LOGLINE_FORMAT = "[%(asctime)s] (%(levelname)s) %(name)s: %(message)s"
VALID_LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"]
EMPTY_CONFIG = {
    "version": 1,
    "disable_existing_loggers": True,
    "loggers": {}
}
DEFAULT_LOGGERS = {
    "app": {
        "level": "INFO",
        "handlers": ["console", "file"]
    },
    "mediamirror.api": {
        "level": "WARN",
        "handlers": ["console", "file"]
    },
    "mediamirror.services.accounts": {
        "level": "INFO",
        "handlers": ["console", "file"]
    },
    "mediamirror.services.auth": {
        "level": "INFO",
        "handlers": ["console", "file"]
    },
    "mediamirror.services.database_manager": {
        "level": "WARN",
        "handlers": ["console", "file"]
    },
    "mediamirror.services.plugin_manager": {
        "level": "INFO",
        "handlers": ["console", "file"]
    },
    "mediamirror.services.settings": {
        "level": "INFO",
        "handlers": ["console", "file"]
    },
    "mediamirror.vnc": {
        "level": "INFO",
        "handlers": ["console", "file"]
    },
    "quart.app": {
        "level": "CRITICAL",
        "handlers": ["console"]
    },
    "quart.serving": {
        "level": "ERROR",
        "handlers": ["console"]
    },
    "hypercorn.access": {
        "level": "CRITICAL",
        "handlers": ["file"]
    },
    "hypercorn.error": {
        "level": "WARN",
        "handlers": ["file"]
    },
    "sqlalchemy": {
        "level": "WARN",
        "handlers": ["console", "file"]
    },
    "alembic": {
        "level": "WARN",
        "handlers": ["console", "file"]
    },
    "jinja2": {
        "level": "WARN",
        "handlers": ["console", "file"]
    },
    "apispec": {
        "level": "WARN",
        "handlers": ["console", "file"]
    },
    "marshmallow": {
        "level": "WARN",
        "handlers": ["console", "file"]
    },
    "py.warnings": {
        "level": "WARN",
        "handlers": ["console", "file"]
    }
}


class LogManagerInitException(Exception):
    pass


class JsonLogFormatter(logging.Formatter):
    root_path = None

    def __init__(self, root_path):
        super().__init__()
        self.root_path = root_path

    def format(self, record: LogRecord) -> str:
        """
        Format log record for JSON log file.

        :param record: Log record
        :return: Formatted log record
        """
        record.name = app_namer(record.name)
        record.message = record.getMessage()
        record.asctime = self.formatTime(record, self.datefmt)
        if record.pathname:
            # Hide install path in logs
            if self.root_path:
                record.pathname = record.pathname.replace(self.root_path, ".", 1)
            else:
                record.pathname = os.path.basename(record.pathname)
        if record.exc_info:
            if not record.exc_text:
                record.exc_text = self.formatException(record.exc_info)

        # Add user info from session if available
        try:
            if has_request_context():
                record.user = {
                    "id": UUID(session.get("user_id")),
                    "username": session.get("username"),
                    "permissions": session.get("permissions")
                }
        except (RuntimeError):
            pass

        record_dict = record.__dict__
        # Remove unused values
        for key in ["msg", "args", "filename"]:
            _ = record_dict.pop(key)
        return json.dumps(record_dict, default=str)


class ConsoleLogFormatter(logging.Formatter):
    root_path = None
    console_width = 80
    FORMATS = {
        logging.DEBUG: text_color.GREEN,
        logging.INFO: text_color.WHITE,
        logging.WARNING: text_color.YELLOW,
        logging.ERROR: text_color.RED,
        logging.CRITICAL: text_color.RED + text_style.BRIGHT
    }

    def __init__(self, root_path):
        self.root_path = root_path
        try:
            self.console_width = os.get_terminal_size().columns
        except OSError:
            pass
        super().__init__()

    def formatException(self, exc_info: Optional[Tuple[Type[BaseException], BaseException, Optional[object]]]) -> str:
        """
        Include tracebacks in exception logging.

        :param exc_info: Exception info
        :return: Formatted exception
        """
        exc_type, exc_value, trace = exc_info
        trace_str = "".join(traceback.format_exception(exc_type, exc_value, trace))
        return f'{trace_str.strip()}'

    def format(self, record: LogRecord) -> str:
        """
        Format log record for console display.

        :param record: Log record
        :return: Formatted log record
        """
        record.name = app_namer(record.name)
        color = self.FORMATS.get(record.levelno)
        # Add exception info if it exists
        if record.exc_info:
            record.msg = f"{record.msg}\n\n{self.formatException(record.exc_info)}"
            record.exc_info = None
        # Hide install path in logs
        record.msg = str(record.msg).replace(f"{self.root_path}", ".")
        return logging.Formatter(f"{color}{LOGLINE_FORMAT}{text_style.RESET_ALL}\n" +
                                 "─" * self.console_width).format(record)


class ConfiguredLogRotator(TimedRotatingFileHandler):
    use_compression = False

    def __init__(self, filename: str, when: int, interval: int, backupCount: int,
                 encoding: Optional[str] = None, delay: bool = False,
                 utc: bool = False, use_compression: bool = False):
        self.use_compression = use_compression
        super().__init__(filename, when, interval, backupCount, encoding, delay, utc)

    def namer(self, default_name: str) -> str:
        """
        Set name for rotated logs based on date.

        :param default_name: Original log name
        :return: %Y-%m/%Y-%m-%d prefix on log name
        """
        log_dir = default_name.rsplit(os.path.sep, 1)[0]
        log_name = os.path.basename(default_name).rsplit(".", 1)[0]
        current_date = datetime.now().strftime("%Y-%m-%d")
        current_month = current_date.rsplit("-", 1)[0]
        sub_dir = os.path.join(log_dir, current_month)
        return os.path.join(sub_dir, f"{current_date}_{log_name}")

    def rotate(self, source: str, dest: str) -> None:
        """
        Rotate log using compression if configured.

        :param source: Current log file location
        :param dest: Rotated log file location
        """
        if self.use_compression:
            if os.path.isfile(source):
                with open(source, "r") as log_file, ZstdWriter(f"{dest}.zst") as compressed_file:
                    compressed_file.write(log_file.read())
        else:
            super().rotate(source, dest)

    def doRollover(self) -> None:
        """
        Verify that the rotation log directory exists before rotation.
        """
        log_dir = os.path.dirname(self.rotation_filename(self.baseFilename))
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)
        super().doRollover()


def app_namer(app_name: str) -> str:
    """
    Converts package.module_name to Module Name for log files.

    :param app_name: Package name (package.module)
    :return: Log name (Module)
    """
    return " ".join(part[:1].upper() + part[1:] for part in app_name.split(".")[-1].split("_"))


async def log_subprocess_output(log, pipe, level=logging.DEBUG):
    while True:
        line = await pipe.readline()
        if not line:
            break
        log.log(level, line.decode())


async def handle_setting_update(key: str, value: bool | dict | str) -> None:
    """
    Handle setting updates for logging configuration.

    :param key: The logging setting
    :param value: The logging value
    """
    if key.startswith("loggers."):
        logger_name = key[8:]
        try:
            if not value:
                await app_log_manager.remove_logger(logger_name)
            else:
                if isinstance(value, str):
                    value = json.loads(value)
                if logger_name in app_log_manager.dict_config["loggers"]:
                    await app_log_manager.update_logger(logger_name, value)
                else:
                    await app_log_manager.add_logger(logger_name, value)
        except json.JSONDecodeError:
            raise ValueError(f"Invalid JSON for logger configuration: {value}")
    elif key == "use_compression":
        if isinstance(value, str):
            value = value.lower() == "true"
        await app_log_manager.set_compression(value)


class AppLogManager:
    root_path = None
    log_name = None
    log_dir = None
    dict_config = {}

    def __init__(self, app, log_config, log_name):
        if not app:
            return
        self.log_name = log_name
        self.root_path = app.root_path
        self.set_log_dir(log_config.get("DIR", "logs"))
        app.logger.name = app.name
        app.config.accesslog = app.logger
        app.config.errorlog = app.logger

    async def initialize(self, app, log_config) -> None:
        """
        Setup logging dict configuration.

        :raises LogManagerInitException: If logging configuration cannot be initialized
        """
        db_logging_config, compression_flag = await self.load_logging_config_from_db()
        if db_logging_config:
            self.dict_config = db_logging_config
        else:
            self.dict_config = EMPTY_CONFIG.copy()
            self.dict_config["loggers"] = DEFAULT_LOGGERS.copy()

        self.dict_config["formatters"] = {
            "console_format": {
                "()": lambda: ConsoleLogFormatter(self.root_path)
            },
            "json_format": {
                "()": lambda: JsonLogFormatter(self.root_path)
            }
        }

        self.dict_config["handlers"] = {
            "console": {
                "level": logging.DEBUG,
                "class": "logging.StreamHandler",
                "formatter": "console_format"
            },
            "file": {
                "level": logging.DEBUG,
                "class": "mediamirror.services.logs.ConfiguredLogRotator",
                "filename": os.path.join(self.log_dir, f"{self.log_name}.log"),
                "when": "midnight",
                "interval": 1,
                "backupCount": int(log_config.get("BACKUP_COUNT", 0)),
                "use_compression": compression_flag or log_config.get("USE_COMPRESSION", "false") == "true",
                "formatter": "json_format"
            }
        }

        if "app" in self.dict_config["loggers"]:
            self.dict_config["loggers"][app.name] = self.dict_config["loggers"].pop("app")
        for module in self.dict_config["loggers"]:
            logging.getLogger(module).handlers.clear()
            self.dict_config["loggers"][module]["propagate"] = False

        logging.captureWarnings(True)
        app.logger = logging.getLogger(app.name)
        logging.config.dictConfig(self.dict_config)
        await settings.register_component_handler("logging", handle_setting_update)

    async def save(self) -> None:
        """
        Apply the current logging configuration and save it to the database.
        """
        logging.config.dictConfig(self.dict_config)
        await self.save_logging_config_to_db()

    async def load_logging_config_from_db(self) -> Tuple[dict, bool]:
        """
        Fetch logging configuration from the database using the Setting model.

        :return: Logging configuration dictionary or None if unavailable, compression flag
        """
        compression_flag = False
        async with get_db_session() as db_session:
            try:
                query_result = (await db_session.execute(select(Setting).filter_by(component="logging"))).all()
                if query_result:
                    config_dict = EMPTY_CONFIG.copy()
                    for setting in query_result:
                        if setting.key == "use_compression":
                            compression_flag = setting.value.lower() == "true"
                        if setting.key.startswith("loggers."):
                            logger_key = setting.key[8:]
                            try:
                                setting_value = json.loads(setting.value)
                            except json.JSONDecodeError:
                                setting_value = setting.value
                            config_dict["loggers"][logger_key] = setting_value
                    return config_dict, compression_flag
            except Exception:
                return None, compression_flag
        return None, compression_flag

    async def save_logging_config_to_db(self) -> None:
        """
        Save logger configurations to the database.

        :param logging_config: Logging configuration dictionary
        """
        async with get_db_session() as db_session:
            try:
                for key, value in self.dict_config["loggers"].items():
                    full_key = f"loggers.{key}"
                    value_string = json.dumps(value) if isinstance(value, dict) else str(value)
                    setting = (await db_session.scalars(select(Setting).filter_by(
                        component="logging", key=full_key))).first()
                    if setting:
                        setting.value = value_string
                    else:
                        new_setting = Setting(
                            component="logging",
                            key=full_key,
                            type="json",
                            value=value_string,
                            default_value=value_string
                        )
                        db_session.add(new_setting)
                current_compression = str(self.dict_config["handlers"]["file"].get("use_compression", False))
                compression_setting = (await db_session.scalars(select(Setting).filter_by(
                    component="logging", key="use_compression"))).first()
                if compression_setting:
                    compression_setting.value = current_compression
                else:
                    new_compression_setting = Setting(
                        component="logging",
                        key="use_compression",
                        type="bool",
                        value=current_compression,
                        default_value=current_compression
                    )
                    db_session.add(new_compression_setting)
                await db_session.commit()
            except Exception as e:
                await db_session.rollback()
                raise LogManagerInitException("Failed to save logging configuration to the database.", e)

    async def add_logger(self, logger_name: str, config: dict) -> None:
        """
        Add a new logger to the logging configuration.

        :param logger_name: Name of the logger
        :param config: Logger configuration dictionary
        :return: True if successful
        :raises: ValueError: If logger already exists or invalid parameters are provided
        """
        if logger_name in self.dict_config["loggers"]:
            raise ValueError(f"Logger '{logger_name}' already exists.")
        handlers = config.get("handlers", ["console", "file"])
        valid_handlers = list(self.dict_config["handlers"].keys())
        for handler in handlers:
            if handler not in valid_handlers:
                raise ValueError(f"Invalid handler: {handler}. Must be one of {valid_handlers}")
        level = config.get("level", "INFO").upper()
        if level == "WARNING":
            level = "WARN"
        if level not in VALID_LOG_LEVELS:
            raise ValueError(f"Invalid log level: {level}. Must be one of {VALID_LOG_LEVELS}")
        self.dict_config["loggers"][logger_name] = {
            "level": level,
            "handlers": handlers
        }
        await self.save()

    async def update_logger(self, logger_name: str, config: dict) -> None:
        """
        Update an existing logger's configuration.

        :param logger_name: Name of the logger to update
        :param config: New logger configuration dictionary
        :raises ValueError: If logger does not exist or invalid parameters are provided
        """
        if logger_name not in self.dict_config["loggers"]:
            raise ValueError(f"Logger '{logger_name}' does not exist.")
        handlers = config.get("handlers", ["console", "file"])
        valid_handlers = list(self.dict_config["handlers"].keys())
        for handler in handlers:
            if handler not in valid_handlers:
                raise ValueError(f"Invalid handler: {handler}. Must be one of {valid_handlers}")
        level = config.get("level", "INFO").upper()
        if level == "WARNING":
            level = "WARN"
        if level not in VALID_LOG_LEVELS:
            raise ValueError(f"Invalid log level: {level}. Must be one of {VALID_LOG_LEVELS}")
        self.dict_config["loggers"][logger_name].update({
            "level": level,
            "handlers": handlers
        })
        await self.save()

    async def remove_logger(self, logger_name: str) -> None:
        """
        Remove a logger from the logging configuration.

        :param logger_name: Name of the logger to remove
        :raises ValueError: If logger does not exist
        """
        if logger_name not in self.dict_config["loggers"]:
            raise ValueError(f"Logger '{logger_name}' does not exist.")
        del self.dict_config["loggers"][logger_name]
        await self.save()

        """
        Reset logging configuration to defaults.
        """
        self.dict_config["loggers"] = DEFAULT_LOGGERS.copy()
        await self.save()

    def set_log_dir(self, new_log_dir: str) -> None:
        """
        Set the logging directory.

        :param new_log_dir: Path to resolve to the new logging directory
        """
        if new_log_dir:
            abs_log_dir = os.path.abspath(new_log_dir)
            if not os.path.isdir(abs_log_dir):
                os.makedirs(abs_log_dir)
            self.log_dir = abs_log_dir

    async def set_compression(self, use_compression: bool) -> None:
        """
        Whether or not log compression is used.

        :param use_compression: Whether or not to enable log compression
        """
        if "file" in self.dict_config.get("handlers", {}):
            self.dict_config["handlers"]["file"]["use_compression"] = use_compression
            await self.save()

    def index_log_dir(self) -> OrderedDict:
        """
        Create an OrderedDict tree of the log directory.

        :return: Log directory tree representation
        """
        log_files_info = OrderedDict()
        if self.log_dir:
            all_log_files = []
            patterns = [
                os.path.join(self.log_dir, "**/*.log"),
                os.path.join(self.log_dir, "**/*.log.zstd")
            ]

            for pattern in patterns:
                all_log_files += glob.glob(pattern, recursive=True)
            all_log_files.sort(reverse=True)

            for file_path in all_log_files:
                relative_path = os.path.relpath(file_path, self.log_dir)
                parts = relative_path.split(os.sep)
                current_level = log_files_info

                for part in parts[:-1]:
                    if part not in current_level:
                        current_level[part] = OrderedDict()
                        current_level[part]["_type"] = "directory"
                    current_level = current_level[part]

                file_name = parts[-1]
                current_level[file_name] = {
                    "_type": "file",
                    "path": relative_path,
                    "size": os.path.getsize(file_path)
                }

                def sort_dict_recursively(d: dict) -> OrderedDict:
                    directories = []
                    files = []
                    for key, value in d.items():
                        if isinstance(value, dict) and value.get("_type") == "directory":
                            directories.append((key, value))
                        else:
                            files.append((key, value))

                    directories.sort(key=lambda x: x[0], reverse=True)
                    files.sort(key=lambda x: x[0], reverse=True)

                    sorted_dict = OrderedDict(files + directories)

                    for key in sorted_dict:
                        if isinstance(sorted_dict[key], dict) and sorted_dict[key].get("_type") == "directory":
                            sorted_dict[key] = sort_dict_recursively(sorted_dict[key])

                    return sorted_dict

                log_files_info = sort_dict_recursively(log_files_info)
        return log_files_info

    def read_log(self, rel_log_path: str) -> Iterator[str]:
        """
        Streams lines from a log in the log folder.

        :param rel_log_path: Relative path to the log file in the log folder
        :return: Log file stream
        """
        abs_log_path = os.path.abspath(os.path.join(self.log_dir, rel_log_path))
        if (not abs_log_path.startswith(self.log_dir)
                or not os.path.exists(abs_log_path)
                or not os.path.isfile(abs_log_path)):
            yield "Bad file path.\n"
        try:
            _, log_ext = os.path.splitext(abs_log_path)
            if log_ext == ".log":
                with open(abs_log_path, "r", encoding="utf-8") as log_file:
                    for line in log_file:
                        yield line
        except Exception:
            yield "Encountered an error while reading log file.\n"


colorama_init()
app_log_manager = None
