#!/bin/sh
set -e

printf "window.API_BASE_URL = '%s'\n" "$API_BASE_URL" > shared/config.js

VERSION="${VERCEL_GIT_COMMIT_SHA:-$(date +%s)}"
find . -name "*.html" -exec sed -i -E \
  "s#(src|href)=\"([^\"?]+\.(js|css))\"#\1=\"\2?v=${VERSION}\"#g" {} +

# Los <script> del HTML quedan versionados arriba, pero ES modules importan otros
# módulos vía `import ... from '../x.js'` — esas URLs nunca pasan por ese sed, así
# que el navegador/CDN puede seguir sirviendo una copia cacheada de un módulo
# compartido (ej. shared/api.js) mientras el entry point ya se actualizó, rompiendo
# el contrato entre ambos (bug real visto en producción tras PR #138).
find . -name "*.js" -exec sed -i -E \
  "s#(from ['\"])([^'\"?]+\.js)(['\"])#\1\2?v=${VERSION}\3#g" {} +
