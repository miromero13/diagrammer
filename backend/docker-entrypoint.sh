#!/bin/sh
set -e

# Simple entrypoint: run migrations then start the app
# Retry migrations a few times to handle DB not ready situations

MAX_ATTEMPTS=5
SLEEP_SECONDS=3
ATTEMPT=1

run_migrations_once() {
  # Prefer compiled JS migration runner if it exists
  if [ -f ./dist/scripts/run-migrations.js ]; then
    echo "[entrypoint] Found compiled migrations runner, using node dist/scripts/run-migrations.js"
    node ./dist/scripts/run-migrations.js
    return $?
  fi

  # Fallback to ts-node-based migration command (requires ts-node & tsconfig-paths)
  echo "[entrypoint] Compiled migration runner not found, falling back to npm run migration:run"
  npm run migration:run
  return $?
}

echo "[entrypoint] Running migration command with up to ${MAX_ATTEMPTS} attempts..."
while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
  if run_migrations_once; then
    echo "[entrypoint] Migrations ran successfully."
    break
  else
    echo "[entrypoint] Migration attempt ${ATTEMPT} failed."
    ATTEMPT=$((ATTEMPT + 1))
    if [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; then
      echo "[entrypoint] Waiting ${SLEEP_SECONDS}s before retry..."
      sleep ${SLEEP_SECONDS}
    else
      echo "[entrypoint] All ${MAX_ATTEMPTS} migration attempts failed. Exiting." >&2
      exit 1
    fi
  fi
done

echo "[entrypoint] Starting application: $@"
exec "$@"