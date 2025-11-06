#!/usr/bin/env bash
docker container stop mediamirror-web mediamirror-db
docker container rm mediamirror-web mediamirror-db
docker volume rm mediamirror_local mediamirror_logs mediamirror_plugins mediamirror_pg_data
docker image prune -a -f
docker builder prune -a -f
