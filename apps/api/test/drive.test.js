// Google Drive: importa lo nuevo, sugiere el requisito, no aprueba nada y no duplica.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crearPool, conDespacho } from '../src/db.js';
import { crearDrive, sincronizarExpediente } from '../src/drive.js';
import { baseDePrueba, IDS } from './ayuda.js';

let base, pool, carpeta;
const llave = Buffer.alloc(32, 7);
before(async () => {
  base = await baseDePrueba(); pool = crearPool(base.appUrl);
  carpeta = await mkdtemp(path.join(tmpdir(), 'drive-'));
});
after(async () => { await pool?.end(); await base?.cerrar(); });

/** Google Drive simulado: carpeta raíz con una subcarpeta "VISITA Y PAGO". */
function googleFalso(archivos) {
  const llamadas = [];
  const fetchFalso = async (url, op = {}) => {
    llamadas.push(String(url));
    const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, arrayBuffer: async () => new ArrayBuffer(0) });
    const u = String(url);
    if (u.includes('oauth2')) {
      assert.match(String(op.body), /grant_type=urn/);
      return json({ access_token: 'ficha', expires_in: 3600 });
    }
    if (u.includes('/files?q=')) {
      const q = decodeURIComponent(u.split('q=')[1].split('&')[0]);
      const padre = /'([^']+)' in parents/.exec(q)[1];
      return json({ files: archivos.filter(a => a.padre === padre).map(({ padre, contenido, ...a }) => a) });
    }
    const id = /files\/([^/?]+)/.exec(u)?.[1];
    const a = archivos.find(x => x.id === id);
    if (!a) return json({}, 404);
    if (u.includes('alt=media') || u.includes('/export')) {
      const b = Buffer.from(a.contenido ?? '');
      return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
    }
    return json({ id: a.id, name: a.name, mimeType: a.mimeType });
  };
  return { fetchFalso, llamadas };
}

test('Drive: importa cifrado, sugiere requisito, deja alerta, no aprueba y no duplica', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const archivos = [
    { id: 'raiz', name: 'KERI', mimeType: 'application/vnd.google-apps.folder', padre: 'nadie' },
    { id: 'sub', name: 'VISITA Y PAGO', mimeType: 'application/vnd.google-apps.folder', padre: 'raiz' },
    { id: 'f1', name: 'comprobante.txt', mimeType: 'text/plain', modifiedTime: '2026-11-08T10:00:00.000Z', size: '20', padre: 'sub', contenido: 'Pago de derechos SAT' },
    { id: 'f2', name: 'foto.jpg', mimeType: 'image/jpeg', modifiedTime: '2026-11-08T10:00:00.000Z', size: '3', padre: 'raiz', contenido: 'xyz' },
    { id: 'f3', name: 'PML ESCANEADO.pdf', mimeType: 'application/pdf', modifiedTime: '2026-11-08T10:00:00.000Z', size: String(154 * 1024 * 1024), padre: 'raiz' },
  ];
  const { fetchFalso } = googleFalso(archivos);
  const drive = crearDrive({ credenciales: { client_email: 'logistics-drive@prueba.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }, fetchImpl: fetchFalso });
  assert.equal((await drive.carpeta('raiz')).name, 'KERI');

  const ctx = { despachoId: IDS.despacho, usuarioId: IDS.mayela, actor: 'usuario' };
  await conDespacho(pool, ctx, (c) => c.query(`UPDATE expedientes SET drive_carpeta_id = 'raiz' WHERE id = $1`, [IDS.expKeri]));
  const opciones = { carpetaArchivos: carpeta, llaveArchivos: llave };
  const r = await conDespacho(pool, ctx, (c) => sincronizarExpediente(c, drive, IDS.expKeri, opciones));
  assert.equal(r.nuevos.length, 3, JSON.stringify(r));
  // El pesado no se descarga: queda solo el enlace a Drive
  const pml = r.nuevos.find(x => x.nombre === 'PML ESCANEADO.pdf');
  assert.equal(pml.soloEnlace, true);
  assert.equal(pml.requisito, 'Estudio de Pérdida Máxima Probable');
  const { rows: [dp] } = await base.superPool.query(`SELECT ruta_cifrada, tamano_bytes FROM documentos WHERE drive_id = 'f3'`);
  assert.equal(dp.ruta_cifrada, null);
  assert.equal(Number(dp.tamano_bytes), 154 * 1024 * 1024);
  const pago = r.nuevos.find(x => x.nombre.includes('comprobante'));
  assert.equal(pago.nombre, 'VISITA Y PAGO / comprobante.txt');
  assert.equal(pago.requisito, 'Pago de derechos de verificación');
  assert.equal(r.nuevos.find(x => x.nombre === 'foto.jpg').requisito, null);

  const { rows: [req] } = await base.superPool.query(
    `SELECT estado, propuesta_ia FROM expediente_requisitos WHERE expediente_id = $1 AND nombre = 'Pago de derechos de verificación'`, [IDS.expKeri]);
  assert.notEqual(req.estado, 'aprobado', 'nunca se aprueba solo');
  assert.equal(req.propuesta_ia.tipo, 'drive');
  const { rows: alertas } = await base.superPool.query(
    `SELECT borrador FROM acciones WHERE expediente_id = $1 AND tipo = 'alerta_interna' AND borrador LIKE '%desde Drive%'`, [IDS.expKeri]);
  assert.equal(alertas.length, 3);
  const { rows: [doc] } = await base.superPool.query(`SELECT origen, ruta_cifrada, texto_extraido FROM documentos WHERE drive_id = 'f1'`);
  assert.equal(doc.origen, 'drive');
  assert.ok(doc.ruta_cifrada);
  assert.match(doc.texto_extraido, /Pago de derechos/);

  // Segunda revisión: nada nuevo. Si el archivo cambia en Drive, entra como versión nueva.
  const otra = await conDespacho(pool, ctx, (c) => sincronizarExpediente(c, drive, IDS.expKeri, opciones));
  assert.equal(otra.nuevos.length, 0);
  archivos[2].modifiedTime = '2026-11-09T09:00:00.000Z';
  const cambio = await conDespacho(pool, ctx, (c) => sincronizarExpediente(c, drive, IDS.expKeri, opciones));
  assert.equal(cambio.nuevos.length, 1);
});

test('Drive: sin acceso a la carpeta, el mensaje dice con quién compartirla', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { fetchFalso } = googleFalso([]);
  const drive = crearDrive({ credenciales: { client_email: 'logistics-drive@prueba.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }, fetchImpl: fetchFalso });
  await assert.rejects(drive.carpeta('ajena'), /Comparta la carpeta con logistics-drive@prueba/);
  assert.equal(crearDrive({ ruta: '/no/existe.json' }), null, 'sin llave, el sistema sigue sin Drive');
});
