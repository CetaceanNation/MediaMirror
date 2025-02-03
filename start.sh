#!/usr/bin/env bash
ENV_FILE="./.env"
if [[ -n "$1" ]]; then
    ENV_FILE="$1"
    if [[ ! -f "$ENV_FILE" ]]; then
        echo "Error: '$ENV_FILE' file not found. Create one based on '.env.example' or specify it as an argument before running."
        exit 1
    fi
    echo "Using custom dotenv file '$ENV_FILE'"
fi
set -a
source "$ENV_FILE"
set +a
if [[ -d ./venv ]]; then
    echo "Using virtual environment found in ./venv"
    source ./venv/bin/activate
else
    echo "Warning: Virtual environment (./venv) not found. Continuing without activation."
fi
flask --app "./mediamirror/app.py" run
