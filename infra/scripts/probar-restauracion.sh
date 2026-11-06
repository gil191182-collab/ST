#!/usr/bin/env bash
# Prueba que el último respaldo SÍ se puede restaurar, sin tocar la base real.
# Levanta un PostgreSQL temporal, restaura ahí y compara conteos con producción.
# Uso: bash infra/scripts/probar-restauracion.sh [carpeta-de-respaldos]
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env; set +a

DESTINO=${1:-${RESPALDO_CARPETA:-/opt/logistics/respaldos}}
ULTIMO=$(ls -t "$DESTINO"/base-*.dump.gpg | head -1)
[[ -f "$ULTIMO" ]] || { echo "No hay respaldos en $DESTINO"; exit 1; }
echo "Probando: $ULTIMO"

TMP=$(mktemp -d); trap 'docker rm -f logistics-prueba-restauracion >/dev/null 2>&1; rm -rf "$TMP"' EXIT
gpg --batch --pinentry-mode loopback --passphrase "$RESPALDO_CLAVE_GPG" -d -o "$TMP/base.dump" "$ULTIMO"

docker run -d --name logistics-prueba-restauracion -e POSTGRES_PASSWORD=prueba -e POSTGRES_DB=logistics postgres:16-alpine >/dev/null
until docker exec logistics-prueba-restauracion pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
docker exec logistics-prueba-restauracion psql -U postgres -qc "CREATE ROLE logistics_app NOLOGIN; CREATE ROLE logistics_admin NOLOGIN;"
docker cp "$TMP/base.dump" logistics-prueba-restauracion:/tmp/base.dump
docker exec logistics-prueba-restauracion pg_restore -U postgres -d logistics --no-owner /tmp/base.dump

CONSULTA="SELECT 'expedientes', count(*) FROM expedientes UNION ALL SELECT 'requisitos', count(*) FROM expediente_requisitos
          UNION ALL SELECT 'documentos', count(*) FROM documentos UNION ALL SELECT 'bitacora', count(*) FROM bitacora"
echo; echo "Restaurado:"
docker exec logistics-prueba-restauracion psql -U postgres -d logistics -At -c "$CONSULTA"
echo; echo "Producción (puede tener más filas si hubo actividad después del respaldo):"
docker compose exec -T postgres psql -U logistics_admin -d logistics -At -c "$CONSULTA"

# Archivos: que el tar se pueda leer completo
ULTIMO_ARCH=$(ls -t "$DESTINO"/archivos-*.tar.gz.gpg | head -1)
gpg --batch --pinentry-mode loopback --passphrase "$RESPALDO_CLAVE_GPG" -d "$ULTIMO_ARCH" | tar tzf - | wc -l | xargs echo "Archivos en el respaldo:"
echo; echo "✔ Restauración probada."
