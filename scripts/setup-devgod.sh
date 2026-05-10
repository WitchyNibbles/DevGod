#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "created .env from .env.example"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for local setup unless you provide a managed Postgres backend" >&2
  exit 1
fi

if ! docker version >/dev/null 2>&1; then
  echo "docker is installed but not usable from this environment; enable Docker Desktop WSL integration or provide a managed Postgres backend" >&2
  exit 1
fi

is_safe_env_key() {
  [[ "$1" =~ ^DEVGOD_[A-Z0-9_]+$ ]]
}

trim_leading_whitespace() {
  local value="$1"
  while [[ "$value" == [[:space:]]* ]]; do
    value="${value#?}"
  done
  printf '%s' "$value"
}

trim_trailing_whitespace() {
  local value="$1"
  while [[ "$value" == *[[:space:]] ]]; do
    value="${value%?}"
  done
  printf '%s' "$value"
}

strip_unquoted_comment() {
  local input="$1"
  local output=""
  local previous=""
  local i ch

  for ((i = 0; i < ${#input}; i++)); do
    ch="${input:i:1}"
    if [[ "$ch" == "#" && ( -z "$output" || "$previous" =~ [[:space:]] ) ]]; then
      break
    fi
    output+="$ch"
    previous="$ch"
  done

  output="$(trim_trailing_whitespace "$output")"
  printf '%s' "$output"
}

unescape_double_quoted_value() {
  local value="$1"
  value="${value//\\\\/\\}"
  value="${value//\\\"/\"}"
  value="${value//\\n/$'\n'}"
  value="${value//\\r/$'\r'}"
  value="${value//\\t/$'\t'}"
  value="${value//\\$/\$}"
  printf '%s' "$value"
}

extract_double_quoted_inner() {
  local input="$1"
  local output=""
  local escaped=0
  local i ch

  for ((i = 1; i < ${#input}; i++)); do
    ch="${input:i:1}"
    if [[ $escaped -eq 1 ]]; then
      output+="\\$ch"
      escaped=0
      continue
    fi

    if [[ "$ch" == "\\" ]]; then
      escaped=1
      continue
    fi

    if [[ "$ch" == '"' ]]; then
      break
    fi

    output+="$ch"
  done

  printf '%s' "$output"
}

load_env_file() {
  local env_file="$1"
  local line key raw_value value

  if [[ ! -f "$env_file" ]]; then
    return 0
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi

    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      key="${BASH_REMATCH[2]}"
      raw_value="${BASH_REMATCH[3]}"
      if ! is_safe_env_key "$key"; then
        continue
      fi

      value="$(trim_leading_whitespace "$raw_value")"

      if [[ "${value:0:1}" == '"' ]]; then
        value="$(extract_double_quoted_inner "$value")"
        value="$(unescape_double_quoted_value "$value")"
      elif [[ "${value:0:1}" == "'" ]]; then
        value="${value:1}"
        if [[ "$value" == *"'"* ]]; then
          value="${value%%"'"*}"
        fi
      else
        value="$(strip_unquoted_comment "$value")"
      fi

      printf -v "$key" '%s' "$value"
      export "$key"
    fi
  done < "$env_file"
}

load_env_file ./.env

if [[ -z "${DEVGOD_PROJECT_REPO_PATH:-}" || "${DEVGOD_PROJECT_REPO_PATH}" == "/absolute/path/to/repo" ]]; then
  export DEVGOD_PROJECT_REPO_PATH="$REPO_ROOT"
fi

if [[ -z "${DEVGOD_PROJECT_SLUG:-}" ]]; then
  export DEVGOD_PROJECT_SLUG="$(basename "$REPO_ROOT" | tr '[:upper:]' '[:lower:]')"
fi

if [[ -z "${DEVGOD_PROJECT_NAME:-}" ]]; then
  export DEVGOD_PROJECT_NAME="${DEVGOD_PROJECT_SLUG}"
fi

if [[ -z "${DEVGOD_DOCKER_CONTAINER_NAME:-}" ]]; then
  export DEVGOD_DOCKER_CONTAINER_NAME="devgod-postgres-${DEVGOD_PROJECT_SLUG}"
fi

if [[ -z "${DEVGOD_QDRANT_CONTAINER_NAME:-}" ]]; then
  export DEVGOD_QDRANT_CONTAINER_NAME="devgod-qdrant-${DEVGOD_PROJECT_SLUG}"
fi

if [[ -z "${DEVGOD_QDRANT_URL:-}" ]]; then
  export DEVGOD_QDRANT_URL="http://127.0.0.1:${DEVGOD_QDRANT_PORT:-6333}"
fi

if [[ -z "${DEVGOD_POSTGRES_PASSWORD:-}" || "${DEVGOD_POSTGRES_PASSWORD}" == "devgod" ]]; then
  echo "DEVGOD_POSTGRES_PASSWORD must be set to a non-default local password before setup continues" >&2
  exit 1
fi

wait_for_container_health() {
  local container_name="$1"
  local label="$2"

  echo "waiting for ${label} to become healthy"
  for _ in {1..60}; do
    if [[ "$(docker inspect -f '{{.State.Health.Status}}' "$container_name" 2>/dev/null || true)" == "healthy" ]]; then
      return 0
    fi
    sleep 2
  done

  echo "${label} did not become healthy" >&2
  docker logs "$container_name" --tail 100 >&2 || true
  exit 1
}

wait_for_qdrant_http() {
  local qdrant_url="$1"

  echo "waiting for devgod-qdrant to answer ${qdrant_url}"
  for _ in {1..60}; do
    if node -e '
      const base = new URL(process.argv[1]);
      if (!base.pathname.endsWith("/")) {
        base.pathname = `${base.pathname}/`;
      }
      const endpoint = new URL("collections", base);
      fetch(endpoint, { redirect: "error", signal: AbortSignal.timeout(2000) })
        .then((response) => process.exit(response.ok ? 0 : 1))
        .catch(() => process.exit(1));
    ' "$qdrant_url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "devgod-qdrant did not answer health checks at ${qdrant_url}" >&2
  docker logs "${DEVGOD_QDRANT_CONTAINER_NAME}" --tail 100 >&2 || true
  exit 1
}

docker compose up -d devgod-postgres devgod-qdrant

wait_for_container_health "${DEVGOD_DOCKER_CONTAINER_NAME}" "devgod-postgres"
wait_for_container_health "${DEVGOD_QDRANT_CONTAINER_NAME}" "devgod-qdrant"
wait_for_qdrant_http "${DEVGOD_QDRANT_URL}"

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run migrate
npm run bootstrap
npm run verify:setup

echo ""
echo "devgod local setup complete"
echo "workspace: ${DEVGOD_WORKSPACE_SLUG}"
echo "project: ${DEVGOD_PROJECT_SLUG}"
echo "database: configured"
echo "qdrant: configured"
