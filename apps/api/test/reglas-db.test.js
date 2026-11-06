// Reglas del dominio que viven en la base de datos (CLAUDE.md §4).
// Se prueban con el MISMO rol con el que se conecta la aplicación.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearPool, conDespacho } from '../src/db.js';
import { baseDePrueba, fallaCon, IDS } from './ayuda.js';

let base, pool, otroDespacho, otroUsuario;
const comoMayela = { despachoId: IDS.despacho, usuarioId: IDS.mayela, actor: 'usuario' };

before(async () => {
  base = await baseDePrueba();
  pool = crearPool(base.appUrl);
  // Segundo despacho para probar aislamiento
  const { rows } = await base.superPool.query(
    `INSERT INTO despachos (nombre, subdominio, tema) VALUES ('Otro Despacho', 'otro', '{"fondo":"#000000","acento":"#FF0000"}') RETURNING id`);
  otroDespacho = rows[0].id;
  const u = await base.superPool.query(
    `INSERT INTO usuarios (despacho_id, nombre, correo, rol) VALUES ($1, 'Consultor Otro', 'c@otro.mx', 'consultor') RETURNING id`, [otroDespacho]);
  otroUsuario = u.rows[0].id;
});
after(async () => { await pool?.end(); await base?.cerrar(); });

test('aislamiento: otro despacho no ve los expedientes de Strateggia', async () => {
  const n = await conDespacho(pool, { despachoId: otroDespacho, usuarioId: otroUsuario }, async (c) =>
    (await c.query('SELECT count(*)::int AS n FROM expedientes')).rows[0].n);
  assert.equal(n, 0);
  const propios = await conDespacho(pool, comoMayela, async (c) =>
    (await c.query('SELECT count(*)::int AS n FROM expedientes')).rows[0].n);
  assert.equal(propios, 5);
});

test('aislamiento: sin despacho fijado no se ve nada', async () => {
  const c = await pool.connect();
  try {
    assert.equal((await c.query('SELECT count(*)::int AS n FROM expedientes')).rows[0].n, 0);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM bitacora')).rows[0].n, 0);
  } finally { c.release(); }
});

test('aislamiento: no se puede escribir en otro despacho', async () => {
  await fallaCon(conDespacho(pool, { despachoId: otroDespacho, usuarioId: otroUsuario }, (c) =>
    c.query(`INSERT INTO clientes (despacho_id, razon_social, nombre_corto) VALUES ($1, 'X', 'X')`, [IDS.despacho])),
  /row-level security/);
  const r = await conDespacho(pool, { despachoId: otroDespacho, usuarioId: otroUsuario }, (c) =>
    c.query(`UPDATE expedientes SET siguiente_paso = 'hackeado' WHERE id = $1`, [IDS.expKeri]));
  assert.equal(r.rowCount, 0, 'el UPDATE no debe alcanzar filas de otro despacho');
});

test('nunca se borra: la app no tiene permiso de DELETE', async () => {
  await fallaCon(conDespacho(pool, comoMayela, (c) => c.query('DELETE FROM mensajes')), /42501|permission denied/);
});

test('nunca se borra: ni siquiera el administrador de la base', async () => {
  await fallaCon(base.superPool.query('DELETE FROM expedientes WHERE id = $1', [IDS.expKeri]), /NUNCA_SE_BORRA/);
  await fallaCon(base.superPool.query('TRUNCATE documentos CASCADE'), /NUNCA_SE_BORRA/);
});

test('la IA no puede aprobar requisitos', async () => {
  await fallaCon(conDespacho(pool, { despachoId: IDS.despacho, usuarioId: IDS.mayela, actor: 'ia' }, (c) =>
    c.query(`UPDATE expediente_requisitos SET estado = 'aprobado', aprobado_por = $1, aprobado_en = now()
             WHERE expediente_id = $2 AND estado = 'pendiente'`, [IDS.mayela, IDS.expKeri])),
  /SOLO_PERSONAS/);
});

test('un cliente no puede aprobar requisitos', async () => {
  await fallaCon(conDespacho(pool, { despachoId: IDS.despacho, usuarioId: IDS.omar, actor: 'usuario' }, (c) =>
    c.query(`UPDATE expediente_requisitos SET estado = 'aprobado', aprobado_por = $1, aprobado_en = now()
             WHERE expediente_id = $2 AND estado = 'pendiente'`, [IDS.omar, IDS.expKeri])),
  /SOLO_CONSULTORES/);
});

test('no se aprueba a nombre de otra persona', async () => {
  await fallaCon(conDespacho(pool, comoMayela, (c) =>
    c.query(`UPDATE expediente_requisitos SET estado = 'aprobado', aprobado_por = $1, aprobado_en = now()
             WHERE expediente_id = $2 AND estado = 'pendiente'`, [IDS.gil, IDS.expKeri])),
  /APROBADOR_DISTINTO/);
});

test('aprobado sin persona es imposible', async () => {
  await fallaCon(conDespacho(pool, comoMayela, (c) =>
    c.query(`UPDATE expediente_requisitos SET estado = 'aprobado' WHERE expediente_id = $1 AND estado = 'pendiente'`, [IDS.expKeri])),
  /aprobado_requiere_persona|SOLO_CONSULTORES/);
});

test('un consultor sí aprueba, y queda en la bitácora con su nombre', async () => {
  const id = await conDespacho(pool, comoMayela, async (c) => {
    const { rows: [r] } = await c.query(
      `UPDATE expediente_requisitos SET estado = 'aprobado', aprobado_por = usuario_actual(), aprobado_en = now()
       WHERE expediente_id = $1 AND nombre = 'Pago de derechos de verificación' RETURNING id`, [IDS.expKeri]);
    return r.id;
  });
  const b = await conDespacho(pool, comoMayela, async (c) =>
    (await c.query(`SELECT actor, usuario_id, detalle FROM bitacora WHERE registro_id = $1 ORDER BY id DESC LIMIT 1`, [id])).rows[0]);
  assert.equal(b.actor, 'usuario');
  assert.equal(b.usuario_id, IDS.mayela);
  assert.equal(b.detalle.estado, 'aprobado');
});

test('cadena: no se abre Inicio de Operaciones sin permiso en la terminal', async () => {
  await fallaCon(conDespacho(pool, comoMayela, (c) => c.query(
    `INSERT INTO expedientes (despacho_id, cliente_id, terminal_id, tramite_version_id)
     SELECT despacho_actual(), $1, $2, v.id FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id WHERE t.clave = 'inicio_operaciones'`,
    [IDS.bulkmatic, IDS.terminalQueretaro])), /CADENA_INCOMPLETA/);
});

test('cadena: como propuesta comercial sí se puede, pero no se activa sin el permiso', async () => {
  const id = await conDespacho(pool, comoMayela, async (c) => (await c.query(
    `INSERT INTO expedientes (despacho_id, cliente_id, terminal_id, tramite_version_id, estado)
     SELECT despacho_actual(), $1, $2, v.id, 'comercial' FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id
     WHERE t.clave = 'inicio_operaciones' RETURNING id`, [IDS.bulkmatic, IDS.terminalQueretaro])).rows[0].id);
  await fallaCon(conDespacho(pool, comoMayela, (c) =>
    c.query(`UPDATE expedientes SET estado = 'en_integracion' WHERE id = $1`, [id])), /CADENA_INCOMPLETA/);
});

test('cadena: "ya existe fuera del sistema" exige documento y desbloquea', async () => {
  await fallaCon(conDespacho(pool, comoMayela, (c) => c.query(
    `INSERT INTO antecedentes_externos (despacho_id, terminal_id, tramite_clave, descripcion, marcado_por)
     VALUES (despacho_actual(), $1, 'permiso', 'Permiso sin documento', usuario_actual())`, [IDS.terminalQueretaro])), /null value|not-null/);
  await conDespacho(pool, comoMayela, async (c) => {
    const { rows: [d] } = await c.query(`INSERT INTO documentos (despacho_id, nombre, subido_por) VALUES (despacho_actual(), 'Permiso Querétaro', usuario_actual()) RETURNING id`);
    await c.query(`INSERT INTO antecedentes_externos (despacho_id, terminal_id, tramite_clave, documento_id, descripcion, marcado_por)
                   VALUES (despacho_actual(), $1, 'permiso', $2, 'Permiso de terminal de carga Querétaro', usuario_actual())`, [IDS.terminalQueretaro, d.id]);
    await c.query(`INSERT INTO expedientes (despacho_id, cliente_id, terminal_id, tramite_version_id)
                   SELECT despacho_actual(), $1, $2, v.id FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id WHERE t.clave = 'inicio_operaciones'`,
      [IDS.bulkmatic, IDS.terminalQueretaro]);
  });
});

test('catálogo versionado: el expediente no cambia de versión', async () => {
  const otra = (await base.superPool.query(
    `INSERT INTO tramite_versiones (tramite_id, homoclave_actual, vigente_desde)
     SELECT id, 'ATTRAPI-XX-NUEVA', DATE '2027-01-01' FROM tramites WHERE clave = 'inicio_operaciones' RETURNING id`)).rows[0].id;
  await fallaCon(conDespacho(pool, comoMayela, (c) =>
    c.query(`UPDATE expedientes SET tramite_version_id = $1 WHERE id = $2`, [otra, IDS.expKeri])), /VERSION_CONGELADA/);
});

test('la app no puede editar el catálogo', async () => {
  await fallaCon(conDespacho(pool, comoMayela, (c) =>
    c.query(`UPDATE tramite_versiones SET homoclave_actual = 'X'`)), /42501|permission denied/);
});

test('bitácora: no se edita ni se borra (ni la app ni el administrador)', async () => {
  await fallaCon(conDespacho(pool, comoMayela, (c) => c.query(`UPDATE bitacora SET accion = 'x'`)), /42501|permission denied/);
  await fallaCon(base.superPool.query(`UPDATE bitacora SET accion = 'x'`), /BITACORA_INMUTABLE/);
  await fallaCon(base.superPool.query(`DELETE FROM bitacora`), /BITACORA_INMUTABLE/);
});

test('acciones: ingresar ante la autoridad nunca queda "enviada" por el sistema', async () => {
  await fallaCon(conDespacho(pool, comoMayela, (c) => c.query(
    `INSERT INTO acciones (despacho_id, expediente_id, tipo, borrador, estado, propuesta_por, aprobada_por, aprobada_en)
     VALUES (despacho_actual(), $1, 'ingreso_autoridad', 'Ingreso', 'enviada', 'sistema', usuario_actual(), now())`, [IDS.expKeri])),
  /acciones_solo_humanas/);
});

test('acciones: el sistema no puede aprobar sus propias propuestas', async () => {
  await fallaCon(conDespacho(pool, { despachoId: IDS.despacho, actor: 'sistema' }, (c) => c.query(
    `UPDATE acciones SET estado = 'aprobada', aprobada_por = $1, aprobada_en = now() WHERE estado = 'propuesta'`, [IDS.mayela])),
  /SOLO_PERSONAS/);
});
