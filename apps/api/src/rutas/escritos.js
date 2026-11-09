// Escritos generados por el sistema (Word y PDF). Al generarse, queda una
// acción de "firma" propuesta: firmar e ingresar lo hace siempre una persona.
import { TIPOS_ESCRITO, armarEscrito, escritoDocx, escritoPdf, ErrorEscrito } from '../escritos.js';
import { guardarArchivo, leerArchivo } from '../seguridad.js';

export function rutasEscritos(app, { config, ErrorHttp, enDespacho, soloConsultor }) {
  app.get('/api/escritos/tipos', async (req) => {
    soloConsultor(req);
    return Object.entries(TIPOS_ESCRITO).map(([clave, t]) => ({ clave, nombre: t.nombre, membrete: t.membrete, asunto: t.asunto, cuerpo: t.cuerpo, firma: t.firma, campos: t.campos ?? [], nota: t.nota ?? null }));
  });

  /** Logo del despacho (descifrado) para incrustarlo en membretes. */
  async function logoDelDespacho(despacho) {
    const ruta = despacho.tema?.logo_ruta;
    if (!ruta) return null;
    try {
      const datos = await leerArchivo({ carpeta: config.carpetaArchivos, ruta, llave: config.llaveArchivos });
      const { default: sharp } = await import('sharp');
      const png = await sharp(datos).resize(600, 600, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
      return { tipo: 'png', datos: png.data, proporcion: png.info.height / png.info.width };
    } catch { return null; }
  }

  app.post('/api/expedientes/:id/escritos', {
    schema: { body: { type: 'object', required: ['tipo'], additionalProperties: false, properties: {
      tipo: { type: 'string', enum: Object.keys(TIPOS_ESCRITO) },
      asunto: { type: 'string' }, cuerpo: { type: 'array', items: { type: 'string' } },
      lugar: { type: 'string' }, fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      destinatario: { type: 'string' }, firmante: { type: 'string' }, cargo_firmante: { type: 'string' },
      fecha_inicio: { type: 'string' }, requisito_id: { type: 'string' },
      extras: { type: 'object', additionalProperties: { type: 'string', maxLength: 1000 } },
    } } },
  }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    return enDespacho(req, async (c) => {
      const { rows: [d] } = await c.query(
        `SELECT e.id, cl.razon_social, cl.nombre_corto, p.numero AS permiso_numero, p.servicio, p.domicilio_textual, p.fecha_otorgamiento::text AS fecha_otorgamiento,
                concat_ws(', ', t.municipio, t.estado) AS lugar, ct.nombre AS representante, u.nombre AS consultor
         FROM expedientes e JOIN clientes cl ON cl.id = e.cliente_id JOIN terminales t ON t.id = e.terminal_id
         LEFT JOIN permisos p ON p.id = e.permiso_id LEFT JOIN contactos ct ON ct.id = e.contacto_id
         LEFT JOIN usuarios u ON u.id = usuario_actual() WHERE e.id = $1`, [req.params.id]);
      if (!d) throw new ErrorHttp(404, 'Expediente no encontrado.');
      const t = TIPOS_ESCRITO[b.tipo];
      let armado;
      try {
        armado = armarEscrito({
          tipo: b.tipo, asunto: b.asunto, cuerpo: b.cuerpo, lugar: b.lugar, fecha: b.fecha, destinatario: b.destinatario,
          firmante: b.firmante ?? (t.firma === 'consultor' ? d.consultor : undefined), cargoFirmante: b.cargo_firmante, extras: b.extras ?? {},
          datos: { ...d, fecha_inicio: b.fecha_inicio, despacho: req.despacho.nombre },
        });
      } catch (e) {
        if (e instanceof ErrorEscrito) throw new ErrorHttp(400, e.message);
        throw e;
      }
      const marca = { ...req.despacho.tema, nombre: req.despacho.nombre, lema: req.despacho.lema };
      const logo = t.membrete ? await logoDelDespacho(req.despacho) : null;
      const [docx, pdf] = await Promise.all([
        escritoDocx({ contenido: armado.contenido, marca, logo }),
        escritoPdf({ contenido: armado.contenido, marca, logo }),
      ]);
      const base = `${t.nombre} - ${d.nombre_corto}`;
      const ids = [];
      for (const [buffer, ext, mime] of [[docx, 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], [pdf, 'pdf', 'application/pdf']]) {
        const { ruta, sha256 } = await guardarArchivo({ carpeta: config.carpetaArchivos, despachoId: req.despacho.id, buffer, llave: config.llaveArchivos });
        const { rows: [doc] } = await c.query(
          `INSERT INTO documentos (despacho_id, expediente_id, requisito_id, nombre, tipo_mime, tamano_bytes, sha256, ruta_cifrada, subido_por, texto_extraido, origen, tipo_escrito)
           VALUES (despacho_actual(), $1, $2, $3, $4, $5, $6, $7, usuario_actual(), $8, 'generado', $9) RETURNING id, nombre`,
          [d.id, b.requisito_id ?? null, `${base}.${ext}`, mime, buffer.length, sha256, ruta, armado.textoCompleto, b.tipo]);
        ids.push(doc);
      }
      if (t.firma === 'cliente') {
        await c.query(
          `INSERT INTO acciones (despacho_id, expediente_id, tipo, canal, destinatario, asunto, borrador, propuesta_por)
           VALUES (despacho_actual(), $1, 'firma', 'interno', $2, $3, $4, 'sistema')`,
          [d.id, armado.contenido.firmante, `Firma: ${t.nombre}`,
           `El escrito «${t.nombre}» está listo para que ${armado.contenido.firmante} lo revise y firme. Después, una persona lo ingresa ante la ATTRAPI.`]);
      }
      return { documentos: ids, revision: armado.revision };
    });
  });
}
