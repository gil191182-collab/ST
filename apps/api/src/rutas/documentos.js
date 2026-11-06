// Revisión de documentos (reglas fijas + Marce), referencias autorizadas y
// plantillas anónimas. Nada aquí aprueba requisitos: todo queda como propuesta.
import { revisarDocumento, anonimizar } from '@logistics/dominio';

export function rutasDocumentos(app, { ErrorHttp, enDespacho, soloConsultor, marce }) {
  async function documentoConContexto(c, id) {
    const { rows: [d] } = await c.query(
      `SELECT d.id, d.nombre, d.texto_extraido, d.requisito_id, d.expediente_id, d.revision, d.referencia_autorizada,
              r.nombre AS requisito, tr.nombre AS tramite, tr.clave AS tramite_clave,
              cl.razon_social, cl.nombre_corto, cl.rfc, cl.id AS cliente_id,
              p.numero AS permiso_numero, p.servicio, p.domicilio_textual
       FROM documentos d
       LEFT JOIN expediente_requisitos r ON r.id = d.requisito_id
       LEFT JOIN expedientes e ON e.id = d.expediente_id
       LEFT JOIN tramite_versiones v ON v.id = e.tramite_version_id LEFT JOIN tramites tr ON tr.id = v.tramite_id
       LEFT JOIN clientes cl ON cl.id = e.cliente_id
       LEFT JOIN permisos p ON p.id = e.permiso_id
       WHERE d.id = $1 AND d.archivado_en IS NULL`, [id]);
    if (!d) throw new ErrorHttp(404, 'Documento no encontrado.');
    return d;
  }

  async function guardarRevision(c, d, parte, valor) {
    const revision = { ...(d.revision ?? {}), [parte]: { ...valor, cuando: new Date().toISOString() } };
    await c.query(`UPDATE documentos SET revision = $2 WHERE id = $1`, [d.id, JSON.stringify(revision)]);
    if (d.requisito_id) {
      await c.query(`UPDATE expediente_requisitos SET propuesta_ia = $2 WHERE id = $1`,
        [d.requisito_id, JSON.stringify({ tipo: 'revision_documento', documento: d.nombre, ...revision })]);
    }
    return revision;
  }

  // Reglas fijas del catálogo sobre el texto extraído del documento
  app.post('/api/documentos/:id/revisar', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const d = await documentoConContexto(c, req.params.id);
      if (!d.texto_extraido) {
        return { resultados: [{ regla: 'texto', resultado: 'REVISAR', mensaje: 'No se pudo leer texto (¿es un escaneo?). Revíselo a mano.', requiereConfirmacion: true }] };
      }
      const resultados = revisarDocumento({
        texto: d.texto_extraido,
        domicilioPermiso: d.domicilio_textual ?? undefined,
        soloPesos: d.tramite_clave === 'registro_tarifas',
      });
      await guardarRevision(c, d, 'reglas', { resultados });
      return { resultados, nota: 'Revisión automática. Un consultor confirma cada resultado.' };
    }, 'sistema');
  });

  // Pre-revisión con Marce (IA)
  app.post('/api/documentos/:id/revisar-con-marce', async (req) => {
    soloConsultor(req);
    const d = await enDespacho(req, (c) => documentoConContexto(c, req.params.id));
    const r = await marce.revisarDocumento({
      texto: d.texto_extraido, requisito: d.requisito, tramite: d.tramite ?? '—', cliente: d.razon_social ?? '—',
      permiso: d.permiso_numero ? { numero: d.permiso_numero, servicio: d.servicio, domicilio_textual: d.domicilio_textual } : null,
    });
    await enDespacho(req, (c) => guardarRevision(c, d, 'marce', r), 'ia');
    return { ...r, nota: 'Observaciones propuestas por Marce. Un consultor decide.' };
  });

  // Marcar que la autoridad aprobó este documento (sirve como referencia)
  app.post('/api/documentos/:id/referencia-autorizada', {
    schema: { body: { type: 'object', required: ['valor'], properties: { valor: { type: 'boolean' } } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows } = await c.query(`UPDATE documentos SET referencia_autorizada = $2 WHERE id = $1 RETURNING id, referencia_autorizada`, [req.params.id, req.body.valor]);
      if (!rows.length) throw new ErrorHttp(404, 'Documento no encontrado.');
      return rows[0];
    });
  });

  // ---------- Plantillas anónimas ----------
  async function datosSensibles(c, d) {
    const datos = [
      { valor: d.razon_social, etiqueta: 'RAZÓN SOCIAL' }, { valor: d.nombre_corto, etiqueta: 'CLIENTE' },
      { valor: d.rfc, etiqueta: 'RFC' }, { valor: d.permiso_numero, etiqueta: 'NÚMERO DE PERMISO' },
      { valor: d.domicilio_textual?.replace(/\[CAPTURAR[^\]]*\]/gi, '').trim(), etiqueta: 'DOMICILIO DEL PERMISO' },
    ];
    if (d.cliente_id) {
      const { rows } = await c.query(`SELECT nombre, correo, telefono FROM contactos WHERE cliente_id = $1`, [d.cliente_id]);
      for (const ct of rows) datos.push({ valor: ct.nombre, etiqueta: 'NOMBRE' }, { valor: ct.correo, etiqueta: 'CORREO' }, { valor: ct.telefono, etiqueta: 'TELÉFONO' });
      const t = await c.query(`SELECT nombre, municipio FROM terminales WHERE cliente_id = $1`, [d.cliente_id]);
      for (const x of t.rows) datos.push({ valor: x.nombre, etiqueta: 'TERMINAL' });
    }
    return datos.filter(x => x.valor);
  }

  // Borrador anónimo (no se guarda): una persona lo revisa antes de guardarlo
  app.post('/api/plantillas/borrador', {
    schema: { body: { type: 'object', required: ['documento_id'], properties: { documento_id: { type: 'string' } } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const d = await documentoConContexto(c, req.body.documento_id);
      if (!d.referencia_autorizada) throw new ErrorHttp(400, 'Solo se usan como plantilla los documentos que la autoridad ya aprobó.');
      if (!d.texto_extraido) throw new ErrorHttp(400, 'El documento no tiene texto legible.');
      return { contenido_anonimo: anonimizar(d.texto_extraido, await datosSensibles(c, d)), tramite_clave: d.tramite_clave, nota: 'Revise que no quede ningún dato del cliente antes de guardar.' };
    });
  });

  app.post('/api/plantillas', {
    schema: { body: { type: 'object', required: ['documento_id', 'nombre', 'tramite_clave', 'contenido_anonimo'], additionalProperties: false, properties: {
      documento_id: { type: 'string' }, nombre: { type: 'string', minLength: 3 }, tramite_clave: { type: 'string' }, contenido_anonimo: { type: 'string', minLength: 20 } } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const d = await documentoConContexto(c, req.body.documento_id);
      if (!d.referencia_autorizada) throw new ErrorHttp(400, 'Solo se usan como plantilla los documentos que la autoridad ya aprobó.');
      // Segunda barrera: si aún aparece un dato del cliente, no se guarda
      const contenido = req.body.contenido_anonimo.toLowerCase();
      const fuga = (await datosSensibles(c, d)).find(x => x.valor.trim().length >= 4 && contenido.includes(x.valor.trim().toLowerCase()));
      if (fuga) throw new ErrorHttp(400, `La plantilla todavía contiene un dato del cliente (${fuga.etiqueta}). Quítelo antes de guardar.`);
      const { rows: [p] } = await c.query(
        `INSERT INTO plantillas_referencia (despacho_id, tramite_clave, nombre, contenido_anonimo, origen_documento_id, revisada_por)
         VALUES (despacho_actual(), $1, $2, $3, $4, usuario_actual()) RETURNING id`,
        [req.body.tramite_clave, req.body.nombre, req.body.contenido_anonimo, d.id]);
      return p;
    });
  });

  app.get('/api/plantillas', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => (await c.query(
      `SELECT p.id, p.nombre, p.tramite_clave, t.nombre AS tramite, p.contenido_anonimo, u.nombre AS revisada_por, p.creado_en
       FROM plantillas_referencia p JOIN tramites t ON t.clave = p.tramite_clave JOIN usuarios u ON u.id = p.revisada_por
       WHERE p.archivado_en IS NULL ORDER BY p.creado_en DESC`)).rows);
  });
}
