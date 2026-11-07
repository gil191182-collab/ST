# Instalación en el servidor (198.251.77.138, IONOS)

Inventario del 7 nov 2026 en `docs/servidor.md`. En el servidor ya corren CertifAI,
VerifyPerson, VerifAI, ReclutAI y servicios auxiliares; todos se publican con el
**Caddy** del contenedor `certifai-caddy` (no hay Nginx).

Logistics usa su propia carpeta (`/opt/logistics/app`), su propia base y su propia
red. Lo único que se agrega fuera de ella es **un bloque al final** de
`/opt/certifai/app/Caddyfile`, con copia de seguridad previa.

> Todos los comandos se pegan en la sesión `ssh root@198.251.77.138`.

## 0. Antes (en horario sin gestores)

1. **Snapshot** en el panel de IONOS: Servidores y nube → el servidor → Snapshots → Crear.
2. **Respaldo de las bases existentes** (solo lee):

```bash
mkdir -p /opt/respaldos-previos && for c in certifai-db verifyperson-db verifai-db reclutai-db; do docker exec $c sh -c 'pg_dumpall -U "$POSTGRES_USER"' | gzip > /opt/respaldos-previos/$c-$(date +%Y%m%d).sql.gz; done; ls -lh /opt/respaldos-previos
```

3. **Cambio a VPS Linux L** (4 vCPU, 8 GB, 240 GB) en el panel. El servidor se reinicia.
4. Comprobar que todo volvió:

```bash
echo "CPUs: $(nproc)"; free -h; df -h /; docker ps --format 'table {{.Names}}\t{{.Status}}'
```

## 1. Descargar Logistics

```bash
mkdir -p /opt/logistics && git clone -b claude/stoic-newton-uisu2d https://github.com/gil191182-collab/ST.git /opt/logistics/app
```

## 2. Instalar (≈10–15 minutos)

```bash
cd /opt/logistics/app && bash infra/scripts/instalar.sh
```

Crea el `.env` con secretos nuevos, construye, crea la base, carga catálogo y pilotos,
arranca y al final pide la contraseña de Gil (no se ve al escribirla).

**Guarde fuera del servidor** `ARCHIVOS_LLAVE` y `RESPALDO_CLAVE_GPG` (sin ellas no se
abren archivos ni respaldos):

```bash
grep -E '^(ARCHIVOS_LLAVE|RESPALDO_CLAVE_GPG)=' /opt/logistics/app/.env
```

## 3. Publicar en https://logistics.strateggia.mx (con aprobación de Gil)

```bash
cd /opt/logistics/app && bash infra/scripts/conectar-caddy.sh
```

Respalda el Caddyfile, agrega el bloque de Logistics al final, conecta Caddy a la red
`logistics-proxy` y recarga **sin reiniciar**. Si algo estuviera mal, Caddy lo rechaza
y los demás sitios siguen igual. Si alguna vez CertifAI recrea su Caddy, basta con
volver a correr este mismo script (no duplica nada).

Para quitarlo: borrar el bloque marcado "Strateggia Logistics" del Caddyfile y
`docker exec certifai-caddy caddy reload --config /etc/caddy/Caddyfile`.

## 4. Primeros pasos en el sistema

1. Entrar como Gil en https://logistics.strateggia.mx
2. **Personas → Cambiar correo** de Mayela al real → **Nuevo enlace** y enviárselo.
3. **Clientes y permisos → Corregir domicilio** de los permisos 0056, 0058 y 0036.

## 5. Respaldos diarios

```bash
apt-get install -y rclone gpg
```

Configurar el destino fuera de IONOS con `rclone config`, poner su nombre en
`RESPALDO_DESTINO_REMOTO` del `.env` y programar:

```bash
echo '15 3 * * * root /opt/logistics/app/infra/scripts/respaldo.sh >> /var/log/logistics-respaldo.log 2>&1' > /etc/cron.d/logistics-respaldo
```

Probar que se puede restaurar (no toca la base real):

```bash
cd /opt/logistics/app && bash infra/scripts/respaldo.sh && bash infra/scripts/probar-restauracion.sh
```

## 6. Conexiones (cuando se tengan)

Ver la tabla "Lo que hay que conectar" en `docs/pendientes.md` (IA, WATI, correo).
Se editan en `/opt/logistics/app/.env` y se aplican con:

```bash
cd /opt/logistics/app && docker compose up -d api worker
```

## Publicar versiones nuevas

Staging primero; producción solo con la aprobación de Gil en el **Chat de
consultores**. El script se niega sin esa aprobación:

```bash
cd /opt/logistics/app && bash infra/scripts/publicar.sh <version>
```

Regresar a la versión anterior:

```bash
cd /opt/logistics/app && bash infra/scripts/publicar.sh --regresar
```
