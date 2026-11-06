// Chat de consultores y publicaciones a producción.
// Producción solo con el clic de aprobación del director (Gil) en el chat (CLAUDE.md §6).
// El script de publicación consulta la base y se niega si no hay aprobación.

export function rutasPublicaciones(app, { ErrorHttp, enDespacho, soloConsultor, soloDirector }) {
  // ---------- Chat de consultores ----------
  app.get('/api/chat', async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows: mensajes } = await c.query(
        `SELECT id, autor_tipo, autor_nombre, texto, creado_en FROM mensajes
         WHERE canal = 'interno' AND expediente_id IS NULL AND archivado_en IS NULL ORDER BY creado_en DESC LIMIT 100`);
      const { rows: publicaciones } = await c.query(
        `SELECT p.id, p.version, p.entorno, p.cambios, p.estado, p.solicitada_por, p.creado_en, p.aprobada_en, p.publicada_en, p.nota,
                u.nombre AS aprobada_por_nombre
         FROM publicaciones p LEFT JOIN usuarios u ON u.id = p.aprobada_por
         WHERE p.archivado_en IS NULL ORDER BY p.creado_en DESC LIMIT 20`);
      return { mensajes: mensajes.reverse(), publicaciones };
    });
  });

  app.post('/api/chat', {
    schema: { body: { type: 'object', required: ['texto'], properties: { texto: { type: 'string', minLength: 1, maxLength: 5000 } } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => (await c.query(
      `INSERT INTO mensajes (despacho_id, canal, direccion, autor_tipo, autor_id, autor_nombre, texto)
       VALUES (despacho_actual(), 'interno', 'interno', 'usuario', usuario_actual(), $1, $2) RETURNING id, creado_en`,
      [req.usuario.nombre, req.body.texto])).rows[0]);
  });

  // ---------- Publicaciones ----------
  // Se solicita después de probar en staging; queda esperando el clic del director.
  app.post('/api/publicaciones', {
    schema: { body: { type: 'object', required: ['version', 'cambios'], additionalProperties: false, properties: {
      version: { type: 'string', pattern: '^[A-Za-z0-9._/-]{4,80}$' }, cambios: { type: 'string', minLength: 10 },
      entorno: { type: 'string', enum: ['staging', 'produccion'] } } } },
  }, async (req) => {
    soloConsultor(req);
    return enDespacho(req, async (c) => {
      const { rows: [p] } = await c.query(
        `INSERT INTO publicaciones (despacho_id, version, entorno, cambios, solicitada_por)
         VALUES (despacho_actual(), $1, $2, $3, $4) RETURNING id, estado`,
        [req.body.version, req.body.entorno ?? 'produccion', req.body.cambios, req.usuario.nombre]);
      await c.query(
        `INSERT INTO mensajes (despacho_id, canal, direccion, autor_tipo, autor_nombre, texto)
         VALUES (despacho_actual(), 'interno', 'interno', 'sistema', 'Sistema', $1)`,
        [`${req.usuario.nombre} pide publicar la versión ${req.body.version} en ${req.body.entorno ?? 'produccion'}. Cambios: ${req.body.cambios}`]);
      return p;
    });
  });

  for (const [ruta, estado, verbo] of [['aprobar', 'aprobada', 'aprobó'], ['rechazar', 'rechazada', 'rechazó']]) {
    app.post(`/api/publicaciones/:id/${ruta}`, {
      schema: { body: { type: ['object', 'null'], properties: { nota: { type: 'string' } } } },
    }, async (req) => {
      soloDirector(req);
      return enDespacho(req, async (c) => {
        const { rows: [p] } = await c.query(
          `UPDATE publicaciones SET estado = $2, nota = $3,
             aprobada_por = CASE WHEN $2 = 'aprobada' THEN usuario_actual() END,
             aprobada_en  = CASE WHEN $2 = 'aprobada' THEN now() END
           WHERE id = $1 AND estado = 'solicitada' RETURNING id, version, estado`, [req.params.id, estado, req.body?.nota ?? null]);
        if (!p) throw new ErrorHttp(409, 'La publicación no existe o ya no está esperando aprobación.');
        await c.query(
          `INSERT INTO mensajes (despacho_id, canal, direccion, autor_tipo, autor_nombre, texto)
           VALUES (despacho_actual(), 'interno', 'interno', 'sistema', 'Sistema', $1)`,
          [`${req.usuario.nombre} ${verbo} publicar la versión ${p.version}.${req.body?.nota ? ` Nota: ${req.body.nota}` : ''}`]);
        return p;
      });
    });
  }
}
