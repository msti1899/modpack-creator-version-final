#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
mode=${1:-start}

if [[ $# -gt 1 ]]; then
  echo 'Usage: dev.sh start|stop|status (local only; no extra flags)' >&2
  exit 64
fi

case "$mode" in
  start | stop | status) ;;
  *)
    echo 'Usage: dev.sh start|stop|status (local only; no extra flags)' >&2
    exit 64
    ;;
esac

if docker info >/dev/null 2>&1; then
  docker_reachable=1
else
  docker_reachable=0
fi

if [[ "$mode" != "start" ]]; then
  if [[ "$docker_reachable" != "1" ]]; then
    echo 'Docker is not reachable, so there is no local database to manage.' >&2
    exit 1
  fi
  exec bash "$root/scripts/db-local.sh" "$mode"
fi

cd -- "$root"

if ! command -v bun >/dev/null 2>&1; then
  echo 'Bun is required but was not found on PATH.' >&2
  exit 69
fi

if [[ ! -d node_modules ]]; then
  echo 'Installing workspace dependencies...'
  bun install --frozen-lockfile
fi

if [[ "$docker_reachable" == "1" ]]; then
  echo 'Starting the local database...'
  bash "$root/scripts/db-local.sh" start
else
  echo 'Docker is not reachable: starting web and api without the local database.' >&2
fi

echo 'Web: http://localhost:3000'
echo 'API health: http://localhost:3001/health'

exec bun run dev
