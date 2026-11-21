#!/bin/sh
# Restaure un dump gzip dans la base wishlist.
# Avec Docker : ./scripts/restaurer.sh backups/daily/wishlist-….sql.gz
# Sans Docker : DATABASE_URL=postgres://… ./scripts/restaurer.sh fichier.sql.gz
set -eu

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
	echo "Indiquez un fichier .sql.gz existant." >&2
	exit 1
fi

if [ -n "${DATABASE_URL:-}" ]; then
	gunzip -c "$file" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
	exit 0
fi

echo "Arrêt de l’application et de la sauvegarde, le temps de recharger la base."
docker compose stop app backup
docker compose exec -T db psql -U wishlist -d postgres -v ON_ERROR_STOP=1 -c \
	"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'wishlist' AND pid <> pg_backend_pid();"
docker compose exec -T db psql -U wishlist -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS wishlist;"
docker compose exec -T db psql -U wishlist -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE wishlist OWNER wishlist;"
gunzip -c "$file" | docker compose exec -T db psql -U wishlist -d wishlist -v ON_ERROR_STOP=1
docker compose start app backup
echo "Restauration terminée. Les sessions et les codes sont ceux du dump. Les photos restent dans data/uploads."
