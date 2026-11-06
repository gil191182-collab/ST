#!/usr/bin/env bash
# Inventario del servidor (SOLO LECTURA). No instala, no cambia, no reinicia nada.
# Uso en el VPS:   sudo bash infra/scripts/inventario.sh > inventario.md
# Luego se revisa, se quitan datos sensibles y se copia a docs/servidor.md.
set -u

t() { echo; echo "## $1"; echo; echo '```'; }
f() { echo '```'; }

echo "# Inventario del servidor — $(date '+%Y-%m-%d %H:%M %Z')"

t "Sistema"
hostnamectl 2>/dev/null | grep -Ev 'Machine ID|Boot ID' ; uname -r; uptime
f

t "CPU y memoria"
nproc; free -h
f

t "Disco"
df -h -x tmpfs -x devtmpfs
echo; du -sh /opt/* 2>/dev/null
f

t "Docker: contenedores"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo "Docker no disponible"
f

t "Docker: consumo actual"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null
f

t "Docker: redes y volúmenes"
docker network ls 2>/dev/null; echo; docker volume ls 2>/dev/null
f

t "Proyectos de docker compose"
docker compose ls 2>/dev/null
f

t "Puertos escuchando"
ss -tlnp 2>/dev/null | awk 'NR==1 || /LISTEN/' | sed -E 's/users:\(\("([^"]+)".*/\1/'
f

t "Nginx"
nginx -v 2>&1; nginx -t 2>&1 | tail -2
echo; ls -l /etc/nginx/sites-enabled/ 2>/dev/null
echo; grep -h "server_name" /etc/nginx/sites-enabled/* 2>/dev/null | sort -u
f

t "Certificados (Let's Encrypt)"
certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry' || ls /etc/letsencrypt/live 2>/dev/null
f

t "n8n"
docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | grep -i n8n || systemctl is-active n8n 2>/dev/null || echo "No se encontró n8n"
f

t "Tareas programadas (cron)"
crontab -l 2>/dev/null; ls /etc/cron.d 2>/dev/null
f

t "DNS de logistics.strateggia.mx"
echo "Registro A:  $(dig +short A logistics.strateggia.mx 2>/dev/null || getent hosts logistics.strateggia.mx)"
echo "IP pública de este servidor: $(curl -s4 --max-time 5 https://ifconfig.me || echo 'no se pudo consultar')"
f

t "Firewall"
ufw status 2>/dev/null || iptables -S 2>/dev/null | head -20
f
