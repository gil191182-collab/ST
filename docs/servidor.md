# Servidor (inventario del 7 nov 2026, antes de instalar)

- **Equipo:** VPS de IONOS, Ubuntu 24.04.4 LTS, 2 vCPU, 3.7 GB RAM, 2 GB swap (42% en uso).
  Disco 116 GB, 81% usado (23 GB libres). Aviso "System restart required" y 62 actualizaciones pendientes.
- **Dominio:** `logistics.strateggia.mx` ya apunta a este servidor.
- **Proxy:** Caddy 2 en el contenedor `certifai-caddy` (puertos 80/443), configurado en
  `/opt/certifai/app/Caddyfile`, redes `app_interna` y `vp-proxy`. No hay Nginx.
- **Puertos ocupados en el equipo:** 22 (ssh), 80/443 (Caddy), 3478 (coturn), 53 (DNS local).
  Libres los que usa Logistics: 3100 y 3101 (solo en 127.0.0.1).
- **Carpetas en /opt:** certifai, compartido, containerd, reclutai, verifaicompany,
  verifyperson, verifyperson-anterior, verifyperson-historico.

## Contenedores y memoria

| Contenedor | Memoria |
|---|---|
| certifai-app | 348 MB |
| verifyperson-app | 311 MB |
| verifyperson-db | 222 MB |
| reclutai-app | 79 MB |
| wa-mcp | 73 MB |
| pauta-mcp | 59 MB |
| verifai-db | 47 MB |
| reclutai-db | 43 MB |
| verifai-app | 39 MB |
| li-mcp | 36 MB |
| verifyperson-turn | 33 MB |
| certifai-caddy | 31 MB |
| certifai-db | 23 MB |
| **Total** | **≈1.3 GB** |

Logistics agrega ≈200 MB en uso normal; construirlo pide más memoria por unos minutos.

## Decisión de capacidad

Subir a **VPS Linux L** (4 vCPU, 8 GB RAM, 240 GB NVMe) antes de instalar, en horario
sin gestores, con snapshot previo (CLAUDE.md §7).

## Aclaración

`servidor-ionos/` del repositorio describe el servidor Windows de VerifyPerson /
CertifAIPerson (62.151.183.215), que es otro equipo.
