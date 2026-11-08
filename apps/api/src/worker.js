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
import { configImap, leerBandeja, procesarCorreoEntrante } from './correo.js';
import { despachoPorSubdominio } from './db.js';

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
      `INSERT INTO acciones (despacho_id, expediente_id, tipo, canal, destinatario, asunto, borrador, propuesta_por, datos)
       VALUES (despacho_actual(), $1, 'recordatorio', 'whatsapp', $2, $3, $4, 'sistema', $5) RETURNING id`,
      [e.id, e.contacto ?? 'Contacto del cliente', `Recordatorio: ${e.tramite} · ${e.cliente}`, borrador,
       JSON.stringify({ resumen: `Nos falta: ${delCliente.slice(0, 5).map(r => r.nombre).join('; ')}.${e.plazo ? ` La fecha límite es el ${fechaLarga(e.plazo.fecha)}.` : ''}` })]);
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

const primerNombre = (n) => String(n ?? '').replace(/^(lic|ing|dr|dra|mtro|mtra|c)\.?\s+/i, '').split(/\s+/)[0] || 'cliente';

/**
 * A quién se envía: el correo o teléfono escrito en "destinatario", o el del contacto
 * del expediente SOLO si el destinatario es ese contacto. Nunca se adivina.
 */
export function direccionDe(a) {
  const dest = String(a.destinatario ?? '');
  const esContacto = a.contacto_nombre && dest.trim().toLowerCase() === a.contacto_nombre.trim().toLowerCase();
  if (a.canal === 'correo') {
    const m = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(dest);
    if (m) return { valor: m[0] };
    if (esContacto && a.correo) return { valor: a.correo };
    return { error: `No hay correo para «${dest}». Edite el destinatario con su correo.` };
  }
  const digitos = dest.replace(/\D/g, '');
  if (digitos.length >= 10) return { valor: digitos };
  if (esContacto && a.telefono) return { valor: a.telefono };
  return { error: `No hay teléfono para «${dest}». Capture el teléfono del contacto o edite el destinatario.` };
}

/** Envía las acciones aprobadas por una persona. Nunca toca ingreso/firma/escrito/cobro. */
export async function enviarAprobadas(client, canales) {
  const { rows } = await client.query(
    `SELECT a.*, ct.telefono, ct.correo, ct.nombre AS contacto_nombre, u.nombre AS consultor, tr.nombre AS tramite,
            (SELECT nombre FROM despachos WHERE id = a.despacho_id) AS despacho
     FROM acciones a
     LEFT JOIN expedientes e ON e.id = a.expediente_id LEFT JOIN contactos ct ON ct.id = e.contacto_id
     LEFT JOIN usuarios u ON u.id = e.consultor_id
     LEFT JOIN tramite_versiones v ON v.id = e.tramite_version_id LEFT JOIN tramites tr ON tr.id = v.tramite_id
     WHERE a.estado = 'aprobada' AND a.tipo = ANY($1) AND a.archivado_en IS NULL
       AND (a.programada_para IS NULL OR a.programada_para <= now())`, [ENVIABLES]);
  const resultado = [];
  for (const a of rows) {
    // Si el canal no está configurado, el canal mismo lo dice (aviso más útil que la dirección)
    const dir = canales.configurados?.[a.canal === 'correo' ? 'correo' : 'whatsapp'] === false ? { valor: null } : direccionDe(a);
    const r = dir.error ? { ok: false, error: dir.error }
      : a.canal === 'correo'
        ? await canales.correo({ para: dir.valor, asunto: a.asunto ?? 'Seguimiento de su trámite', texto: a.borrador })
        : await canales.whatsapp({
            telefono: dir.valor, texto: a.borrador,
            // Para la plantilla lg_recordatorio si la ventana de 24 h está cerrada
            variables: [primerNombre(a.contacto_nombre ?? a.destinatario), a.consultor ?? a.despacho, a.tramite ?? 'en curso', a.datos?.resumen ?? a.borrador],
          });
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

/** Lee la bandeja del despacho (solo lectura) y registra las notificaciones de la ATTRAPI. */
export async function revisarCorreo(pool, cfg, opciones = {}) {
  const d = await despachoPorSubdominio(pool, cfg.despacho);
  if (!d) return [];
  return leerBandeja(cfg, (correo) => conDespacho(pool, { despachoId: d.id, actor: 'sistema' }, (c) => procesarCorreoEntrante(c, correo)), opciones);
}

export async function ciclo(pool, { canales = crearCanales(), log = console.log, imap = configImap() } = {}) {
  if (imap) {
    try {
      const r = await revisarCorreo(pool, imap);
      log(JSON.stringify({ correo: { leidos: r.length, deLaAutoridad: r.filter(x => x.clasificacion?.esAutoridad && !x.duplicado).length } }));
    } catch (e) { log(`No se pudo leer el correo: ${e.message}`); }
  }
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
