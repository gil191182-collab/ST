// Fechas "de calendario" (sin hora) en formato AAAA-MM-DD.
// Se calcula en UTC para que los días naturales no se corran por horario de verano.

const RE = /^\d{4}-\d{2}-\d{2}$/;

export function aFecha(valor) {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'string' && RE.test(valor)) return valor;
  if (typeof valor === 'string') return new Date(valor).toISOString().slice(0, 10);
  throw new Error(`Fecha inválida: ${valor}`);
}

function utc(fecha) {
  const [a, m, d] = aFecha(fecha).split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

export function sumarDias(fecha, dias) {
  return new Date(utc(fecha) + dias * 86400000).toISOString().slice(0, 10);
}

/** Días naturales desde `desde` hasta `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde, hasta) {
  return Math.round((utc(hasta) - utc(desde)) / 86400000);
}

/** Suma meses; si el día no existe en el mes destino (31, 29 feb) se usa el último día del mes. */
export function sumarMeses(fecha, meses) {
  const [a, m, d] = aFecha(fecha).split('-').map(Number);
  const total = (m - 1) + meses;
  const anio = a + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

export const sumarAnios = (fecha, anios) => sumarMeses(fecha, anios * 12);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2 dic 2026" */
export function fechaCorta(fecha) {
  const [a, m, d] = aFecha(fecha).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** "2 de diciembre de 2026" */
export function fechaLarga(fecha) {
  const [a, m, d] = aFecha(fecha).split('-').map(Number);
  return `${d} de ${MESES_LARGOS[m - 1]} de ${a}`;
}

/** Fecha de hoy en la Ciudad de México. */
export function hoyMexico(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(ahora);
}
