# Pendientes y preguntas

## Preguntas de negocio / normativa (para Mayela)

Son decisiones de ustedes; el sistema las deja marcadas y no inventa nada.

1. **Homoclaves del catálogo.** Solo está capturada `ATTRAPI-03-005` (Registro de
   Tarifas), que aparece en el expediente de Bulkmatic. Faltan las homoclaves
   actuales (ATTRAPI-xx) y anteriores (ARTF-xx) de: Proyecto Ejecutivo, Permiso,
   Inicio de Operaciones, Programa de Contingencias, Pólizas, Aviso de cambios y
   Renovación del permiso. Todas están marcadas "por confirmar".
2. **Requisitos completos.** El expediente real de Bulkmatic tiene 27 requisitos y
   el de SFM 20; solo se capturaron los que se ven en las pantallas (16 y 5).
   Por eso el avance de Bulkmatic sale "0 de 16" y no "9 de 27".
3. **Textos de endosos** de pólizas para la comparación palabra por palabra:
   la tabla existe pero está vacía. Hace falta el texto oficial de cada endoso.
4. **Domicilios textuales** de los tres permisos (0056, 0058 y 0036), copiados
   tal cual del permiso con kilómetros y línea. Hoy dicen `[CAPTURAR…]` y el
   sistema avisa que no puede comparar.
5. **Registro de tarifas cada 2 años**: aparece en el portal de KERI pero no está
   en CLAUDE.md. Está calculado así; confirmar si es correcto.
6. **Fecha del permiso de SFM** (SCT-DGDFM-04-010-B/0036) y su vigencia (2029).
7. **Oficio de la prórroga de KERI** (al 2 dic 2026).
8. **Correos y teléfonos**: Mayela, Omar Abarca (KERI) y Carlos Gómez (Bulkmatic).
   Sin teléfono el piloto automático no puede enviar WhatsApp.

## Decisiones técnicas tomadas (se pueden cambiar)

- **Una sola imagen para API, trabajador y migraciones**; otra para el panel web.
- **Next.js 16** (no 15): la 15 traía una versión vulnerable de PostCSS.
- **Marce usa Claude Opus 5.5** con respaldo automático de modelo si la solicitud
  es rechazada. Se puede cambiar con `ANTHROPIC_MODELO`.
- **Correo por "relay"**: falta decidir cómo se conecta la cuenta de Mayela
  (Gmail/Google Workspace con OAuth, o SMTP). Sin eso no se envían correos.
- **WATI**: se usa el envío de mensaje de sesión. Fuera de la ventana de 24 h
  WhatsApp exige plantillas aprobadas; falta definirlas con la cuenta real.
- **Contraseñas**: se definen con un comando en el servidor. Falta la pantalla de
  "olvidé mi contraseña" (requiere correo funcionando).

## Lo que falta construir

- Extraer texto de PDF y Word para la revisión automática (hoy se pega el texto).
- Pre-revisión de documentos con Marce (además de las reglas fijas).
- Membretes .docx y PDF con la marca del despacho.
- Sincronización opcional con Google Drive por despacho.
- Pantalla para subir el logo (la API ya existe: `POST /api/despacho/logo`).
- Pantallas para registrar resoluciones, prórrogas y abrir expedientes
  (la API ya valida la cadena de trámites).
- Chat de consultores con el botón de aprobación de Gil para producción.
- Lectura del correo de Mayela para detectar notificaciones de la ATTRAPI.
- Plantillas anónimas desde referencias autorizadas (la función de anonimizar ya
  está probada; falta la pantalla y la revisión humana).
