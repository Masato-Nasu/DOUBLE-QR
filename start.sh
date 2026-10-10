#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
printf '%s\n' 'DOUBLE QR: http://127.0.0.1:8765' '終了: Ctrl+C'
exec python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
