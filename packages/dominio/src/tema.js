// Marca por despacho (CLAUDE.md §5): colores extraídos del logo, contraste
// mínimo 4.5:1 en texto (WCAG AA). Los componentes nunca llevan colores fijos:
// leen el tema que produce esta función.

export const CONTRASTE_MINIMO = 4.5;

export function hexARgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Color inválido: ${hex}`);
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}

export function rgbAHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function canal(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminancia(hex) {
  const [r, g, b] = hexARgb(hex);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function contraste(hex1, hex2) {
  const [a, b] = [luminancia(hex1), luminancia(hex2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Blanco o casi negro, el que contraste más con el fondo. */
export function textoSobre(fondo, oscuro = '#111827', claro = '#FFFFFF') {
  return contraste(fondo, claro) >= contraste(fondo, oscuro) ? claro : oscuro;
}

function mezclar(hex, hacia, t) {
  const a = hexARgb(hex), b = hexARgb(hacia);
  return rgbAHex(a.map((v, i) => v + (b[i] - v) * t));
}

/** Oscurece (o aclara) un color hasta que el texto encima cumpla el contraste. */
export function ajustarParaContraste(fondo, texto, minimo = CONTRASTE_MINIMO) {
  if (contraste(fondo, texto) >= minimo) return fondo;
  const hacia = luminancia(texto) > 0.5 ? '#000000' : '#FFFFFF';
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mezclar(fondo, hacia, t);
    if (contraste(c, texto) >= minimo) return c;
  }
  return hacia;
}

function rgbAHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/**
 * Extrae fondo y acento de los píxeles de un logo.
 * `pixeles`: Uint8Array/Array RGBA plano (como lo entrega sharp().raw()).
 * - Ignora transparentes y casi blancos (fondo del archivo).
 * - Fondo: el color oscuro más frecuente.
 * - Acento: el color más saturado y frecuente que no se parezca al fondo.
 */
export function extraerColores(pixeles) {
  const cubetas = new Map();
  for (let i = 0; i < pixeles.length; i += 4) {
    const [r, g, b, a] = [pixeles[i], pixeles[i + 1], pixeles[i + 2], pixeles[i + 3]];
    if (a < 128) continue;
    if (r > 235 && g > 235 && b > 235) continue;
    const clave = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const c = cubetas.get(clave) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += r; c.g += g; c.b += b;
    cubetas.set(clave, c);
  }
  const colores = [...cubetas.values()].map(c => {
    const rgb = [c.r / c.n, c.g / c.n, c.b / c.n];
    const [h, s, l] = rgbAHsl(rgb);
    return { hex: rgbAHex(rgb), n: c.n, h, s, l };
  });
  if (!colores.length) return null;
  const oscuros = colores.filter(c => c.l < 0.35).sort((a, b) => b.n - a.n);
  const fondo = (oscuros[0] ?? [...colores].sort((a, b) => a.l - b.l)[0]);
  const candidatos = colores
    .filter(c => c.s > 0.35 && c.l > 0.2 && c.l < 0.8 && Math.min(Math.abs(c.h - fondo.h), 360 - Math.abs(c.h - fondo.h)) > 30)
    .sort((a, b) => b.n * b.s - a.n * a.s);
  const acento = candidatos[0] ?? colores.filter(c => c !== fondo).sort((a, b) => b.n - a.n)[0] ?? fondo;
  return { fondo: fondo.hex, acento: acento.hex };
}

/**
 * Tema completo y seguro a partir de los colores del despacho.
 * Garantiza contraste ≥ 4.5:1 para el texto sobre fondo, sobre botones de acción
 * y para el acento usado como texto sobre fondo claro.
 */
export function construirTema({ fondo, acento, accion, tipografia = 'Poppins' }) {
  const accionBase = accion ?? acento;
  const textoAccion = '#FFFFFF';
  const accionSegura = ajustarParaContraste(accionBase, textoAccion);
  const textoFondo = textoSobre(fondo);
  const acentoSobreClaro = ajustarParaContraste(acento, '#FFFFFF'); // acento como texto/enlace sobre blanco
  const tema = {
    fondo,
    textoFondo,
    acento,
    acentoTexto: acentoSobreClaro,
    accion: accionSegura,
    textoAccion,
    superficie: '#FFFFFF',
    textoSuperficie: '#1F2937',
    tipografia,
  };
  tema.verificacion = {
    textoSobreFondo: +contraste(fondo, textoFondo).toFixed(2),
    textoSobreAccion: +contraste(accionSegura, textoAccion).toFixed(2),
    acentoSobreBlanco: +contraste(acentoSobreClaro, '#FFFFFF').toFixed(2),
    ajustes: [
      accionSegura !== accionBase ? `Botón de acción ajustado de ${accionBase} a ${accionSegura} para cumplir 4.5:1` : null,
      acentoSobreClaro !== acento ? `Acento como texto ajustado de ${acento} a ${acentoSobreClaro}` : null,
    ].filter(Boolean),
  };
  return tema;
}

/** Variables CSS para inyectar en el panel, portal, correos y PDF. */
export function temaACss(tema) {
  return [
    `--color-fondo:${tema.fondo}`, `--color-texto-fondo:${tema.textoFondo}`,
    `--color-acento:${tema.acento}`, `--color-acento-texto:${tema.acentoTexto}`,
    `--color-accion:${tema.accion}`, `--color-texto-accion:${tema.textoAccion}`,
    `--color-superficie:${tema.superficie}`, `--color-texto:${tema.textoSuperficie}`,
    `--fuente:'${tema.tipografia}'`,
  ].join(';');
}
