// Carpeta de Google Drive por expediente: ligar, ver estado y revisar ahora.
import { idCarpetaDrive } from '@logistics/dominio';
import { sincronizarExpediente, ErrorDrive } from '../drive.js';

export function rutasDrive(app, { config, drive, ErrorHttp, enDespacho, soloConsultor }) {
  const opciones = { carpetaArchivos: config.carpetaArchivos, llaveArchivos: config.llaveArchivos };

  app.get('/api/expedientes/:id/drive', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows: [e] } = await c.query(
        `SELECT drive_carpeta_id, drive_revisado_en,
                (SELECT count(*) FROM documentos d WHERE d.expediente_id = e.id AND d.origen = 'drive' AND d.archivado_en IS NULL)::int AS importados
         FROM expedientes e WHERE id = $1`, [req.params.id]);
      if (!e) throw new ErrorHttp(404, 'Expediente no encontrado.');
      return { configurado: Boolean(drive), correo: drive?.correo ?? null, ...e };
    });
  });

  app.put('/api/expedientes/:id/drive', {
    schema: { body: { type: 'object', required: ['enlace'], additionalProperties: false, properties: { enlace: { type: 'string', maxLength: 500 } } } },
  }, async (req) => {
    soloConsultor(req);
    const enlace = req.body.enlace.trim();
    const id = enlace ? idCarpetaDrive(enlace) : null;
    if (enlace && !id) throw new ErrorHttp(400, 'Ese enlace no parece de una carpeta de Google Drive. Cópielo desde Drive: Compartir → Copiar enlace.');
    let nombre = null;
    if (id && drive) {
      try { nombre = (await drive.carpeta(id)).name; }
      catch (e) { throw new ErrorHttp(400, e instanceof ErrorDrive ? e.message : 'No se pudo consultar Google Drive.'); }
    }
    return enDespacho(req, async (c) => {
      const { rows } = await c.query(`UPDATE expedientes SET drive_carpeta_id = $2 WHERE id = $1 RETURNING id`, [req.params.id, id]);
      if (!rows.length) throw new ErrorHttp(404, 'Expediente no encontrado.');
      return { drive_carpeta_id: id, nombre };
    });
  });

  app.post('/api/expedientes/:id/drive/revisar', async (req) => {
    soloConsultor(req);
    if (!drive) throw new ErrorHttp(400, 'La conexión con Google Drive no está configurada en el servidor.');
    try {
      return await enDespacho(req, (c) => sincronizarExpediente(c, drive, req.params.id, { ...opciones, log: (m) => req.log.warn(m) }));
    } catch (e) {
      if (e instanceof ErrorDrive) throw new ErrorHttp(400, e.message);
      throw e;
    }
  });
}
