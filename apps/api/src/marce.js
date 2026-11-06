// Marce: asistente de los consultores.
// - Contesta preguntas sobre los expedientes con los datos del sistema.
// - Propone mensajes (WhatsApp, correo, recordatorios) que quedan como
//   acciones "propuesta": una persona las aprueba antes de que salgan.
// - Nunca aprueba requisitos, nunca ingresa, firma, envía escritos ni cobra.
import Anthropic from '@anthropic-ai/sdk';

const INSTRUCCIONES = `Eres Marce, asistente de los consultores de un despacho que gestiona trámites ferroviarios ante la ATTRAPI (Agencia de Trenes y Transporte Público Integrado) en México.

Contestas en español claro, breve y cordial, solo con base en los datos del expediente que se te dan. Si un dato no está, dilo y sugiere a quién pedírselo; no lo inventes.

Reglas que no se rompen:
- Tú propones; una persona aprueba. No digas que algo "ya se envió" o "ya quedó aprobado".
- Nunca propongas ingresar trámites ante la autoridad, firmar, enviar escritos oficiales ni registrar cobros como algo que tú harás: eso lo hace una persona. Puedes recordarlo como pendiente.
- No cites a la antigua Agencia Reguladora del Transporte Ferroviario; la autoridad es la ATTRAPI.
- El domicilio de la terminal se escribe idéntico al del permiso.
- Los mensajes al cliente son cordiales, concretos y dicen exactamente qué falta.

Si conviene mandar un recordatorio o un mensaje, inclúyelo en "propuestas" con el borrador listo. Si no hace falta, deja "propuestas" vacío.`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['respuesta', 'propuestas'],
  properties: {
    respuesta: { type: 'string' },
    propuestas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'canal', 'destinatario', 'asunto', 'borrador', 'expediente_id'],
        properties: {
          tipo: { type: 'string', enum: ['recordatorio', 'correo', 'whatsapp', 'alerta_interna'] },
          canal: { type: 'string', enum: ['whatsapp', 'correo', 'portal', 'interno'] },
          destinatario: { type: 'string' },
          asunto: { type: 'string' },
          borrador: { type: 'string' },
          expediente_id: { type: 'string' },
        },
      },
    },
  },
};

/** Resumen en texto del estado de los expedientes, para dárselo a Marce. */
export function contextoDeExpedientes(expedientes) {
  return expedientes.map(e => [
    `Expediente ${e.id}: ${e.cliente} · ${e.terminal} · ${e.tramite}${e.homoclave ? ` (${e.homoclave})` : ''}`,
    e.permiso ? `  Permiso: ${e.permiso}` : null,
    `  Estado: ${e.estado}. Avance: ${e.aprobados} de ${e.total} requisitos aprobados.`,
    e.plazo ? `  Plazo: ${e.plazo.fecha} (${e.plazo.dias} días) — ${e.plazo.regla}` : '  Plazo: sin fecha fija',
    e.contacto ? `  Contacto del cliente: ${e.contacto}` : null,
    `  Siguiente paso: ${e.siguiente_paso ?? '—'}`,
    ...(e.pendientes ?? []).map(r => `  - Pendiente (${r.responsable}): ${r.nombre} [${r.estado}]${r.nota ? ` — ${r.nota}` : ''}`),
  ].filter(Boolean).join('\n')).join('\n\n');
}

/** Respuesta sin IA (cuando no hay llave de Anthropic configurada). */
function respuestaSinIA(expedientes) {
  const lineas = expedientes.map(e => {
    const p = (e.pendientes ?? []).map(r => r.nombre).slice(0, 6).join('; ');
    return `• ${e.cliente} (${e.tramite}): ${e.aprobados}/${e.total} aprobados.${p ? ` Falta: ${p}.` : ''}`;
  });
  return {
    respuesta: `Marce aún no está conectada a la IA (falta la llave de Anthropic). Esto es lo que dice el sistema:\n${lineas.join('\n')}`,
    propuestas: [],
    modelo: null,
  };
}

export function crearMarce({ modelo, activo, cliente } = {}) {
  const anthropic = activo ? (cliente ?? new Anthropic()) : null;

  return {
    activo: Boolean(anthropic),

    async preguntar({ pregunta, expedientes, quienPregunta }) {
      if (!anthropic) return respuestaSinIA(expedientes);
      const contexto = contextoDeExpedientes(expedientes);
      const r = await anthropic.beta.messages.create({
        model: modelo,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
        system: INSTRUCCIONES,
        messages: [{
          role: 'user',
          content: `Datos actuales de los expedientes:\n\n${contexto}\n\nPregunta de ${quienPregunta}: ${pregunta}`,
        }],
      });
      if (r.stop_reason === 'refusal') {
        return { respuesta: 'Marce no pudo contestar esta pregunta. Intente redactarla de otra forma.', propuestas: [], modelo: r.model };
      }
      if (r.stop_reason === 'max_tokens') {
        return { respuesta: 'La respuesta quedó incompleta. Intente una pregunta más concreta.', propuestas: [], modelo: r.model };
      }
      const texto = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
      let datos;
      try { datos = JSON.parse(texto); } catch { datos = { respuesta: texto, propuestas: [] }; }
      const ids = new Set(expedientes.map(e => e.id));
      return {
        respuesta: String(datos.respuesta ?? ''),
        // Solo propuestas sobre expedientes que existen en este despacho
        propuestas: (datos.propuestas ?? []).filter(p => ids.has(p.expediente_id)),
        modelo: r.model,
      };
    },
  };
}
