// Entradas: mensajes de WhatsApp (WATI) y correos reenviados (notificaciones de la ATTRAPI).
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

  // ---------- WhatsApp (WATI) ----------
  app.post('/api/entradas/whatsapp', { config: { publica: 'total' } }, async (req) => {
    verificarToken(req);
    const despacho = await despachoDe(req);
    const m = req.body ?? {};
    const telefono = String(m.waId ?? m.from ?? '');
    const texto = String(m.text ?? m.data ?? '').trim() || (m.type ? `[${m.type} recibido]` : '');
    if (!telefono || !texto) return { ok: true, ignorado: 'sin teléfono o texto' };
    return conDespacho(pool, { despachoId: despacho.id, actor: 'sistema' }, async (c) => {
      const clave = telefonoClave(telefono);
      const { rows: [ct] } = await c.query(
        `SELECT ct.id, ct.nombre, ct.cliente_id, cl.nombre_corto FROM contactos ct JOIN clientes cl ON cl.id = ct.cliente_id
         WHERE right(ct.telefono_digitos, 10) = $1 AND ct.archivado_en IS NULL LIMIT 1`, [clave]);
      const exp = ct ? (await c.query(SQL_ACTIVO.replace('%s', 'e.cliente_id = $1'), [ct.cliente_id])).rows[0] : null;
      const { rows } = await c.query(
        `INSERT INTO mensajes (despacho_id, expediente_id, canal, direccion, autor_tipo, autor_nombre, remitente, texto, id_externo)
         VALUES (despacho_actual(), $1, 'whatsapp', 'entrante', 'externo', $2, $3, $4, $5)
         ON CONFLICT DO NOTHING RETURNING id`,
        [exp?.id ?? null, ct?.nombre ?? m.senderName ?? telefono, telefono, texto, m.id ? String(m.id) : null]);
      if (!rows.length) return { ok: true, duplicado: true };
      await alerta(c, exp?.id ?? null, ct
        ? `WhatsApp de ${ct.nombre} (${ct.nombre_corto}): «${texto.slice(0, 200)}»`
        : `WhatsApp de un número no registrado (${telefono}${m.senderName ? `, ${m.senderName}` : ''}): «${texto.slice(0, 200)}»`);
      return { ok: true, expediente: exp?.id ?? null };
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
