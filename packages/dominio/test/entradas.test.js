import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasificarCorreo, permisosMencionados, normalizarPermiso, folioPermiso, oficiosMencionados, telefonoClave } from '../src/index.js';

test('normaliza números de permiso escritos de distintas formas', () => {
  assert.equal(normalizarPermiso('ATTRAPI-04010-B/0056'), 'ATTRAPI-04-010-B/0056');
  assert.equal(normalizarPermiso('attrapi 04-010-B / 56'), 'ATTRAPI-04-010-B/0056');
  assert.equal(folioPermiso('SCT-DGDFM-04-010-B/0036'), 'B/0036');
});

test('encuentra permisos y oficios en el texto de un acuerdo real', () => {
  const t = 'Acuerdo No. ATTRAPI/UVSR/DSF/069/2026 ... Permiso ATTRAPI-04010-B/0056 ... oficio ATTRAPI/1.4.-300/2026';
  assert.deepEqual(permisosMencionados(t), ['ATTRAPI-04-010-B/0056']);
  assert.deepEqual(oficiosMencionados(t), ['ATTRAPI/UVSR/DSF/069/2026', 'ATTRAPI/1.4.-300/2026']);
});

test('correo de la autoridad por remitente', () => {
  const c = clasificarCorreo({ de: 'Notificaciones <cis@attrapi.gob.mx>', asunto: 'Notificación', texto: 'Se le requiere...' });
  assert.equal(c.esAutoridad, true);
  assert.equal(c.tipo, 'requerimiento');
});

test('correo reenviado que menciona ATTRAPI y un oficio también cuenta', () => {
  const c = clasificarCorreo({ de: 'mayela@gmail.com', asunto: 'Fwd: Acuerdo', texto: 'Acuerdo No. ATTRAPI/UVSR/DSF/068/2026' });
  assert.equal(c.esAutoridad, true);
  assert.equal(c.tipo, 'acuerdo');
});

test('un correo cualquiera no es de la autoridad', () => {
  assert.equal(clasificarCorreo({ de: 'ventas@proveedor.com', asunto: 'Promoción', texto: 'Hola' }).esAutoridad, false);
  assert.equal(clasificarCorreo({ de: 'x@y.com', asunto: 'ATTRAPI', texto: 'conferencia sobre la ATTRAPI' }).esAutoridad, false);
});

test('teléfonos con y sin lada internacional coinciden', () => {
  assert.equal(telefonoClave('+52 1 449 123 4567'), telefonoClave('449-123-4567'));
});
