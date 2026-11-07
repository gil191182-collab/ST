# Pendientes y preguntas

## Preguntas de negocio / normativa (para Mayela)

Son decisiones de ustedes; el sistema las deja marcadas y no inventa nada.
Casi todo se puede capturar ya desde la pantalla **Clientes y permisos**.

1. **Homoclaves del catálogo.** Solo está capturada `ATTRAPI-03-005` (Registro de
   Tarifas). Faltan las actuales (ATTRAPI-xx) y anteriores (ARTF-xx) del resto.
   (El catálogo se cambia con una migración revisada, no desde la pantalla.)
2. **Requisitos completos.** Bulkmatic tiene 27 y SFM 20; solo hay 16 y 5.
3. **Textos de endosos** de pólizas para la comparación palabra por palabra.
4. **Domicilios textuales** de los permisos 0056, 0058 y 0036 (pantalla Clientes →
   Corregir domicilio). Mientras digan `[CAPTURAR…]`, el sistema no genera escritos
   ni puede comparar domicilios.
5. **Registro de tarifas cada 2 años**: confirmar.
6. **Fecha y vigencia del permiso de SFM**, y **oficio de la prórroga de KERI**.
7. **Correos y teléfonos** de Mayela, Omar Abarca y Carlos Gómez.
8. **Texto base del "Aviso de inicio de operaciones"**: es un borrador; validarlo.

## Lo que hay que conectar al instalar (no es código)

| Qué | Qué se necesita | Dónde va |
|---|---|---|
| Marce con IA | Llave de API de Anthropic | `ANTHROPIC_API_KEY` en `.env` |
| WhatsApp (enviar) | Token y URL de la cuenta WATI | `WATI_URL`, `WATI_TOKEN` |
| WhatsApp (recibir) | En WATI → Webhooks: `https://logistics.strateggia.mx/api/entradas/whatsapp?despacho=strateggia&token=<ENTRADAS_TOKEN>` | `ENTRADAS_TOKEN` |
| Correo de Mayela | Contraseña de aplicación de Google | `SMTP_*`, `IMAP_*` |
| Copia de respaldos fuera de IONOS | Cuenta de almacenamiento (p. ej. Backblaze B2, Google Drive vía rclone) | `RESPALDO_DESTINO_REMOTO` |

## Decisiones técnicas tomadas (se pueden cambiar)

- **Servidor:** Ubuntu + Docker como dice CLAUDE.md. `servidor-ionos/` describe el
  servidor Windows de VerifyPerson, que es otro.
- **Next.js 16** (la 15 traía una versión vulnerable de PostCSS).
- **Marce usa Claude Opus 5.5** con respaldo automático de modelo; se cambia con `ANTHROPIC_MODELO`.
- **Correo por SMTP/IMAP con contraseña de aplicación**: no requiere crear un proyecto
  en Google Cloud. El buzón se abre en **solo lectura**.
- **WATI**: mensaje de sesión (ventana de 24 h). Fuera de la ventana se necesitan
  plantillas aprobadas por WhatsApp: definirlas con la cuenta real.
- **Escritos que firma el cliente** salen sin membrete del despacho; las **cartas del
  despacho** llevan logo, colores y lema.
- **Mensajes del piloto automático** solo salen si el destinatario tiene correo o
  teléfono claros; nunca se "adivina" a quién mandar.

## Lo que falta construir

- Sincronización opcional con Google Drive por despacho (requiere un proyecto de
  Google Cloud con OAuth; se hará cuando se decida qué carpeta y qué cuenta).
- Plantillas de WhatsApp aprobadas para mensajes fuera de la ventana de 24 h.
- Lectura de PDF escaneados (OCR): hoy esos documentos se marcan "sin texto legible"
  y se revisan a mano.
