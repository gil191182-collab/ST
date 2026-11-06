import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compararDomicilio, compararEndoso, citasAgenciaAnterior, diferenciasPalabras,
  anonimizar, domicilioTieneKmYLinea, revisarDocumento,
} from '../src/index.js';

const DOM = 'Carretera Panamericana, Km. 59.8, Soledad de Abajo, Cosío, Aguascalientes';

test('domicilio idéntico (solo cambian espacios) → OK', () => {
  const r = compararDomicilio(DOM, 'Carretera  Panamericana,\nKm. 59.8, Soledad de Abajo, Cosío, Aguascalientes');
  assert.equal(r.resultado, 'OK');
});

test('domicilio sin acento → FALLA (idéntico quiere decir idéntico)', () => {
  const r = compararDomicilio(DOM, 'Carretera Panamericana, Km. 59.8, Soledad de Abajo, Cosio, Aguascalientes');
  assert.equal(r.resultado, 'FALLA');
  assert.match(r.mensaje, /Cosío/);
});

test('domicilio con las mismas palabras en otro orden → FALLA por orden', () => {
  const r = compararDomicilio('Km. 59.8 Carretera Panamericana', 'Carretera Panamericana Km. 59.8');
  assert.equal(r.resultado, 'FALLA');
  assert.match(r.mensaje, /otro orden/);
});

test('domicilio del permiso sin capturar → FALTA', () => {
  assert.equal(compararDomicilio('[CAPTURAR TEXTUAL DEL PERMISO]', 'x').resultado, 'FALTA');
});

test('detecta si el domicilio trae km y línea', () => {
  assert.deepEqual(domicilioTieneKmYLinea(DOM), { km: true, linea: false });
  assert.deepEqual(domicilioTieneKmYLinea('Km 12+300 de la Línea A'), { km: true, linea: true });
});

test('endoso palabra por palabra', () => {
  const cat = 'Se designa como beneficiario preferente a la Agencia de Trenes y Transporte Público Integrado';
  assert.equal(compararEndoso(cat, cat).resultado, 'OK');
  const r = compararEndoso(cat, 'Se designa como beneficiario a la Agencia de Trenes y Transporte Público Integrado');
  assert.equal(r.resultado, 'FALLA');
  assert.deepEqual(r.diferencias, [{ tipo: 'falta', palabra: 'preferente', posicion: 4 }]);
});

test('diferencias detecta palabras de más y de menos', () => {
  const d = diferenciasPalabras('a b c', 'a x c d');
  assert.deepEqual(d.map(x => `${x.tipo}:${x.palabra}`).sort(), ['falta:b', 'sobra:d', 'sobra:x']);
});

test('antigua Agencia Reguladora: nombre → FALLA; siglas ARTF → REVISAR', () => {
  const h = citasAgenciaAnterior('Ante la Agencia Reguladora del Transporte Ferroviario, homoclave ARTF-03-005.');
  assert.deepEqual(h.map(x => x.resultado), ['FALLA', 'REVISAR']);
  assert.equal(citasAgenciaAnterior('Agencia de Trenes y Transporte Público Integrado').length, 0);
});

test('anonimizar referencia autorizada', () => {
  const t = anonimizar('Energéticos Keri, S.A.P.I. de C.V., RFC EKE120101AB1, representada por Omar Israel Abarca Torres',
    [{ valor: 'Energéticos Keri, S.A.P.I. de C.V.', etiqueta: 'RAZÓN SOCIAL' }, { valor: 'Omar Israel Abarca Torres', etiqueta: 'REPRESENTANTE' }]);
  assert.equal(t, '[RAZÓN SOCIAL], RFC [RFC], representada por [REPRESENTANTE]');
});

test('revisión automática estilo Bulkmatic (Anexo 3)', () => {
  const dom = 'Carretera Tula-Jorobas Km 3, Atitalaquia, Hidalgo';
  const r = revisarDocumento({
    texto: `Domicilio: ${dom}. Tarifas en pesos mexicanos. Agencia de Trenes y Transporte Público Integrado.`,
    domicilioPermiso: dom, soloPesos: true,
  });
  const porRegla = Object.fromEntries(r.map(x => [x.regla, x.resultado]));
  assert.deepEqual(porRegla, { domicilio_identico: 'OK', agencia_anterior: 'OK', solo_pesos: 'OK' });
  assert.ok(r.every(x => x.requiereConfirmacion), 'todo resultado requiere confirmación de un consultor');
});

test('revisión detecta dólares, marcadores y agencia anterior', () => {
  const r = revisarDocumento({ texto: 'Tarifa USD 100 [CAPTURAR línea] conforme a la Agencia Reguladora', soloPesos: true });
  const porRegla = Object.fromEntries(r.map(x => [x.regla, x.resultado]));
  assert.equal(porRegla.solo_pesos, 'FALLA');
  assert.equal(porRegla.marcadores, 'FALTA');
  assert.equal(porRegla.agencia_anterior, 'FALLA');
});
