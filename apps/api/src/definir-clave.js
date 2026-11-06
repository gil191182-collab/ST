// Define o cambia la contraseña de una persona. Se corre en el servidor:
//   docker compose exec api node src/definir-clave.js strateggia gil191182@gmail.com
// Pide la contraseña sin mostrarla en pantalla.
import readline from 'node:readline';
import { crearPool, conDespacho, despachoPorSubdominio } from './db.js';
import { hashClave } from './seguridad.js';

const [subdominio, correo] = process.argv.slice(2);
if (!subdominio || !correo) {
  console.error('Uso: node src/definir-clave.js <subdominio-del-despacho> <correo>');
  process.exit(1);
}

function preguntarOculto(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(texto)) process.stdout.write(s); };
    rl.question(texto, (r) => { rl.close(); process.stdout.write('\n'); resolve(r); });
  });
}

const clave = process.env.CLAVE_NUEVA ?? await preguntarOculto('Contraseña nueva (mínimo 10 caracteres): ');
if (clave.length < 10) { console.error('La contraseña debe tener al menos 10 caracteres.'); process.exit(1); }

const pool = crearPool(process.env.DATABASE_URL);
const despacho = await despachoPorSubdominio(pool, subdominio);
if (!despacho) { console.error('No existe ese despacho.'); process.exit(1); }
const n = await conDespacho(pool, { despachoId: despacho.id, actor: 'sistema' }, async (c) =>
  (await c.query('UPDATE usuarios SET clave_hash = $2 WHERE lower(correo) = lower($1) RETURNING id', [correo, hashClave(clave)])).rowCount);
await pool.end();
console.log(n ? 'Contraseña guardada.' : 'No se encontró a esa persona en el despacho.');
