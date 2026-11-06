# Strateggia Logistics

Plataforma para que despachos de consultoría gestionen trámites ferroviarios ante
la ATTRAPI. Las reglas del proyecto están en [CLAUDE.md](CLAUDE.md).

## Cómo está armado

| Carpeta | Qué es |
|---|---|
| `db/migraciones` | Estructura de la base y **reglas que viven en la base**: aislamiento por despacho (RLS), nada se borra, solo personas aprueban, cadena de trámites, versión de catálogo congelada, bitácora inmutable |
| `db/semillas` | Catálogo inicial y expedientes piloto (KERI, Bulkmatic Atitalaquia, SFM) |
| `packages/dominio` | Reglas del negocio sin base de datos: plazos, textos exactos, revisión automática, colores de marca y contraste |
| `apps/api` | API (Fastify), Marce (Claude), trabajador en segundo plano, envío por WhatsApp/correo **solo de lo aprobado** |
| `apps/web` | Panel de consultores y portal del cliente (Next.js + Tailwind) |
| `infra` | Nginx, inventario del servidor, respaldos, prueba de restauración y publicación con regreso |
| `docs` | Instalación, servidor, pendientes |

## Reglas que no se negocian y dónde se cumplen

| Regla (CLAUDE.md §4) | Dónde |
|---|---|
| Aislamiento por despacho | Políticas RLS en `001_base.sql`; la app usa el rol `logistics_app` sin `BYPASSRLS` |
| Catálogo versionado | `tramite_versiones` + disparador `VERSION_CONGELADA` |
| Cadena de trámites | Disparador `CADENA_INCOMPLETA` (excepción: antecedente externo **con documento**) |
| Plazos automáticos | `packages/dominio/src/plazos.js` + trabajador |
| Textos exactos / antigua Agencia | `packages/dominio/src/textos.js` y `revision.js` |
| Nada cumplido sin persona | Restricción `aprobado_requiere_persona` + disparador `SOLO_PERSONAS` |
| Acciones que el sistema nunca hace solo | Restricción `acciones_solo_humanas`; el trabajador solo envía lo aprobado |
| Nunca se borra | Disparadores `NUNCA_SE_BORRA` en todas las tablas; la app no tiene permiso `DELETE` |
| Bitácora con quién lo pidió | Disparador en cada tabla; `BITACORA_INMUTABLE` |

Cada una tiene su prueba en `apps/api/test/reglas-db.test.js`.

## Pruebas

Necesitan PostgreSQL 16. Con uno local en el puerto 5433:

```bash
npm install && npm test
```

## Desarrollo local

```bash
DATABASE_ADMIN_URL=postgresql://postgres@localhost:5433/logistics APP_DB_PASSWORD=dev npm run sembrar
```

```bash
DATABASE_URL=postgresql://logistics_app:dev@localhost:5433/logistics npm run dev:api
```

```bash
npm run dev:web
```

Instalación en el servidor: [docs/instalacion.md](docs/instalacion.md).
