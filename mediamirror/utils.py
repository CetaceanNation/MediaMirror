from flask import current_app as app
import os
import sys
from tomllib import load as tomlload, TOMLDecodeError


def read_config_file(config_filename="config.toml"):
    try:
        if app:
            with app.open_resource(config_filename) as config_file:
                config_data = tomlload(config_file)
        else:
            config_path = os.path.abspath(config_filename)
            with open(config_path, "rb") as config_file:
                config_data = tomlload(config_file)
    except FileNotFoundError:
        print(f"ERROR: Missing '{config_filename}' file, check 'example_{config_filename}' for a reference")
        sys.exit(1)
    except TOMLDecodeError:
        print(
            f"ERROR: The contents of '{config_filename}' were not valid TOML," +
            " check the spec at 'https://toml.io/en/v1.0.0'"
        )
        sys.exit(2)
    return config_data
