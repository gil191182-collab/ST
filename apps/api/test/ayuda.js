// Crea una base de datos nueva para cada archivo de pruebas, con migraciones y pilotos.
import pg from 'pg';
import crypto from 'node:crypto';
import { migrar } from '../../../db/migrar.js';

const ADMIN = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgresql://postgres@localhost:5433/postgres?host=/tmp';
const APP_PASSWORD = 'prueba-app';

export const IDS = {
  despacho: '00000000-0000-4000-8000-000000000001',
  gil: '00000000-0000-4000-8000-0000000000a1',
  mayela: '00000000-0000-4000-8000-0000000000a2',
  omar: '00000000-0000-4000-8000-0000000000a3',
  keri: '00000000-0000-4000-8000-0000000000c1',
  bulkmatic: '00000000-0000-4000-8000-0000000000c2',
  expKeri: '00000000-0000-4000-8000-000000000201',
  expBulkmatic: '00000000-0000-4000-8000-000000000202',
  expSfm: '00000000-0000-4000-8000-000000000203',
  terminalQueretaro: '00000000-0000-4000-8000-0000000000e4',
  permisoKeri: '00000000-0000-4000-8000-0000000000f1',
};

function urlCon(base, db, usuario) {
  const u = new URL(base);
  u.pathname = `/${db}`;
  if (usuario) { u.username = usuario; u.password = APP_PASSWORD; }
  return u.toString();
}

export async function baseDePrueba() {
  const nombre = `logistics_t_${crypto.randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nombre}`);
  await admin.end();
  const adminUrl = urlCon(ADMIN, nombre);
  await migrar({ url: adminUrl, semillas: true, appPassword: APP_PASSWORD, log: () => {} });
  const superPool = new pg.Pool({ connectionString: adminUrl, max: 2 });
  const appUrl = urlCon(ADMIN, nombre, 'logistics_app');
  return {
    nombre, adminUrl, appUrl, superPool,
    async cerrar() {
      await superPool.end();
      const a = new pg.Client({ connectionString: ADMIN });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
      await a.end();
    },
  };
}

/** Espera que la promesa falle con un código/mensaje de regla. */
export async function fallaCon(promesa, patron) {
  try { await promesa; } catch (e) {
    if (patron.test(e.message) || patron.test(e.code ?? '')) return e;
    throw new Error(`Falló, pero con otro error: ${e.code} ${e.message}`);
  }
  throw new Error(`Se esperaba un error ${patron}, pero la operación se permitió.`);
}
