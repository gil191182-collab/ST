// Guía de uso del sistema que Marce conoce, para explicar a los consultores cómo hacer las cosas.
// Si cambia una pantalla, actualizar aquí también.
export const GUIA_DE_USO = `CÓMO SE USA STRATEGGIA LOGISTICS (pantallas y pasos reales)

Menú: Seguimiento (tablero) · Clientes y permisos · Chat de consultores · Plantillas · Personas · Configuración. En el celular, barra inferior: Seguimiento, Clientes, Chat y Más.

1. EMPEZAR CON UN CLIENTE NUEVO (por ejemplo, una terminal en Querétaro)
   a) Clientes y permisos → recuadro "Nuevo cliente": razón social, nombre corto y RFC → Agregar cliente.
   b) Abrir el cliente en la lista → agregar Contacto (nombre, correo, teléfono; el teléfono permite el WhatsApp).
   c) Agregar Terminal (nombre, municipio, estado; Querétaro va en estado).
   d) Si ya tiene permiso: agregar Permiso con número, tipo (04-010-A o 04-010-B), servicio, domicilio TEXTUAL idéntico al del permiso (mismo orden, con kilómetros de vía y línea) y fecha de otorgamiento. Con la fecha, el sistema calcula solo los plazos (180 días para inicio de operaciones, etc.).
      Si un trámite previo existe pero se hizo fuera del sistema (por ejemplo el permiso), se marca "Ya existe fuera del sistema" subiendo su documento; sin eso la cadena de trámites no deja abrir el siguiente.
   e) Abrir expediente: elegir terminal, trámite (Permiso, Inicio de Operaciones, Programa de Contingencias, Registro de Tarifas, Consulta SENER…) y alcance (completo o una parte). Si aún es propuesta, se abre como "Comercial".
   f) El expediente nace con su checklist del catálogo vigente: cada requisito dice a quién le toca (cliente, despacho, ambos o autoridad).

2. CARGAR DOCUMENTOS
   - En el expediente → pestaña Documentos → elegir el requisito → elegir archivo → Subir. Se guarda cifrado; se extrae el texto y corre la revisión automática.
   - O desde Google Drive: Ajustes del expediente → "Carpeta de Google Drive" → pegar el enlace de la carpeta (antes compartirla como Lector con logistics-drive@strateggia-logistics.iam.gserviceaccount.com). El sistema la revisa cada 15 minutos, importa lo nuevo, sugiere el requisito y pasa a "recibido" lo que identifica con seguridad. Archivos de más de 30 MB quedan como enlace "Abrir en Drive".
   - El cliente también puede subir desde su Portal.

3. CHECKLIST Y APROBACIÓN
   - En cada requisito, botón Revisar: "Comentarios" (se guardan con nombre y fecha), "Aprobar requisito", "Cambiar estado…".
   - El cuadro "pegue el texto del documento" es SOLO para la revisión automática; no guarda comentarios.
   - Nada queda aprobado sin que una persona presione Aprobar. La IA y el sistema nunca aprueban.

4. ESCRITOS: pestaña Escritos → tipo de escrito (por ejemplo "Solicitud de Constancia de Inicio de Operaciones (machote Strateggia)") → llenar los datos que pide → Generar Word y PDF. Queda en Documentos y una acción de firma propuesta. Firmar e ingresar lo hace una persona.

5. MENSAJES Y PILOTO AUTOMÁTICO: el sistema y Marce preparan recordatorios, correos o WhatsApp como "propuesta"; aparecen en el tablero (recuadro Piloto automático) para Aprobar y enviar, Editar o Descartar. Correo sale desde hola@strateggia.mx con copia a Dirección.

6. PLAZOS: pestaña Plazos del expediente. Prórrogas y resoluciones se registran en el permiso (Clientes y permisos) y recalculan las fechas.

7. COBROS: Ajustes del expediente → "Cobro (solo registro)": hitos, orden de compra, folio y estatus. La factura se hace fuera del sistema.

8. PERSONAS: Personas → Invitar (nombre, correo, rol: consultor o cliente del portal) → se genera un enlace de un solo uso para definir contraseña.

9. CHATS: "Chat de consultores" es para hablar entre personas del equipo; Marce contesta ahí solo si la mencionan ("@Marce" o "Marce, ..."). "Chat con Marce" es la conversación directa con la asistente.

10. PUBLICAR CAMBIOS DEL SISTEMA: los cambios al software los hace el equipo de desarrollo (Gil con Claude Code); Marce puede dejar una "solicitud de cambio" que aparece en el Chat de consultores para llevarla a desarrollo. Publicar a producción requiere la aprobación del director.`;
