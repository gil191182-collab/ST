// Acceso a la base. TODA consulta operativa pasa por conDespacho(), que abre una
// transacción y fija el despacho, la persona y el tipo de actor. Row Level
// Security en PostgreSQL hace el resto: si se olvida el despacho, no se ve nada.
import pg from 'pg';

// Las fechas (tipo date) se manejan como texto AAAA-MM-DD, sin zona horaria.
pg.types.setTypeParser(1082, v => v);

export function crearPool(url) {
  return new pg.Pool({ connectionString: url, max: 10 });
}

/**
 * @param {pg.Pool} pool
 * @param {{despachoId: string, usuarioId?: string|null, actor?: 'usuario'|'ia'|'sistema'}} ctx
 * @param {(client: pg.PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function conDespacho(pool, ctx, fn) {
  if (!ctx?.despachoId) throw new Error('conDespacho: falta despachoId');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.despacho_id', $1, true), set_config('app.usuario_id', $2, true), set_config('app.actor', $3, true)`,
      [ctx.despachoId, ctx.usuarioId ?? '', ctx.actor ?? (ctx.usuarioId ? 'usuario' : 'sistema')],
    );
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Funciones acotadas que operan "por encima" del aislamiento (definidas en la base). */
export async function despachoPorSubdominio(pool, subdominio) {
  const { rows } = await pool.query('SELECT * FROM despacho_por_subdominio($1)', [subdominio]);
  return rows[0] ?? null;
}

export async function despachosActivos(pool) {
  const { rows } = await pool.query('SELECT despachos_activos() AS id');
  return rows.map(r => r.id);
}

/** Traduce los errores de reglas de la base a mensajes para la persona. */
export function traducirError(e) {
  const m = /^([A-Z_]+): (.*)$/s.exec(e?.message ?? '');
  if (e?.code === 'P0001' && m) {
    const estatus = { NUNCA_SE_BORRA: 409, CADENA_INCOMPLETA: 409, VERSION_CONGELADA: 409,
      SOLO_PERSONAS: 403, SOLO_CONSULTORES: 403, SOLO_DIRECTOR: 403, APROBADOR_DISTINTO: 403, BITACORA_INMUTABLE: 409 }[m[1]] ?? 400;
    return { estatus, codigo: m[1], mensaje: m[2] };
  }
  if (e?.code === '23514') return { estatus: 400, codigo: 'REGLA', mensaje: `No se cumple una regla del sistema (${e.constraint}).` };
  if (e?.code === '42501') return { estatus: 403, codigo: 'SIN_PERMISO', mensaje: 'La aplicación no tiene permiso para esa operación.' };
  return null;
}
