// Personas del despacho: invitar, restablecer contraseña y archivar.
// La invitación es un enlace de un solo uso; en la base solo queda su huella.
import crypto from 'node:crypto';
import { hashClave, firmar } from '../seguridad.js';

const DIAS_INVITACION = 7;
const HORAS_RESTABLECER = 24;
const huella = (ficha) => crypto.createHash('sha256').update(ficha).digest('hex');

export function rutasUsuarios(app, { config, pool, ErrorHttp, enDespacho, soloConsultor, soloDirector }) {
  async function crearFicha(c, usuarioId, motivo, horas) {
    const ficha = crypto.randomBytes(32).toString('base64url');
    await c.query(`UPDATE invitaciones SET archivado_en = now() WHERE usuario_id = $1 AND usada_en IS NULL AND archivado_en IS NULL`, [usuarioId]);
    await c.query(
      `INSERT INTO invitaciones (despacho_id, usuario_id, huella, motivo, vence_en, creada_por)
       VALUES (despacho_actual(), $1, $2, $3, now() + make_interval(hours => $4), usuario_actual())`,
      [usuarioId, huella(ficha), motivo, horas]);
    return { enlace: `/acceso/${ficha}`, vence_en_horas: horas };
  }

  app.get('/api/usuarios', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => (await c.query(
      `SELECT u.id, u.nombre, u.correo, u.telefono, u.rol, u.cliente_id, cl.nombre_corto AS cliente, (u.clave_hash IS NOT NULL) AS activo, u.archivado_en
       FROM usuarios u LEFT JOIN clientes cl ON cl.id = u.cliente_id ORDER BY u.archivado_en NULLS FIRST, u.rol, u.nombre`)).rows);
  });

  // El director invita a consultores; un consultor puede invitar a clientes.
  app.post('/api/usuarios', {
    schema: { body: { type: 'object', required: ['nombre', 'correo', 'rol'], additionalProperties: false, properties: {
      nombre: { type: 'string', minLength: 2 }, correo: { type: 'string', format: 'email' }, telefono: { type: 'string' },
      rol: { type: 'string', enum: ['director', 'consultor', 'cliente'] }, cliente_id: { type: 'string' } } } },
  }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    if (b.rol !== 'cliente') soloDirector(req);
    if (b.rol === 'cliente' && !b.cliente_id) throw new ErrorHttp(400, 'Indique a qué cliente pertenece.');
    return enDespacho(req, async (c) => {
      const { rows: ya } = await c.query(`SELECT 1 FROM usuarios WHERE lower(correo) = lower($1)`, [b.correo]);
      if (ya.length) throw new ErrorHttp(409, 'Ya existe una persona con ese correo en el despacho.');
      const { rows: [u] } = await c.query(
        `INSERT INTO usuarios (despacho_id, nombre, correo, telefono, rol, cliente_id) VALUES (despacho_actual(), $1, $2, $3, $4, $5) RETURNING id`,
        [b.nombre, b.correo, b.telefono ?? null, b.rol, b.rol === 'cliente' ? b.cliente_id : null]);
      return { id: u.id, ...(await crearFicha(c, u.id, 'invitacion', DIAS_INVITACION * 24)) };
    });
  });

  app.post('/api/usuarios/:id/restablecer', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows: [u] } = await c.query(`SELECT id, rol FROM usuarios WHERE id = $1 AND archivado_en IS NULL`, [req.params.id]);
      if (!u) throw new ErrorHttp(404, 'Persona no encontrada.');
      if (u.rol !== 'cliente') soloDirector(req);
      return crearFicha(c, u.id, 'restablecer', HORAS_RESTABLECER);
    });
  });

  app.post('/api/usuarios/:id/archivar', async (req) => {
    soloDirector(req);
    if (req.params.id === req.usuario.id) throw new ErrorHttp(400, 'No puede archivarse a sí mismo.');
    return enDespacho(req, async (c) => {
      const { rows } = await c.query(`UPDATE usuarios SET archivado_en = now(), clave_hash = NULL WHERE id = $1 AND archivado_en IS NULL RETURNING id`, [req.params.id]);
      if (!rows.length) throw new ErrorHttp(404, 'Persona no encontrada.');
      return rows[0];
    });
  });

  // ---------- Públicas: abrir el enlace y definir la contraseña ----------
  async function buscarFicha(req) {
    return enDespacho(req, async (c) => {
      const { rows: [i] } = await c.query(
        `SELECT i.id, i.motivo, i.usuario_id, u.nombre, u.correo, u.rol, u.cliente_id FROM invitaciones i JOIN usuarios u ON u.id = i.usuario_id
         WHERE i.huella = $1 AND i.usada_en IS NULL AND i.archivado_en IS NULL AND i.vence_en > now() AND u.archivado_en IS NULL`,
        [huella(req.params.ficha)]);
      if (!i) throw new ErrorHttp(410, 'El enlace venció o ya se usó. Pida uno nuevo a su consultora.');
      return i;
    }, 'sistema');
  }

  app.get('/api/acceso/:ficha', { config: { publica: true } }, async (req) => {
    const i = await buscarFicha(req);
    return { nombre: i.nombre, correo: i.correo, motivo: i.motivo };
  });

  app.post('/api/acceso/:ficha', {
    config: { publica: true },
    schema: { body: { type: 'object', required: ['clave'], properties: { clave: { type: 'string', minLength: 10, maxLength: 200 } } } },
  }, async (req, reply) => {
    const i = await buscarFicha(req);
    await enDespacho({ despacho: req.despacho, usuario: { id: i.usuario_id } }, async (c) => {
      await c.query(`UPDATE usuarios SET clave_hash = $2 WHERE id = $1`, [i.usuario_id, hashClave(req.body.clave)]);
      await c.query(`UPDATE invitaciones SET usada_en = now() WHERE id = $1`, [i.id]);
    }, 'usuario');
    const ficha = firmar({ despacho: req.despacho.id, usuario: i.usuario_id, rol: i.rol, cliente: i.cliente_id, nombre: i.nombre }, config.secreto, 12 * 3600);
    reply.setCookie('sesion', ficha, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.produccion, maxAge: 12 * 3600 });
    return { usuario: { nombre: i.nombre, rol: i.rol } };
  });
}
