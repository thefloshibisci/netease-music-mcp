#!/bin/sh
set -e
mkdir -p /data
node scripts/init-personal-service.js /data
exec node src/personal-server.js
