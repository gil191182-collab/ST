// Clasificación de mensajes entrantes (correo de la ATTRAPI, WhatsApp).
// Solo identifica y propone; una persona revisa cada notificación.
import { normalizarEspacios } from './textos.js';

const DOMINIOS_AUTORIDAD = ['attrapi.gob.mx', 'sct.gob.mx', 'sict.gob.mx'];

/** Números de permiso (actuales y anteriores) mencionados en un texto. */
export function permisosMencionados(texto = '') {
  const encontrados = new Set();
  const re = /\b((?:ATTRAPI|SCT-DGDFM|ARTF)[-\s]?04[-\s]?0?10[-\s]?[AB]\s*\/\s*\d{3,4})\b/gi;
  for (const m of String(texto).matchAll(re)) encontrados.add(normalizarPermiso(m[1]));
  return [...encontrados];
}

/** "ATTRAPI-04010-B/0056", "ATTRAPI 04-010-B / 0056" → "ATTRAPI-04-010-B/0056" */
export function normalizarPermiso(numero = '') {
  const m = /^(ATTRAPI|SCT-DGDFM|ARTF)[-\s]?04[-\s]?0?10[-\s]?([AB])\s*\/\s*(\d{1,4})$/i.exec(String(numero).trim());
  if (!m) return String(numero).trim().toUpperCase();
  return `${m[1].toUpperCase()}-04-010-${m[2].toUpperCase()}/${m[3].padStart(4, '0')}`;
}

/** Folio del permiso (B/0056) para comparar entre homoclave anterior y actual. */
export function folioPermiso(numero = '') {
  const m = /([AB])\/(\d{3,4})$/.exec(normalizarPermiso(numero));
  return m ? `${m[1]}/${m[2].padStart(4, '0')}` : null;
}

/** Oficios y acuerdos citados: "Acuerdo No. ATTRAPI/UVSR/DSF/069/2026", "oficio ATTRAPI/1.4.-300/2026" */
export function oficiosMencionados(texto = '') {
  const re = /\bATTRAPI\/[A-Z0-9.\-]+(?:\/[A-Z0-9.\-]+)*\/\d{4}\b/gi;
  return [...new Set([...String(texto).matchAll(re)].map(m => m[0].toUpperCase()))];
}

/**
 * ¿Es una notificación de la autoridad? Devuelve { esAutoridad, motivo, permisos, oficios, tipo }.
 * tipo: 'acuerdo' | 'oficio' | 'requerimiento' | 'otro'
 */
export function clasificarCorreo({ de = '', asunto = '', texto = '' }) {
  const dominio = String(de).toLowerCase().split('@')[1]?.replace(/>.*/, '') ?? '';
  const todo = normalizarEspacios(`${asunto}\n${texto}`);
  const porRemitente = DOMINIOS_AUTORIDAD.some(d => dominio === d || dominio.endsWith(`.${d}`));
  const porContenido = /Agencia de Trenes y Transporte P[uú]blico Integrado|\bATTRAPI\b/i.test(todo);
  const oficios = oficiosMencionados(todo);
  const permisos = permisosMencionados(todo);
  let tipo = 'otro';
  if (/\bacuerdo\b/i.test(todo)) tipo = 'acuerdo';
  if (/\boficio\b/i.test(todo)) tipo = 'oficio';
  if (/\b(requiere|requerimiento|prevenci[oó]n|observaci[oó]n(es)?)\b/i.test(todo)) tipo = 'requerimiento';
  return {
    esAutoridad: porRemitente || (porContenido && (oficios.length > 0 || permisos.length > 0)),
    motivo: porRemitente ? `remitente ${dominio}` : porContenido ? 'menciona a la ATTRAPI con oficio o permiso' : 'sin señales',
    permisos, oficios, tipo,
  };
}

/** Últimos 10 dígitos de un teléfono (México): para comparar números con y sin lada internacional. */
export function telefonoClave(tel = '') {
  const d = String(tel).replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d || null;
}
