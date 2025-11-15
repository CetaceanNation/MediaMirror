# MediaMirror

A web application for locally browsing and managing online creator content. This repository is still being developed and is not a working product.

## Getting Started
1. Create the file `.env`, based on the contents of [`.env.example`](.env.example). Update values as documented.
2. Update the logging levels and handlers in [`logging_config.json`](logging_config.json) as you see fit. This file is only used on first run, later the configuration can be updated in the database.

### Docker
#### Requirements
- `.env` file exists based on [`.env.example`](.env.example)

Run with `./scripts/start-docker.sh` or `docker compose up`

### Native
#### Requirements
- Python (developed and tested with 3.12)
    - Consider creating a Python virtual environment to isolate dependencies (`python -m venv ./venv`)
- Postgres database
- An environment file based on [`.env.example`](.env.example)

Run with `./scripts/start-native.sh`. You can pass the path to a specific environment file to this script, in case you want to maintain different configurations.
