// Aplica las migraciones (y opcionalmente las semillas) en orden.
// Se ejecuta con el usuario administrador de PostgreSQL (DATABASE_ADMIN_URL).
// Uso:  node db/migrar.js            → solo migraciones
//       node db/migrar.js --semillas → migraciones + catálogo + pilotos
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const aqui = path.dirname(fileURLToPath(import.meta.url));

export async function migrar({ url = process.env.DATABASE_ADMIN_URL, semillas = false, appPassword = process.env.APP_DB_PASSWORD, log = console.log } = {}) {
  if (!url) throw new Error('Falta DATABASE_ADMIN_URL');
  if (!appPassword) throw new Error('Falta APP_DB_PASSWORD (contraseña del rol logistics_app)');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS migraciones_aplicadas (nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())`);
    // Rol de la aplicación (sin poder de borrar ni de saltarse RLS)
    const { rows } = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'logistics_app'`);
    const pass = appPassword.replace(/'/g, "''");
    await client.query(rows.length
      ? `ALTER ROLE logistics_app LOGIN PASSWORD '${pass}'`
      : `CREATE ROLE logistics_app LOGIN PASSWORD '${pass}' NOBYPASSRLS`);

    const carpetas = [['migraciones', path.join(aqui, 'migraciones')]];
    if (semillas) carpetas.push(['semillas', path.join(aqui, 'semillas')]);
    for (const [tipo, dir] of carpetas) {
      for (const archivo of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
        const nombre = `${tipo}/${archivo}`;
        const ya = await client.query('SELECT 1 FROM migraciones_aplicadas WHERE nombre = $1', [nombre]);
        if (ya.rows.length) continue;
        const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO migraciones_aplicadas (nombre) VALUES ($1)', [nombre]);
          await client.query('COMMIT');
          log(`✔ ${nombre}`);
        } catch (e) {
          await client.query('ROLLBACK');
          throw new Error(`Falló ${nombre}: ${e.message}`);
        }
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrar({ semillas: process.argv.includes('--semillas') })
    .then(() => console.log('Base de datos al día.'))
    .catch(e => { console.error(e.message); process.exit(1); });
}
