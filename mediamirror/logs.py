from collections import OrderedDict
from colorama import init as colorama_init, Fore as text_color, Style as text_style
from datetime import datetime
import glob
import json
import logging
from logging import StreamHandler
from logging.handlers import TimedRotatingFileHandler
import os
import sys
import traceback

from compression import zstd_log_rotator

LOGLINE_FORMAT = "[%(asctime)s] (%(levelname)s) %(name)s: %(message)s"


class JsonLogFormatter(logging.Formatter):
    root_path = None

    def __init__(self, root_path):
        super().__init__()
        self.root_path = root_path

    def format(self, record):
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
        color = self.FORMATS.get(record.levelno)
        # Add exception info if it exists
        if record.exc_info:
            record.msg = f"{record.msg}\n\n{self.formatException(record.exc_info)}"
            record.exc_info = None
        # Hide install path in logs
        record.msg = str(record.msg).replace(f"File \"{self.root_path}", "File \".")
        return logging.Formatter(f"{color}{LOGLINE_FORMAT}{text_style.RESET_ALL}\n" +
                                 "─" * self.CONSOLE_WIDTH).format(record)


def log_namer(default_name):
    # Add %Y-%m-%d date prefix to rotated logs
    log_dir = default_name.rsplit(os.path.sep, 1)[0]
    log_name = os.path.basename(default_name).rsplit(".", 1)[0]
    current_date = datetime.now().strftime("%Y-%m-%d")
    return os.path.join(log_dir, f"{current_date}_{log_name}")


def app_namer(app_name):
    # package.module_name -> Module Name
    return " ".join(part[:1].upper() + part[1:] for part in app_name.split(".")[-1].split("_"))


class LogManager:
    app_loggers = {
        "Root": logging.getLogger()
    }
    root_path = None
    log_name = None
    log_dir = None
    use_compression = False

    def __init__(self, log_name=None):
        self.log_name = log_name
        self.init_root_logger()

    def set_root_path(self, root_path):
        self.root_path = root_path

    def set_log_dir(self, new_log_dir):
        if new_log_dir:
            abs_log_dir = os.path.abspath(new_log_dir)
            if os.path.isdir(abs_log_dir):
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

    def configure_logging(self, logger, use_console, use_logfile,
                          console_level=logging.WARNING, logfile_level=logging.INFO):
        logger.name = app_name = app_namer(logger.name)
        lowest_level = min([console_level, logfile_level])
        logger.setLevel(lowest_level)
        logger.propagate = False
        # Remove existing handlers
        for handler in logger.handlers:
            logger.removeHandler(handler)
        if use_console:
            # Add handler for console std output
            console_handler = StreamHandler()
            console_formatter = ConsoleLogFormatter(self.root_path)
            console_handler.setFormatter(console_formatter)
            console_handler.setLevel(console_level)
            logger.addHandler(console_handler)
            logger.debug(f"Now writing ({logging.getLevelName(console_level)}) {app_name} logs to console")
        if use_logfile and self.log_dir:
            # Add handler for log file output
            if not os.path.isdir(self.log_dir):
                logger.debug(f"Making log destination '{self.log_dir}'")
                os.makedirs(self.log_dir)
            logfile_path = os.path.join(self.log_dir, f"{self.log_name}.log")
            TimedRotatingFileHandler.namer
            logfile_handler = TimedRotatingFileHandler(
                filename=logfile_path, when="midnight")
            logfile_formatter = JsonLogFormatter(self.root_path)
            logfile_handler.setFormatter(logfile_formatter)
            logfile_handler.namer = log_namer
            if self.use_compression:
                logfile_handler.rotator = zstd_log_rotator
            logfile_handler.setLevel(logfile_level)
            logger.addHandler(logfile_handler)
            logger.debug(f"Now writing ({logging.getLevelName(logfile_level)}) {app_name} logs to '{logfile_path}'")
        return logger

    def init_root_logger(self):

        self.configure_logging(logging.getLogger(), True, False, console_level=logging.DEBUG)

    def disable_root_logger(self):
        self.configure_logging(logging.getLogger(), False, False)
        logging.getLogger().disabled = True


colorama_init()
app_log_manager = None
