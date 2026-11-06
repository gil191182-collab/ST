# Servidor (inventario)

> **Pendiente.** Este archivo se llena con la salida de
> `infra/scripts/inventario.sh` corrida en el VPS de IONOS **antes de instalar
> nada** (CLAUDE.md §7.1). Hasta entonces no se ha tocado el servidor.

Datos que debe contener:

- Sistema, CPU, RAM y disco libres
- Contenedores corriendo (CertifAI, n8n, otros) y su consumo
- Puertos ocupados (confirmar que 3100 y 3101 están libres)
- Bloques de Nginx activos y certificados
- Registro A de logistics.strateggia.mx vs. IP del servidor

## Duda abierta

`servidor-ionos/README.md` describe el servidor de CertifAI como **Windows Server
con IIS**, mientras que CLAUDE.md lo describe como **Ubuntu 24.04 con Docker**.
Hay que confirmar cuál es antes de instalar: todo lo de `infra/` supone Ubuntu
con Docker.
