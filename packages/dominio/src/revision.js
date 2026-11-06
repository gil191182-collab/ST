// Revisión automática de documentos (pantalla "Detalle de expediente").
// Corre las reglas del catálogo sobre el texto de un documento y devuelve
// resultados OK / REVISAR / FALTA / FALLA. NUNCA aprueba nada: un consultor
// confirma cada resultado.
import { compararDomicilio, citasAgenciaAnterior, contieneMarcadorPendiente, compararEndoso, normalizarEspacios } from './textos.js';

/**
 * @param {object} p
 * @param {string} p.texto            Texto completo del documento.
 * @param {string} [p.domicilioPermiso] Domicilio textual del permiso.
 * @param {string} [p.domicilioEnDocumento] Domicilio tal como aparece en el documento (si se identificó).
 * @param {Array<{clave:string, texto:string}>} [p.endososCatalogo]
 * @param {Record<string,string>} [p.endososEnDocumento]  clave → texto encontrado
 * @param {boolean} [p.soloPesos] Para tarifas: no debe haber importes en dólares.
 */
export function revisarDocumento(p) {
  const r = [];
  const texto = p.texto ?? '';

  if (p.domicilioPermiso !== undefined) {
    if (p.domicilioEnDocumento) {
      r.push({ regla: 'domicilio_identico', ...compararDomicilio(p.domicilioPermiso, p.domicilioEnDocumento) });
    } else if (!contieneMarcadorPendiente(p.domicilioPermiso)) {
      const aparece = normalizarEspacios(texto).includes(normalizarEspacios(p.domicilioPermiso));
      r.push(aparece
        ? { regla: 'domicilio_identico', resultado: 'OK', mensaje: 'El domicilio del permiso aparece idéntico en el documento.' }
        : { regla: 'domicilio_identico', resultado: 'REVISAR', mensaje: 'No se encontró el domicilio del permiso escrito igual en el documento.' });
    } else {
      r.push({ regla: 'domicilio_identico', resultado: 'FALTA', mensaje: 'Capture el domicilio textual del permiso para poder compararlo.' });
    }
  }

  const citas = citasAgenciaAnterior(texto);
  const fallas = citas.filter(c => c.resultado === 'FALLA');
  const siglas = citas.filter(c => c.resultado === 'REVISAR');
  if (fallas.length) r.push({ regla: 'agencia_anterior', resultado: 'FALLA', mensaje: `El documento cita a la antigua Agencia Reguladora (${fallas.length} vez/veces).` });
  else if (siglas.length) r.push({ regla: 'agencia_anterior', resultado: 'REVISAR', mensaje: `Aparecen las siglas ARTF ${siglas.length} vez/veces: confirmar que solo son homoclaves o acuerdos históricos.` });
  else r.push({ regla: 'agencia_anterior', resultado: 'OK', mensaje: 'Ningún texto cita a la antigua Agencia Reguladora.' });

  if (contieneMarcadorPendiente(texto)) {
    r.push({ regla: 'marcadores', resultado: 'FALTA', mensaje: 'El documento todavía tiene campos [CAPTURAR …] sin llenar.' });
  }

  if (p.soloPesos) {
    const usd = /\b(USD|US\$|d[oó]lares?)\b/i.test(texto);
    r.push(usd
      ? { regla: 'solo_pesos', resultado: 'FALLA', mensaje: 'Hay importes en dólares; las tarifas van solo en pesos.' }
      : { regla: 'solo_pesos', resultado: 'OK', mensaje: 'Tarifas solo en pesos.' });
  }

  for (const e of p.endososCatalogo ?? []) {
    const encontrado = p.endososEnDocumento?.[e.clave];
    if (!encontrado) r.push({ regla: `endoso:${e.clave}`, resultado: 'FALTA', mensaje: `No se encontró el endoso «${e.clave}».` });
    else r.push({ regla: `endoso:${e.clave}`, ...compararEndoso(e.texto, encontrado) });
  }

  return r.map(x => ({ ...x, requiereConfirmacion: true }));
}
