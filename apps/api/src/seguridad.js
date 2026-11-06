// Contraseñas (scrypt), sesiones firmadas y archivos cifrados con URLs firmadas.
// Solo se usa la librería criptográfica que trae Node.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// ---------- Contraseñas ----------
export function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(clave, sal, 64);
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export function verificarClave(clave, guardado) {
  if (!guardado?.startsWith('scrypt$')) return false;
  const [, sal, hash] = guardado.split('$');
  const calculado = crypto.scryptSync(clave, Buffer.from(sal, 'base64'), 64);
  const esperado = Buffer.from(hash, 'base64');
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

// ---------- Fichas firmadas (sesión y URLs de archivos) ----------
const b64 = (b) => Buffer.from(b).toString('base64url');

export function firmar(datos, secreto, segundos) {
  const cuerpo = b64(JSON.stringify({ ...datos, exp: Math.floor(Date.now() / 1000) + segundos }));
  const firma = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

export function verificarFirma(ficha, secreto) {
  if (typeof ficha !== 'string' || !ficha.includes('.')) return null;
  const [cuerpo, firma] = ficha.split('.');
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
  if (datos.exp < Math.floor(Date.now() / 1000)) return null;
  return datos;
}

// ---------- Archivos cifrados (AES-256-GCM) ----------
// Formato en disco: [12 bytes IV][16 bytes etiqueta][contenido cifrado]
export function cifrar(buffer, llave) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', llave, iv);
  const cifrado = Buffer.concat([c.update(buffer), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), cifrado]);
}

export function descifrar(buffer, llave) {
  const iv = buffer.subarray(0, 12), etiqueta = buffer.subarray(12, 28), datos = buffer.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', llave, iv);
  d.setAuthTag(etiqueta);
  return Buffer.concat([d.update(datos), d.final()]);
}

export async function guardarArchivo({ carpeta, despachoId, buffer, llave }) {
  const id = crypto.randomUUID();
  const relativa = path.join(despachoId, id.slice(0, 2), `${id}.bin`);
  const destino = path.join(carpeta, relativa);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, cifrar(buffer, llave), { mode: 0o600 });
  return { ruta: relativa, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

export async function leerArchivo({ carpeta, ruta, llave }) {
  const completa = path.resolve(carpeta, ruta);
  if (!completa.startsWith(path.resolve(carpeta) + path.sep)) throw new Error('Ruta inválida');
  return descifrar(await fs.readFile(completa), llave);
}
