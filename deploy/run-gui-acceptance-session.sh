#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
  echo 'FAIL: D-Bus session is not available.' >&2
  exit 1
fi

atspi_launcher=''
registry_daemon=''
for candidate in /usr/libexec/at-spi-bus-launcher /usr/lib/at-spi-bus-launcher; do
  if [[ -x "$candidate" ]]; then atspi_launcher="$candidate"; break; fi
done
for candidate in /usr/libexec/at-spi2-registryd /usr/lib/at-spi2-registryd; do
  if [[ -x "$candidate" ]]; then registry_daemon="$candidate"; break; fi
done
if [[ -z "$atspi_launcher" || -z "$registry_daemon" ]]; then
  echo 'FAIL: AT-SPI runtime is not installed.' >&2
  exit 1
fi

"$atspi_launcher" --launch-immediately --a11y=1 --screen-reader=1 >/dev/null 2>&1 &
atspi_pid=$!
registry_pid=''
cleanup() {
  if [[ -n "$registry_pid" ]]; then kill "$registry_pid" 2>/dev/null || true; fi
  kill "$atspi_pid" 2>/dev/null || true
}
trap cleanup EXIT
address=''
for _ in $(seq 1 50); do
  response=$(gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus \
    --method org.a11y.Bus.GetAddress 2>/dev/null || true)
  if [[ "$response" == *"unix:path="* ]]; then
    address=$(printf '%s\n' "$response" | sed -n "s/^[[:space:]]*('\\([^']*\\)'[,]\{0,1\})$/\\1/p")
    [[ -n "$address" ]] && break
  fi
  sleep 0.1
done
if [[ -z "$address" ]]; then
  echo 'FAIL: AT-SPI accessibility bus did not become ready.' >&2
  exit 1
fi

export AT_SPI_BUS_ADDRESS="$address"
export GTK_A11Y=atspi
export NO_AT_BRIDGE=0
xprop -root -f AT_SPI_BUS 8s -set AT_SPI_BUS "$address" >/dev/null
"$registry_daemon" >/dev/null 2>&1 &
registry_pid=$!
sleep 1
echo 'PASS: D-Bus and AT-SPI session are ready.'
node /opt/app/deploy/e2e-gui-shared-display.mjs
