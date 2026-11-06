// Reglas de "textos exactos" (CLAUDE.md §4):
//  - El domicilio va idéntico al del permiso, en el mismo orden, con km de vía y línea.
//  - Los endosos de pólizas se comparan palabra por palabra con el catálogo.
//  - Ningún documento puede citar a la antigua Agencia Reguladora.

/** Solo unifica espacios y saltos de línea. NO cambia mayúsculas, acentos ni puntuación. */
export function normalizarEspacios(texto = '') {
  return String(texto).replace(/\s+/g, ' ').trim();
}

export function palabras(texto = '') {
  const t = normalizarEspacios(texto);
  return t ? t.split(' ') : [];
}

/**
 * Diferencias palabra por palabra (LCS). Devuelve lista de
 * { tipo: 'falta' | 'sobra', palabra, posicion } donde posicion es el índice
 * de la palabra en el texto esperado (falta) o en el encontrado (sobra).
 */
export function diferenciasPalabras(esperado, encontrado) {
  const a = palabras(esperado);
  const b = palabras(encontrado);
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const dif = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) dif.push({ tipo: 'falta', palabra: a[i], posicion: i++ });
    else dif.push({ tipo: 'sobra', palabra: b[j], posicion: j++ });
  }
  while (i < n) dif.push({ tipo: 'falta', palabra: a[i], posicion: i++ });
  while (j < m) dif.push({ tipo: 'sobra', palabra: b[j], posicion: j++ });
  return dif;
}

function describir(dif) {
  return dif.slice(0, 8).map(d => (d.tipo === 'falta' ? `falta «${d.palabra}»` : `sobra «${d.palabra}»`)).join('; ') +
    (dif.length > 8 ? `; y ${dif.length - 8} diferencias más` : '');
}

/** El domicilio del documento debe ser idéntico al del permiso. */
export function compararDomicilio(domicilioPermiso, domicilioDocumento) {
  if (contieneMarcadorPendiente(domicilioPermiso)) {
    return { ok: false, resultado: 'FALTA', mensaje: 'El domicilio del permiso aún no está capturado textual en el sistema.' };
  }
  const iguales = normalizarEspacios(domicilioPermiso) === normalizarEspacios(domicilioDocumento);
  if (iguales) return { ok: true, resultado: 'OK', mensaje: 'Domicilio idéntico al permiso, en el mismo orden.' };
  const dif = diferenciasPalabras(domicilioPermiso, domicilioDocumento);
  // Mismas palabras pero en otro orden → también es error
  const mismoConjunto = dif.length && [...palabras(domicilioPermiso)].sort().join(' ') === [...palabras(domicilioDocumento)].sort().join(' ');
  return {
    ok: false,
    resultado: 'FALLA',
    mensaje: mismoConjunto
      ? 'El domicilio tiene las mismas palabras que el permiso pero en otro orden.'
      : `El domicilio no es idéntico al del permiso: ${describir(dif)}.`,
    diferencias: dif,
  };
}

/** ¿El texto del permiso menciona kilómetro y línea? (si no, hay que confirmarlo) */
export function domicilioTieneKmYLinea(domicilio) {
  const t = normalizarEspacios(domicilio);
  return {
    km: /\bkm\.?\s*\d|\bkil[oó]metro/i.test(t),
    linea: /\bl[ií]nea\b/i.test(t),
  };
}

/** Endoso de póliza vs. texto del catálogo, palabra por palabra. */
export function compararEndoso(textoCatalogo, textoPoliza) {
  const dif = diferenciasPalabras(textoCatalogo, textoPoliza);
  if (!dif.length) return { ok: true, resultado: 'OK', mensaje: 'El endoso coincide palabra por palabra con el catálogo.' };
  return { ok: false, resultado: 'FALLA', mensaje: `El endoso no coincide con el catálogo: ${describir(dif)}.`, diferencias: dif };
}

// La antigua Agencia Reguladora del Transporte Ferroviario (ARTF).
const PATRON_AGENCIA = /Agencia\s+Reguladora(\s+del\s+Transporte\s+Ferroviario)?/gi;
const PATRON_SIGLAS = /\bARTF\b/g;

/**
 * Busca citas a la antigua Agencia Reguladora.
 * - El nombre completo → FALLA (no puede ir).
 * - Las siglas ARTF → REVISAR (pueden ser una homoclave anterior o un acuerdo histórico;
 *   lo decide el consultor).
 */
export function citasAgenciaAnterior(texto = '') {
  const hallazgos = [];
  for (const m of String(texto).matchAll(PATRON_AGENCIA)) hallazgos.push({ resultado: 'FALLA', texto: m[0], indice: m.index });
  for (const m of String(texto).matchAll(PATRON_SIGLAS)) hallazgos.push({ resultado: 'REVISAR', texto: m[0], indice: m.index });
  return hallazgos;
}

export function contieneMarcadorPendiente(texto = '') {
  return /\[CAPTURAR[^\]]*\]/i.test(String(texto));
}

/**
 * Quita de un texto los datos de un cliente (para reutilizar una referencia
 * autorizada como plantilla anónima). `datos` = lista de { valor, etiqueta }.
 * Una persona debe revisar el resultado antes de guardarlo como plantilla.
 */
export function anonimizar(texto, datos) {
  let salida = String(texto);
  const ordenados = [...datos].filter(d => d.valor && d.valor.trim().length >= 3)
    .sort((a, b) => b.valor.length - a.valor.length);
  for (const { valor, etiqueta } of ordenados) {
    const escapado = valor.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    salida = salida.replace(new RegExp(escapado, 'gi'), `[${etiqueta}]`);
  }
  // RFC mexicano (personas morales y físicas)
  salida = salida.replace(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g, '[RFC]');
  return salida;
}
