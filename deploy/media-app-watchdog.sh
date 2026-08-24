#!/usr/bin/env bash
set -u

service_name="media-app.service"
local_health="http://127.0.0.1:3460/health"
tailnet_health="${MEDIA_APP_TAILNET_HEALTH_URL:-}"

if ! systemctl --user is-active --quiet "$service_name"; then
  echo "Media Tracker watchdog: user service is not active." >&2
  exit 1
fi

if ! curl --fail --silent --show-error --max-time 10 "$local_health" >/dev/null; then
  echo "Media Tracker watchdog: local health check failed." >&2
  exit 1
fi

if [[ -n "$tailnet_health" ]] && ! curl --fail --silent --show-error --max-time 15 "$tailnet_health" >/dev/null; then
  echo "Media Tracker watchdog: Tailnet health check failed." >&2
  exit 1
fi
