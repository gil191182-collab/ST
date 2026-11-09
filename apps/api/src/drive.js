// Conexión de solo lectura con Google Drive mediante una cuenta de servicio.
// La llave (archivo JSON) vive en el servidor, fuera del código: GOOGLE_DRIVE_JSON.
// El sistema solo ve las carpetas que alguien comparta con el correo de esa cuenta.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sugerirRequisito, revisarDocumento } from '@logistics/dominio';
import { guardarArchivo } from './seguridad.js';
import { extraerTexto } from './texto.js';

const API = 'https://www.googleapis.com/drive/v3';
const LIMITE_BYTES = 30 * 1024 * 1024;
const MAX_ARCHIVOS = 300;
// Documentos de Google: se exportan a un formato que el sistema sabe leer
const EXPORTAR = {
  'application/vnd.google-apps.document': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: 'pdf' },
};
const CARPETA = 'application/vnd.google-apps.folder';

export class ErrorDrive extends Error {}

/** Devuelve null si no hay llave configurada (el resto del sistema sigue funcionando). */
export function crearDrive({ ruta = process.env.GOOGLE_DRIVE_JSON, fetchImpl = globalThis.fetch, credenciales } = {}) {
  let cred = credenciales;
  if (!cred) {
    if (!ruta) return null;
    try { cred = JSON.parse(readFileSync(ruta, 'utf8')); } catch { return null; }
  }
  if (!cred?.client_email || !cred?.private_key) return null;

  let ficha = null;
  async function token() {
    if (ficha && ficha.vence > Date.now() + 60_000) return ficha.valor;
    const ahora = Math.floor(Date.now() / 1000);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const sinFirma = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: cred.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: cred.token_uri ?? 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
    })}`;
    const firma = createSign('RSA-SHA256').update(sinFirma).sign(cred.private_key).toString('base64url');
    const r = await fetchImpl(cred.token_uri ?? 'https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${sinFirma}.${firma}` }),
    });
    if (!r.ok) throw new ErrorDrive(`Google no aceptó la llave de la cuenta de servicio (${r.status}).`);
    const j = await r.json();
    ficha = { valor: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return ficha.valor;
  }

  async function pedir(url, { binario = false } = {}) {
    const r = await fetchImpl(url, { headers: { authorization: `Bearer ${await token()}` } });
    if (r.status === 404 || r.status === 403) {
      throw new ErrorDrive(`El sistema no tiene acceso. Comparta la carpeta con ${cred.client_email} (como lector).`);
    }
    if (!r.ok) throw new ErrorDrive(`Google Drive respondió ${r.status}.`);
    return binario ? Buffer.from(await r.arrayBuffer()) : r.json();
  }

  const comunes = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

  return {
    correo: cred.client_email,

    async carpeta(id) {
      const f = await pedir(`${API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType&supportsAllDrives=true`);
      if (f.mimeType !== CARPETA) throw new ErrorDrive('El enlace no es de una carpeta de Drive.');
      return f;
    },

    /** Archivos de la carpeta y sus subcarpetas (hasta 4 niveles), con la ruta de carpetas. */
    async listar(id, { profundidad = 4 } = {}) {
      const archivos = [];
      const pendientes = [{ id, ruta: '', nivel: 0 }];
      while (pendientes.length && archivos.length < MAX_ARCHIVOS) {
        const { id: actual, ruta, nivel } = pendientes.shift();
        let pagina = '';
        do {
          const q = encodeURIComponent(`'${actual}' in parents and trashed = false`);
          const j = await pedir(`${API}/files?q=${q}&pageSize=200&${comunes}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,size)${pagina ? `&pageToken=${pagina}` : ''}`);
          for (const f of j.files ?? []) {
            if (f.mimeType === CARPETA) {
              if (nivel < profundidad) pendientes.push({ id: f.id, ruta: ruta ? `${ruta} / ${f.name}` : f.name, nivel: nivel + 1 });
            } else if (!f.mimeType.startsWith('application/vnd.google-apps.') || EXPORTAR[f.mimeType]) {
              archivos.push({ ...f, ruta });
            }
          }
          pagina = j.nextPageToken ?? '';
        } while (pagina);
      }
      return archivos;
    },

    async descargar(f) {
      const exp = EXPORTAR[f.mimeType];
      if (exp) {
        const datos = await pedir(`${API}/files/${f.id}/export?mimeType=${encodeURIComponent(exp.mime)}`, { binario: true });
        return { datos, mime: exp.mime, nombre: f.name.endsWith(`.${exp.ext}`) ? f.name : `${f.name}.${exp.ext}` };
      }
      if (Number(f.size ?? 0) > LIMITE_BYTES) throw new ErrorDrive(`«${f.name}» pesa más de 30 MB; súbalo a mano si se necesita.`);
      return { datos: await pedir(`${API}/files/${f.id}?alt=media&supportsAllDrives=true`, { binario: true }), mime: f.mimeType, nombre: f.name };
    },
  };
}

/**
 * Revisa la carpeta del expediente e importa lo nuevo. Para cada archivo nuevo:
 * lo guarda cifrado, extrae el texto, corre las reglas y PROPONE el requisito.
 * No cambia estados ni aprueba: deja una alerta para que una persona lo revise.
 * `c` es un cliente con el despacho ya fijado (RLS).
 */
export async function sincronizarExpediente(c, drive, expedienteId, { carpetaArchivos, llaveArchivos, log = () => {} }) {
  const { rows: [e] } = await c.query(
    `SELECT e.id, e.despacho_id, e.drive_carpeta_id, p.domicilio_textual, tr.clave AS tramite_clave, cl.nombre_corto AS cliente
     FROM expedientes e JOIN clientes cl ON cl.id = e.cliente_id
     LEFT JOIN permisos p ON p.id = e.permiso_id
     LEFT JOIN tramite_versiones v ON v.id = e.tramite_version_id LEFT JOIN tramites tr ON tr.id = v.tramite_id
     WHERE e.id = $1 AND e.archivado_en IS NULL`, [expedienteId]);
  if (!e?.drive_carpeta_id) return { nuevos: [], errores: [] };

  const archivos = await drive.listar(e.drive_carpeta_id);
  const { rows: ya } = await c.query(
    `SELECT drive_id, drive_modificado FROM documentos WHERE expediente_id = $1 AND drive_id IS NOT NULL`, [e.id]);
  const conocidos = new Set(ya.map(d => `${d.drive_id}|${new Date(d.drive_modificado).toISOString()}`));
  const { rows: requisitos } = await c.query(
    `SELECT id, nombre, seccion FROM expediente_requisitos WHERE expediente_id = $1 AND archivado_en IS NULL`, [e.id]);

  const nuevos = [];
  const errores = [];
  for (const f of archivos) {
    if (conocidos.has(`${f.id}|${new Date(f.modifiedTime).toISOString()}`)) continue;
    try {
      const { datos, mime, nombre } = await drive.descargar(f);
      const { ruta, sha256 } = await guardarArchivo({ carpeta: carpetaArchivos, despachoId: e.despacho_id, buffer: datos, llave: llaveArchivos });
      const texto = await extraerTexto(datos, { nombre, tipo: mime });
      const sugerencia = sugerirRequisito({ nombreArchivo: nombre, ruta: f.ruta, texto, requisitos });
      const revision = texto ? {
        reglas: {
          resultados: revisarDocumento({ texto, domicilioPermiso: e.domicilio_textual ?? undefined, soloPesos: e.tramite_clave === 'registro_tarifas' }),
          cuando: new Date().toISOString(),
        },
      } : null;
      const nombreVisible = f.ruta ? `${f.ruta} / ${nombre}` : nombre;
      const { rows: [d] } = await c.query(
        `INSERT INTO documentos (despacho_id, expediente_id, requisito_id, nombre, tipo_mime, tamano_bytes, sha256, ruta_cifrada,
                                 texto_extraido, revision, origen, drive_id, drive_modificado)
         VALUES (despacho_actual(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 'drive', $10, $11)
         ON CONFLICT DO NOTHING RETURNING id`,
        [e.id, sugerencia?.id ?? null, nombreVisible, mime, datos.length, sha256, ruta, texto, revision ? JSON.stringify(revision) : null, f.id, f.modifiedTime]);
      if (!d) continue;
      if (sugerencia) {
        await c.query(`UPDATE expediente_requisitos SET propuesta_ia = $2 WHERE id = $1`,
          [sugerencia.id, JSON.stringify({ tipo: 'drive', documento: nombreVisible, documento_id: d.id, sugerencia, ...(revision ?? {}) })]);
      }
      await c.query(
        `INSERT INTO acciones (despacho_id, expediente_id, tipo, canal, destinatario, borrador, propuesta_por)
         VALUES (despacho_actual(), $1, 'alerta_interna', 'interno', 'Consultor', $2, 'sistema')`,
        [e.id, sugerencia
          ? `Llegó «${nombreVisible}» desde Drive (${e.cliente}). Parece ser para «${sugerencia.nombre}» (confianza ${sugerencia.confianza}). Revíselo y, si está bien, apruébelo.`
          : `Llegó «${nombreVisible}» desde Drive (${e.cliente}). No se identificó el requisito: asígnelo en Documentos.`]);
      nuevos.push({ id: d.id, nombre: nombreVisible, requisito: sugerencia?.nombre ?? null });
    } catch (err) {
      errores.push({ archivo: f.name, error: err.message });
      log(`Drive: no se pudo importar «${f.name}»: ${err.message}`);
    }
  }
  await c.query(`UPDATE expedientes SET drive_revisado_en = now() WHERE id = $1`, [e.id]);
  return { nuevos, errores, revisados: archivos.length };
}

/** Todas las carpetas del despacho (lo usa el trabajador en segundo plano). */
export async function sincronizarDespacho(c, drive, opciones) {
  const { rows } = await c.query(
    `SELECT id FROM expedientes WHERE drive_carpeta_id IS NOT NULL AND archivado_en IS NULL AND estado NOT IN ('concluido')`);
  const resultado = [];
  for (const { id } of rows) {
    try { resultado.push({ id, ...(await sincronizarExpediente(c, drive, id, opciones)) }); }
    catch (err) { resultado.push({ id, nuevos: [], errores: [{ error: err.message }] }); }
  }
  return resultado;
}
