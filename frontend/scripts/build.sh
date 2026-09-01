#!/bin/sh
set -eu

RUNTIME_CONFIG_MODE="${RUNTIME_CONFIG_MODE:-embedded}"

case "$RUNTIME_CONFIG_MODE" in
  embedded)
    : "${API_BASE_URL:?API_BASE_URL es obligatorio en modo embedded}"

    COOKIE_CSRF_NAME="${COOKIE_CSRF_NAME:-tajy_csrf}"

    {
      printf "window.API_BASE_URL = '%s'\n" "$API_BASE_URL"
      printf "window.COOKIE_CSRF_NAME = '%s'\n" "$COOKIE_CSRF_NAME"
    } > shared/config.js
    ;;

  external)
    # En releases del VPS, config.js pertenece al entorno y no al artifact.
    # Debe ser materializado por deploy-test/promote-prod.
    rm -f shared/config.js
    ;;

  *)
    echo "RUNTIME_CONFIG_MODE inválido: $RUNTIME_CONFIG_MODE" >&2
    echo "Valores permitidos: embedded | external" >&2
    exit 1
    ;;
esac

VERSION="${BUILD_VERSION:-${VERCEL_GIT_COMMIT_SHA:-$(date +%s)}}"

find . -name "*.html" -exec sed -i -E \
  "s#(src|href)=\"([^\"?]+\.(js|css))\"#\1=\"\2?v=${VERSION}\"#g" {} +

# Los <script> del HTML quedan versionados arriba, pero ES modules importan otros
# módulos vía `import ... from '../x.js'` — esas URLs nunca pasan por ese sed, así
# que el navegador/CDN puede seguir sirviendo una copia cacheada de un módulo
# compartido (ej. shared/api.js) mientras el entry point ya se actualizó, rompiendo
# el contrato entre ambos (bug real visto en producción tras PR #138).
find . -name "*.js" -exec sed -i -E \
  "s#(from ['\"])([^'\"?]+\.js)(['\"])#\1\2?v=${VERSION}\3#g" {} +
