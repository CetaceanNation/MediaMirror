from collections import OrderedDict
from colorama import init as colorama_init, Fore as text_color, Style as text_style
from datetime import datetime
import glob
import json
import logging
import logging.config
from logging import StreamHandler
from logging.handlers import TimedRotatingFileHandler
import os
import traceback

from compression import ZstdWriter

LOGLINE_FORMAT = "[%(asctime)s] (%(levelname)s) %(name)s: %(message)s"


class JsonLogFormatter(logging.Formatter):
    root_path = None

    def __init__(self, root_path):
        super().__init__()
        self.root_path = root_path

    def format(self, record):
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
        super().__init__()
        self.root_path = root_path

    def formatException(self, exc_info):
        exc_type, exc_value, trace = exc_info
        trace_str = "".join(traceback.format_exception(exc_type, exc_value, trace))
        return f'{trace_str.strip()}'

    def format(self, record):
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

    def __init__(self, filename, when, interval, backupCount,
                 encoding=None, delay=False, utc=False, use_compression=False):
        self.use_compression = use_compression
        super().__init__(filename, when, interval, backupCount, encoding, delay, utc)

    def namer(default_name):
        # Add %Y-%m/%Y-%m-%d date prefix to rotated logs
        log_dir = default_name.rsplit(os.path.sep, 1)[0]
        log_name = os.path.basename(default_name).rsplit(".", 1)[0]
        current_date = datetime.now().strftime("%Y-%m-%d")
        current_month = current_date.rsplit("-", 1)[0]
        sub_dir = os.path.join(log_dir, current_month)
        return os.path.join(sub_dir, f"{current_date}_{log_name}")

    def rotate(self, source, dest):
        if self.use_compression:
            if os.path.isfile(source):
                with open(source, "r") as log_file, ZstdWriter(f"{dest}.zst") as compressed_file:
                    compressed_file.write(log_file.read())
        else:
            super().rotate()

    def doRollover(self):
        log_dir = os.path.dirname(self.rotation_filename(self.baseFilename))
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)
        super().doRollover()


def app_namer(app_name):
    # package.module_name -> Module Name
    return " ".join(part[:1].upper() + part[1:] for part in app_name.split(".")[-1].split("_"))


class LogManager:
    root_path = None
    log_name = None
    log_dir = None

    def __init__(self, app, log_config, module_configs, log_name=None):
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
                "class": "logs.ConfiguredLogRotator",
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

        logging.config.dictConfig(module_configs)

    def set_log_dir(self, new_log_dir):
        if new_log_dir:
            abs_log_dir = os.path.abspath(new_log_dir)
            if not os.path.isdir(abs_log_dir):
                os.makedirs(self.log_dir)
            self.log_dir = abs_log_dir

    def set_compression(self, use_compression):
        if isinstance(use_compression, bool):
            self.use_compression = use_compression

    def index_log_dir(self):
        log_files_info = OrderedDict()
        if self.log_dir:
            all_log_files = []
            patterns = [
                os.path.join(self.log_dir, "**/*.log"),
                os.path.join(self.log_dir, "**/*.log.zstd")
            ]
            for pattern in patterns:
                all_log_files += glob.glob(pattern, recursive=True)
            all_log_files.sort()
            all_log_files.reverse()
            for file_path in all_log_files:
                file_size = os.path.getsize(file_path)
                log_files_info.append(
                    {
                        "fname": os.path.basename(file_path),
                        "path": file_path,
                        "size": file_size
                    }
                )
        return log_files_info


colorama_init()
app_log_manager = None
