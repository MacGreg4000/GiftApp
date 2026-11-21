#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
	token_file="${SETUP_TOKEN_FILE:-/data/uploads/setup-token}"
	mkdir -p /data/uploads "$(dirname "$token_file")"
	chown -R node:node /data/uploads || true
	if [ ! -e "$token_file" ]; then
		touch "$token_file"
		chmod 600 "$token_file"
	fi
	chown node:node "$token_file" || true
	exec su-exec node "$0" "$@"
fi

exec node build/index.js
