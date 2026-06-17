#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
set -euo pipefail

CONFIG_PATH=/data/options.json

bashio::log.info "Starting internal Valkey"
valkey-server --bind 127.0.0.1 --port 6379 --save "" --appendonly no &
VALKEY_PID="$!"

cleanup() {
  if kill -0 "${VALKEY_PID}" 2>/dev/null; then
    kill "${VALKEY_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

for attempt in $(seq 1 50); do
  if valkey-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; then
    bashio::log.info "Internal Valkey is ready"
    break
  fi

  if [ "${attempt}" = "50" ]; then
    bashio::log.fatal "Internal Valkey did not become ready"
    exit 1
  fi

  sleep 0.1
done

MQTT_HOST="$(bashio::services mqtt "host")"
MQTT_PORT="$(bashio::services mqtt "port")"
MQTT_USERNAME_VALUE="$(bashio::services mqtt "username")"
MQTT_PASSWORD_VALUE="$(bashio::services mqtt "password")"

export RF003_BASE_URL="$(bashio::config 'rf003_base_url')"
export RF003_USERNAME="$(bashio::config 'rf003_username')"
export RF003_PASSWORD="$(bashio::config 'rf003_password')"
export MQTT_URL="mqtt://${MQTT_HOST}:${MQTT_PORT}"
export MQTT_DISCOVERY_PREFIX="$(bashio::config 'mqtt_discovery_prefix')"
export MQTT_BASE_TOPIC="$(bashio::config 'mqtt_base_topic')"
export POLL_FULL_STATE_INTERVAL_MS="$(bashio::config 'poll_full_state_interval_ms')"
export POLL_DEVICE_STATE_INTERVAL_MS="$(bashio::config 'poll_device_state_interval_ms')"
export LOG_LEVEL="$(bashio::config 'log_level')"
export VALKEY_URL="redis://127.0.0.1:6379"
export HTTP_HOST="127.0.0.1"
export HTTP_PORT="3000"

if [ -n "${MQTT_USERNAME_VALUE}" ]; then
  export MQTT_USERNAME="${MQTT_USERNAME_VALUE}"
fi

if [ -n "${MQTT_PASSWORD_VALUE}" ]; then
  export MQTT_PASSWORD="${MQTT_PASSWORD_VALUE}"
fi

bashio::log.info "Starting eLAN RF-003 MQTT bridge"
bun /app/dist/index.js &
APP_PID="$!"

wait -n "${APP_PID}" "${VALKEY_PID}"
EXIT_CODE="$?"

cleanup
exit "${EXIT_CODE}"
