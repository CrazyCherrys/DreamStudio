#!/usr/bin/env sh
set -eu

mkdir -p "${LOCAL_STORAGE_ROOT:-/data}/image/input" "${LOCAL_STORAGE_ROOT:-/data}/image/output"

npm run db:migrate:deploy
npm run db:init:m0

exec npm run start
