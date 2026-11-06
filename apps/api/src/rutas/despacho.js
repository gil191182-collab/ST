// Datos del despacho y su logo.
import { construirTema } from '@logistics/dominio';
import { leerArchivo } from '../seguridad.js';

export function rutasDespacho(app, { config, ErrorHttp, enDespacho, soloConsultor, soloDirector }) {
  app.get('/api/despacho', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows: [d] } = await c.query(`SELECT id, nombre, subdominio, tema, lema, correo_notificaciones, whatsapp_numero FROM despachos WHERE id = despacho_actual()`);
      const { logo_ruta, ...tema } = d.tema;
      return { ...d, tema, tieneLogo: Boolean(logo_ruta), temaCalculado: construirTema(d.tema) };
    });
  });

  app.patch('/api/despacho', {
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      nombre: { type: 'string', minLength: 2 }, lema: { type: 'string' }, correo_notificaciones: { type: 'string' },
      whatsapp_numero: { type: 'string' }, tipografia: { type: 'string', pattern: '^[A-Za-z0-9 ]{2,40}$' },
      fondo: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }, acento: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
      accion: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    } } },
  }, async (req) => {
    soloDirector(req);
    const b = req.body;
    const temaParcial = Object.fromEntries(['tipografia', 'fondo', 'acento', 'accion'].filter(k => b[k]).map(k => [k, b[k]]));
    return enDespacho(req, async (c) => {
      const { rows: [d] } = await c.query(
        `UPDATE despachos SET nombre = coalesce($1, nombre), lema = coalesce($2, lema), correo_notificaciones = coalesce($3, correo_notificaciones),
           whatsapp_numero = coalesce($4, whatsapp_numero), tema = tema || $5::jsonb WHERE id = despacho_actual() RETURNING tema`,
        [b.nombre ?? null, b.lema ?? null, b.correo_notificaciones ?? null, b.whatsapp_numero ?? null, JSON.stringify(temaParcial)]);
      // El tema que se aplica SIEMPRE pasa por la verificación de contraste
      return { temaCalculado: construirTema(d.tema) };
    });
  });

  // Logo (público: se muestra en la pantalla de acceso)
  app.get('/api/despacho/logo', { config: { publica: true } }, async (req, reply) => {
    const ruta = req.despacho.tema?.logo_ruta;
    if (!ruta) throw new ErrorHttp(404, 'El despacho aún no tiene logo.');
    const datos = await leerArchivo({ carpeta: config.carpetaArchivos, ruta, llave: config.llaveArchivos });
    const { default: sharp } = await import('sharp');
    const png = await sharp(datos).resize(400, 400, { fit: 'inside' }).png().toBuffer();
    reply.header('Content-Type', 'image/png').header('Cache-Control', 'public, max-age=300');
    return reply.send(png);
  });
}
