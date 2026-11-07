// Correo del despacho:
//  - Entrada: procesa notificaciones de la ATTRAPI (desde el reenvío o desde IMAP).
//  - Lectura IMAP en SOLO LECTURA: nunca borra, mueve ni marca correos en el buzón.
import { clasificarCorreo, folioPermiso } from '@logistics/dominio';

const SQL_ACTIVO = `SELECT e.id FROM expedientes e WHERE e.archivado_en IS NULL AND e.estado NOT IN ('concluido','comercial') AND e.permiso_id = $1 ORDER BY e.creado_en DESC LIMIT 1`;

/** Guarda un correo de la autoridad en su expediente y crea una alerta interna. `c` corre dentro de conDespacho. */
export async function procesarCorreoEntrante(c, { id, de, asunto, texto = '' }) {
  const clasif = clasificarCorreo({ de, asunto, texto });
  if (!clasif.esAutoridad) return { ignorado: 'no parece de la autoridad', clasificacion: clasif };
  const folios = new Set(clasif.permisos.map(folioPermiso).filter(Boolean));
  const { rows: permisos } = await c.query(
    `SELECT p.id, p.numero, cl.nombre_corto FROM permisos p JOIN terminales t ON t.id = p.terminal_id
     JOIN clientes cl ON cl.id = t.cliente_id WHERE p.archivado_en IS NULL`);
  const permiso = permisos.find(p => folios.has(folioPermiso(p.numero)));
  const exp = permiso ? (await c.query(SQL_ACTIVO, [permiso.id])).rows[0] : null;
  const { rows } = await c.query(
    `INSERT INTO mensajes (despacho_id, expediente_id, canal, direccion, autor_tipo, autor_nombre, remitente, texto, id_externo)
     VALUES (despacho_actual(), $1, 'correo', 'entrante', 'externo', 'ATTRAPI', $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
    [exp?.id ?? null, de, `${asunto}\n\n${texto.slice(0, 20000)}`, id ?? null]);
  if (!rows.length) return { duplicado: true };
  const quien = permiso ? `${permiso.nombre_corto} (${permiso.numero})` : 'permiso no identificado';
  const oficios = clasif.oficios.length ? ` Oficio(s): ${clasif.oficios.join(', ')}.` : '';
  const siguiente = clasif.tipo === 'requerimiento' ? ' Revisar el requerimiento y su plazo.'
    : ['acuerdo', 'oficio'].includes(clasif.tipo) ? ' Si es una resolución, regístrela para que se recalculen los plazos.' : '';
  await c.query(
    `INSERT INTO acciones (despacho_id, expediente_id, tipo, canal, destinatario, borrador, propuesta_por)
     VALUES (despacho_actual(), $1, 'alerta_interna', 'interno', 'Consultores', $2, 'sistema')`,
    [exp?.id ?? null, `Notificación de la ATTRAPI · ${quien}: «${asunto}».${oficios}${siguiente}`]);
  return { expediente: exp?.id ?? null, clasificacion: clasif };
}

/** Configuración IMAP desde variables de entorno (o null si no está). */
export function configImap(env = process.env) {
  if (!env.IMAP_HOST || !env.IMAP_USUARIO || !env.IMAP_CLAVE) return null;
  return {
    host: env.IMAP_HOST, port: Number(env.IMAP_PUERTO ?? 993), secure: env.IMAP_SEGURO !== 'false',
    auth: { user: env.IMAP_USUARIO, pass: env.IMAP_CLAVE },
    dias: Number(env.IMAP_DIAS ?? 3), despacho: env.IMAP_DESPACHO ?? env.DESPACHO_POR_DEFECTO ?? 'strateggia',
  };
}

/**
 * Lee los correos recientes de la bandeja SIN modificarlos (abre el buzón en solo lectura)
 * y entrega cada uno a `alCorreo`. `crearCliente` permite usar un cliente falso en pruebas.
 */
export async function leerBandeja(cfg, alCorreo, { crearCliente } = {}) {
  const crear = crearCliente ?? (async (c) => { const { ImapFlow } = await import('imapflow'); return new ImapFlow({ ...c, logger: false }); });
  const { simpleParser } = await import('mailparser');
  const cliente = await crear({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.auth });
  await cliente.connect();
  const resultados = [];
  try {
    const candado = await cliente.getMailboxLock('INBOX', { readOnly: true });
    try {
      const desde = new Date(Date.now() - cfg.dias * 86400000);
      for await (const m of cliente.fetch({ since: desde }, { source: true, envelope: true })) {
        const correo = await simpleParser(m.source);
        resultados.push(await alCorreo({
          id: correo.messageId ?? `imap-${m.uid}`,
          de: correo.from?.text ?? '',
          asunto: correo.subject ?? '',
          texto: correo.text ?? '',
        }));
      }
    } finally { candado.release(); }
  } finally { await cliente.logout().catch(() => {}); }
  return resultados;
}
