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
import traceback
from typing import (
    Iterator,
    Optional,
    Tuple,
    Type
)

from services.compression import ZstdWriter

LOGLINE_FORMAT = "[%(asctime)s] (%(levelname)s) %(name)s: %(message)s"


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
        record_dict = record.__dict__
        # Remove unused values
        for key in ["msg", "args", "filename"]:
            _ = record_dict.pop(key)
        return json.dumps(record_dict, default=str)


class ConsoleLogFormatter(logging.Formatter):
    root_path = None
    CONSOLE_WIDTH = os.get_terminal_size().columns
    FORMATS = {
        logging.DEBUG: text_color.GREEN,
        logging.INFO: text_color.WHITE,
        logging.WARNING: text_color.YELLOW,
        logging.ERROR: text_color.RED,
        logging.CRITICAL: text_color.RED + text_style.BRIGHT
    }

    def __init__(self, root_path):
        self.root_path = root_path
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
                                 "─" * self.CONSOLE_WIDTH).format(record)


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


class LogManager:
    root_path = None
    log_name = None
    log_dir = None

    def __init__(self, app=None, log_config=None, module_configs=None, log_name=None):
        if not app:
            return
        self.log_name = log_name
        self.root_path = app.root_path
        self.set_log_dir(log_config.get("logging_directory", "./logs"))

        app.logger.name = app.name

        module_configs["formatters"] = {
            "console_format": {
                "()": lambda: ConsoleLogFormatter(self.root_path)
            },
            "json_format": {
                "()": lambda: JsonLogFormatter(self.root_path)
            }
        }

        module_configs["handlers"] = {
            "console": {
                "level": logging.DEBUG,
                "class": "logging.StreamHandler",
                "formatter": "console_format"
            },
            "file": {
                "level": logging.DEBUG,
                "class": "services.logs.ConfiguredLogRotator",
                "filename": os.path.join(self.log_dir, f"{self.log_name}.log"),
                "when": "midnight",
                "interval": 1,
                "backupCount": int(log_config.get("backup_count", 0)),
                "use_compression": bool(log_config.get("use_compression", False)),
                "formatter": "json_format"
            }
        }

        if "app" in module_configs["loggers"]:
            module_configs["loggers"][app.name] = module_configs["loggers"].pop("app")
        for module in module_configs["loggers"]:
            module_configs["loggers"][module]["propagate"] = False

        logging.captureWarnings(True)

        logging.config.dictConfig(module_configs)

    def set_log_dir(self, new_log_dir: str) -> None:
        """
        Set the logging directory.

        :param new_log_dir: Path to resolve to the new logging directory
        """
        if new_log_dir:
            abs_log_dir = os.path.abspath(new_log_dir)
            if not os.path.isdir(abs_log_dir):
                os.makedirs(self.log_dir)
            self.log_dir = abs_log_dir

    def set_compression(self, use_compression: bool) -> None:
        """
        Whether or not log compression is used.

        :param use_compression: Whether or not to enable log compression
        """
        if isinstance(use_compression, bool):
            self.use_compression = use_compression

    def index_log_dir(self) -> OrderedDict:
        """
        Create an OrderedDict tree of the log directory.

        :return: OrderedDict
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

                    sorted_dict = OrderedDict(directories + files)

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
            with open(os.path.join(self.log_dir, rel_log_path), "r", encoding="utf-8") as log_file:
                for line in log_file:
                    yield line
        except Exception:
            yield "Encountered an error while reading log file.\n"


colorama_init()
app_log_manager = LogManager()
