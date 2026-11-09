// Pruebas de punta a punta de la API con los expedientes piloto.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { diasEntre, hoyMexico } from '@logistics/dominio';
import { cargarConfig } from '../src/config.js';
import { crearPool, conDespacho } from '../src/db.js';
import { crearApp } from '../src/app.js';
import { crearMarce } from '../src/marce.js';
import { hashClave } from '../src/seguridad.js';
import { ciclo, prepararRecordatorios, enviarAprobadas } from '../src/worker.js';
import { crearCanales } from '../src/canales.js';
import { baseDePrueba, IDS } from './ayuda.js';

let base, pool, app, carpeta, marceFalsa;
const H = { 'x-despacho': 'strateggia' };

async function entrar(correo, clave) {
  const r = await app.inject({ method: 'POST', url: '/api/sesion', headers: H, payload: { correo, clave } });
  assert.equal(r.statusCode, 200, r.body);
  return { ...H, cookie: `sesion=${r.cookies.find(c => c.name === 'sesion').value}` };
}

before(async () => {
  base = await baseDePrueba();
  pool = crearPool(base.appUrl);
  carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'archivos-'));
  await base.superPool.query(`UPDATE usuarios SET clave_hash = $1 WHERE id IN ($2, $3)`, [hashClave('clave-segura-123'), IDS.mayela, IDS.omar]);
  await base.superPool.query(`UPDATE contactos SET telefono = '+52 449 000 0000' WHERE nombre LIKE 'Omar%'`);
  const config = cargarConfig({ DATABASE_URL: base.appUrl, ARCHIVOS_CARPETA: carpeta });
  marceFalsa = { respuesta: null };
  const clienteFalso = { beta: { messages: { create: async (params) => { marceFalsa.ultimo = params; return marceFalsa.respuesta; } } } };
  app = crearApp({ config, pool, marce: crearMarce({ modelo: 'claude-opus-5-5', activo: true, cliente: clienteFalso }) });
  await app.ready();
  await ciclo(pool, { canales: crearCanales({}), log: () => {} }); // calcula plazos
});
after(async () => { await app?.close(); await pool?.end(); await base?.cerrar(); await fs.rm(carpeta, { recursive: true, force: true }); });

test('sin sesión no hay datos', async () => {
  const r = await app.inject({ url: '/api/tablero', headers: H });
  assert.equal(r.statusCode, 401);
});

test('contraseña incorrecta', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/sesion', headers: H, payload: { correo: 'mayela@capturar-correo.invalid', clave: 'x' } });
  assert.equal(r.statusCode, 401);
});

test('tema público del despacho con contraste verificado', async () => {
  const r = await app.inject({ url: '/api/tema', headers: H });
  const t = r.json();
  assert.equal(t.tema.fondo, '#1B2440');
  assert.ok(t.tema.verificacion.textoSobreAccion >= 4.5);
});

test('tablero: KERI primero, crítico, con el plazo de la prórroga', async () => {
  const h = await entrar('mayela@capturar-correo.invalid', 'clave-segura-123');
  const t = (await app.inject({ url: '/api/tablero', headers: h })).json();
  assert.equal(t.indicadores.expedientesActivos, 3);
  assert.equal(t.indicadores.propuestasAbiertas, 2);
  const [primero] = t.expedientes;
  assert.equal(primero.cliente, 'Energéticos Keri');
  assert.equal(primero.plazo.fecha, '2026-12-02');
  assert.equal(primero.plazo.dias, diasEntre(hoyMexico(), '2026-12-02'));
  assert.equal(primero.plazo.definitivo, true);
  assert.equal(`${primero.aprobados}/${primero.total}`, '3/14', '8 originales + 6 pasos de escrito, ingreso y visita');
  const bulk = t.expedientes.find(e => e.id === IDS.expBulkmatic);
  assert.equal(bulk.plazo.fecha, '2027-02-16', 'Bulkmatic: 180 días desde el 20 ago 2026');
  const sfm = t.expedientes.find(e => e.id === IDS.expSfm);
  assert.equal(sfm.plazo, null, 'SFM ya opera: sin fecha fija');
  assert.ok(t.acciones.some(a => a.estado === 'propuesta'), 'hay acciones esperando aprobación');
});

test('detalle KERI: plazos calculados incluyen contingencias jun 2028', async () => {
  const h = await entrar('mayela@capturar-correo.invalid', 'clave-segura-123');
  const d = (await app.inject({ url: `/api/expedientes/${IDS.expKeri}`, headers: h })).json();
  const tipos = Object.fromEntries(d.plazos.map(p => [p.tipo, p.fecha]));
  assert.equal(tipos.contingencias_actualizacion, '2028-06-12');
  assert.equal(tipos.renovacion_permiso, '2046-12-22');
  assert.equal(d.requisitos.length, 14);
  assert.equal(d.mensajes.length, 3);
});

test('el cliente entra al portal y solo ve lo suyo', async () => {
  const h = await entrar('omar@capturar-correo.invalid', 'clave-segura-123');
  assert.equal((await app.inject({ url: '/api/tablero', headers: h })).statusCode, 403);
  const p = (await app.inject({ url: '/api/portal', headers: h })).json();
  assert.equal(p.length, 1);
  assert.equal(p[0].permiso, 'ATTRAPI-04-010-B/0056');
  assert.ok(p[0].loQueNecesitamos.some(r => r.nombre === 'Pago de derechos de verificación'));
  assert.ok(!('propuesta_ia' in p[0].requisitos[0]), 'no se muestran datos internos');
  // No puede escribir en el expediente de otro cliente
  const r = await app.inject({ method: 'POST', url: `/api/expedientes/${IDS.expBulkmatic}/mensajes`, headers: h, payload: { texto: 'hola' } });
  assert.equal(r.statusCode, 404);
  const ok = await app.inject({ method: 'POST', url: `/api/expedientes/${IDS.expKeri}/mensajes`, headers: h, payload: { texto: 'Ya pagamos.' } });
  assert.equal(ok.statusCode, 200);
});

test('aprobar requisito por API (consultor) y el cliente no puede', async () => {
  const hM = await entrar('mayela@capturar-correo.invalid', 'clave-segura-123');
  const d = (await app.inject({ url: `/api/expedientes/${IDS.expKeri}`, headers: hM })).json();
  const bases = d.requisitos.find(r => r.nombre === 'Bases de Coordinación');
  const hO = await entrar('omar@capturar-correo.invalid', 'clave-segura-123');
  assert.equal((await app.inject({ method: 'POST', url: `/api/requisitos/${bases.id}/aprobar`, headers: hO })).statusCode, 403);
  const r = await app.inject({ method: 'POST', url: `/api/requisitos/${bases.id}/aprobar`, headers: hM, payload: {} });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().estado, 'aprobado');
  // "aprobado" no se puede poner por la vía de edición normal
  const p = await app.inject({ method: 'PATCH', url: `/api/requisitos/${bases.id}`, headers: hM, payload: { estado: 'aprobado' } });
  assert.equal(p.statusCode, 400);
});

test('abrir expediente sin permiso previo explica la cadena', async () => {
  const h = await entrar('mayela@capturar-correo.invalid', 'clave-segura-123');
  const r = await app.inject({ method: 'POST', url: '/api/expedientes', headers: h,
    payload: { terminal_id: '00000000-0000-4000-8000-0000000000e5', tramite_clave: 'inicio_operaciones' } });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, 'CADENA_INCOMPLETA');
  assert.match(r.json().mensaje, /falta el resultado de "permiso"/);
});

test('documentos: se guardan cifrados y se descargan con URL firmada', async () => {
  const h = await entrar('omar@capturar-correo.invalid', 'clave-segura-123');
  const limite = '----limite';
  const cuerpo = `--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="comprobante.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-contenido-de-prueba\r\n--${limite}--\r\n`;
  const r = await app.inject({ method: 'POST', url: `/api/expedientes/${IDS.expKeri}/documentos`, payload: cuerpo,
    headers: { ...h, 'content-type': `multipart/form-data; boundary=${limite}` } });
  assert.equal(r.statusCode, 200, r.body);
  const { id } = r.json();
  // En disco está cifrado
  const { rows: [doc] } = await base.superPool.query('SELECT ruta_cifrada FROM documentos WHERE id = $1', [id]);
  const crudo = await fs.readFile(path.join(carpeta, doc.ruta_cifrada));
  assert.ok(!crudo.toString().includes('contenido-de-prueba'));
  const { url } = (await app.inject({ url: `/api/documentos/${id}/url`, headers: h })).json();
  const descarga = await app.inject({ url });
  assert.equal(descarga.body, '%PDF-contenido-de-prueba');
  assert.equal((await app.inject({ url: url.slice(0, -3) + 'abc' })).statusCode, 403, 'firma alterada');
});

test('revisión automática guarda propuesta y no aprueba', async () => {
  const h = await entrar('mayela@capturar-correo.invalid', 'clave-segura-123');
  const d = (await app.inject({ url: `/api/expedientes/${IDS.expBulkmatic}`, headers: h })).json();
  const anexo = d.requisitos.find(r => r.nombre.startsWith('Anexo 1'));
  const r = (await app.inject({ method: 'POST', url: `/api/requisitos/${anexo.id}/revisar`, headers: h,
    payload: { texto: 'Tarifa por carrotanque USD 500, según la Agencia Reguladora', solo_pesos: true } })).json();
  const porRegla = Object.fromEntries(r.resultados.map(x => [x.regla, x.resultado]));
  assert.equal(porRegla.solo_pesos, 'FALLA');
  assert.equal(porRegla.agencia_anterior, 'FALLA');
  assert.equal(porRegla.domicilio_identico, 'FALTA', 'el domicilio del permiso 0058 aún no está capturado');
  const despues = (await app.inject({ url: `/api/expedientes/${IDS.expBulkmatic}`, headers: h })).json();
  assert.equal(despues.requisitos.find(x => x.id === anexo.id).estado, 'revision_cliente');
});

test('Marce: propone, no envía; las propuestas quedan esperando aprobación', async () => {
  const h = await entrar('mayela@capturar-correo.invalid', 'clave-segura-123');
  marceFalsa.respuesta = {
    model: 'claude-opus-5-5', stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({
      respuesta: 'A Bulkmatic le faltan coordenadas, línea y datos de Finanzas. ¿Le mando el recordatorio a Carlos Gómez?',
      propuestas: [
        { tipo: 'whatsapp', canal: 'whatsapp', destinatario: 'Lic. Carlos Gómez', asunto: '', borrador: 'Buen día...', expediente_id: IDS.expBulkmatic },
        { tipo: 'whatsapp', canal: 'whatsapp', destinatario: 'x', asunto: '', borrador: 'x', expediente_id: '00000000-0000-0000-0000-000000000000' },
      ],
    }) }],
  };
  const r = (await app.inject({ method: 'POST', url: '/api/marce', headers: h, payload: { pregunta: '¿Qué le falta a Bulkmatic para ingresar tarifas?' } })).json();
  assert.match(r.respuesta, /coordenadas/);
  assert.equal(r.propuestas.length, 1, 'se descarta la propuesta de un expediente inexistente');
  assert.equal(r.propuestas[0].estado, 'propuesta');
  // Lo que recibió Claude: datos del despacho y la configuración correcta
  assert.equal(marceFalsa.ultimo.model, 'claude-opus-5-5');
  assert.match(marceFalsa.ultimo.messages[0].content, /Bulkmatic/);
  const { rows: [b] } = await base.superPool.query(`SELECT actor FROM bitacora WHERE tabla = 'acciones' AND registro_id = $1`, [r.propuestas[0].id]);
  assert.equal(b.actor, 'ia');
});

test('piloto automático: prepara recordatorio, no lo envía hasta que una persona aprueba', async () => {
  const ctx = { despachoId: IDS.despacho, actor: 'sistema' };
  await conDespacho(pool, ctx, (c) => prepararRecordatorios(c));
  const { rows: [{ n }] } = await base.superPool.query(
    `SELECT count(*)::int AS n FROM acciones WHERE tipo = 'recordatorio' AND propuesta_por = 'sistema' AND estado = 'propuesta'`);
  assert.ok(n >= 1, 'el trabajador preparó recordatorios');
  const otraVez = await conDespacho(pool, ctx, (c) => prepararRecordatorios(c));
  assert.equal(otraVez.length, 0, 'uno por expediente por día');

  // wa-mcp: el texto libre falla porque la ventana de 24 h está cerrada → se usa la plantilla lg_recordatorio
  const enviados = [];
  const fetchFalso = async (url, op) => {
    enviados.push({ url, cuerpo: JSON.parse(op.body), llave: op.headers['X-API-Key'] });
    if (url.endsWith('/mensajes')) return { ok: false, status: 422, json: async () => ({ error: 'La ventana de 24 h está cerrada (último mensaje del cliente hace nunca h).' }) };
    return { ok: true, status: 200, json: async () => ({ enviado: true }) };
  };
  const canales = crearCanales({ WA_MCP_URL: 'https://whats.ejemplo/api/v1', WA_LLAVE: 'strateggia_llave', WA_REAL: '1' }, fetchFalso);
  await conDespacho(pool, ctx, (c) => enviarAprobadas(c, canales));
  assert.equal(enviados.length, 0, 'nada sale sin aprobación');

  const { rows: [keri] } = await base.superPool.query(
    `SELECT id FROM acciones WHERE expediente_id = $1 AND tipo = 'recordatorio' AND propuesta_por = 'sistema'`, [IDS.expKeri]);
  const h = await entrar('mayela@capturar-correo.invalid', 'clave-segura-123');
  assert.equal((await app.inject({ method: 'POST', url: `/api/acciones/${keri.id}/aprobar`, headers: h, payload: {} })).statusCode, 200);
  await conDespacho(pool, ctx, (c) => enviarAprobadas(c, canales));
  assert.equal(enviados.length, 2, 'intenta texto y, con la ventana cerrada, manda la plantilla');
  assert.equal(enviados[0].url, 'https://whats.ejemplo/api/v1/mensajes');
  assert.equal(enviados[1].url, 'https://whats.ejemplo/api/v1/plantillas/enviar');
  assert.equal(enviados[1].llave, 'strateggia_llave');
  const p = enviados[1].cuerpo;
  assert.equal(p.telefono, '524490000000');
  assert.equal(p.plantilla, 'lg_recordatorio');
  assert.equal(p.categoria, 'marketing', 'Meta clasificó lg_recordatorio como marketing');
  assert.equal(p.variables[0], 'Omar');
  assert.equal(p.variables[1], 'Mayela Romero Pérez');
  assert.equal(p.variables[2], 'Constancia de Inicio de Operaciones');
  assert.match(p.variables[3], /^Nos falta: .*Pago de derechos.* La fecha límite es el 2 de diciembre de 2026\.$/);
  assert.ok(p.variables.every(v => !v.includes('\n')), 'sin saltos de línea (Meta no los acepta)');
  const { rows: [a] } = await base.superPool.query('SELECT estado FROM acciones WHERE id = $1', [keri.id]);
  assert.equal(a.estado, 'enviada');
});

test('sin canal configurado no se finge el envío', async () => {
  const ctx = { despachoId: IDS.despacho, actor: 'sistema' };
  const { rows: [b] } = await base.superPool.query(
    `SELECT id FROM acciones WHERE expediente_id = $1 AND estado = 'propuesta' AND canal = 'whatsapp' LIMIT 1`, [IDS.expBulkmatic]);
  const h = await entrar('mayela@capturar-correo.invalid', 'clave-segura-123');
  await app.inject({ method: 'POST', url: `/api/acciones/${b.id}/aprobar`, headers: h, payload: {} });
  const r = await conDespacho(pool, ctx, (c) => enviarAprobadas(c, crearCanales({})));
  assert.ok(r.every(x => !x.ok));
  const { rows: [a] } = await base.superPool.query('SELECT estado, error FROM acciones WHERE id = $1', [b.id]);
  assert.equal(a.estado, 'aprobada');
  assert.match(a.error, /no está configurado/);
});

test('archivar en lugar de borrar', async () => {
  const h = await entrar('mayela@capturar-correo.invalid', 'clave-segura-123');
  const { rows: [m] } = await base.superPool.query(`SELECT id FROM mensajes WHERE expediente_id = $1 LIMIT 1`, [IDS.expKeri]);
  const r = await app.inject({ method: 'POST', url: `/api/mensajes/${m.id}/archivar`, headers: h });
  assert.equal(r.statusCode, 200);
  const { rows: [sigue] } = await base.superPool.query('SELECT archivado_en FROM mensajes WHERE id = $1', [m.id]);
  assert.ok(sigue.archivado_en, 'el mensaje sigue en la base, solo archivado');
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/mensajes/${m.id}`, headers: h })).statusCode, 404);
});
