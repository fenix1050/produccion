#!/bin/sh
set -e

printf "window.API_BASE_URL = '%s'\n" "$API_BASE_URL" > shared/config.js

VERSION="${VERCEL_GIT_COMMIT_SHA:-$(date +%s)}"
find . -name "*.html" -exec sed -i -E \
  "s#(src|href)=\"([^\"?]+\.(js|css))\"#\1=\"\2?v=${VERSION}\"#g" {} +
