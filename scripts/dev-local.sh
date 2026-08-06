#!/usr/bin/env sh

inngest_pid=""

cleanup() {
  trap - EXIT INT TERM
  if [ -n "$inngest_pid" ]; then
    kill "$inngest_pid" 2>/dev/null || true
    wait "$inngest_pid" 2>/dev/null || true
  fi
  pnpm db:dev:down || true
}

trap cleanup EXIT
trap 'exit 0' INT TERM

pnpm db:dev:up
database_exit=$?
if [ "$database_exit" -ne 0 ]; then
  exit "$database_exit"
fi

pnpm exec inngest-cli dev --no-discovery -u http://localhost:3000/api/inngest &
inngest_pid=$!

INNGEST_DEV=1 pnpm dev
web_exit=$?

# Ctrl+C is an intentional local-development shutdown, not a script failure.
if [ "$web_exit" -eq 130 ] || [ "$web_exit" -eq 143 ]; then
  exit 0
fi

exit "$web_exit"
