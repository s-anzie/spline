#!/usr/bin/env bash
#
# Starts the three pieces on this machine: hub, console, worker.
#
# Not a deployment. It exists because starting them by hand means getting four
# things right every time — the port, the CORS origin, the worker's state path
# and the MCP server's path — and getting one wrong produces a symptom that
# points somewhere else entirely.
#
#   scripts/dev-stack.sh          start everything
#   scripts/dev-stack.sh stop     stop everything
#   scripts/dev-stack.sh logs     follow all three
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/spline"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/spline-worker"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}/spline-worker"

# The documented default (apps/hub/.env.example), overridable because a
# machine can legitimately already have something there.
HUB_PORT="${SPLINE_HUB_PORT:-8765}"
WEB_PORT="${SPLINE_WEB_PORT:-3003}"
HUB_URL="http://localhost:${HUB_PORT}"

mkdir -p "$STATE" "$CONFIG" "$DATA/workspaces"
chmod 700 "$CONFIG"

port_holder() {
  ss -ltnp 2>/dev/null | grep ":$1 " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1
}

stop() {
  for port in "$HUB_PORT" "$WEB_PORT"; do
    pid="$(port_holder "$port" || true)"
    [ -n "$pid" ] && { kill "$pid" 2>/dev/null || true; echo "stopped :$port"; }
  done
  [ -f "$STATE/worker.pid" ] && { kill "$(cat "$STATE/worker.pid")" 2>/dev/null || true; rm -f "$STATE/worker.pid"; echo "stopped worker"; }
  return 0
}

case "${1:-start}" in
  stop) stop; exit 0 ;;
  logs) tail -f "$STATE"/*.log; exit 0 ;;
esac

stop
sleep 1

# ── The hub ────────────────────────────────────────────────────────────────
# CORS_ORIGINS is what lets the console talk to it at all: the hub allows no
# browser origin by default (§18).
cd "$ROOT/apps/hub"
grep -q "^CORS_ORIGINS" .env || echo "CORS_ORIGINS=http://localhost:${WEB_PORT}" >> .env
( set -a; . ./.env; set +a
  PORT="$HUB_PORT" LISTEN_HOST=127.0.0.1 PUBLIC_HUB_URL="$HUB_URL" \
  setsid npx ts-node src/main.ts > "$STATE/hub.log" 2>&1 < /dev/null & )

# ── The worker ─────────────────────────────────────────────────────────────
# NOT started here: it is a systemd user daemon (`spline-worker.service`), so
# it survives a logout and restarts itself. This only makes sure the built
# MCP bridge it hands to agents is current, since the agent's CLI spawns it
# and a stale build is a bridge that answers the wrong hub.
( cd "$ROOT/apps/worker" && npx tsc >/dev/null 2>&1 || true )
systemctl --user restart spline-worker.service 2>/dev/null || true

# Wait for the hub before anything talks to it: a worker that asked while it
# was still starting reported "fetch failed", which reads as a hub that is
# down rather than one that is not up YET.
for _ in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$HUB_URL/health" || true)" = "200" ] && break
  sleep 1
done

# ── The console ────────────────────────────────────────────────────────────
cd "$ROOT/apps/web"
echo "NEXT_PUBLIC_HUB_URL=$HUB_URL" > .env.local
setsid npx next dev --port "$WEB_PORT" > "$STATE/web.log" 2>&1 < /dev/null &

sleep 14
printf '\n  hub      %s   (%s)\n' "$HUB_URL" "$(curl -s -o /dev/null -w '%{http_code}' "$HUB_URL/health" || echo down)"
printf '  console  http://localhost:%s\n' "$WEB_PORT"
printf '  logs     %s\n\n' "$STATE"

printf '  worker   systemd --user · spline-worker.service (%s)\n\n' \
  "$(systemctl --user is-active spline-worker.service 2>/dev/null || echo unknown)"

code="$(systemctl --user status spline-worker.service --no-pager -n 40 2>/dev/null | grep -o 'PAIRING CODE:  [A-Z0-9]*' | tail -1 || true)"
if [ -n "$code" ]; then
  echo "  This machine is not paired yet — $code"
  echo "  Approve it from the console. Reading the code here is what proves you can see this machine."
else
  systemctl --user status spline-worker.service --no-pager -n 20 2>/dev/null \
    | grep -m1 "registered with the hub" | sed 's/^.*registered/  worker registered/' || true
fi
