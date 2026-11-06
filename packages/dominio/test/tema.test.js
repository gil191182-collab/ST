import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contraste, construirTema, extraerColores, hexARgb, temaACss, CONTRASTE_MINIMO } from '../src/index.js';

test('contraste: blanco sobre negro es 21:1', () => {
  assert.equal(contraste('#FFFFFF', '#000000').toFixed(0), '21');
});

test('tema Strateggia cumple 4.5:1 en todo texto', () => {
  const t = construirTema({ fondo: '#1B2440', acento: '#D68C28', accion: '#B35A0C', tipografia: 'Poppins' });
  assert.equal(t.fondo, '#1B2440');
  assert.equal(t.textoFondo, '#FFFFFF');
  assert.ok(t.verificacion.textoSobreFondo >= CONTRASTE_MINIMO);
  assert.ok(t.verificacion.textoSobreAccion >= CONTRASTE_MINIMO, `acción: ${t.verificacion.textoSobreAccion}`);
  assert.ok(t.verificacion.acentoSobreBlanco >= CONTRASTE_MINIMO);
  assert.match(temaACss(t), /--color-fondo:#1B2440/);
});

test('un botón demasiado claro se oscurece hasta cumplir', () => {
  const t = construirTema({ fondo: '#FFFFFF', acento: '#FFD54F' });
  assert.notEqual(t.accion, '#FFD54F');
  assert.ok(contraste(t.accion, '#FFFFFF') >= CONTRASTE_MINIMO);
  assert.equal(t.textoFondo, '#111827');
  assert.equal(t.verificacion.ajustes.length, 2);
});

test('extrae fondo azul marino y acento naranja de un logo', () => {
  const px = [];
  const pinta = (hex, n) => { const [r, g, b] = hexARgb(hex); for (let i = 0; i < n; i++) px.push(r, g, b, 255); };
  pinta('#1B2440', 600);   // fondo del logo
  pinta('#D68C28', 150);   // acento
  pinta('#FFFFFF', 900);   // blanco (se ignora)
  for (let i = 0; i < 300; i++) px.push(0, 0, 0, 0); // transparente (se ignora)
  const c = extraerColores(Uint8Array.from(px));
  const cerca = (a, b) => hexARgb(a).every((v, i) => Math.abs(v - hexARgb(b)[i]) <= 8);
  assert.ok(cerca(c.fondo, '#1B2440'), c.fondo);
  assert.ok(cerca(c.acento, '#D68C28'), c.acento);
});
