#!/usr/bin/env bash
# Prueba que el último respaldo SÍ se puede restaurar, sin tocar nada real:
# levanta un PostgreSQL temporal, restaura ahí cada base y cuenta sus tablas.
# Uso: bash infra/scripts/probar-restauracion.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env; set +a
DESTINO=${RESPALDO_CARPETA:-/opt/respaldos}

ULTIMO=$(ls -dt "$DESTINO"/diario/* "$DESTINO"/semanal/* 2>/dev/null | head -1)
[[ -n "$ULTIMO" ]] || { echo "No hay respaldos en $DESTINO"; exit 1; }
echo "Probando el respaldo: $ULTIMO"
(cd "$ULTIMO" && sha256sum -c --quiet SUMAS.txt) && echo "✔ Archivos íntegros (sumas de verificación)" || { echo "✘ Algún archivo está dañado"; exit 1; }

TMP=$(mktemp -d)
NOMBRE=prueba-restauracion-$$
trap 'docker rm -f $NOMBRE >/dev/null 2>&1; rm -rf "$TMP"' EXIT

fallas=0
for g in "$ULTIMO"/base-*.sql.gz.gpg; do
  [[ -f "$g" ]] || continue
  base=$(basename "$g" .sql.gz.gpg); base=${base#base-}
  gpg --batch --quiet --pinentry-mode loopback --passphrase "$RESPALDO_CLAVE_GPG" -d "$g" > "$TMP/b.sql.gz" || { echo "✘ $base: no se pudo descifrar"; fallas=$((fallas+1)); continue; }
  # Cada base se restaura en un PostgreSQL temporal y limpio, que después se elimina
  docker rm -f $NOMBRE >/dev/null 2>&1
  docker run -d --name $NOMBRE -e POSTGRES_PASSWORD=prueba postgres:17-alpine >/dev/null
  until docker exec $NOMBRE pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
  sleep 2
  gzip -dc "$TMP/b.sql.gz" | docker exec -i $NOMBRE psql -U postgres -q -v ON_ERROR_STOP=0 >"$TMP/salida" 2>&1
  resumen=$(docker exec $NOMBRE psql -U postgres -Atc "SELECT datname FROM pg_database WHERE datname NOT IN ('template0','template1')" | while read -r db; do
    n=$(docker exec $NOMBRE psql -U postgres -d "$db" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")
    [[ "$n" -gt 0 ]] && echo -n "$db: $n tablas; "
  done)
  if [[ -n "$resumen" ]]; then echo "✔ $base → $resumen"; else echo "✘ $base: no se restauró ninguna tabla"; fallas=$((fallas+1)); fi
done

for g in "$ULTIMO"/*.tar.gz.gpg; do
  [[ -f "$g" ]] || continue
  n=$(gpg --batch --quiet --pinentry-mode loopback --passphrase "$RESPALDO_CLAVE_GPG" -d "$g" | tar tzf - 2>/dev/null | wc -l)
  if [[ $n -gt 0 ]]; then echo "✔ $(basename "$g" .tar.gz.gpg): $n archivos"; else echo "✘ $(basename "$g"): vacío o dañado"; fallas=$((fallas+1)); fi
done

[[ $fallas -eq 0 ]] && echo "✔ Restauración probada: todo se puede recuperar." || { echo "✘ $fallas problema(s)."; exit 1; }
