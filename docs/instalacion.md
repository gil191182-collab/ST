# Instalación en el servidor (IONOS)

Sigue el orden de CLAUDE.md §7. Ningún paso toca CertifAI: Logistics tiene su
propia carpeta (`/opt/logistics/app`), su propia red de Docker (`logistics_red`),
su propia base (volumen `logistics_postgres`) y su propio bloque de Nginx.

> Los comandos se corren en el VPS como administrador (`sudo`).

## 1. Inventario (antes de instalar nada)

Primero se copia el repositorio y se corre el inventario, que **solo lee** información:

```bash
sudo mkdir -p /opt/logistics && cd /opt/logistics
```

```bash
sudo git clone https://github.com/gil191182-collab/ST.git app && cd app
```

```bash
sudo bash infra/scripts/inventario.sh > /tmp/inventario.md
```

Revisar `/tmp/inventario.md`, quitar datos sensibles y pasarlo a `docs/servidor.md`.
**Revisar especialmente:** que los puertos 3100 y 3101 estén libres (si no, cambiar
`WEB_PUERTO_HOST`/`API_PUERTO_HOST` en `.env` y en `infra/nginx/logistics.conf`),
la RAM libre y el disco.

## 2. DNS

El inventario muestra el registro A de `logistics.strateggia.mx` y la IP del
servidor; deben coincidir. Para despachos con subdominio propio hace falta además
un registro `*.logistics.strateggia.mx` apuntando a la misma IP.

## 3. Configuración

```bash
sudo cp .env.example .env && sudo chmod 600 .env && sudo nano .env
```

Generar cada secreto con el comando que viene al lado en `.env.example`.
**La `ARCHIVOS_LLAVE` y la `RESPALDO_CLAVE_GPG` se guardan también fuera del
servidor** (por ejemplo en el gestor de contraseñas de Gil): sin ellas no se
pueden abrir los archivos ni los respaldos.

## 4. Arranque

```bash
sudo docker compose build
```

```bash
sudo docker compose up -d postgres
```

```bash
sudo docker compose --profile herramientas run --rm migrar node db/migrar.js --semillas
```

```bash
sudo docker compose up -d api worker web
```

Contraseñas de Gil y Mayela (la pide sin mostrarla):

```bash
sudo docker compose exec api node apps/api/src/definir-clave.js strateggia gil191182@gmail.com
```

> El correo de Mayela está como `mayela@capturar-correo.invalid` hasta que se
> confirme el real (ver `docs/pendientes.md`).

## 5. Nginx y certificado

```bash
sudo cp infra/nginx/logistics.conf /etc/nginx/sites-available/logistics.conf
```

Primero el certificado (con Nginx sirviendo el reto en el puerto 80):

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d logistics.strateggia.mx -d staging.logistics.strateggia.mx
```

```bash
sudo ln -s /etc/nginx/sites-available/logistics.conf /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` revisa toda la configuración (incluida la de CertifAI) antes de
recargar; si marca error, **no** se recarga y CertifAI sigue igual.

## 6. Respaldos

Instalar `rclone` y configurar el destino fuera de IONOS (`rclone config`), poner
el nombre en `RESPALDO_DESTINO_REMOTO` y programar:

```bash
echo '15 3 * * * root /opt/logistics/app/infra/scripts/respaldo.sh >> /var/log/logistics-respaldo.log 2>&1' | sudo tee /etc/cron.d/logistics-respaldo
```

Probar la restauración (no toca la base real):

```bash
sudo bash infra/scripts/respaldo.sh && sudo bash infra/scripts/probar-restauracion.sh
```

## 7. Publicar versiones

Siempre en `staging` primero; producción solo con la aprobación de Gil.

```bash
sudo bash infra/scripts/publicar.sh <rama-o-etiqueta>
```

Regresar a la versión anterior:

```bash
sudo bash infra/scripts/publicar.sh --regresar
```

## Restaurar un respaldo en producción (emergencia)

1. Detener la app: `sudo docker compose stop api worker web`
2. Descifrar: `gpg -d -o /tmp/base.dump /opt/logistics/respaldos/base-AAAAMMDD-HHMM.dump.gpg`
3. Restaurar: `sudo docker compose exec -T postgres pg_restore -U logistics_admin -d logistics --clean --if-exists < /tmp/base.dump`
4. Arrancar: `sudo docker compose up -d api worker web`

> El paso 3 reemplaza la base. Hacerlo solo con la aprobación de Gil.

## Capacidad

Medido en pruebas (sin usuarios): ~120 MB de RAM para los cuatro contenedores.
Límites puestos en `docker-compose.yml`: 512 MB PostgreSQL, 320 MB API, 192 MB
trabajador, 384 MB web (≈1.4 GB máximo). Con 4 GB compartidos con CertifAI,
medir con `docker stats` antes de abrir a clientes; la recomendación sigue siendo
subir a 4 vCPU y 8 GB.
