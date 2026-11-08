#!/usr/bin/env bash
# Se conserva por compatibilidad: el respaldo ahora cubre todo el servidor.
exec "$(dirname "$0")/respaldo-servidor.sh" "$@"
