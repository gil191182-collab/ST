// Sugerir a qué requisito corresponde un archivo (por su nombre, su carpeta y su texto).
// Solo es una PROPUESTA: una persona confirma y aprueba.

const VACIAS = new Set(('de del la las el los y o en con para por al a un una su sus que se lo como copia '
  + 'documento documentos original vigente vigentes si aplica pdf docx doc xlsx jpg png scan escaneo final version').split(' '));

// Palabras que en los expedientes se escriben de varias formas
const SINONIMOS = [
  [/\bp\.?\s?m\.?\s?l\b|perdida maxima/g, ' pml '],
  [/\bdc\s?-?\s?3\b/g, ' dc3 '],
  [/\bdc\s?-?\s?5\b/g, ' dc5 '],
  [/\bpipc\b|programa interno de proteccion civil/g, ' pipc proteccion civil '],
  [/\brc\b/g, ' responsabilidad civil '],
  [/\bcontingencia\b/g, ' contingencias '],
  [/\bderecho\b/g, ' derechos '],
  [/\bcomprobante de pago|\bpago\b|\bpagos\b|\bdpa\b|hoja de ayuda/g, ' pago derechos '],
  [/\bacta\b/g, ' acta constitutiva '],
  [/\bpoderes\b/g, ' poder '],
  [/\bpolizas?\b/g, ' poliza '],
  [/\bconcesionari[oa]\b|\bferromex\b|\bcpkc\b|\bkcsm\b/g, ' concesionario '],
];

export function normalizar(s) {
  let t = String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[_./\\()\[\]{}"'«»,;:]+/g, ' ');
  for (const [re, rep] of SINONIMOS) t = t.replace(re, rep);
  return t.replace(/\s+/g, ' ').trim();
}

export function palabras(s) {
  return [...new Set(normalizar(s).split(' ').filter(p => p.length >= 3 && !VACIAS.has(p) && !/^\d+$/.test(p)))];
}

/**
 * @param {{ nombreArchivo: string, ruta?: string, texto?: string|null,
 *           requisitos: {id: string, nombre: string, seccion?: string}[] }} p
 * @returns {{ id: string, nombre: string, confianza: 'alta'|'media', motivo: string } | null}
 */
export function sugerirRequisito({ nombreArchivo, ruta = '', texto = '', requisitos }) {
  const delNombre = new Set(palabras(`${ruta} ${nombreArchivo}`));
  const delTexto = new Set(palabras(String(texto ?? '').slice(0, 3000)));
  // Una palabra que solo aparece en un requisito (PML, DC3, concesionario...) vale más
  const frecuencia = new Map();
  for (const r of requisitos) for (const p of palabras(r.nombre)) frecuencia.set(p, (frecuencia.get(p) ?? 0) + 1);
  let mejor = null;
  for (const r of requisitos) {
    const claves = palabras(r.nombre);
    if (!claves.length) continue;
    const enNombre = claves.filter(p => delNombre.has(p));
    const enTexto = claves.filter(p => delTexto.has(p) && !delNombre.has(p));
    const puntos = enNombre.reduce((s, p) => s + (frecuencia.get(p) === 1 ? 3 : 2), 0) + enTexto.length * 0.5;
    const proporcion = enNombre.length / claves.length;
    if (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && proporcion > mejor.proporcion)) {
      mejor = { r, puntos, proporcion, enNombre, enTexto };
    }
  }
  if (!mejor || mejor.enNombre.length === 0 || mejor.puntos < 2.5) return null;
  const confianza = mejor.enNombre.length >= 2 || mejor.proporcion >= 0.5 ? 'alta' : 'media';
  return {
    id: mejor.r.id, nombre: mejor.r.nombre, confianza,
    motivo: `Coinciden: ${[...mejor.enNombre, ...mejor.enTexto].join(', ')}`,
  };
}

/** Extrae el ID de una carpeta de Drive desde su enlace (o lo acepta tal cual). */
export function idCarpetaDrive(enlace) {
  const s = String(enlace ?? '').trim();
  const m = /\/folders\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}
