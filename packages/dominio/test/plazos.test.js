import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sumarDias, diasEntre, sumarMeses, limiteInicioOperaciones, contingenciasAntesDeIniciar,
  actualizacionContingencias, renovacionPolizas, avisoCambiosTerminal, renovacionPermiso,
  urgencia, plazosDelPermiso, fechaCorta,
} from '../src/index.js';

const HOY = '2026-11-05'; // fecha de las pantallas del lienzo

test('Bulkmatic Atitalaquia: permiso 20 ago 2026 + 180 días naturales = 16 feb 2027 (103 días)', () => {
  const lim = limiteInicioOperaciones({ fechaPermiso: '2026-08-20' });
  assert.equal(lim.fecha, '2027-02-16');
  assert.equal(lim.conProrroga, false);
  assert.equal(urgencia(lim.fecha, HOY).dias, 103);
});

test('KERI: con prórroga al 2 dic 2026 y sin segunda prórroga → 27 días, crítico y definitivo', () => {
  const lim = limiteInicioOperaciones({
    fechaPermiso: '2026-02-23',
    prorrogas: [{ concepto: 'inicio_operaciones', nueva_fecha: '2026-12-02', admite_otra_prorroga: false }],
  });
  assert.equal(lim.fecha, '2026-12-02');
  assert.equal(lim.definitivo, true);
  assert.match(lim.regla, /no habrá otra prórroga/);
  assert.deepEqual(urgencia(lim.fecha, HOY), { dias: 27, nivel: 'critico' });
});

test('KERI sin prórroga habría vencido el 22 ago 2026', () => {
  assert.equal(limiteInicioOperaciones({ fechaPermiso: '2026-02-23' }).fecha, '2026-08-22');
});

test('se usa la prórroga más reciente e ignora las archivadas', () => {
  const lim = limiteInicioOperaciones({
    fechaPermiso: '2026-01-01',
    prorrogas: [
      { nueva_fecha: '2026-09-01', admite_otra_prorroga: true },
      { nueva_fecha: '2026-12-01', admite_otra_prorroga: true },
      { nueva_fecha: '2027-03-01', admite_otra_prorroga: true, archivado_en: '2026-10-01' },
    ],
  });
  assert.equal(lim.fecha, '2026-12-01');
});

test('Programa de Contingencias: 15 días naturales antes de iniciar', () => {
  assert.equal(contingenciasAntesDeIniciar({ fechaInicio: '2026-12-02' }).fecha, '2026-11-17');
});

test('Programa de Contingencias: cada 2 años (KERI, acuerdo 12 jun 2026 → jun 2028)', () => {
  assert.equal(actualizacionContingencias({ ultimaAprobacion: '2026-06-12' }).fecha, '2028-06-12');
});

test('Pólizas: cada año; 29 de febrero cae en 28 de febrero', () => {
  assert.equal(renovacionPolizas({ emision: '2026-03-15' }).fecha, '2027-03-15');
  assert.equal(renovacionPolizas({ emision: '2028-02-29' }).fecha, '2029-02-28');
});

test('Aviso de cambios en la terminal: 15 días naturales', () => {
  assert.equal(avisoCambiosTerminal({ fechaCambio: '2026-12-20' }).fecha, '2027-01-04');
});

test('Renovación del permiso: 6 meses antes (KERI vence 22 jun 2047)', () => {
  assert.equal(renovacionPermiso({ vigenciaHasta: '2047-06-22' }).fecha, '2046-12-22');
});

test('urgencia por niveles', () => {
  assert.equal(urgencia('2026-11-01', HOY).nivel, 'vencido');
  assert.equal(urgencia('2026-12-20', HOY).nivel, 'atencion');
  assert.equal(urgencia('2027-02-16', HOY).nivel, 'en_tiempo');
});

test('plazosDelPermiso reúne todos los plazos de KERI', () => {
  const p = plazosDelPermiso({
    permiso: { fecha_otorgamiento: '2026-02-23', vigencia_hasta: '2047-06-22' },
    prorrogas: [{ nueva_fecha: '2026-12-02', admite_otra_prorroga: false }],
    aprobacionContingencias: '2026-06-12',
  });
  const porTipo = Object.fromEntries(p.map(x => [x.tipo, x.fecha]));
  assert.equal(porTipo.inicio_operaciones, '2026-12-02');
  assert.equal(porTipo.contingencias_inicial, '2026-11-17');
  assert.equal(porTipo.contingencias_actualizacion, '2028-06-12');
  assert.equal(porTipo.renovacion_permiso, '2046-12-22');
});

test('sin fecha de permiso no se inventa plazo', () => {
  assert.equal(limiteInicioOperaciones({ fechaPermiso: null }), null);
  assert.equal(plazosDelPermiso({ permiso: { fecha_otorgamiento: null } }).length, 0);
});

test('aritmética de fechas sin corrimientos por horario de verano', () => {
  assert.equal(sumarDias('2026-03-31', 1), '2026-04-01');
  assert.equal(diasEntre('2026-01-01', '2027-01-01'), 365);
  assert.equal(sumarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(fechaCorta('2026-12-02'), '2 dic 2026');
});
