#!/bin/sh
# R3: `docker compose exec -it kindwords reset-password`, then type the new password.
cd /app && exec node dist-cli/reset-password.mjs "$@"
