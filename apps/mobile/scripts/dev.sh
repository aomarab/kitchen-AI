#!/usr/bin/env sh
# Start Metro, tolerating an instance that is already serving this project.
#
# `expo start` treats an occupied port as an interactive question ("Use port
# 8082 instead?"). Under `turbo run dev` there is no TTY to answer it, so expo
# exits 1 — and because turbo tears down the whole run when one task fails,
# a stray Metro left over from an earlier session takes the web app and the API
# down with it. That is the entire failure mode behind "pnpm dev is broken".
#
# Reusing a Metro that is already bundling this project is what the developer
# wanted anyway, so detect that case and hold the persistent turbo task open
# instead of starting a second bundler.
set -e

PORT="${EXPO_PORT:-8081}"

# `expo` resolves through pnpm's PATH when run as a package script, but not when
# this file is invoked directly. Add the package's bin dir so both work.
PATH="$(cd "$(dirname "$0")/.." && pwd)/node_modules/.bin:${PATH}"
export PATH

# Metro answers /status with the literal body `packager-status:running`. This is
# the same handshake React Native clients use, so it distinguishes "our bundler
# is already up" from "some unrelated process holds this port" — the latter must
# still fail loudly rather than be silently adopted.
metro_is_running() {
  curl -sf -m 2 "http://localhost:${PORT}/status" 2>/dev/null |
    grep -q 'packager-status:running'
}

if metro_is_running; then
  echo "Metro is already serving this project on port ${PORT} — reusing it."
  echo "Stop that instance, or set EXPO_PORT, to run a second bundler."
  # turbo marks `dev` persistent; returning now would report the task as
  # finished and shut its siblings down. Idle until the bundler goes away.
  while metro_is_running; do
    sleep 5
  done
  echo "Metro on port ${PORT} stopped."
  exit 0
fi

exec expo start --port "${PORT}"
