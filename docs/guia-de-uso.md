# Cómo funciona Strateggia Logistics

**Dirección:** https://logistics.strateggia.mx

## La idea en una frase

Es el lugar donde vive cada trámite ferroviario de cada cliente: qué se pide, qué falta,
cuándo vence y qué se ha hablado. El sistema **avisa, prepara y propone**; las personas
**deciden y aprueban**.

## Quién entra y qué ve

| Persona | Qué ve |
|---|---|
| **Gil (director)** | Todo. Además: invita consultores, cambia la marca y aprueba publicar versiones nuevas del sistema. |
| **Mayela (consultora)** | Todos los clientes y trámites. Aprueba requisitos y mensajes. |
| **Cada cliente** (p. ej. Omar de KERI) | Solo su propio trámite, en el **portal del cliente**: qué le falta, sus fechas y sus mensajes. Nunca ve a otros clientes. |

Para dar acceso a alguien: **Personas → Invitar**. El sistema da un enlace de un solo
uso; se le manda por WhatsApp y la persona crea su contraseña.

## Las pantallas (menú de arriba)

1. **Seguimiento.** La pantalla principal:
   - Arriba: cuántos trámites hay, cuáles vencen en menos de 30 días y cuáles esperan al cliente.
   - La tabla, ordenada por urgencia: el que está más cerca de vencer va primero, en rojo.
   - A la derecha, el **Piloto automático**: mensajes que el sistema o Marce prepararon y que **esperan su aprobación**.
   - Abajo a la derecha, el **chat con Marce**.
2. **Clientes y permisos.** Alta de clientes, contactos, terminales y permisos. Aquí también:
   - se corrige el **domicilio textual** del permiso,
   - se registran **prórrogas** y **resoluciones** de la ATTRAPI,
   - y se **abre un expediente** nuevo.
3. **Detalle de un expediente** (clic en el nombre del cliente). Tiene pestañas:
   - **Checklist:** cada requisito con su estado. Solo una persona puede marcarlo "Aprobado".
   - **Documentos:** se suben, se ven, y se pueden revisar con las reglas o pedirle a Marce una pre-revisión.
   - **Escritos:** genera el Word y el PDF, por ejemplo el Aviso de inicio de operaciones, con el domicilio exacto del permiso.
   - **Mensajes**, **Plazos** y **Bitácora** (todo lo que pasó y quién lo hizo).
   - **Ajustes:** estado, siguiente paso, piloto automático, concluir y cobro.
4. **Chat de consultores.** Conversación interna del equipo, y donde Gil aprueba las
   versiones nuevas del sistema antes de publicarlas.
5. **Plantillas.** Textos de trámites que la autoridad ya aprobó, sin datos del cliente,
   para reutilizarlos.
6. **Personas** y **Configuración** (logo, colores, datos del despacho).

## Lo que hace solo

- **Calcula las fechas límite:**
  - 180 días desde el permiso para el inicio de operaciones, o la fecha de la prórroga si la hay.
  - Programa de Contingencias: 15 días antes de iniciar y cada 2 años.
  - Pólizas: cada año.
  - Renovación del permiso: 6 meses antes.
  - Si se registra una prórroga o una resolución, las fechas se recalculan.
- **Cada hora revisa los expedientes con "piloto automático"** y, si al cliente le falta
  algo, **prepara** un recordatorio de WhatsApp. **No lo manda:** lo deja en el Piloto
  automático para que alguien lo apruebe, lo edite o lo descarte.
- **Revisa los documentos** con las reglas: domicilio idéntico al permiso, que no citen a la
  antigua Agencia Reguladora y tarifas solo en pesos. Marca OK / REVISAR / FALTA / FALLA;
  una persona confirma.
- **Recibe los WhatsApp** que contestan los clientes y los pone en su expediente con un aviso.
- **Respalda todo el servidor cada noche** (3:15 a.m.) en el Google Drive de strateggia2014.

## Lo que el sistema NUNCA hace solo

- Marcar un requisito como cumplido.
- Mandar un mensaje sin que una persona lo apruebe.
- Ingresar un trámite ante la ATTRAPI, firmar, enviar un escrito oficial o registrar un cobro.
- Borrar algo: todo se **archiva** y queda en la bitácora.

## Marce (la asistente con IA)

Se le escribe en el chat como a una persona. Ejemplos:
- "¿Qué le falta a Bulkmatic para ingresar tarifas?"
- "¿Qué trámites vencen este mes?"
- "Prepárale un recordatorio a Carlos Gómez."

Contesta con los datos del sistema y, si conviene, **deja un mensaje listo** en el Piloto
automático. Nunca envía ni aprueba por su cuenta.

## Un día normal de Mayela

1. Entra a **Seguimiento** y ve primero lo que está en rojo.
2. Revisa el **Piloto automático**: aprueba, edita o descarta los recordatorios.
3. Abre el expediente del día, revisa los documentos nuevos y aprueba los requisitos que ya están bien.
4. Si la ATTRAPI resolvió algo, lo registra en **Clientes y permisos → Registrar resolución**.
5. Si tiene dudas de un expediente, le pregunta a Marce.

## WhatsApp y correo

- **WhatsApp** sale del número de Strateggia (+52 222 422 0404), el mismo de VerifyPerson y
  ReclutAI, sin mezclarse: las respuestas de los clientes de Logistics solo llegan a Logistics.
  Si el cliente no ha escrito en 24 h, se usa la plantilla aprobada por Meta.
- **Correo** sale por Mailrelay desde hola@strateggia.mx, con copia a strateggia2014@gmail.com.
  *Pendiente: que Mailrelay habilite ese remitente.*
