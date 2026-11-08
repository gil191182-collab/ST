// Correo: destinatario correcto, envío SMTP y lectura IMAP de solo lectura.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearPool, conDespacho } from '../src/db.js';
import { direccionDe, enviarAprobadas, revisarCorreo } from '../src/worker.js';
import { crearCanales } from '../src/canales.js';
import { baseDePrueba, IDS } from './ayuda.js';

let base, pool;
before(async () => { base = await baseDePrueba(); pool = crearPool(base.appUrl); });
after(async () => { await pool?.end(); await base?.cerrar(); });

test('destinatario: nunca se manda al contacto del expediente si el mensaje es para otra persona', () => {
  const contacto = { contacto_nombre: 'Omar Israel Abarca Torres', correo: 'omar@keri.mx', telefono: '4491112233' };
  assert.ok(direccionDe({ ...contacto, canal: 'correo', destinatario: 'Berkley (aseguradora)' }).error);
  assert.equal(direccionDe({ ...contacto, canal: 'correo', destinatario: 'Berkley <polizas@berkley.com.mx>' }).valor, 'polizas@berkley.com.mx');
  assert.equal(direccionDe({ ...contacto, canal: 'correo', destinatario: 'Omar Israel Abarca Torres' }).valor, 'omar@keri.mx');
  assert.equal(direccionDe({ ...contacto, canal: 'whatsapp', destinatario: 'Omar Israel Abarca Torres' }).valor, '4491112233');
  assert.equal(direccionDe({ ...contacto, canal: 'whatsapp', destinatario: '+52 55 1234 5678' }).valor, '525512345678');
  assert.ok(direccionDe({ ...contacto, canal: 'whatsapp', destinatario: 'Lic. Carlos Gómez' }).error);
});

test('envío por SMTP de una acción aprobada (correo a la aseguradora con su dirección)', async () => {
  const enviados = [];
  const transporte = { sendMail: async (m) => { enviados.push(m); } };
  const canales = crearCanales({ SMTP_HOST: 'smtp.gmail.com', SMTP_USUARIO: 'mayela@gmail.com', SMTP_CLAVE: 'x' }, fetch, transporte);
  // Aprobar la propuesta del correo a Berkley, poniendo su dirección
  const { rows: [a] } = await base.superPool.query(`SELECT id FROM acciones WHERE canal = 'correo' AND expediente_id = $1`, [IDS.expKeri]);
  await conDespacho(pool, { despachoId: IDS.despacho, usuarioId: IDS.mayela, actor: 'usuario' }, (c) =>
    c.query(`UPDATE acciones SET estado = 'aprobada', aprobada_por = usuario_actual(), aprobada_en = now(), destinatario = 'Berkley <polizas@berkley.com.mx>' WHERE id = $1`, [a.id]));
  const r = await conDespacho(pool, { despachoId: IDS.despacho, actor: 'sistema' }, (c) => enviarAprobadas(c, canales));
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, 'polizas@berkley.com.mx');
  assert.equal(enviados[0].from, 'mayela@gmail.com');
  assert.ok(r.find(x => x.id === a.id).ok);
});

test('lectura del buzón: solo lectura, registra notificaciones de la ATTRAPI y no duplica', async () => {
  const crudo = (id, de, asunto, texto) => Buffer.from(`Message-ID: <${id}>\r\nFrom: ${de}\r\nSubject: ${asunto}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${texto}\r\n`);
  const correos = [
    crudo('a1@attrapi', 'CIS <cis@attrapi.gob.mx>', 'Acuerdo ATTRAPI/UVSR/DSF/101/2026', 'Permiso ATTRAPI-04-010-B/0058: se tiene por recibido el registro de tarifas.'),
    crudo('b2@promo', 'promo@tienda.com', 'Ofertas', 'Hola'),
  ];
  let modoLectura = null, cerrado = false;
  const clienteFalso = async () => ({
    connect: async () => {},
    getMailboxLock: async (buzon, op) => { modoLectura = op?.readOnly; return { release() {} }; },
    fetch: async function* () { for (const [i, source] of correos.entries()) yield { uid: i + 1, source }; },
    logout: async () => { cerrado = true; },
  });
  const cfg = { host: 'imap.gmail.com', port: 993, secure: true, auth: { user: 'x', pass: 'y' }, dias: 3, despacho: 'strateggia' };
  const r1 = await revisarCorreo(pool, cfg, { crearCliente: clienteFalso });
  assert.equal(modoLectura, true, 'el buzón se abre en solo lectura');
  assert.equal(cerrado, true);
  assert.equal(r1[0].expediente, IDS.expBulkmatic);
  assert.ok(r1[1].ignorado);
  const r2 = await revisarCorreo(pool, cfg, { crearCliente: clienteFalso });
  assert.equal(r2[0].duplicado, true, 'el mismo correo no se registra dos veces');
});

test('Mailrelay: misma forma que VerifyPerson y copia opcional', async () => {
  const llamadas = [];
  const fetchFalso = async (url, op) => { llamadas.push({ url, op, cuerpo: JSON.parse(op.body) }); return { ok: true, status: 200, text: async () => '' }; };
  const canales = crearCanales({ MAILRELAY_BASE_URL: 'https://cuenta.ipzmarketing.com/', MAILRELAY_API_KEY: 'k', MAILRELAY_FROM_EMAIL: 'hola@strateggia.mx', MAILRELAY_REAL: '1', CORREO_COPIA: 'strateggia2014@gmail.com' }, fetchFalso);
  const r = await canales.correo({ para: 'polizas@berkley.com.mx', asunto: 'Corrección de pólizas', texto: 'Buen día.\n\nLes pedimos <corregir> el domicilio.' });
  assert.equal(r.ok, true);
  assert.equal(llamadas[0].url, 'https://cuenta.ipzmarketing.com/api/v1/send_emails');
  assert.equal(llamadas[0].op.headers['X-AUTH-TOKEN'], 'k');
  assert.deepEqual(llamadas[0].cuerpo.to, [{ email: 'polizas@berkley.com.mx' }]);
  assert.equal(llamadas[0].cuerpo.from.email, 'hola@strateggia.mx');
  assert.equal(llamadas[0].cuerpo.html_part, '<p>Buen día.</p><p>Les pedimos &lt;corregir&gt; el domicilio.</p>');
  assert.equal(llamadas[1].cuerpo.subject, '[Copia] Corrección de pólizas');
  // Sin el interruptor no se manda nada
  assert.equal(crearCanales({ MAILRELAY_BASE_URL: 'x', MAILRELAY_API_KEY: 'k', MAILRELAY_FROM_EMAIL: 'a@b.c' }, fetchFalso).configurados.correo, false);
});
