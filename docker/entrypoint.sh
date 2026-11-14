#!/bin/sh
# KTD14: the same steps as `npm run start:standalone`: apply migrations, then start the server.
set -e
cd /app
node dist-cli/migrate.mjs
exec node server/start.mjs
