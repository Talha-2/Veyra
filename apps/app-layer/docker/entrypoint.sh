#!/bin/sh
# Turns runtime environment into php.ini overrides, then runs the server.
#
# conf.d files load alphabetically; "zz-" sorts after "99-app.ini", so what is
# written here wins. Only settings a developer flips per session belong here.
set -e

cat > /usr/local/etc/php/conf.d/zz-runtime.ini <<EOF
; Written by docker/entrypoint.sh from the container environment.
opcache.validate_timestamps = ${OPCACHE_VALIDATE_TIMESTAMPS:-0}
EOF

exec "$@"
