// Trabajador en segundo plano. Cada hora, por cada despacho:
//  1. Recalcula plazos.
//  2. Piloto automático: PREPARA recordatorios (quedan "propuesta").
//  3. Envía solo las acciones que una persona ya aprobó.
import { fileURLToPath } from 'node:url';
import { fechaLarga, hoyMexico } from '@logistics/dominio';
import { crearPool, conDespacho, despachosActivos } from './db.js';
import { recalcularPlazos } from './plazos.js';
import { listarExpedientes, pendientesDe } from './consultas.js';
import { crearCanales } from './canales.js';

const ENVIABLES = ['recordatorio', 'correo', 'whatsapp'];

/** Recordatorios del piloto automático: uno por expediente por día, como propuesta. */
export async function prepararRecordatorios(client, { hoy = hoyMexico() } = {}) {
  const lista = (await listarExpedientes(client, { hoy }))
    .filter(e => e.piloto_automatico && !['comercial', 'concluido', 'suspendido'].includes(e.estado));
  const pend = await pendientesDe(client, lista.map(e => e.id));
  const creadas = [];
  for (const e of lista) {
    const delCliente = (pend[e.id] ?? []).filter(r => ['cliente', 'ambos'].includes(r.responsable) && ['pendiente', 'observacion', 'por_confirmar'].includes(r.estado));
    if (!delCliente.length) continue;
    const { rows: [ya] } = await client.query(
      `SELECT 1 FROM acciones WHERE expediente_id = $1 AND archivado_en IS NULL AND (
         (tipo = 'recordatorio' AND propuesta_por = 'sistema' AND (creado_en AT TIME ZONE 'America/Mexico_City')::date = $2::date)
         OR (tipo IN ('recordatorio','whatsapp') AND estado = 'propuesta'))`, [e.id, hoy]);
    if (ya) continue;
    const lista = delCliente.slice(0, 5).map(r => `• ${r.nombre}${r.nota ? ` (${r.nota})` : ''}`).join('\n');
    const plazo = e.plazo ? `\nFecha límite: ${fechaLarga(e.plazo.fecha)} (faltan ${e.plazo.dias} días).` : '';
    const borrador = `Buen día${e.contacto ? `, ${e.contacto}` : ''}. Para avanzar con ${e.tramite} de ${e.terminal} nos falta:\n${lista}${plazo}\nQuedamos atentos. Gracias.`;
    const { rows: [a] } = await client.query(
      `INSERT INTO acciones (despacho_id, expediente_id, tipo, canal, destinatario, asunto, borrador, propuesta_por)
       VALUES (despacho_actual(), $1, 'recordatorio', 'whatsapp', $2, $3, $4, 'sistema') RETURNING id`,
      [e.id, e.contacto ?? 'Contacto del cliente', `Recordatorio: ${e.tramite} · ${e.cliente}`, borrador]);
    creadas.push(a.id);
    if (e.plazo && e.plazo.dias <= 30) {
      await client.query(
        `INSERT INTO acciones (despacho_id, expediente_id, tipo, canal, destinatario, borrador, propuesta_por)
         VALUES (despacho_actual(), $1, 'alerta_interna', 'interno', $2, $3, 'sistema')`,
        [e.id, e.consultor ?? 'Consultor', `${e.cliente}: a ${e.plazo.dias} días del límite (${e.plazo.fechaTexto}) con ${delCliente.length} pendiente(s) del cliente.`]);
    }
  }
  return creadas;
}

/** Envía las acciones aprobadas por una persona. Nunca toca ingreso/firma/escrito/cobro. */
export async function enviarAprobadas(client, canales) {
  const { rows } = await client.query(
    `SELECT a.*, ct.telefono, ct.correo FROM acciones a
     LEFT JOIN expedientes e ON e.id = a.expediente_id LEFT JOIN contactos ct ON ct.id = e.contacto_id
     WHERE a.estado = 'aprobada' AND a.tipo = ANY($1) AND a.archivado_en IS NULL
       AND (a.programada_para IS NULL OR a.programada_para <= now())`, [ENVIABLES]);
  const resultado = [];
  for (const a of rows) {
    const r = a.canal === 'correo'
      ? await canales.correo({ para: a.correo, asunto: a.asunto ?? 'Seguimiento de su trámite', texto: a.borrador })
      : await canales.whatsapp({ telefono: a.telefono, texto: a.borrador });
    if (r.ok) {
      await client.query(`UPDATE acciones SET estado = 'enviada', ejecutada_en = now(), error = NULL WHERE id = $1`, [a.id]);
      await client.query(
        `INSERT INTO mensajes (despacho_id, expediente_id, canal, direccion, autor_tipo, autor_nombre, texto)
         VALUES (despacho_actual(), $1, $2, 'saliente', 'sistema', 'Piloto automático', $3)`,
        [a.expediente_id, a.canal === 'correo' ? 'correo' : 'whatsapp', a.borrador]);
    } else if (a.error !== r.error) {
      await client.query(`UPDATE acciones SET error = $2 WHERE id = $1`, [a.id, r.error]);
    }
    resultado.push({ id: a.id, ...r });
  }
  return resultado;
}

export async function ciclo(pool, { canales = crearCanales(), log = console.log } = {}) {
  for (const despachoId of await despachosActivos(pool)) {
    const ctx = { despachoId, actor: 'sistema' };
    try {
      const cambios = await conDespacho(pool, ctx, (c) => recalcularPlazos(c));
      const propuestas = await conDespacho(pool, ctx, (c) => prepararRecordatorios(c));
      const envios = await conDespacho(pool, ctx, (c) => enviarAprobadas(c, canales));
      log(JSON.stringify({ despachoId, plazosCambiados: cambios.length, propuestas: propuestas.length, envios: envios.length }));
    } catch (e) {
      log(`Error en el despacho ${despachoId}: ${e.message}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = crearPool(process.env.DATABASE_URL);
  const minutos = Number(process.env.WORKER_MINUTOS ?? 60);
  const correr = () => ciclo(pool).catch(e => console.error(e));
  correr();
  setInterval(correr, minutos * 60 * 1000);
  console.log(`Trabajador activo: cada ${minutos} minutos.`);
}
