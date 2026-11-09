#!/usr/bin/env bash
# Vigilante de Logistics (cron cada 5 minutos). Si la página no responde porque:
#   - Caddy (certifai-caddy) perdió la conexión a la red logistics-proxy
#     (pasa cuando CertifAI reinicia o recrea su Caddy), o
#   - algún contenedor de Logistics está detenido,
# lo vuelve a conectar / encender. NO reinicia ni modifica nada de CertifAI:
# solo conecta su Caddy a la red de Logistics, igual que conectar-caddy.sh.
set -uo pipefail
cd "$(dirname "$0")/../.."
LOG=/var/log/logistics-vigilante.log
anotar() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# 1. Contenedores de Logistics encendidos
for s in postgres api worker web; do
  if [ "$(docker compose ps -q --status running "$s" 2>/dev/null)" = "" ]; then
    anotar "$s estaba detenido: se enciende."
    docker compose up -d "$s" >> "$LOG" 2>&1
  fi
done

# 2. Caddy conectado a la red de Logistics
if docker ps --format '{{.Names}}' | grep -qx certifai-caddy; then
  if ! docker network inspect logistics-proxy --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -qw certifai-caddy; then
    anotar "Caddy no estaba conectado a logistics-proxy: se reconecta."
    docker network connect logistics-proxy certifai-caddy >> "$LOG" 2>&1 || anotar "No se pudo reconectar Caddy."
  fi
fi
