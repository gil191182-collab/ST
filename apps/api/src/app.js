// API de Strateggia Logistics.
// Cada petición: 1) identifica el despacho por el subdominio, 2) identifica a la
// persona por su sesión, 3) corre todo dentro de conDespacho() (RLS).
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { construirTema, temaACss, extraerColores, revisarDocumento, hoyMexico } from '@logistics/dominio';
import { conDespacho, despachoPorSubdominio, traducirError } from './db.js';
import { verificarClave, firmar, verificarFirma, guardarArchivo, leerArchivo } from './seguridad.js';
import { tablero, detalleExpediente, portalCliente, listarExpedientes, pendientesDe } from './consultas.js';
import { recalcularPlazos } from './plazos.js';

const HORAS_SESION = 12;
const MINUTOS_URL_ARCHIVO = 10;
const ESTADOS_EDITABLES = ['pendiente', 'por_elaborar', 'en_integracion', 'parcial', 'recibido', 'revision_cliente', 'en_revision', 'observacion', 'por_confirmar'];

class ErrorHttp extends Error {
  constructor(estatus, mensaje) { super(mensaje); this.estatus = estatus; }
}

export function crearApp({ config, pool, marce, logger = false }) {
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 2 * 1024 * 1024, maxParamLength: 1000 });
  app.register(cookie);
  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });

  // ---------- Despacho por subdominio ----------
  function subdominioDe(req) {
    if (!config.produccion && req.headers['x-despacho']) return String(req.headers['x-despacho']);
    const host = String(req.headers['x-forwarded-host'] ?? req.hostname ?? '').split(':')[0].toLowerCase();
    if (host === config.dominioBase || host === `staging.${config.dominioBase}` || !host.endsWith(`.${config.dominioBase}`)) {
      return config.despachoPorDefecto;
    }
    return host.slice(0, -(config.dominioBase.length + 1)).replace(/^staging\./, '');
  }

  app.decorateRequest('despacho', null);
  app.decorateRequest('usuario', null);

  app.addHook('preHandler', async (req) => {
    if (req.routeOptions.config?.publica === 'total') return;
    const despacho = await despachoPorSubdominio(pool, subdominioDe(req));
    if (!despacho) throw new ErrorHttp(404, 'Despacho no encontrado.');
    req.despacho = despacho;
    if (req.routeOptions.config?.publica) return;
    const ficha = req.cookies?.sesion ?? (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const datos = verificarFirma(ficha, config.secreto);
    if (!datos || datos.despacho !== despacho.id) throw new ErrorHttp(401, 'Inicie sesión.');
    req.usuario = { id: datos.usuario, rol: datos.rol, clienteId: datos.cliente ?? null, nombre: datos.nombre };
  });

  const ctx = (req, actor = 'usuario') => ({ despachoId: req.despacho.id, usuarioId: req.usuario?.id ?? null, actor });
  const enDespacho = (req, fn, actor) => conDespacho(pool, ctx(req, actor), fn);
  const soloConsultor = (req) => {
    if (!['director', 'consultor'].includes(req.usuario?.rol)) throw new ErrorHttp(403, 'Solo para consultores del despacho.');
  };
  const soloDirector = (req) => {
    if (req.usuario?.rol !== 'director') throw new ErrorHttp(403, 'Solo el director del despacho puede hacer esto.');
  };
  async function exigirAccesoExpediente(client, req, expedienteId) {
    const { rows } = await client.query('SELECT cliente_id FROM expedientes WHERE id = $1', [expedienteId]);
    if (!rows.length) throw new ErrorHttp(404, 'Expediente no encontrado.');
    if (req.usuario.rol === 'cliente' && rows[0].cliente_id !== req.usuario.clienteId) throw new ErrorHttp(404, 'Expediente no encontrado.');
  }

  app.setErrorHandler((err, req, reply) => {
    const t = traducirError(err);
    if (t) return reply.code(t.estatus).send({ error: t.codigo, mensaje: t.mensaje });
    if (err instanceof ErrorHttp) return reply.code(err.estatus).send({ error: 'SOLICITUD', mensaje: err.message });
    if (err.validation) return reply.code(400).send({ error: 'DATOS', mensaje: 'Faltan datos o tienen un formato incorrecto.' });
    req.log.error(err);
    reply.code(500).send({ error: 'INTERNO', mensaje: 'Algo falló en el servidor. Ya quedó registrado.' });
  });

  // ---------- Salud ----------
  app.get('/api/salud', { config: { publica: 'total' } }, async () => {
    await pool.query('SELECT 1');
    return { ok: true, marce: marce.activo };
  });

  // ---------- Tema del despacho (público: lo necesita la pantalla de acceso) ----------
  app.get('/api/tema', { config: { publica: true } }, async (req) => {
    const tema = construirTema(req.despacho.tema);
    return { despacho: req.despacho.nombre, lema: req.despacho.lema, logo: req.despacho.tema.logo ?? null, tema, css: temaACss(tema) };
  });

  // ---------- Sesión ----------
  app.post('/api/sesion', {
    config: { publica: true },
    schema: { body: { type: 'object', required: ['correo', 'clave'], properties: { correo: { type: 'string' }, clave: { type: 'string' } } } },
  }, async (req, reply) => {
    const u = await conDespacho(pool, { despachoId: req.despacho.id, actor: 'sistema' }, async (c) => {
      const { rows } = await c.query(
        `SELECT id, nombre, rol, cliente_id, clave_hash FROM usuarios WHERE lower(correo) = lower($1) AND archivado_en IS NULL`, [req.body.correo]);
      return rows[0];
    });
    if (!u || !verificarClave(req.body.clave, u.clave_hash)) throw new ErrorHttp(401, 'Correo o contraseña incorrectos.');
    const ficha = firmar({ despacho: req.despacho.id, usuario: u.id, rol: u.rol, cliente: u.cliente_id, nombre: u.nombre }, config.secreto, HORAS_SESION * 3600);
    reply.setCookie('sesion', ficha, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.produccion, maxAge: HORAS_SESION * 3600 });
    return { usuario: { id: u.id, nombre: u.nombre, rol: u.rol } };
  });

  app.delete('/api/sesion', { config: { publica: true } }, async (req, reply) => {
    reply.clearCookie('sesion', { path: '/' });
    return { ok: true };
  });

  app.get('/api/yo', async (req) => ({ usuario: req.usuario, despacho: req.despacho.nombre }));

  // ---------- Tablero interno ----------
  app.get('/api/tablero', async (req) => {
    soloConsultor(req);
    return enDespacho(req, (c) => tablero(c));
  });

  app.get('/api/expedientes/:id', async (req) => {
    soloConsultor(req);
    const d = await enDespacho(req, (c) => detalleExpediente(c, req.params.id));
    if (!d) throw new ErrorHttp(404, 'Expediente no encontrado.');
    return d;
  });

  // Abrir expediente: la base valida la cadena de trámites y copia los requisitos de la versión vigente
  app.post('/api/expedientes', {
    schema: { body: { type: 'object', required: ['terminal_id', 'tramite_clave'], properties: {
      terminal_id: { type: 'string' }, permiso_id: { type: ['string', 'null'] }, tramite_clave: { type: 'string' },
      alcance: { type: 'string' }, estado: { type: 'string', enum: ['comercial', 'en_integracion'] },
    } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const b = req.body;
      const hoy = hoyMexico();
      const { rows: [v] } = await c.query(
        `SELECT v.id FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id
         WHERE t.clave = $1 AND v.vigente_desde <= $2 AND (v.vigente_hasta IS NULL OR v.vigente_hasta > $2)
         ORDER BY v.vigente_desde DESC LIMIT 1`, [b.tramite_clave, hoy]);
      if (!v) throw new ErrorHttp(400, 'No hay una versión vigente de ese trámite en el catálogo.');
      const { rows: [t] } = await c.query('SELECT cliente_id FROM terminales WHERE id = $1', [b.terminal_id]);
      if (!t) throw new ErrorHttp(404, 'Terminal no encontrada.');
      const { rows: [e] } = await c.query(
        `INSERT INTO expedientes (despacho_id, cliente_id, terminal_id, permiso_id, tramite_version_id, alcance, estado, consultor_id)
         VALUES (despacho_actual(), $1, $2, $3, $4, $5, $6, usuario_actual()) RETURNING id`,
        [t.cliente_id, b.terminal_id, b.permiso_id ?? null, v.id, b.alcance ?? 'completo', b.estado ?? 'en_integracion']);
      await c.query(
        `INSERT INTO expediente_requisitos (despacho_id, expediente_id, requisito_catalogo_id, seccion, nombre, responsable, orden)
         SELECT despacho_actual(), $1, r.id, r.seccion, r.nombre, r.responsable, r.orden FROM requisitos_catalogo r
         WHERE r.tramite_version_id = $2 AND r.vigente_desde <= $3 AND (r.vigente_hasta IS NULL OR r.vigente_hasta > $3)`,
        [e.id, v.id, hoy]);
      return { id: e.id };
    });
  });

  // "Ya existe fuera del sistema" (requiere documento ya subido)
  app.post('/api/antecedentes', {
    schema: { body: { type: 'object', required: ['terminal_id', 'tramite_clave', 'documento_id', 'descripcion'], properties: {
      terminal_id: { type: 'string' }, tramite_clave: { type: 'string' }, documento_id: { type: 'string' }, descripcion: { type: 'string', minLength: 5 },
    } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const b = req.body;
      const { rows: [a] } = await c.query(
        `INSERT INTO antecedentes_externos (despacho_id, terminal_id, tramite_clave, documento_id, descripcion, marcado_por)
         VALUES (despacho_actual(), $1, $2, $3, $4, usuario_actual()) RETURNING id`,
        [b.terminal_id, b.tramite_clave, b.documento_id, b.descripcion]);
      return a;
    });
  });

  // ---------- Requisitos ----------
  app.patch('/api/requisitos/:id', {
    schema: { body: { type: 'object', properties: { estado: { type: 'string', enum: ESTADOS_EDITABLES }, nota: { type: 'string' } } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows } = await c.query(
        `UPDATE expediente_requisitos SET estado = coalesce($2, estado), nota = coalesce($3, nota),
           aprobado_por = CASE WHEN coalesce($2, estado) = 'aprobado' THEN aprobado_por END,
           aprobado_en  = CASE WHEN coalesce($2, estado) = 'aprobado' THEN aprobado_en END
         WHERE id = $1 RETURNING id, estado, nota`, [req.params.id, req.body.estado ?? null, req.body.nota ?? null]);
      if (!rows.length) throw new ErrorHttp(404, 'Requisito no encontrado.');
      return rows[0];
    });
  });

  // Aprobar: SOLO una persona consultora; la base lo verifica otra vez.
  app.post('/api/requisitos/:id/aprobar', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows } = await c.query(
        `UPDATE expediente_requisitos SET estado = 'aprobado', aprobado_por = usuario_actual(), aprobado_en = now(),
           nota = coalesce($2, nota) WHERE id = $1 RETURNING id, estado, aprobado_en`, [req.params.id, req.body?.nota ?? null]);
      if (!rows.length) throw new ErrorHttp(404, 'Requisito no encontrado.');
      return rows[0];
    });
  });

  // ---------- Acciones (lo que prepara el sistema y aprueba una persona) ----------
  app.post('/api/acciones/:id/aprobar', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows } = await c.query(
        `UPDATE acciones SET estado = 'aprobada', aprobada_por = usuario_actual(), aprobada_en = now(),
           borrador = coalesce($2, borrador)
         WHERE id = $1 AND estado = 'propuesta' RETURNING id, tipo, estado`, [req.params.id, req.body?.borrador ?? null]);
      if (!rows.length) throw new ErrorHttp(409, 'La acción no existe o ya no está esperando aprobación.');
      return rows[0];
    });
  });

  app.post('/api/acciones/:id/rechazar', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows } = await c.query(
        `UPDATE acciones SET estado = 'rechazada' WHERE id = $1 AND estado = 'propuesta' RETURNING id, estado`, [req.params.id]);
      if (!rows.length) throw new ErrorHttp(409, 'La acción no existe o ya no está esperando aprobación.');
      return rows[0];
    });
  });

  // Para ingreso/firma/escrito/cobro: la persona registra que ELLA lo hizo.
  app.post('/api/acciones/:id/hecha', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows } = await c.query(
        `UPDATE acciones SET estado = 'hecha_por_persona', ejecutada_por = usuario_actual(), ejecutada_en = now(),
           aprobada_por = coalesce(aprobada_por, usuario_actual()), aprobada_en = coalesce(aprobada_en, now())
         WHERE id = $1 AND estado IN ('propuesta','aprobada') RETURNING id, estado`, [req.params.id]);
      if (!rows.length) throw new ErrorHttp(409, 'La acción no existe o ya se cerró.');
      return rows[0];
    });
  });

  // ---------- Mensajes ----------
  app.post('/api/expedientes/:id/mensajes', {
    schema: { body: { type: 'object', required: ['texto'], properties: { texto: { type: 'string', minLength: 1, maxLength: 5000 }, interno: { type: 'boolean' } } } },
  }, async (req) => {
    return enDespacho(req, async (c) => {
      await exigirAccesoExpediente(c, req, req.params.id);
      const esCliente = req.usuario.rol === 'cliente';
      const { rows: [m] } = await c.query(
        `INSERT INTO mensajes (despacho_id, expediente_id, canal, direccion, autor_tipo, autor_id, autor_nombre, texto)
         VALUES (despacho_actual(), $1, $2, $3, $4, usuario_actual(), $5, $6) RETURNING id, creado_en`,
        [req.params.id, !esCliente && req.body.interno ? 'interno' : 'portal', esCliente ? 'entrante' : (req.body.interno ? 'interno' : 'saliente'),
         esCliente ? 'cliente' : 'usuario', req.usuario.nombre, req.body.texto]);
      return m;
    });
  });

  // ---------- Documentos (cifrados en disco, URLs firmadas) ----------
  app.post('/api/expedientes/:id/documentos', async (req) => {
    const archivo = await req.file();
    if (!archivo) throw new ErrorHttp(400, 'No se recibió ningún archivo.');
    const buffer = await archivo.toBuffer();
    const requisitoId = archivo.fields?.requisito_id?.value || null;
    return enDespacho(req, async (c) => {
      await exigirAccesoExpediente(c, req, req.params.id);
      const { ruta, sha256 } = await guardarArchivo({ carpeta: config.carpetaArchivos, despachoId: req.despacho.id, buffer, llave: config.llaveArchivos });
      const { rows: [d] } = await c.query(
        `INSERT INTO documentos (despacho_id, expediente_id, requisito_id, nombre, tipo_mime, tamano_bytes, sha256, ruta_cifrada, subido_por)
         VALUES (despacho_actual(), $1, $2, $3, $4, $5, $6, $7, usuario_actual()) RETURNING id, nombre`,
        [req.params.id, requisitoId, archivo.filename, archivo.mimetype, buffer.length, sha256, ruta]);
      if (requisitoId && req.usuario.rol === 'cliente') {
        await c.query(`UPDATE expediente_requisitos SET estado = 'recibido' WHERE id = $1 AND expediente_id = $2 AND estado <> 'aprobado'`, [requisitoId, req.params.id]);
      }
      return d;
    });
  });

  app.get('/api/documentos/:id/url', async (req) => {
    return enDespacho(req, async (c) => {
      const { rows: [d] } = await c.query('SELECT id, expediente_id, ruta_cifrada FROM documentos WHERE id = $1 AND archivado_en IS NULL', [req.params.id]);
      if (!d) throw new ErrorHttp(404, 'Documento no encontrado.');
      if (d.expediente_id) await exigirAccesoExpediente(c, req, d.expediente_id);
      else soloConsultor(req);
      if (!d.ruta_cifrada) throw new ErrorHttp(409, 'Este documento todavía no se ha subido.');
      const ficha = firmar({ doc: d.id, despacho: req.despacho.id }, config.secreto, MINUTOS_URL_ARCHIVO * 60);
      return { url: `/archivos/${ficha}`, vence_en_minutos: MINUTOS_URL_ARCHIVO };
    });
  });

  app.get('/archivos/:ficha', { config: { publica: 'total' } }, async (req, reply) => {
    const datos = verificarFirma(req.params.ficha, config.secreto);
    if (!datos?.doc) throw new ErrorHttp(403, 'El enlace venció o no es válido. Pida uno nuevo.');
    const d = await conDespacho(pool, { despachoId: datos.despacho, actor: 'sistema' }, async (c) =>
      (await c.query('SELECT nombre, tipo_mime, ruta_cifrada FROM documentos WHERE id = $1', [datos.doc])).rows[0]);
    if (!d?.ruta_cifrada) throw new ErrorHttp(404, 'Documento no encontrado.');
    const contenido = await leerArchivo({ carpeta: config.carpetaArchivos, ruta: d.ruta_cifrada, llave: config.llaveArchivos });
    reply.header('Content-Type', d.tipo_mime ?? 'application/octet-stream');
    reply.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(d.nombre)}`);
    reply.header('Cache-Control', 'private, no-store');
    return reply.send(contenido);
  });

  // Pre-revisión con las reglas del catálogo (texto del documento). Guarda la
  // propuesta en el requisito; NO cambia su estado: un consultor confirma.
  app.post('/api/requisitos/:id/revisar', {
    schema: { body: { type: 'object', required: ['texto'], properties: {
      texto: { type: 'string' }, domicilio_en_documento: { type: 'string' }, solo_pesos: { type: 'boolean' },
    } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT r.id, p.domicilio_textual FROM expediente_requisitos r JOIN expedientes e ON e.id = r.expediente_id
         LEFT JOIN permisos p ON p.id = e.permiso_id WHERE r.id = $1`, [req.params.id]);
      if (!r) throw new ErrorHttp(404, 'Requisito no encontrado.');
      const resultados = revisarDocumento({
        texto: req.body.texto, domicilioPermiso: r.domicilio_textual ?? undefined,
        domicilioEnDocumento: req.body.domicilio_en_documento, soloPesos: req.body.solo_pesos,
      });
      await c.query(`UPDATE expediente_requisitos SET propuesta_ia = $2 WHERE id = $1`,
        [r.id, JSON.stringify({ tipo: 'revision_automatica', cuando: new Date().toISOString(), resultados })]);
      return { resultados, nota: 'Revisión automática. Un consultor confirma cada resultado.' };
    }, 'sistema');
  });

  // ---------- Cobro (solo registro; la factura vive fuera) ----------
  app.patch('/api/cobros/:id', {
    schema: { body: { type: 'object', properties: {
      orden_compra: { type: 'string' }, folio_factura: { type: 'string' },
      estatus: { type: 'string', enum: ['pendiente', 'oc_pendiente', 'facturado', 'pago_por_confirmar', 'pagado'] },
    } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const b = req.body;
      const { rows } = await c.query(
        `UPDATE hitos_cobro SET orden_compra = coalesce($2, orden_compra), folio_factura = coalesce($3, folio_factura),
           estatus = coalesce($4, estatus), actualizado_por = usuario_actual() WHERE id = $1 RETURNING *`,
        [req.params.id, b.orden_compra ?? null, b.folio_factura ?? null, b.estatus ?? null]);
      if (!rows.length) throw new ErrorHttp(404, 'Hito no encontrado.');
      return rows[0];
    });
  });

  // ---------- Archivar (nunca borrar) ----------
  const ARCHIVABLES = { expedientes: 'expedientes', documentos: 'documentos', mensajes: 'mensajes', requisitos: 'expediente_requisitos' };
  app.post('/api/:tipo/:id/archivar', async (req) => {
    soloConsultor(req);
    const tabla = ARCHIVABLES[req.params.tipo];
    if (!tabla) throw new ErrorHttp(404, 'No se puede archivar ese tipo de registro.');
    return enDespacho(req, async (c) => {
      const { rows } = await c.query(`UPDATE ${tabla} SET archivado_en = now() WHERE id = $1 AND archivado_en IS NULL RETURNING id, archivado_en`, [req.params.id]);
      if (!rows.length) throw new ErrorHttp(404, 'No encontrado o ya archivado.');
      return rows[0];
    });
  });

  // ---------- Marce ----------
  app.post('/api/marce', {
    schema: { body: { type: 'object', required: ['pregunta'], properties: { pregunta: { type: 'string', minLength: 2, maxLength: 4000 }, expediente_id: { type: 'string' } } } },
  }, async (req) => {
    soloConsultor(req);
    const expedientes = await enDespacho(req, async (c) => {
      const lista = (await listarExpedientes(c)).filter(e => e.estado !== 'concluido' && (!req.body.expediente_id || e.id === req.body.expediente_id));
      const pend = await pendientesDe(c, lista.map(e => e.id));
      return lista.map(e => ({ ...e, pendientes: pend[e.id] ?? [] }));
    });
    const r = await marce.preguntar({ pregunta: req.body.pregunta, expedientes, quienPregunta: req.usuario.nombre });
    // Guardar la conversación y las propuestas (quedan esperando aprobación)
    await enDespacho(req, async (c) => {
      for (const [autor, texto, tipo] of [[req.usuario.nombre, req.body.pregunta, 'usuario'], ['Marce', r.respuesta, 'ia']]) {
        await c.query(`INSERT INTO mensajes (despacho_id, expediente_id, canal, direccion, autor_tipo, autor_id, autor_nombre, texto)
                       VALUES (despacho_actual(), $1, 'interno', 'interno', $2, $3, $4, $5)`,
          [req.body.expediente_id ?? null, tipo, tipo === 'usuario' ? req.usuario.id : null, autor, texto]);
      }
    });
    const propuestas = await enDespacho(req, async (c) => {
      const ids = [];
      for (const p of r.propuestas) {
        const { rows: [a] } = await c.query(
          `INSERT INTO acciones (despacho_id, expediente_id, tipo, canal, destinatario, asunto, borrador, propuesta_por)
           VALUES (despacho_actual(), $1, $2, $3, $4, $5, $6, 'ia') RETURNING id, tipo, canal, destinatario, borrador, estado`,
          [p.expediente_id, p.tipo, p.canal, p.destinatario, p.asunto || null, p.borrador]);
        ids.push(a);
      }
      return ids;
    }, 'ia');
    return { respuesta: r.respuesta, propuestas, marceActiva: marce.activo };
  });

  // ---------- Portal del cliente ----------
  app.get('/api/portal', async (req) => {
    if (req.usuario.rol !== 'cliente') throw new ErrorHttp(403, 'El portal es para clientes.');
    return enDespacho(req, (c) => portalCliente(c, { clienteId: req.usuario.clienteId }));
  });

  // ---------- Marca del despacho: subir logo y extraer colores ----------
  app.post('/api/despacho/logo', async (req) => {
    soloDirector(req);
    const archivo = await req.file();
    if (!archivo) throw new ErrorHttp(400, 'No se recibió el logo.');
    const buffer = await archivo.toBuffer();
    const { default: sharp } = await import('sharp');
    const { data } = await sharp(buffer).resize(200, 200, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const colores = extraerColores(data);
    if (!colores) throw new ErrorHttp(400, 'No se pudieron leer colores del logo.');
    const tema = construirTema({ ...colores, tipografia: req.despacho.tema.tipografia ?? 'Poppins' });
    const { ruta } = await guardarArchivo({ carpeta: config.carpetaArchivos, despachoId: req.despacho.id, buffer, llave: config.llaveArchivos });
    await enDespacho(req, (c) => c.query(
      `UPDATE despachos SET tema = tema || $1::jsonb WHERE id = despacho_actual()`,
      [JSON.stringify({ fondo: tema.fondo, acento: tema.acento, accion: tema.accion, logo_ruta: ruta })]));
    return { tema, nota: 'Colores aplicados. Revise la verificación de contraste.' };
  });

  // ---------- Recalcular plazos a petición ----------
  app.post('/api/plazos/recalcular', async (req) => {
    soloConsultor(req);
    return { cambios: await enDespacho(req, (c) => recalcularPlazos(c), 'sistema') };
  });

  return app;
}
