// Consultas de lectura. Todas corren dentro de conDespacho(), así que RLS
// ya limita los datos al despacho de quien pregunta.
import { urgencia, hoyMexico, fechaCorta } from '@logistics/dominio';

const SQL_EXPEDIENTES = `
SELECT e.id, e.estado, e.alcance, e.siguiente_paso, e.piloto_automatico, e.abierto_en,
       c.id AS cliente_id, c.nombre_corto AS cliente, t.nombre AS terminal,
       concat_ws(', ', t.municipio, t.estado) AS ubicacion,
       tr.clave AS tramite_clave, tr.nombre AS tramite, v.homoclave_actual AS homoclave,
       p.id AS permiso_id, p.numero AS permiso, p.servicio, p.fecha_otorgamiento,
       ct.nombre AS contacto, u.nombre AS consultor, e.contacto_id, e.consultor_id, e.terminal_id, e.resultado,
       (SELECT count(*) FROM expediente_requisitos r WHERE r.expediente_id = e.id AND r.archivado_en IS NULL)::int AS total,
       (SELECT count(*) FROM expediente_requisitos r WHERE r.expediente_id = e.id AND r.estado = 'aprobado' AND r.archivado_en IS NULL)::int AS aprobados,
       (SELECT count(*) FROM expediente_requisitos r WHERE r.expediente_id = e.id AND r.estado = 'observacion' AND r.archivado_en IS NULL)::int AS con_observacion,
       (SELECT count(*) FROM expediente_requisitos r WHERE r.expediente_id = e.id AND r.responsable IN ('cliente','ambos')
          AND r.estado IN ('pendiente','observacion','por_confirmar') AND r.archivado_en IS NULL)::int AS pendientes_cliente,
       pl.fecha AS plazo_fecha, pl.regla AS plazo_regla, pl.descripcion AS plazo_descripcion, pl.definitivo AS plazo_definitivo
FROM expedientes e
JOIN clientes c ON c.id = e.cliente_id
JOIN terminales t ON t.id = e.terminal_id
JOIN tramite_versiones v ON v.id = e.tramite_version_id
JOIN tramites tr ON tr.id = v.tramite_id
LEFT JOIN permisos p ON p.id = e.permiso_id
LEFT JOIN contactos ct ON ct.id = e.contacto_id
LEFT JOIN usuarios u ON u.id = e.consultor_id
LEFT JOIN LATERAL (
  SELECT * FROM plazos x
  WHERE x.archivado_en IS NULL AND (x.expediente_id = e.id OR (x.permiso_id = e.permiso_id AND x.tipo = 'inicio_operaciones'))
  ORDER BY (x.expediente_id = e.id) DESC, x.fecha LIMIT 1
) pl ON true
WHERE e.archivado_en IS NULL`;

const PESO_URGENCIA = { vencido: 0, critico: 1, atencion: 2, en_tiempo: 3, sin_fecha: 4 };

function decorar(e, hoy) {
  const u = e.plazo_fecha ? urgencia(e.plazo_fecha, hoy) : { dias: null, nivel: 'sin_fecha' };
  return {
    ...e,
    plazo: e.plazo_fecha ? {
      fecha: e.plazo_fecha, fechaTexto: fechaCorta(e.plazo_fecha), dias: u.dias, nivel: u.nivel,
      regla: e.plazo_regla, descripcion: e.plazo_descripcion, definitivo: e.plazo_definitivo,
    } : null,
    urgencia: u.nivel,
  };
}

export async function listarExpedientes(client, { hoy = hoyMexico(), clienteId } = {}) {
  const { rows } = await client.query(
    SQL_EXPEDIENTES + (clienteId ? ' AND e.cliente_id = $1' : '') + ' ORDER BY e.abierto_en',
    clienteId ? [clienteId] : [],
  );
  return rows.map(r => decorar({ ...r, plazo_fecha: r.plazo_fecha && toISO(r.plazo_fecha) }, hoy))
    .sort((a, b) => (a.estado === 'comercial') - (b.estado === 'comercial')
      || PESO_URGENCIA[a.urgencia] - PESO_URGENCIA[b.urgencia]
      || (a.plazo?.dias ?? 1e9) - (b.plazo?.dias ?? 1e9));
}

function toISO(d) {
  return d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : d;
}

export async function pendientesDe(client, expedienteIds) {
  if (!expedienteIds.length) return {};
  const { rows } = await client.query(
    `SELECT expediente_id, nombre, responsable, estado, nota FROM expediente_requisitos
     WHERE expediente_id = ANY($1) AND estado <> 'aprobado' AND archivado_en IS NULL ORDER BY orden`, [expedienteIds]);
  const m = {};
  for (const r of rows) (m[r.expediente_id] ??= []).push(r);
  return m;
}

export async function tablero(client, { hoy = hoyMexico() } = {}) {
  const expedientes = await listarExpedientes(client, { hoy });
  const activos = expedientes.filter(e => e.estado !== 'comercial' && e.estado !== 'concluido');
  const comerciales = expedientes.filter(e => e.estado === 'comercial');
  const { rows: acciones } = await client.query(
    `SELECT a.*, c.nombre_corto AS cliente FROM acciones a
     LEFT JOIN expedientes e ON e.id = a.expediente_id LEFT JOIN clientes c ON c.id = e.cliente_id
     WHERE a.archivado_en IS NULL AND a.estado IN ('propuesta','aprobada') ORDER BY a.creado_en`);
  const { rows: cobros } = await client.query(
    `SELECT h.*, c.nombre_corto AS cliente FROM hitos_cobro h JOIN expedientes e ON e.id = h.expediente_id
     JOIN clientes c ON c.id = e.cliente_id WHERE h.archivado_en IS NULL ORDER BY h.creado_en`);
  const vencenPronto = activos.filter(e => e.plazo && e.plazo.dias !== null && e.plazo.dias <= 30);
  return {
    hoy,
    indicadores: {
      expedientesActivos: activos.length,
      activosNombres: activos.map(e => e.cliente + (e.ubicacion ? ` ${e.terminal.replace('Terminal ', '')}` : '')),
      vencenEn30: vencenPronto.length,
      vencenEn30Detalle: vencenPronto.map(e => `${e.cliente} ${e.plazo.fechaTexto}`),
      esperandoCliente: activos.filter(e => e.estado === 'esperando_cliente').length,
      pendientesCliente: activos.reduce((s, e) => s + e.pendientes_cliente, 0),
      propuestasAbiertas: comerciales.length,
      propuestasNombres: comerciales.map(e => `${e.cliente} ${e.terminal.replace('Terminal ', '')}`),
    },
    expedientes,
    acciones,
    cobros,
  };
}

export async function detalleExpediente(client, id, { hoy = hoyMexico() } = {}) {
  const lista = await listarExpedientes(client, { hoy });
  const exp = lista.find(e => e.id === id);
  if (!exp) return null;
  const q = (sql) => client.query(sql, [id]).then(r => r.rows);
  const [requisitos, documentos, mensajes, plazos, bitacora, cobros, acciones] = await Promise.all([
    q(`SELECT id, seccion, nombre, responsable, estado, nota, propuesta_ia, aprobado_en,
              (SELECT nombre FROM usuarios u WHERE u.id = r.aprobado_por) AS aprobado_por_nombre
       FROM expediente_requisitos r WHERE expediente_id = $1 AND archivado_en IS NULL ORDER BY orden`),
    q(`SELECT id, nombre, tipo_mime, tamano_bytes, requisito_id, version, creado_en, (ruta_cifrada IS NOT NULL) AS disponible,
              (texto_extraido IS NOT NULL) AS con_texto, revision, referencia_autorizada, origen, tipo_escrito
       FROM documentos WHERE expediente_id = $1 AND archivado_en IS NULL ORDER BY creado_en DESC`),
    q(`SELECT id, canal, direccion, autor_tipo, autor_nombre, texto, creado_en FROM mensajes
       WHERE expediente_id = $1 AND archivado_en IS NULL ORDER BY creado_en`),
    q(`SELECT p.tipo, p.fecha, p.descripcion, p.regla, p.definitivo FROM plazos p
       WHERE p.archivado_en IS NULL AND (p.expediente_id = $1 OR p.permiso_id = (SELECT permiso_id FROM expedientes WHERE id = $1))
       ORDER BY p.fecha`),
    q(`SELECT b.cuando, b.actor, b.accion, b.tabla, b.detalle, u.nombre AS persona FROM bitacora b
       LEFT JOIN usuarios u ON u.id = b.usuario_id
       WHERE b.registro_id = $1 OR (b.detalle->>'expediente_id') = $1::text
       ORDER BY b.cuando DESC LIMIT 50`),
    q(`SELECT * FROM hitos_cobro WHERE expediente_id = $1 AND archivado_en IS NULL ORDER BY creado_en`),
    q(`SELECT * FROM acciones WHERE expediente_id = $1 AND archivado_en IS NULL ORDER BY creado_en DESC`),
  ]);
  return {
    ...exp,
    requisitos, documentos, mensajes, bitacora, cobros, acciones,
    plazos: plazos.map(p => ({ ...p, fecha: toISO(p.fecha), fechaTexto: fechaCorta(toISO(p.fecha)) })),
  };
}

/** Vista del portal del cliente: solo sus expedientes y sin datos internos. */
export async function portalCliente(client, { clienteId, hoy = hoyMexico() }) {
  const lista = await listarExpedientes(client, { hoy, clienteId });
  const visibles = lista.filter(e => e.estado !== 'comercial');
  const resultado = [];
  for (const e of visibles) {
    const d = await detalleExpediente(client, e.id, { hoy });
    resultado.push({
      id: d.id, tramite: d.tramite, homoclave: d.homoclave, permiso: d.permiso, servicio: d.servicio,
      terminal: d.terminal, ubicacion: d.ubicacion, consultor: d.consultor, tramite_clave: d.tramite_clave,
      total: d.total, aprobados: d.aprobados, con_observacion: d.con_observacion, plazo: d.plazo,
      fecha_otorgamiento: d.fecha_otorgamiento && toISO(d.fecha_otorgamiento),
      requisitos: d.requisitos.map(({ propuesta_ia, ...r }) => r),
      documentos: d.documentos.map(({ revision, referencia_autorizada, ...x }) => x),
      mensajes: d.mensajes.filter(m => m.canal !== 'interno'),
      plazos: d.plazos,
      loQueNecesitamos: d.requisitos.filter(r => ['cliente', 'ambos'].includes(r.responsable) && !['aprobado', 'recibido', 'en_revision'].includes(r.estado)),
    });
  }
  return resultado;
}
