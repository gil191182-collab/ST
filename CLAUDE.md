# CLAUDE.md — Strateggia Logistics (logistics.strateggia.mx)

## 1. Con quién trabajas

Gil Romero Pérez (Director General, GMI Grupo Strateggia) es el dueño del proyecto. Mayela Romero Pérez (Directora de Logística y Regulación Ferroviaria) es la usuaria principal. Ninguno es programador.

- Explica en español y sin jerga. Si usas un término técnico, defínelo la primera vez.
- Antes de hacer algo, di en una o dos frases qué vas a hacer y por qué. Después, di qué pasó.
- Si algo falla, traduce el error: qué significa y qué opciones hay. No pegues solo el mensaje técnico.
- Las dudas técnicas las resuelves tú. Las de negocio o normativa se preguntan.

## 2. Qué se construye

Una plataforma multi-inquilino para que despachos de consultoría gestionen trámites ferroviarios ante la ATTRAPI (Agencia de Trenes y Transporte Público Integrado): permisos de servicios auxiliares, inicio de operaciones y obligaciones periódicas, completos o por partes.

Strateggia es el primer inquilino y el dueño de la plataforma; después se vende a otros despachos.

La especificación completa está en el documento "Strateggia Logistics — Bosquejo del sistema" y las pantallas en el lienzo "Portal del cliente y tablero de seguimiento". Copias en `/docs`. Léelas antes de proponer arquitectura; no inventes lo que ya está decidido ahí.

## 3. Stack (mismo que CertifAI; no se cambia sin plantearlo)

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL con Row Level Security |
| Backend | Node.js (API + trabajos en segundo plano) |
| Frontend | Next.js + Tailwind |
| Contenedores | Docker + docker-compose, en `/opt/logistics/app` |
| Servidor | VPS Linux M de IONOS, Ubuntu 24.04 (el mismo de CertifAI). La IP va en `.env`, nunca en el código |
| Proxy | Nginx + Let's Encrypt; logistics.strateggia.mx y subdominios por despacho |
| Archivos | Disco del servidor, cifrados, con URLs firmadas; sincronización opcional con Google Drive por despacho |
| WhatsApp | WATI (Strateggia usa su número actual) |
| Correo | Cuenta conectada por despacho (Strateggia: la de Mayela, que recibe las notificaciones de la ATTRAPI) |
| IA | API de Anthropic (Claude) para "Marce": asistente, piloto automático y pre-revisión de documentos |
| Facturación | Fuera del sistema. Aquí solo se registran hitos, orden de compra, folio y estatus |

CertifAI vive en el mismo servidor (`/opt/certifai/app`). **No toques sus contenedores, su base ni su configuración de Nginx.** Logistics usa su propia red de Docker, su propia base y su propio bloque de Nginx.

## 4. Reglas del dominio que NO se negocian

Salen de la normativa y de expedientes reales. Romperlas no es un bug: es un trámite rechazado.

- **Aislamiento por despacho.** Toda tabla operativa lleva `despacho_id` y el aislamiento se aplica con Row Level Security en la base de datos, no en el código.
- **Catálogo versionado.** Cada trámite guarda su homoclave actual (ATTRAPI-xx) y las anteriores (ARTF-xx), con requisitos fechados por vigencia. Un expediente queda ligado a la versión con la que se abrió.
- **Cadena de trámites.** Proyecto Ejecutivo → Permiso (04-010-A / 04-010-B) → Inicio de Operaciones → obligaciones periódicas. Un trámite no se abre si falta el resultado del anterior, salvo que el consultor lo marque como "ya existe fuera del sistema" con su documento.
- **Plazos que se calculan solos.**
  - 180 días naturales desde el permiso para el inicio de operaciones (con prórroga, si existe).
  - Programa de Contingencias: 15 días naturales antes de iniciar y cada 2 años.
  - Pólizas: cada año.
  - Avisos de cambios en la terminal: 15 días naturales.
- **El registro de tarifas es por permiso, no por terminal.**
- **Textos exactos.** El domicilio va idéntico al del permiso, en el mismo orden, con kilómetros de vía y línea. Los endosos de pólizas se comparan palabra por palabra con los textos del catálogo. Ningún documento puede citar a la antigua Agencia Reguladora.
- **Nada se marca como cumplido sin una persona.** La IA propone; un consultor aprueba cada requisito.
- **Acciones que nunca hace el sistema solo:** ingresar ante la autoridad, firmar, enviar un escrito oficial, registrar un cobro. Prepara todo y pide aprobación.
- **Nunca se borra.** Expedientes, documentos y mensajes se archivan, no se eliminan. Toda acción queda en la bitácora con quién la pidió.
- **Referencias autorizadas anónimas.** Los documentos que la autoridad ya aprobó a un cliente se reutilizan como plantilla sin su nombre ni datos.

## 5. Marca por despacho

El despacho sube su logo; el sistema extrae color de fondo y de acento, revisa contraste (4.5:1 mínimo en texto) y aplica la marca al panel, al portal del cliente, a los correos, a los membretes .docx y a los PDF. **Los colores nunca van fijos en componentes: se leen del tema del despacho.**

Strateggia Logistics:

- Fondo: `#1B2440`
- Acento: `#D68C28`
- Botones de acción: `#B35A0C`
- Tipografía: Poppins
- Lema: "Contigo hasta el final"

## 6. Cómo se pasa código a producción

1. Todo cambio va en una rama, con pruebas.
2. Pruebas y reglas de dominio en verde, o no se avanza.
3. Se publica en staging.logistics.strateggia.mx y se avisa qué cambió.
4. Producción solo con clic de aprobación de Gil en el chat de consultores. Antes de publicar: respaldo de la base. Siempre hay botón para regresar a la versión anterior.

Marce puede leer y cambiar todo el código siguiendo este camino. No puede borrar datos, cambiar permisos de usuarios, tocar respaldos ni apagar la bitácora.

## 7. Primera tarea en el servidor

1. Inventario: qué corre hoy (CertifAI, n8n, Nginx, puertos, RAM y disco libres). Documentarlo en `/docs/servidor.md` antes de instalar nada.
2. Confirmar que el registro A de logistics.strateggia.mx apunta al servidor.
3. Crear `/opt/logistics/app` con docker-compose (app, api, worker, postgres propio), bloque de Nginx y certificado.
4. Respaldo diario de la base y los archivos, con copia fuera de IONOS, probado con una restauración.
5. Cargar el catálogo inicial y los expedientes piloto:
   - KERI (Inicio de Operaciones, vence el 2 dic 2026)
   - Bulkmatic Atitalaquia (Registro de Tarifas)
   - SFM (Programa de Contingencias)

**Advertencia de capacidad:** el VPS tiene 2 vCPU y 4 GB compartidos con CertifAI. Mide consumo y avisa antes de abrir el sistema a clientes; la recomendación es subir a 4 vCPU y 8 GB.
