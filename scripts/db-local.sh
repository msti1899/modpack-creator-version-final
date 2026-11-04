#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 ]]; then
  echo 'Usage: db-local.sh start|stop|status|reset|test (local only; no extra flags)' >&2
  exit 64
fi
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cli="$root/node_modules/.bin/supabase"
network=modpack-creator-local

case "$1" in
  start)
    if binding=$(docker network inspect --format '{{.Driver}}|{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}' "$network" 2>/dev/null); then
      if [[ "$binding" != 'bridge|127.0.0.1' ]]; then
        echo "Refusing network $network: it must be a bridge bound to 127.0.0.1." >&2
        exit 1
      fi
    else
      docker network create --driver bridge \
        --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 "$network" >/dev/null
    fi
    exec "$cli" start --network-id "$network" --workdir "$root"
    ;;
  stop|status) exec "$cli" "$1" --network-id "$network" --workdir "$root" ;;
  reset) exec "$cli" db reset --network-id "$network" --workdir "$root" ;;
  test) exec "$cli" test db --network-id "$network" --workdir "$root" ;;
  *) echo 'Unsupported local database command.' >&2; exit 64 ;;
esac
