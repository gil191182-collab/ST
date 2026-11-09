// Pruebas de la segunda etapa: altas, invitaciones, documentos, escritos,
// plantillas anónimas, entradas de WhatsApp/correo y publicaciones.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document, Packer, Paragraph } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { cargarConfig } from '../src/config.js';
import { crearPool } from '../src/db.js';
import { crearApp } from '../src/app.js';
import { crearMarce } from '../src/marce.js';
import { hashClave } from '../src/seguridad.js';
import { extraerTexto } from '../src/texto.js';
import { baseDePrueba, IDS } from './ayuda.js';

let base, pool, app, carpeta, marceFalsa;
const H = { 'x-despacho': 'strateggia' };
const TOKEN = 'token-de-entradas-123456';

async function entrar(correo, clave = 'clave-segura-123') {
  const r = await app.inject({ method: 'POST', url: '/api/sesion', headers: H, payload: { correo, clave } });
  assert.equal(r.statusCode, 200, r.body);
  return { ...H, cookie: `sesion=${r.cookies.find(c => c.name === 'sesion').value}` };
}
const pedir = async (h, method, url, payload) => {
  const r = await app.inject({ method, url, headers: h, payload });
  return { status: r.statusCode, json: r.body ? (() => { try { return JSON.parse(r.body); } catch { return r.body; } })() : null, raw: r };
};
function multipart(nombre, contenido, tipo, campos = {}) {
  const lim = '----lim' + Math.random().toString(16).slice(2);
  const partes = Object.entries(campos).map(([k, v]) => Buffer.from(`--${lim}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  partes.push(Buffer.from(`--${lim}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`), Buffer.from(contenido), Buffer.from(`\r\n--${lim}--\r\n`));
  return { payload: Buffer.concat(partes), tipo: `multipart/form-data; boundary=${lim}` };
}

before(async () => {
  base = await baseDePrueba();
  pool = crearPool(base.appUrl);
  carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'archivos-'));
  await base.superPool.query(`UPDATE usuarios SET clave_hash = $1 WHERE id IN ($2, $3, $4)`, [hashClave('clave-segura-123'), IDS.mayela, IDS.omar, IDS.gil]);
  await base.superPool.query(`UPDATE contactos SET telefono = '+52 449 111 2233' WHERE nombre LIKE 'Omar%'`);
  await base.superPool.query(`UPDATE permisos SET domicilio_textual = 'Carretera Panamericana, Km. 59.8, Soledad de Abajo, Cosío, Aguascalientes' WHERE id = $1`, [IDS.permisoKeri]);
  marceFalsa = {};
  const clienteFalso = { beta: { messages: { create: async (p) => { marceFalsa.ultimo = p; return marceFalsa.respuesta; } } } };
  const config = cargarConfig({ DATABASE_URL: base.appUrl, ARCHIVOS_CARPETA: carpeta, ENTRADAS_TOKEN: TOKEN, WA_SECRETO_WEBHOOK: 'whsec_prueba' });
  app = crearApp({ config, pool, marce: crearMarce({ modelo: 'claude-opus-5-5', activo: true, cliente: clienteFalso }) });
  await app.ready();
});
after(async () => { await app?.close(); await pool?.end(); await base?.cerrar(); await fs.rm(carpeta, { recursive: true, force: true }); });

test('alta completa: cliente → contacto → terminal → permiso → plazos; luego abrir Inicio de Operaciones', async () => {
  const h = await entrar('mayela@capturar-correo.invalid');
  const cl = await pedir(h, 'POST', '/api/clientes', { razon_social: 'Terminal de Prueba, S.A. de C.V.', nombre_corto: 'Prueba', rfc: 'TPR200101AB1' });
  assert.equal(cl.status, 200, JSON.stringify(cl.json));
  const ct = await pedir(h, 'POST', `/api/clientes/${cl.json.id}/contactos`, { nombre: 'Ana Pérez', telefono: '55 1234 5678' });
  assert.equal(ct.status, 200);
  const te = await pedir(h, 'POST', `/api/clientes/${cl.json.id}/terminales`, { nombre: 'Terminal Lerma', municipio: 'Lerma', estado: 'Estado de México' });
  const pe = await pedir(h, 'POST', `/api/terminales/${te.json.id}/permisos`, {
    numero: 'ATTRAPI-04-010-A/0099', tipo: '04-010-A', servicio: 'Terminal de carga',
    domicilio_textual: 'Carretera Toluca-Naucalpan Km. 5, Lerma, Estado de México', fecha_otorgamiento: '2026-10-01' });
  assert.equal(pe.status, 200, JSON.stringify(pe.json));
  assert.ok(pe.json.avisos.some(a => /línea ferroviaria/.test(a)), 'avisa que falta la línea');
  // El Inicio de Operaciones no se abre: falta el antecedente del permiso en la terminal
  const sin = await pedir(h, 'POST', '/api/expedientes', { terminal_id: te.json.id, permiso_id: pe.json.id, tramite_clave: 'inicio_operaciones' });
  assert.equal(sin.status, 409);
  // Se sube el permiso y se marca "ya existe fuera del sistema"
  const mp = multipart('permiso.txt', 'Permiso ATTRAPI-04-010-A/0099', 'text/plain');
  const doc = await app.inject({ method: 'POST', url: `/api/terminales/${te.json.id}/documentos`, headers: { ...h, 'content-type': mp.tipo }, payload: mp.payload });
  assert.equal(doc.statusCode, 200, doc.body);
  const ant = await pedir(h, 'POST', '/api/antecedentes', { terminal_id: te.json.id, tramite_clave: 'permiso', documento_id: doc.json().id, descripcion: 'Permiso 0099 del 1 oct 2026' });
  assert.equal(ant.status, 200);
  const exp = await pedir(h, 'POST', '/api/expedientes', { terminal_id: te.json.id, permiso_id: pe.json.id, tramite_clave: 'inicio_operaciones' });
  assert.equal(exp.status, 200, JSON.stringify(exp.json));
  const det = await pedir(h, 'GET', `/api/expedientes/${exp.json.id}`);
  assert.equal(det.json.requisitos.length, 21, 'versión 2 del catálogo (desde 8 nov 2026)');
  assert.equal(det.json.plazo.fecha, '2027-03-30', '1 oct 2026 + 180 días naturales');
  // Concluir sin resultado no se permite
  const conc = await pedir(h, 'PATCH', `/api/expedientes/${exp.json.id}`, { estado: 'concluido' });
  assert.equal(conc.status, 400);
});

test('prórroga y resolución recalculan los plazos', async () => {
  const h = await entrar('mayela@capturar-correo.invalid');
  const pr = await pedir(h, 'POST', `/api/permisos/${IDS.permisoKeri}/resoluciones`, { tramite_clave: 'renovacion_polizas', oficio: 'Oficio ATTRAPI/1.4.-300/2026', fecha: '2026-07-01' });
  assert.equal(pr.status, 200, JSON.stringify(pr.json));
  assert.ok(pr.json.plazos.some(p => p.tipo === 'polizas' && p.a === '2027-07-01'));
});

test('invitación: enlace de un solo uso para definir contraseña', async () => {
  const hG = await entrar('gil191182@gmail.com');
  const hM = await entrar('mayela@capturar-correo.invalid');
  // Un consultor no invita consultores; el director sí
  assert.equal((await pedir(hM, 'POST', '/api/usuarios', { nombre: 'Nuevo', correo: 'nuevo@strateggia.mx', rol: 'consultor' })).status, 403);
  const inv = await pedir(hG, 'POST', '/api/usuarios', { nombre: 'Consultor Nuevo', correo: 'nuevo@strateggia.mx', rol: 'consultor' });
  assert.equal(inv.status, 200);
  const ficha = inv.json.enlace.split('/').pop();
  assert.equal((await pedir(H, 'GET', `/api/acceso/${ficha}`)).json.nombre, 'Consultor Nuevo');
  assert.equal((await pedir(H, 'POST', `/api/acceso/${ficha}`, { clave: 'corta' })).status, 400);
  assert.equal((await pedir(H, 'POST', `/api/acceso/${ficha}`, { clave: 'una-clave-larga-1' })).status, 200);
  assert.equal((await pedir(H, 'POST', `/api/acceso/${ficha}`, { clave: 'otra-clave-larga-2' })).status, 410, 'no se reutiliza');
  await entrar('nuevo@strateggia.mx', 'una-clave-larga-1');
  const { rows: [i] } = await base.superPool.query(`SELECT huella FROM invitaciones LIMIT 1`);
  assert.notEqual(i.huella, ficha, 'en la base solo queda la huella');
  // Un consultor sí invita a un cliente al portal
  const cli = await pedir(hM, 'POST', '/api/usuarios', { nombre: 'Carlos Gómez', correo: 'carlos@bulkmatic.invalid', rol: 'cliente', cliente_id: IDS.bulkmatic });
  assert.equal(cli.status, 200);
});

test('extracción de texto de Word y PDF', async () => {
  const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Póliza de Responsabilidad Civil con domicilio en Cosío')] }] }));
  assert.match(await extraerTexto(docx, { nombre: 'poliza.docx' }), /Responsabilidad Civil/);
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Estudio de Perdida Maxima Probable', { x: 50, y: 700, font: await pdf.embedFont(StandardFonts.Helvetica) });
  assert.match(await extraerTexto(Buffer.from(await pdf.save()), { nombre: 'pml.pdf' }), /Perdida Maxima/);
  assert.equal(await extraerTexto(Buffer.from('xx'), { nombre: 'foto.jpg' }), null);
});

test('documento subido: revisión por reglas y pre-revisión de Marce sin aprobar', async () => {
  const h = await entrar('mayela@capturar-correo.invalid');
  const det = (await pedir(h, 'GET', `/api/expedientes/${IDS.expKeri}`)).json;
  const rc = det.requisitos.find(r => r.nombre === 'Póliza de Responsabilidad Civil');
  const texto = 'Póliza RC. Domicilio: Carretera Panamericana Km 59.8, Soledad de Abajo, Cosio, Aguascalientes. Beneficiario: Agencia Reguladora del Transporte Ferroviario.';
  const mp = multipart('poliza-rc.txt', texto, 'text/plain', { requisito_id: rc.id });
  const sub = await app.inject({ method: 'POST', url: `/api/expedientes/${IDS.expKeri}/documentos`, headers: { ...h, 'content-type': mp.tipo }, payload: mp.payload });
  assert.equal(sub.json().con_texto, true);
  const rev = await pedir(h, 'POST', `/api/documentos/${sub.json().id}/revisar`);
  const porRegla = Object.fromEntries(rev.json.resultados.map(x => [x.regla, x.resultado]));
  assert.equal(porRegla.domicilio_identico, 'REVISAR', 'el domicilio no aparece idéntico');
  assert.equal(porRegla.agencia_anterior, 'FALLA');
  marceFalsa.respuesta = { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({
    resumen: 'La póliza tiene el domicilio distinto al permiso.', observaciones: [{ nivel: 'FALLA', mensaje: 'Dice "Km 59.8" y "Cosio" sin acento; el permiso dice "Km. 59.8" y "Cosío".' }] }) }] };
  const m = await pedir(h, 'POST', `/api/documentos/${sub.json().id}/revisar-con-marce`);
  assert.equal(m.json.observaciones[0].nivel, 'FALLA');
  assert.match(marceFalsa.ultimo.messages[0].content, /Domicilio textual del permiso: Carretera Panamericana, Km\. 59\.8/);
  const despues = (await pedir(h, 'GET', `/api/expedientes/${IDS.expKeri}`)).json.requisitos.find(r => r.id === rc.id);
  assert.equal(despues.estado, 'observacion', 'el estado no lo cambia ni la revisión ni Marce');
  assert.ok(despues.propuesta_ia.marce && despues.propuesta_ia.reglas);
});

test('escritos: Word y PDF con domicilio textual; acción de firma propuesta', async () => {
  const h = await entrar('mayela@capturar-correo.invalid');
  const sinFecha = await pedir(h, 'POST', `/api/expedientes/${IDS.expKeri}/escritos`, { tipo: 'aviso_inicio_operaciones' });
  assert.equal(sinFecha.status, 400);
  assert.match(sinFecha.json.mensaje, /fecha_inicio/);
  const r = await pedir(h, 'POST', `/api/expedientes/${IDS.expKeri}/escritos`, { tipo: 'aviso_inicio_operaciones', fecha_inicio: '1 de diciembre de 2026', firmante: 'Omar Israel Abarca Torres' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.documentos.length, 2);
  const pdfDoc = r.json.documentos.find(d => d.nombre.endsWith('.pdf'));
  const { url } = (await pedir(h, 'GET', `/api/documentos/${pdfDoc.id}/url`)).json;
  const pdf = (await app.inject({ url })).rawPayload;
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const texto = await extraerTexto(pdf, { nombre: 'x.pdf' });
  assert.match(texto.replace(/\s+/g, ' '), /Carretera Panamericana, Km\. 59\.8, Soledad de Abajo, Cosío, Aguascalientes/);
  assert.match(texto, /AGENCIA DE TRENES Y TRANSPORTE PÚBLICO INTEGRADO/);
  const { rows } = await base.superPool.query(`SELECT tipo, estado FROM acciones WHERE expediente_id = $1 AND tipo = 'firma'`, [IDS.expKeri]);
  assert.deepEqual(rows, [{ tipo: 'firma', estado: 'propuesta' }]);
  // Un escrito que cite a la antigua Agencia no se genera
  const malo = await pedir(h, 'POST', `/api/expedientes/${IDS.expKeri}/escritos`, { tipo: 'escrito_libre', asunto: 'Prueba', cuerpo: ['Conforme a la Agencia Reguladora del Transporte Ferroviario...'], firmante: 'X' });
  assert.equal(malo.status, 400);
  // Carta membretada del despacho
  const carta = await pedir(h, 'POST', `/api/expedientes/${IDS.expKeri}/escritos`, { tipo: 'carta_despacho', destinatario: 'Berkley México', asunto: 'Corrección de pólizas', cuerpo: ['Les pedimos corregir el domicilio.'] });
  assert.equal(carta.status, 200, JSON.stringify(carta.json));
});

test('escrito de solicitud de inicio de operaciones (machote Strateggia): pide los datos que faltan y no cita a la antigua Agencia', async () => {
  const h = await entrar('mayela@capturar-correo.invalid');
  const tipos = (await pedir(h, 'GET', '/api/escritos/tipos')).json;
  const t = tipos.find(x => x.clave === 'solicitud_inicio_operaciones');
  assert.ok(t && t.campos.length >= 5);
  const incompleto = await pedir(h, 'POST', `/api/expedientes/${IDS.expKeri}/escritos`, { tipo: 'solicitud_inicio_operaciones', firmante: 'Omar Israel Abarca Torres' });
  assert.equal(incompleto.status, 400);
  assert.match(incompleto.json.mensaje, /escritura_poder/);
  const extras = {
    escritura_poder: 'Escritura Pública No. 26,484 de fecha 21 de abril de 2016',
    autorizados: 'los CC. Lic. Lisette Mayela Romero Pérez y Lic. Eder Giovanni Suárez Padilla',
    domicilio_notificaciones: 'Avenida Tecnológico 1220, colonia Villa de las Palmas, Aguascalientes, C.P. 20263',
    superficie: '175,311.00 m²', condicion_inicio: 'Condición DÉCIMA', condicion_anexos: 'Condición DÉCIMA',
  };
  const r = await pedir(h, 'POST', `/api/expedientes/${IDS.expKeri}/escritos`, { tipo: 'solicitud_inicio_operaciones', firmante: 'Omar Israel Abarca Torres', extras });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const pdfDoc = r.json.documentos.find(d => d.nombre.endsWith('.pdf'));
  const { url } = (await pedir(h, 'GET', `/api/documentos/${pdfDoc.id}/url`)).json;
  const texto = (await extraerTexto((await app.inject({ url })).rawPayload, { nombre: 'x.pdf' })).replace(/\s+/g, ' ');
  assert.match(texto, /Carretera Panamericana, Km\. 59\.8, Soledad de Abajo, Cosío, Aguascalientes/);
  assert.match(texto, /artículo 194 del Reglamento del Servicio Ferroviario/);
  assert.match(texto, /Escritura Pública No\. 26,484/);
  assert.doesNotMatch(texto, /Agencia Reguladora/i);
});

test('plantilla anónima: solo de referencias autorizadas y sin datos del cliente', async () => {
  const h = await entrar('mayela@capturar-correo.invalid');
  const mp = multipart('contingencias-keri.txt', 'Programa de Contingencias de Energéticos Keri, S.A.P.I. de C.V., terminal en Carretera Panamericana, Km. 59.8, Soledad de Abajo, Cosío, Aguascalientes. Responsable: Omar Israel Abarca Torres. Brigadas internas y rutas de evacuación.', 'text/plain');
  const d = (await app.inject({ method: 'POST', url: `/api/expedientes/${IDS.expKeri}/documentos`, headers: { ...h, 'content-type': mp.tipo }, payload: mp.payload })).json();
  assert.equal((await pedir(h, 'POST', '/api/plantillas/borrador', { documento_id: d.id })).status, 400, 'aún no es referencia autorizada');
  await pedir(h, 'POST', `/api/documentos/${d.id}/referencia-autorizada`, { valor: true });
  const b = (await pedir(h, 'POST', '/api/plantillas/borrador', { documento_id: d.id })).json;
  assert.doesNotMatch(b.contenido_anonimo, /Keri|Abarca|59\.8/);
  assert.match(b.contenido_anonimo, /\[RAZÓN SOCIAL\]/);
  const fuga = await pedir(h, 'POST', '/api/plantillas', { documento_id: d.id, nombre: 'Contingencias base', tramite_clave: 'programa_contingencias', contenido_anonimo: b.contenido_anonimo + ' Contacto: Omar Israel Abarca Torres' });
  assert.equal(fuga.status, 400);
  const ok = await pedir(h, 'POST', '/api/plantillas', { documento_id: d.id, nombre: 'Contingencias base', tramite_clave: 'programa_contingencias', contenido_anonimo: b.contenido_anonimo });
  assert.equal(ok.status, 200);
  assert.equal((await pedir(h, 'GET', '/api/plantillas')).json.length, 1);
});

test('WhatsApp entrante por wa-mcp: firma verificada, va al expediente y genera alerta', async () => {
  const crypto = await import('node:crypto');
  const enviar = (obj, firma) => {
    const cuerpo = JSON.stringify(obj);
    const f = firma ?? 'sha256=' + crypto.createHmac('sha256', 'whsec_prueba').update(cuerpo).digest('hex');
    return app.inject({ method: 'POST', url: '/api/entradas/wa-mcp?despacho=strateggia', payload: cuerpo,
      headers: { 'content-type': 'application/json', 'x-wa-evento': obj.evento, 'x-wa-signature': f } });
  };
  const aviso = { evento: 'mensaje_entrante', espacio: 'strateggia', ts: new Date().toISOString(),
    datos: { telefono: '524491112233', nombre: 'Omar', texto: 'Ya subimos el comprobante', tipo: 'text', wa_message_id: 'wamid.1' } };
  assert.equal((await enviar(aviso, 'sha256=falsa')).statusCode, 401, 'sin firma válida no se acepta');
  const r = await enviar(aviso);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().expediente, IDS.expKeri);
  assert.equal((await enviar(aviso)).json().duplicado, true);
  const { rows } = await base.superPool.query(`SELECT borrador FROM acciones WHERE tipo = 'alerta_interna' AND borrador LIKE 'WhatsApp de Omar%'`);
  assert.equal(rows.length, 1);
  const baja = await enviar({ evento: 'baja', espacio: 'strateggia', datos: { telefono: '524491112233', texto: 'ya no me escriban' } });
  assert.equal(baja.statusCode, 200);
  const { rows: [b] } = await base.superPool.query(`SELECT borrador FROM acciones WHERE borrador LIKE '%no recibir más mensajes%'`);
  assert.ok(b, 'la baja genera alerta');
});

test('correo de la ATTRAPI: se identifica el permiso aunque venga escrito distinto', async () => {
  const r = await pedir({}, 'POST', `/api/entradas/correo?token=${TOKEN}`, {
    id: 'correo-1', de: 'CIS <notificaciones@attrapi.gob.mx>', asunto: 'Acuerdo ATTRAPI/UVSR/DSF/099/2026',
    texto: 'En relación con el permiso ATTRAPI-04010-B/0056 se le requiere corregir el domicilio de las pólizas.' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.expediente, IDS.expKeri);
  const { rows } = await base.superPool.query(`SELECT borrador FROM acciones WHERE borrador LIKE 'Notificación de la ATTRAPI%'`);
  assert.match(rows[0].borrador, /Energéticos Keri \(ATTRAPI-04-010-B\/0056\).*ATTRAPI\/UVSR\/DSF\/099\/2026.*requerimiento/s);
  const otro = await pedir({}, 'POST', `/api/entradas/correo?token=${TOKEN}`, { de: 'promo@tienda.com', asunto: 'Ofertas', texto: 'hola' });
  assert.ok(otro.json.ignorado);
});

test('publicaciones: solo el director aprueba; la consulta del script lo confirma', async () => {
  const hM = await entrar('mayela@capturar-correo.invalid');
  const hG = await entrar('gil191182@gmail.com');
  const p = await pedir(hM, 'POST', '/api/publicaciones', { version: 'abc1234', cambios: 'Pantalla de clientes y escritos con membrete.' });
  assert.equal(p.status, 200);
  const consulta = () => base.superPool.query(`SELECT * FROM publicacion_aprobada('abc1234')`).then(r => r.rows);
  assert.equal((await consulta()).length, 0, 'sin aprobación el script no publica');
  assert.equal((await pedir(hM, 'POST', `/api/publicaciones/${p.json.id}/aprobar`, {})).status, 403);
  const ap = await pedir(hG, 'POST', `/api/publicaciones/${p.json.id}/aprobar`, { nota: 'Adelante' });
  assert.equal(ap.status, 200, JSON.stringify(ap.json));
  const [a] = await consulta();
  assert.equal(a.aprobada_por, 'Gil Romero Pérez');
  const chat = (await pedir(hM, 'GET', '/api/chat')).json;
  assert.ok(chat.mensajes.some(m => /Gil Romero Pérez aprobó publicar la versión abc1234/.test(m.texto)));
  // Ni la base acepta que el sistema apruebe por su cuenta
  await assert.rejects(base.superPool.query(`UPDATE publicaciones SET estado='aprobada', aprobada_por=$1, aprobada_en=now() WHERE version='otra'`, [IDS.gil]).then(async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.despacho_id', $1, true), set_config('app.actor', 'sistema', true)`, [IDS.despacho]);
      await c.query(`INSERT INTO publicaciones (despacho_id, version, cambios, solicitada_por, estado, aprobada_por, aprobada_en) VALUES ($1, 'zzz9999', 'cambio de prueba', 'Marce', 'aprobada', $2, now())`, [IDS.despacho, IDS.gil]);
    } finally { await c.query('ROLLBACK'); c.release(); }
  }), /SOLO_PERSONAS/);
});

test('configuración del despacho: colores manuales siempre pasan por el contraste', async () => {
  const hG = await entrar('gil191182@gmail.com');
  const r = await pedir(hG, 'PATCH', '/api/despacho', { accion: '#F5C542' });
  assert.equal(r.status, 200);
  assert.ok(r.json.temaCalculado.verificacion.textoSobreAccion >= 4.5);
  assert.notEqual(r.json.temaCalculado.accion, '#F5C542');
  const hM = await entrar('mayela@capturar-correo.invalid');
  assert.equal((await pedir(hM, 'PATCH', '/api/despacho', { lema: 'x' })).status, 403);
});

test('subir logo: extrae colores pero respeta el botón de acción ya definido', async () => {
  await base.superPool.query(`UPDATE despachos SET tema = tema || '{"accion":"#B35A0C"}'::jsonb`);
  const hG = await entrar('gil191182@gmail.com');
  const { default: sharp } = await import('sharp');
  const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#0B3D2E"/><circle cx="100" cy="100" r="50" fill="#E63946"/></svg>')).png().toBuffer();
  const mp = multipart('logo.png', png, 'image/png');
  const r = await app.inject({ method: 'POST', url: '/api/despacho/logo', headers: { ...hG, 'content-type': mp.tipo }, payload: mp.payload });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().tema.accion, '#B35A0C');
  const { rows: [d] } = await base.superPool.query(`SELECT tema FROM despachos WHERE subdominio = 'strateggia'`);
  assert.equal(d.tema.accion, '#B35A0C');
  assert.notEqual(d.tema.fondo, '#1B2440', 'el fondo sí sale del logo nuevo');
  const logo = await app.inject({ url: '/api/despacho/logo', headers: H });
  assert.equal(logo.headers['content-type'], 'image/png');
  assert.equal((await pedir(hG, 'GET', '/api/yo')).json.logo, '/api/despacho/logo');
});

test('el director corrige el correo de una persona sin perder sus expedientes', async () => {
  const hG = await entrar('gil191182@gmail.com');
  const r = await pedir(hG, 'PATCH', `/api/usuarios/${IDS.mayela}`, { correo: 'mayela.romero@strateggia.mx' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  await entrar('mayela.romero@strateggia.mx');
  const { rows: [e] } = await base.superPool.query(`SELECT consultor_id FROM expedientes WHERE id = $1`, [IDS.expKeri]);
  assert.equal(e.consultor_id, IDS.mayela);
  await pedir(hG, 'PATCH', `/api/usuarios/${IDS.mayela}`, { correo: 'mayela@capturar-correo.invalid' });
});
