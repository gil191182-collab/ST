#!/usr/bin/env bash
# Respaldo de TODO el servidor (todos los sistemas, no solo Logistics).
#
#  Diario:
#   - Bases de datos de todos los contenedores PostgreSQL (CertifAI, VerifyPerson,
#     VerifAI, ReclutAI, Logistics, y cualquiera nuevo), con pg_dumpall. Solo LEE.
#   - Configuración: Caddyfile, .env y docker-compose de cada sistema en /opt.
#   - Documentos de Logistics (volumen logistics_archivos, ya cifrados).
#  Semanal (domingo, o con COMPLETO=1):
#   - Código y archivos de /opt (sin node_modules ni compilados) y los volúmenes de
#     Docker que no son bases de datos (archivos subidos, certificados, etc.).
#
#  Todo se cifra con GPG (RESPALDO_CLAVE_GPG) y se copia fuera de IONOS con rclone
#  (RESPALDO_DESTINO_REMOTO). Conserva: local 7 días / 2 semanas; remoto 15 días / 4 semanas
#  (configurable con RESPALDO_DIAS_DIARIO_REMOTO y RESPALDO_DIAS_SEMANAL_REMOTO).
#
#  Cron sugerido: 15 3 * * * root /opt/logistics/app/infra/scripts/respaldo-servidor.sh >> /var/log/respaldo-servidor.log 2>&1
set -uo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env; set +a

: "${RESPALDO_CLAVE_GPG:?Falta RESPALDO_CLAVE_GPG en .env}"
DESTINO=${RESPALDO_CARPETA:-/opt/respaldos}
OPT=${RESPALDO_OPT:-/opt}
FECHA=$(date +%Y%m%d-%H%M)
SEMANAL=0
[[ "$(date +%u)" == "7" || "${COMPLETO:-0}" == "1" ]] && SEMANAL=1
TIPO=$([[ $SEMANAL == 1 ]] && echo semanal || echo diario)
SALIDA="$DESTINO/$TIPO/$FECHA"
TMP=$(mktemp -d)
ERR=$(mktemp)
trap 'rm -rf "$TMP" "$ERR"' EXIT
mkdir -p "$SALIDA"; chmod 700 "$DESTINO"
errores=0
log() { echo "[$(date '+%F %T')] $*"; }
fallo() { log "✘ $*"; errores=$((errores + 1)); }

log "Respaldo $TIPO $FECHA → $SALIDA"

# 1. Bases de datos de todos los sistemas
for c in $(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /^postgres/ {print $1}'); do
  archivo="$TMP/base-$c.sql.gz"
  if docker exec "$c" sh -c 'pg_dumpall -U "${POSTGRES_USER:-postgres}"' 2>"$ERR" | gzip > "$archivo" \
     && [[ $(gzip -dc "$archivo" | head -c 2000 | wc -c) -ge 1000 ]]; then
    log "  ✔ base $c ($(du -h "$archivo" | cut -f1))"
  else
    fallo "base $c: $(head -c 300 "$ERR")"
  fi
done

# 2. Configuración de cada sistema
find "$OPT" -maxdepth 3 \( -name '.env' -o -name '.env.*' -o -name 'docker-compose*.yml' -o -name 'compose*.yml' -o -name 'Caddyfile' -o -name '.versiones' \) \
  -not -path '*/node_modules/*' -not -path "$DESTINO/*" -not -path "$OPT/respaldos*" -print0 2>/dev/null \
  | tar czf "$TMP/configuracion.tar.gz" --null -T - 2>/dev/null \
  && log "  ✔ configuración ($(tar tzf "$TMP/configuracion.tar.gz" | wc -l) archivos)" || fallo "configuración"
cp /etc/cron.d/*respaldo* "$TMP/" 2>/dev/null || true

# 3. Documentos de Logistics
if docker volume inspect logistics_archivos >/dev/null 2>&1; then
  docker run --rm -v logistics_archivos:/datos:ro -v "$TMP":/salida alpine tar czf /salida/logistics-archivos.tar.gz -C /datos . \
    && log "  ✔ documentos de Logistics" || fallo "documentos de Logistics"
fi

# 4. Semanal: código, archivos de /opt y volúmenes que no son bases de datos
if [[ $SEMANAL == 1 ]]; then
  # Carpetas que no se respaldan cada semana (historial que ya no cambia). Separadas por espacio.
  excluir=$(echo "containerd ${RESPALDO_OPT_EXCLUIR:-}" | tr ' ' '\n' | grep -v '^$' | paste -sd'|')
  carpetas=$(cd "$OPT" && ls -d */ 2>/dev/null | tr -d '/' | grep -vE "^(${excluir}|respaldos.*)$")
  [[ -n "${RESPALDO_OPT_EXCLUIR:-}" ]] && log "  (no se incluyen cada semana: ${RESPALDO_OPT_EXCLUIR})"
  (cd "$OPT" && tar czf "$TMP/opt-codigo-y-archivos.tar.gz" --exclude='node_modules' --exclude='.next' --exclude='.git' $carpetas 2>/dev/null) \
    && log "  ✔ código y archivos de /opt ($(du -h "$TMP/opt-codigo-y-archivos.tar.gz" | cut -f1))" || fallo "código de /opt"
  # Volúmenes de Docker que NO son de PostgreSQL (esos ya están en el paso 1)
  vols=$(docker ps -q | xargs -r docker inspect -f '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}|{{.Destination}}{{"\n"}}{{end}}{{end}}' \
         | grep -v '|/var/lib/postgresql' | cut -d'|' -f1 | sort -u | grep -v '^logistics_archivos$' || true)
  for v in $vols; do
    docker run --rm -v "$v":/datos:ro -v "$TMP":/salida alpine tar czf "/salida/volumen-$v.tar.gz" -C /datos . \
      && log "  ✔ volumen $v" || fallo "volumen $v"
  done
fi

# 5. Cifrar y guardar
for f in "$TMP"/*; do
  [[ -f "$f" ]] || continue
  gpg --batch --yes --pinentry-mode loopback --passphrase "$RESPALDO_CLAVE_GPG" --symmetric --cipher-algo AES256 \
    -o "$SALIDA/$(basename "$f").gpg" "$f" || fallo "cifrar $(basename "$f")"
done
(cd "$SALIDA" && sha256sum *.gpg > SUMAS.txt)
log "  Total: $(du -sh "$SALIDA" | cut -f1)"

# 6. Copia fuera de IONOS
if [[ -n "${RESPALDO_DESTINO_REMOTO:-}" ]]; then
  if rclone copy "$SALIDA" "$RESPALDO_DESTINO_REMOTO/$TIPO/$FECHA" --transfers 2 --retries 5; then
    log "  ✔ copiado a $RESPALDO_DESTINO_REMOTO/$TIPO/$FECHA"
    rclone delete "$RESPALDO_DESTINO_REMOTO/diario" --min-age "${RESPALDO_DIAS_DIARIO_REMOTO:-15}d" 2>/dev/null || true
    rclone delete "$RESPALDO_DESTINO_REMOTO/semanal" --min-age "${RESPALDO_DIAS_SEMANAL_REMOTO:-29}d" 2>/dev/null || true
    rclone rmdirs "$RESPALDO_DESTINO_REMOTO" --leave-root 2>/dev/null || true
  else
    fallo "copia fuera de IONOS ($RESPALDO_DESTINO_REMOTO)"
  fi
else
  log "  AVISO: RESPALDO_DESTINO_REMOTO vacío; el respaldo solo quedó en este servidor."
fi

# 7. Limpieza local
find "$DESTINO/diario" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
find "$DESTINO/semanal" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} + 2>/dev/null || true

echo "$FECHA $TIPO errores=$errores" > "$DESTINO/ULTIMO.txt"
if [[ $errores -gt 0 ]]; then log "✘ Terminó con $errores error(es)."; exit 1; fi
log "✔ Respaldo $TIPO terminado sin errores."
