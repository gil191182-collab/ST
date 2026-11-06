#!/usr/bin/env bash
# Publica una versión (rama/etiqueta de git) con respaldo previo y opción de regresar.
#
#   bash infra/scripts/publicar.sh <version>     → respalda, construye, migra y arranca
#   bash infra/scripts/publicar.sh --regresar    → vuelve a la versión anterior
#
# Producción solo se publica después de la aprobación de Gil (CLAUDE.md §6).
# Este script NO decide eso: lo corre una persona cuando ya hay aprobación.
set -euo pipefail
cd "$(dirname "$0")/../.."

ARCHIVO_VERSIONES=.versiones   # historial: una versión por línea, la última es la actual

if [[ "${1:-}" == "--regresar" ]]; then
  ANTERIOR=$(tail -2 "$ARCHIVO_VERSIONES" | head -1)
  [[ -n "$ANTERIOR" ]] || { echo "No hay versión anterior registrada."; exit 1; }
  echo "Regresando a $ANTERIOR (las imágenes ya existen; no se reconstruye)…"
  echo "OJO: si la versión nueva cambió la base, restaure el respaldo previo con docs/instalacion.md §Restaurar."
  VERSION=$ANTERIOR docker compose up -d api worker web
  echo "$ANTERIOR" >> "$ARCHIVO_VERSIONES"
  exit 0
fi

VERSION=${1:?Indique la versión (rama o etiqueta de git)}
ENTORNO=${PUBLICAR_ENTORNO:-produccion}   # en el servidor de staging: PUBLICAR_ENTORNO=staging en .env

echo "Descargando $VERSION…"
git fetch --tags origin
git checkout --quiet "$VERSION"
ETIQUETA=$(git rev-parse --short HEAD)

if [[ "$ENTORNO" == "produccion" ]]; then
  # Regla de CLAUDE.md §6: producción solo con el clic de aprobación de Gil en el chat.
  APROBACION=$(docker compose exec -T postgres psql -U logistics_admin -d logistics -At \
    -c "SELECT aprobada_por || ' el ' || to_char(aprobada_en, 'YYYY-MM-DD HH24:MI') FROM publicacion_aprobada('$ETIQUETA')")
  if [[ -z "$APROBACION" ]]; then
    echo "✘ La versión $ETIQUETA no tiene aprobación del director para producción."
    echo "  Solicítela en el chat de consultores (versión: $ETIQUETA) y vuelva a correr este script."
    exit 1
  fi
  echo "✔ Aprobada por $APROBACION"
fi

echo "1/5 Respaldo previo de la base…"
bash infra/scripts/respaldo.sh
echo "2/5 Versión $ETIQUETA lista."

echo "3/5 Construyendo imágenes $ETIQUETA…"
VERSION=$ETIQUETA docker compose build

echo "4/5 Aplicando migraciones…"
VERSION=$ETIQUETA docker compose --profile herramientas run --rm migrar

echo "5/5 Arrancando…"
VERSION=$ETIQUETA docker compose up -d api worker web
echo "$ETIQUETA" >> "$ARCHIVO_VERSIONES"
if [[ "$ENTORNO" == "produccion" ]]; then
  docker compose exec -T postgres psql -U logistics_admin -d logistics -qc \
    "UPDATE publicaciones SET estado = 'publicada', publicada_en = now() WHERE id = (SELECT id FROM publicacion_aprobada('$ETIQUETA'))"
fi

sleep 5
docker compose ps
curl -fsS "http://127.0.0.1:${API_PUERTO_HOST:-3101}/api/salud" && echo " ✔ Versión $ETIQUETA arriba."
