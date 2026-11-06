// Altas y cambios: clientes, contactos, terminales, permisos, prórrogas,
// resoluciones, expedientes y cobros. La base valida las reglas del dominio.
import { domicilioTieneKmYLinea, citasAgenciaAnterior } from '@logistics/dominio';
import { guardarArchivo } from '../seguridad.js';
import { extraerTexto } from '../texto.js';

const texto = (min = 1) => ({ type: 'string', minLength: min });
const fecha = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const opcional = (t) => ({ anyOf: [t, { type: 'null' }] });

export function rutasGestion(app, { config, ErrorHttp, enDespacho, soloConsultor, recalcularPlazos }) {
  const uno = async (c, sql, params, mensaje = 'No encontrado.') => {
    const { rows } = await c.query(sql, params);
    if (!rows.length) throw new ErrorHttp(404, mensaje);
    return rows[0];
  };

  // ---------- Catálogo ----------
  app.get('/api/catalogo/tramites', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => (await c.query(
      `SELECT t.clave, t.nombre, t.etapa, t.requiere_clave, t.periodicidad_meses, v.homoclave_actual, v.homoclaves_anteriores, v.por_confirmar,
              (SELECT count(*) FROM requisitos_catalogo r WHERE r.tramite_version_id = v.id)::int AS requisitos
       FROM tramites t JOIN LATERAL (
         SELECT * FROM tramite_versiones v WHERE v.tramite_id = t.id AND v.vigente_desde <= current_date
           AND (v.vigente_hasta IS NULL OR v.vigente_hasta > current_date) ORDER BY v.vigente_desde DESC LIMIT 1) v ON true
       ORDER BY t.etapa, t.nombre`)).rows);
  });

  // ---------- Clientes y todo lo que cuelga de ellos ----------
  app.get('/api/clientes', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const q = (sql) => c.query(sql).then(r => r.rows);
      const [clientes, contactos, terminales, permisos, prorrogas, resoluciones, antecedentes] = await Promise.all([
        q(`SELECT id, razon_social, nombre_corto, rfc FROM clientes WHERE archivado_en IS NULL ORDER BY nombre_corto`),
        q(`SELECT id, cliente_id, nombre, cargo, correo, telefono FROM contactos WHERE archivado_en IS NULL ORDER BY nombre`),
        q(`SELECT id, cliente_id, nombre, municipio, estado FROM terminales WHERE archivado_en IS NULL ORDER BY nombre`),
        q(`SELECT id, terminal_id, numero, tipo, servicio, domicilio_textual, fecha_otorgamiento, vigencia_hasta FROM permisos WHERE archivado_en IS NULL ORDER BY numero`),
        q(`SELECT id, permiso_id, nueva_fecha, oficio, admite_otra_prorroga FROM prorrogas WHERE archivado_en IS NULL ORDER BY nueva_fecha`),
        q(`SELECT id, permiso_id, tramite_clave, oficio, fecha FROM resoluciones WHERE archivado_en IS NULL ORDER BY fecha`),
        q(`SELECT a.id, a.terminal_id, a.tramite_clave, a.descripcion, d.nombre AS documento FROM antecedentes_externos a
           JOIN documentos d ON d.id = a.documento_id WHERE a.archivado_en IS NULL`),
      ]);
      const por = (lista, campo) => lista.reduce((m, x) => ((m[x[campo]] ??= []).push(x), m), {});
      const contactosPor = por(contactos, 'cliente_id'), terminalesPor = por(terminales, 'cliente_id');
      const permisosPor = por(permisos, 'terminal_id'), prorrogasPor = por(prorrogas, 'permiso_id');
      const resolPor = por(resoluciones, 'permiso_id'), antPor = por(antecedentes, 'terminal_id');
      return clientes.map(cl => ({
        ...cl,
        contactos: contactosPor[cl.id] ?? [],
        terminales: (terminalesPor[cl.id] ?? []).map(t => ({
          ...t,
          antecedentes: antPor[t.id] ?? [],
          permisos: (permisosPor[t.id] ?? []).map(p => ({
            ...p, prorrogas: prorrogasPor[p.id] ?? [], resoluciones: resolPor[p.id] ?? [],
            avisos: avisosDomicilio(p.domicilio_textual),
          })),
        })),
      }));
    });
  });

  app.post('/api/clientes', {
    schema: { body: { type: 'object', required: ['razon_social', 'nombre_corto'], additionalProperties: false,
      properties: { razon_social: texto(3), nombre_corto: texto(2), rfc: opcional({ type: 'string', pattern: '^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$' }) } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, (c) => uno(c,
      `INSERT INTO clientes (despacho_id, razon_social, nombre_corto, rfc) VALUES (despacho_actual(), $1, $2, $3) RETURNING id`,
      [req.body.razon_social.trim(), req.body.nombre_corto.trim(), req.body.rfc ?? null]));
  });

  app.patch('/api/clientes/:id', {
    schema: { body: { type: 'object', additionalProperties: false, properties: { razon_social: texto(3), nombre_corto: texto(2), rfc: opcional({ type: 'string' }) } } },
  }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    return enDespacho(req, (c) => uno(c,
      `UPDATE clientes SET razon_social = coalesce($2, razon_social), nombre_corto = coalesce($3, nombre_corto),
         rfc = CASE WHEN $5 THEN $4 ELSE rfc END WHERE id = $1 RETURNING id`,
      [req.params.id, b.razon_social ?? null, b.nombre_corto ?? null, b.rfc ?? null, 'rfc' in b], 'Cliente no encontrado.'));
  });

  const esquemaContacto = { type: 'object', additionalProperties: false, properties: {
    nombre: texto(2), cargo: opcional({ type: 'string' }), correo: opcional({ type: 'string', format: 'email' }), telefono: opcional({ type: 'string' }) } };

  app.post('/api/clientes/:id/contactos', { schema: { body: { ...esquemaContacto, required: ['nombre'] } } }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    return enDespacho(req, (c) => uno(c,
      `INSERT INTO contactos (despacho_id, cliente_id, nombre, cargo, correo, telefono) VALUES (despacho_actual(), $1, $2, $3, $4, $5) RETURNING id`,
      [req.params.id, b.nombre, b.cargo ?? null, b.correo ?? null, b.telefono ?? null]));
  });

  app.patch('/api/contactos/:id', { schema: { body: esquemaContacto } }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    return enDespacho(req, (c) => uno(c,
      `UPDATE contactos SET nombre = coalesce($2, nombre), cargo = coalesce($3, cargo), correo = coalesce($4, correo), telefono = coalesce($5, telefono)
       WHERE id = $1 RETURNING id`, [req.params.id, b.nombre ?? null, b.cargo ?? null, b.correo ?? null, b.telefono ?? null], 'Contacto no encontrado.'));
  });

  app.post('/api/clientes/:id/terminales', {
    schema: { body: { type: 'object', required: ['nombre'], additionalProperties: false, properties: { nombre: texto(2), municipio: { type: 'string' }, estado: { type: 'string' } } } },
  }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    return enDespacho(req, (c) => uno(c,
      `INSERT INTO terminales (despacho_id, cliente_id, nombre, municipio, estado) VALUES (despacho_actual(), $1, $2, $3, $4) RETURNING id`,
      [req.params.id, b.nombre, b.municipio ?? null, b.estado ?? null]));
  });

  // ---------- Permisos ----------
  const esquemaPermiso = { type: 'object', additionalProperties: false, properties: {
    numero: texto(5), tipo: { type: 'string', enum: ['04-010-A', '04-010-B'] }, servicio: texto(3),
    domicilio_textual: texto(5), fecha_otorgamiento: opcional(fecha), vigencia_hasta: opcional(fecha) } };

  function validarDomicilio(dom) {
    if (dom && citasAgenciaAnterior(dom).some(x => x.resultado === 'FALLA')) {
      throw new ErrorHttp(400, 'El domicilio no puede mencionar a la antigua Agencia Reguladora.');
    }
  }

  app.post('/api/terminales/:id/permisos', {
    schema: { body: { ...esquemaPermiso, required: ['numero', 'tipo', 'servicio', 'domicilio_textual'] } },
  }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    validarDomicilio(b.domicilio_textual);
    // El domicilio se guarda TAL CUAL (sin recortar ni cambiar mayúsculas): debe ser idéntico al permiso.
    return enDespacho(req, async (c) => {
      const p = await uno(c,
        `INSERT INTO permisos (despacho_id, terminal_id, numero, tipo, servicio, domicilio_textual, fecha_otorgamiento, vigencia_hasta)
         VALUES (despacho_actual(), $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [req.params.id, b.numero.trim(), b.tipo, b.servicio, b.domicilio_textual, b.fecha_otorgamiento ?? null, b.vigencia_hasta ?? null]);
      await recalcularPlazos(c);
      return { ...p, avisos: avisosDomicilio(b.domicilio_textual) };
    });
  });

  app.patch('/api/permisos/:id', { schema: { body: esquemaPermiso } }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    validarDomicilio(b.domicilio_textual);
    return enDespacho(req, async (c) => {
      const p = await uno(c,
        `UPDATE permisos SET numero = coalesce($2, numero), tipo = coalesce($3, tipo), servicio = coalesce($4, servicio),
           domicilio_textual = coalesce($5, domicilio_textual), fecha_otorgamiento = coalesce($6, fecha_otorgamiento),
           vigencia_hasta = coalesce($7, vigencia_hasta) WHERE id = $1 RETURNING id, domicilio_textual`,
        [req.params.id, b.numero ?? null, b.tipo ?? null, b.servicio ?? null, b.domicilio_textual ?? null, b.fecha_otorgamiento ?? null, b.vigencia_hasta ?? null],
        'Permiso no encontrado.');
      await recalcularPlazos(c);
      return { id: p.id, avisos: avisosDomicilio(p.domicilio_textual) };
    });
  });

  app.post('/api/permisos/:id/prorrogas', {
    schema: { body: { type: 'object', required: ['nueva_fecha'], additionalProperties: false, properties: {
      nueva_fecha: fecha, oficio: { type: 'string' }, admite_otra_prorroga: { type: 'boolean' }, concepto: { type: 'string', enum: ['inicio_operaciones'] } } } },
  }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    return enDespacho(req, async (c) => {
      const r = await uno(c,
        `INSERT INTO prorrogas (despacho_id, permiso_id, concepto, nueva_fecha, oficio, admite_otra_prorroga, registrado_por)
         VALUES (despacho_actual(), $1, 'inicio_operaciones', $2, $3, $4, usuario_actual()) RETURNING id`,
        [req.params.id, b.nueva_fecha, b.oficio ?? null, b.admite_otra_prorroga ?? false]);
      return { ...r, plazos: await recalcularPlazos(c) };
    });
  });

  app.post('/api/permisos/:id/resoluciones', {
    schema: { body: { type: 'object', required: ['tramite_clave', 'oficio', 'fecha'], additionalProperties: false, properties: {
      tramite_clave: texto(), oficio: texto(5), fecha, documento_id: opcional({ type: 'string' }), expediente_id: opcional({ type: 'string' }) } } },
  }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    if (citasAgenciaAnterior(b.oficio).some(x => x.resultado === 'FALLA')) throw new ErrorHttp(400, 'Revise el número de oficio.');
    return enDespacho(req, async (c) => {
      const r = await uno(c,
        `INSERT INTO resoluciones (despacho_id, permiso_id, tramite_clave, oficio, fecha, documento_id, expediente_id, registrado_por)
         VALUES (despacho_actual(), $1, $2, $3, $4, $5, $6, usuario_actual()) RETURNING id`,
        [req.params.id, b.tramite_clave, b.oficio, b.fecha, b.documento_id ?? null, b.expediente_id ?? null]);
      return { ...r, plazos: await recalcularPlazos(c) };
    });
  });

  // ---------- Expedientes ----------
  app.patch('/api/expedientes/:id', {
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      estado: { type: 'string', enum: ['comercial', 'en_integracion', 'esperando_cliente', 'en_revision_autoridad', 'con_observaciones', 'concluido', 'suspendido'] },
      siguiente_paso: { type: 'string' }, piloto_automatico: { type: 'boolean' }, contacto_id: opcional({ type: 'string' }),
      consultor_id: { type: 'string' }, permiso_id: opcional({ type: 'string' }), alcance: { type: 'string' },
      resultado: { type: 'string' }, resultado_documento_id: { type: 'string' } } } },
  }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    return enDespacho(req, async (c) => {
      const actual = await uno(c, `SELECT * FROM expedientes WHERE id = $1`, [req.params.id], 'Expediente no encontrado.');
      if (b.estado === 'concluido' && !((b.resultado ?? actual.resultado) && (b.resultado_documento_id ?? actual.resultado_documento_id))) {
        throw new ErrorHttp(400, 'Para concluir un expediente registre el oficio o acuerdo que lo resolvió y su documento.');
      }
      const campos = Object.keys(b);
      if (!campos.length) return { id: actual.id };
      const sets = campos.map((k, i) => `${k} = $${i + 2}`).join(', ');
      return uno(c, `UPDATE expedientes SET ${sets} WHERE id = $1 RETURNING id, estado`, [req.params.id, ...campos.map(k => b[k])]);
    });
  });

  app.post('/api/expedientes/:id/cobros', {
    schema: { body: { type: 'object', required: ['descripcion'], additionalProperties: false, properties: {
      descripcion: texto(2), porcentaje: opcional({ type: 'number', minimum: 0, maximum: 100 }), orden_compra: { type: 'string' } } } },
  }, async (req) => {
    soloConsultor(req);
    const b = req.body;
    return enDespacho(req, (c) => uno(c,
      `INSERT INTO hitos_cobro (despacho_id, expediente_id, descripcion, porcentaje, orden_compra, actualizado_por)
       VALUES (despacho_actual(), $1, $2, $3, $4, usuario_actual()) RETURNING id`,
      [req.params.id, b.descripcion, b.porcentaje ?? null, b.orden_compra ?? null]));
  });

  // Documento sin expediente (p. ej. el permiso para marcar "ya existe fuera del sistema")
  app.post('/api/terminales/:id/documentos', async (req) => {
    soloConsultor(req);
    const archivo = await req.file();
    if (!archivo) throw new ErrorHttp(400, 'No se recibió ningún archivo.');
    const buffer = await archivo.toBuffer();
    return enDespacho(req, async (c) => {
      await uno(c, 'SELECT id FROM terminales WHERE id = $1', [req.params.id], 'Terminal no encontrada.');
      const { ruta, sha256 } = await guardarArchivo({ carpeta: config.carpetaArchivos, despachoId: req.despacho.id, buffer, llave: config.llaveArchivos });
      return uno(c,
        `INSERT INTO documentos (despacho_id, nombre, tipo_mime, tamano_bytes, sha256, ruta_cifrada, subido_por, texto_extraido)
         VALUES (despacho_actual(), $1, $2, $3, $4, $5, usuario_actual(), $6) RETURNING id, nombre`,
        [archivo.filename, archivo.mimetype, buffer.length, sha256, ruta, await extraerTexto(buffer, { nombre: archivo.filename, tipo: archivo.mimetype })]);
    });
  });
}

/** Avisos (no bloquean) sobre el domicilio capturado del permiso. */
export function avisosDomicilio(dom) {
  const avisos = [];
  if (!dom || /\[CAPTURAR/i.test(dom)) avisos.push('Falta capturar el domicilio textual del permiso.');
  else {
    const { km, linea } = domicilioTieneKmYLinea(dom);
    if (!km) avisos.push('El domicilio no menciona kilómetro de vía: confirme que así viene en el permiso.');
    if (!linea) avisos.push('El domicilio no menciona la línea ferroviaria: confirme que así viene en el permiso.');
  }
  return avisos;
}
