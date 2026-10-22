#!/bin/sh
set -eu

exec /usr/bin/chromium --disable-setuid-sandbox --force-renderer-accessibility "$@"
