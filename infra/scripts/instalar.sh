#!/usr/bin/env bash
# Instalación de Strateggia Logistics en el servidor (primera vez).
# Uso:  cd /opt/logistics/app && bash infra/scripts/instalar.sh
# No toca CertifAI ni los otros sistemas. Conectar Caddy es un paso aparte
# (infra/scripts/conectar-caddy.sh) que se hace con la aprobación de Gil.
set -euo pipefail
cd "$(dirname "$0")/../.."

paso() { echo; echo "▶ $1"; }

paso "1/6 Configuración (.env)"
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  poner() { sed -i "s|^$1=.*|$1=$2|" .env; }
  poner DB_ADMIN_PASSWORD "$(openssl rand -hex 24)"
  poner APP_DB_PASSWORD "$(openssl rand -hex 24)"
  poner APP_SECRETO "$(openssl rand -hex 48)"
  poner ARCHIVOS_LLAVE "$(openssl rand -base64 32)"
  poner ENTRADAS_TOKEN "$(openssl rand -hex 24)"
  poner RESPALDO_CLAVE_GPG "$(openssl rand -hex 24)"
  poner SERVIDOR_IP "$(curl -s4 --max-time 5 ifconfig.me || true)"
  echo "  .env creado con secretos nuevos."
  echo "  IMPORTANTE: guarde una copia de ARCHIVOS_LLAVE y RESPALDO_CLAVE_GPG fuera del servidor."
else
  echo "  .env ya existe; no se cambia."
fi

paso "2/6 Red para el proxy"
docker network inspect logistics-proxy >/dev/null 2>&1 || docker network create logistics-proxy >/dev/null
echo "  Red logistics-proxy lista."

paso "3/6 Construyendo (puede tardar 5–10 minutos)"
docker compose build

paso "4/6 Base de datos"
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U logistics_admin -d logistics >/dev/null 2>&1; do sleep 2; done
docker compose --profile herramientas run --rm migrar node db/migrar.js --semillas

paso "5/6 Arrancando la aplicación"
docker compose up -d api worker web
for i in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:${API_PUERTO_HOST:-3101}/api/salud" >/dev/null 2>&1 && break; sleep 2
done
curl -fsS "http://127.0.0.1:${API_PUERTO_HOST:-3101}/api/salud" && echo "  ✔ API arriba."
curl -fsS -o /dev/null "http://127.0.0.1:${WEB_PUERTO_HOST:-3100}/entrar" && echo "  ✔ Panel arriba."

paso "6/6 Contraseña del director (Gil)"
# La contraseña se pide aquí (read -s: no se ve ni queda en el historial) y se pasa al contenedor
CLAVE=""
until [[ ${#CLAVE} -ge 10 ]]; do
  read -r -s -p "  Contraseña nueva para Logistics (mínimo 10 caracteres): " CLAVE; echo
  [[ ${#CLAVE} -ge 10 ]] || echo "  Debe tener al menos 10 caracteres. Intente de nuevo."
done
docker compose exec -T -e CLAVE_NUEVA="$CLAVE" api node apps/api/src/definir-clave.js strateggia gil191182@gmail.com
unset CLAVE

echo
echo "✔ Logistics instalado. Siguiente paso: conectar Caddy (bash infra/scripts/conectar-caddy.sh)."
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}' | grep -E "NAME|logistics"
