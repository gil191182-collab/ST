// Plazos que se calculan solos (CLAUDE.md §4).
// Cada función devuelve { fecha, regla } donde "regla" explica el cálculo
// en español, para que el consultor vea de dónde sale cada fecha.
import { sumarDias, sumarMeses, sumarAnios, diasEntre, fechaCorta, aFecha } from './fechas.js';

export const REGLAS = Object.freeze({
  DIAS_INICIO_OPERACIONES: 180,       // días naturales desde el permiso
  DIAS_CONTINGENCIAS_ANTES_INICIO: 15, // días naturales antes de iniciar
  MESES_ACTUALIZAR_CONTINGENCIAS: 24,  // cada 2 años
  MESES_POLIZAS: 12,                   // cada año
  DIAS_AVISO_CAMBIOS: 15,              // días naturales desde el cambio
  MESES_RENOVACION_PERMISO_ANTES: 6,   // iniciar 6 meses antes del vencimiento
  MESES_ACTUALIZAR_TARIFAS: 24,        // POR CONFIRMAR con Mayela (aparece en el portal de KERI)
});

/**
 * Límite para el inicio de operaciones: 180 días naturales desde el permiso,
 * o la fecha de la prórroga más reciente si existe.
 */
export function limiteInicioOperaciones({ fechaPermiso, prorrogas = [] }) {
  if (!fechaPermiso && !prorrogas.length) return null;
  const vigentes = prorrogas
    .filter(p => (p.concepto ?? 'inicio_operaciones') === 'inicio_operaciones' && !p.archivado_en)
    .sort((a, b) => aFecha(a.nueva_fecha).localeCompare(aFecha(b.nueva_fecha)));
  const ultima = vigentes.at(-1);
  if (ultima) {
    return {
      tipo: 'inicio_operaciones',
      fecha: aFecha(ultima.nueva_fecha),
      regla: `Prórroga${ultima.oficio ? ` (${ultima.oficio})` : ''} al ${fechaCorta(ultima.nueva_fecha)}` +
        (ultima.admite_otra_prorroga ? '' : '. La autoridad indicó que no habrá otra prórroga.'),
      conProrroga: true,
      definitivo: !ultima.admite_otra_prorroga,
    };
  }
  const fecha = sumarDias(fechaPermiso, REGLAS.DIAS_INICIO_OPERACIONES);
  return {
    tipo: 'inicio_operaciones',
    fecha,
    regla: `${REGLAS.DIAS_INICIO_OPERACIONES} días naturales desde el permiso (${fechaCorta(fechaPermiso)})`,
    conProrroga: false,
    definitivo: false,
  };
}

/** Programa de Contingencias: 15 días naturales antes de iniciar operaciones. */
export function contingenciasAntesDeIniciar({ fechaInicio }) {
  return {
    tipo: 'contingencias_inicial',
    fecha: sumarDias(fechaInicio, -REGLAS.DIAS_CONTINGENCIAS_ANTES_INICIO),
    regla: `${REGLAS.DIAS_CONTINGENCIAS_ANTES_INICIO} días naturales antes del inicio de operaciones (${fechaCorta(fechaInicio)})`,
  };
}

/** Programa de Contingencias: actualizar cada 2 años desde la última aprobación. */
export function actualizacionContingencias({ ultimaAprobacion }) {
  return {
    tipo: 'contingencias_actualizacion',
    fecha: sumarMeses(ultimaAprobacion, REGLAS.MESES_ACTUALIZAR_CONTINGENCIAS),
    regla: `Cada 2 años desde la última aprobación (${fechaCorta(ultimaAprobacion)})`,
  };
}

/** Pólizas: renovar cada año desde la emisión. */
export function renovacionPolizas({ emision }) {
  return {
    tipo: 'polizas',
    fecha: sumarAnios(emision, 1),
    regla: `Emisión (${fechaCorta(emision)}) + 1 año`,
  };
}

/** Aviso de cambios en la terminal: 15 días naturales desde el cambio. */
export function avisoCambiosTerminal({ fechaCambio }) {
  return {
    tipo: 'aviso_cambios',
    fecha: sumarDias(fechaCambio, REGLAS.DIAS_AVISO_CAMBIOS),
    regla: `${REGLAS.DIAS_AVISO_CAMBIOS} días naturales desde el cambio (${fechaCorta(fechaCambio)})`,
  };
}

/** Renovación del permiso: iniciar 6 meses antes de que venza. */
export function renovacionPermiso({ vigenciaHasta }) {
  return {
    tipo: 'renovacion_permiso',
    fecha: sumarMeses(vigenciaHasta, -REGLAS.MESES_RENOVACION_PERMISO_ANTES),
    regla: `6 meses antes del vencimiento del permiso (${fechaCorta(vigenciaHasta)})`,
  };
}

/** Registro de tarifas: actualizar cada 2 años (por permiso, no por terminal). POR CONFIRMAR. */
export function actualizacionTarifas({ ultimoRegistro }) {
  return {
    tipo: 'tarifas_actualizacion',
    fecha: sumarMeses(ultimoRegistro, REGLAS.MESES_ACTUALIZAR_TARIFAS),
    regla: `Cada 2 años desde el último registro (${fechaCorta(ultimoRegistro)}) — por confirmar`,
  };
}

/**
 * Qué tan urgente es una fecha límite.
 *  vencido: ya pasó · critico: ≤30 días · atencion: ≤60 días · en_tiempo: más de 60
 */
export function urgencia(fecha, hoy) {
  const dias = diasEntre(hoy, fecha);
  let nivel = 'en_tiempo';
  if (dias < 0) nivel = 'vencido';
  else if (dias <= 30) nivel = 'critico';
  else if (dias <= 60) nivel = 'atencion';
  return { dias, nivel };
}

/**
 * Calcula todos los plazos que se derivan de un permiso.
 * `datos`: { permiso, prorrogas, aprobacionContingencias, emisionPolizas, registroTarifas, inicioReal }
 */
export function plazosDelPermiso(datos) {
  const { permiso, prorrogas = [], aprobacionContingencias, emisionPolizas, registroTarifas, inicioReal } = datos;
  const plazos = [];
  if (!inicioReal) {
    const lim = limiteInicioOperaciones({ fechaPermiso: permiso.fecha_otorgamiento, prorrogas });
    if (lim) {
      plazos.push(lim);
      plazos.push(contingenciasAntesDeIniciar({ fechaInicio: lim.fecha }));
    }
  }
  if (aprobacionContingencias) plazos.push(actualizacionContingencias({ ultimaAprobacion: aprobacionContingencias }));
  if (emisionPolizas) plazos.push(renovacionPolizas({ emision: emisionPolizas }));
  if (registroTarifas) plazos.push(actualizacionTarifas({ ultimoRegistro: registroTarifas }));
  if (permiso.vigencia_hasta) plazos.push(renovacionPermiso({ vigenciaHasta: permiso.vigencia_hasta }));
  return plazos;
}
