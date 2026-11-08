// Entradas: mensajes de WhatsApp (wa-mcp) y correos reenviados (notificaciones de la ATTRAPI).
// Se guardan en el expediente que corresponda y generan una alerta interna.
// No se responde nada en automático: el piloto automático solo propone.
import crypto from 'node:crypto';
import { telefonoClave } from '@logistics/dominio';
import { procesarCorreoEntrante } from '../correo.js';
import { conDespacho, despachoPorSubdominio } from '../db.js';

export function rutasEntradas(app, { config, pool, ErrorHttp }) {
  function verificarToken(req) {
    const dado = String(req.query?.token ?? req.headers['x-token'] ?? '');
    const esperado = config.entradasToken ?? '';
    if (!esperado || dado.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(dado), Buffer.from(esperado))) {
      throw new ErrorHttp(401, 'Token inválido.');
    }
  }

  async function despachoDe(req) {
    const d = await despachoPorSubdominio(pool, String(req.query?.despacho ?? config.despachoPorDefecto));
    if (!d) throw new ErrorHttp(404, 'Despacho no encontrado.');
    return d;
  }

  async function alerta(c, expedienteId, texto) {
    await c.query(
      `INSERT INTO acciones (despacho_id, expediente_id, tipo, canal, destinatario, borrador, propuesta_por)
       VALUES (despacho_actual(), $1, 'alerta_interna', 'interno', 'Consultores', $2, 'sistema')`, [expedienteId, texto]);
  }

  // Expediente activo más reciente de un cliente (o de un permiso)
  const SQL_ACTIVO = `SELECT e.id FROM expedientes e WHERE e.archivado_en IS NULL AND e.estado NOT IN ('concluido','comercial') AND %s ORDER BY e.creado_en DESC LIMIT 1`;

  // ---------- WhatsApp (wa-mcp) ----------
  // wa-mcp avisa con un POST firmado (x-wa-signature = sha256=HMAC del cuerpo con el
  // secreto del callback). El callback está acotado al sistema "lg": solo llegan
  // conversaciones que abrió Logistics. Si la firma no cuadra, el aviso no es nuestro.
  function firmaValida(req) {
    const secreto = config.waSecretoWebhook ?? '';
    const dada = String(req.headers['x-wa-signature'] ?? '');
    if (!secreto || !req.cuerpoCrudo) return false;
    const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(req.cuerpoCrudo).digest('hex');
    return dada.length === esperada.length && crypto.timingSafeEqual(Buffer.from(dada), Buffer.from(esperada));
  }

  app.post('/api/entradas/wa-mcp', { config: { publica: 'total' } }, async (req) => {
    if (!firmaValida(req)) throw new ErrorHttp(401, 'Firma inválida.');
    const despacho = await despachoDe(req);
    const { evento, datos = {} } = req.body ?? {};
    const telefono = String(datos.telefono ?? '');
    if (!telefono) return { ok: true, ignorado: 'sin teléfono' };
    return conDespacho(pool, { despachoId: despacho.id, actor: 'sistema' }, async (c) => {
      const { rows: [ct] } = await c.query(
        `SELECT ct.id, ct.nombre, ct.cliente_id, cl.nombre_corto FROM contactos ct JOIN clientes cl ON cl.id = ct.cliente_id
         WHERE right(ct.telefono_digitos, 10) = $1 AND ct.archivado_en IS NULL LIMIT 1`, [telefonoClave(telefono)]);
      const exp = ct ? (await c.query(SQL_ACTIVO.replace('%s', 'e.cliente_id = $1'), [ct.cliente_id])).rows[0] : null;
      const quien = ct ? `${ct.nombre} (${ct.nombre_corto})` : `un número no registrado (${telefono}${datos.nombre ? `, ${datos.nombre}` : ''})`;

      if (evento === 'mensaje_entrante') {
        const texto = String(datos.texto ?? '').trim() || `[${datos.tipo ?? 'mensaje'} recibido]`;
        const { rows } = await c.query(
          `INSERT INTO mensajes (despacho_id, expediente_id, canal, direccion, autor_tipo, autor_nombre, remitente, texto, id_externo)
           VALUES (despacho_actual(), $1, 'whatsapp', 'entrante', 'externo', $2, $3, $4, $5)
           ON CONFLICT DO NOTHING RETURNING id`,
          [exp?.id ?? null, ct?.nombre ?? datos.nombre ?? telefono, telefono, texto, datos.wa_message_id ?? null]);
        if (!rows.length) return { ok: true, duplicado: true };
        await alerta(c, exp?.id ?? null, `WhatsApp de ${quien}: «${texto.slice(0, 200)}»`);
        return { ok: true, expediente: exp?.id ?? null };
      }
      if (evento === 'baja') {
        await alerta(c, exp?.id ?? null, `${quien} pidió por WhatsApp no recibir más mensajes. No se le volverá a escribir por ese medio.`);
        return { ok: true };
      }
      if (evento === 'envio_fallido') {
        await alerta(c, exp?.id ?? null, `No se pudo entregar un WhatsApp a ${quien}${datos.error ? `: ${datos.error}` : ''}.`);
        return { ok: true };
      }
      return { ok: true, ignorado: evento };
    });
  });

  // ---------- Correo (reenvío desde la cuenta del despacho) ----------
  app.post('/api/entradas/correo', {
    config: { publica: 'total' },
    schema: { body: { type: 'object', required: ['de', 'asunto'], properties: {
      id: { type: 'string' }, de: { type: 'string' }, asunto: { type: 'string' }, texto: { type: 'string' }, fecha: { type: 'string' } } } },
  }, async (req) => {
    verificarToken(req);
    const despacho = await despachoDe(req);
    const r = await conDespacho(pool, { despachoId: despacho.id, actor: 'sistema' }, (c) => procesarCorreoEntrante(c, req.body));
    return { ok: true, ...r };
  });
}
