#!/usr/bin/env bash
# Respaldo diario de la base y de los archivos de Logistics.
#  - Base: pg_dump en formato comprimido.
#  - Archivos: el volumen de archivos (ya van cifrados con ARCHIVOS_LLAVE).
#  - Todo se cifra con GPG antes de salir del servidor.
#  - Copia fuera de IONOS con rclone (RESPALDO_DESTINO_REMOTO).
#  - Conserva 14 diarios locales.
# Cron sugerido (3:15 a.m.):  15 3 * * * /opt/logistics/app/infra/scripts/respaldo.sh >> /var/log/logistics-respaldo.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env; set +a

DESTINO=${RESPALDO_CARPETA:-/opt/logistics/respaldos}
FECHA=$(date +%Y%m%d-%H%M)
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

echo "[$(date)] Respaldando base…"
docker compose exec -T postgres pg_dump -U logistics_admin -d logistics -Fc > "$DESTINO/base-$FECHA.dump"

echo "[$(date)] Respaldando archivos…"
docker run --rm -v logistics_archivos:/datos:ro -v "$DESTINO":/salida alpine \
  tar czf "/salida/archivos-$FECHA.tar.gz" -C /datos .

for f in "$DESTINO/base-$FECHA.dump" "$DESTINO/archivos-$FECHA.tar.gz"; do
  gpg --batch --yes --pinentry-mode loopback --passphrase "$RESPALDO_CLAVE_GPG" --symmetric --cipher-algo AES256 -o "$f.gpg" "$f"
  rm -f "$f"
done
sha256sum "$DESTINO"/*-"$FECHA".*.gpg > "$DESTINO/sumas-$FECHA.txt"

if [[ -n "${RESPALDO_DESTINO_REMOTO:-}" ]]; then
  echo "[$(date)] Copiando fuera de IONOS a $RESPALDO_DESTINO_REMOTO…"
  rclone copy "$DESTINO" "$RESPALDO_DESTINO_REMOTO" --include "*-$FECHA.*"
else
  echo "AVISO: RESPALDO_DESTINO_REMOTO vacío; el respaldo solo quedó en este servidor." >&2
fi

find "$DESTINO" -type f -mtime +14 -delete
echo "[$(date)] Respaldo $FECHA terminado."
