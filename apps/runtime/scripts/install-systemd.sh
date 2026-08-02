#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/spline"
UNIT_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
NODE_BIN="$(command -v node)"

if ! command -v bwrap >/dev/null 2>&1; then
  echo "Erreur: Bubblewrap (bwrap) est requis pour isoler les agents." >&2
  echo "Installez le paquet bubblewrap puis relancez cette commande." >&2
  exit 1
fi

cd "$REPO_ROOT"
npm run build -w apps/runtime
mkdir -p "$CONFIG_ROOT" "$UNIT_ROOT"
chmod 700 "$CONFIG_ROOT"

cat > "$UNIT_ROOT/spline-runtime.service" <<EOF
[Unit]
Description=Spline local machine runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO_ROOT
ExecStart=$NODE_BIN $REPO_ROOT/apps/runtime/dist/main.js
Environment=SPLINE_RUNTIME_CONFIG=$CONFIG_ROOT/runtime.json
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now spline-runtime.service

if ! loginctl enable-linger "$USER" 2>/dev/null; then
  echo "Le service démarrera à ta connexion. Pour le démarrer dès le boot, exécute: sudo loginctl enable-linger $USER"
fi

echo "Spline runtime installé et démarré."
echo "Configure le token avec: npm run token:set -w apps/runtime"
