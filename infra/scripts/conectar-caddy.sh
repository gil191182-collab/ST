#!/usr/bin/env bash
# Publica logistics.strateggia.mx a través del Caddy que ya corre en el servidor
# (contenedor certifai-caddy). Hace tres cosas, en orden y con respaldo:
#   1. Copia de seguridad del Caddyfile actual.
#   2. Agrega AL FINAL el bloque de Logistics (no toca los bloques existentes).
#   3. Conecta Caddy a la red logistics-proxy y recarga SIN reiniciar.
#      Si la configuración nueva tuviera un error, Caddy la rechaza y sigue con la anterior.
set -euo pipefail
cd "$(dirname "$0")/../.."
CADDYFILE=/opt/certifai/app/Caddyfile
BLOQUE=infra/caddy/logistics.caddy

if grep -q "logistics.strateggia.mx" "$CADDYFILE"; then
  echo "El Caddyfile ya tiene el bloque de Logistics; no se agrega de nuevo."
else
  cp "$CADDYFILE" "$CADDYFILE.antes-de-logistics-$(date +%Y%m%d-%H%M)"
  { echo; cat "$BLOQUE"; } >> "$CADDYFILE"
  echo "✔ Bloque agregado (copia de seguridad junto al archivo)."
fi

docker network connect logistics-proxy certifai-caddy 2>/dev/null && echo "✔ Caddy conectado a logistics-proxy." || echo "  Caddy ya estaba conectado a logistics-proxy."

if docker exec certifai-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  docker exec certifai-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "✔ Caddy recargado. En 1–2 minutos debe abrir https://logistics.strateggia.mx"
else
  echo "✘ Caddy no aceptó la configuración; NO se recargó y los sitios siguen igual."
  docker exec certifai-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true
  exit 1
fi
