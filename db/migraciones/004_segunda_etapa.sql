-- Segunda etapa: invitaciones, texto de documentos, escritos, entradas y publicaciones.

-- ---------- Invitaciones / restablecer contraseña ----------
-- La ficha viaja en el enlace; aquí solo se guarda su huella (sha256).
CREATE TABLE invitaciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id  uuid NOT NULL REFERENCES despachos(id),
  usuario_id   uuid NOT NULL REFERENCES usuarios(id),
  huella       text NOT NULL UNIQUE,
  motivo       text NOT NULL CHECK (motivo IN ('invitacion','restablecer')),
  vence_en     timestamptz NOT NULL,
  usada_en     timestamptz,
  creada_por   uuid REFERENCES usuarios(id),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  archivado_en timestamptz
);

-- ---------- Documentos: texto extraído y origen ----------
ALTER TABLE documentos ADD COLUMN texto_extraido text;
ALTER TABLE documentos ADD COLUMN revision jsonb;      -- resultados de reglas y observaciones de Marce (propuestas)
ALTER TABLE documentos ADD COLUMN tipo_escrito text;   -- si fue generado por el sistema
ALTER TABLE documentos ADD COLUMN origen text NOT NULL DEFAULT 'subido'
  CHECK (origen IN ('subido','generado','whatsapp','correo'));

-- Teléfonos normalizados (solo dígitos) para reconocer mensajes entrantes
ALTER TABLE contactos ADD COLUMN telefono_digitos text GENERATED ALWAYS AS (nullif(regexp_replace(coalesce(telefono,''), '\D', '', 'g'), '')) STORED;
CREATE INDEX ON contactos (despacho_id, telefono_digitos);

-- Mensajes entrantes: de dónde vinieron (id externo para no duplicar)
ALTER TABLE mensajes ADD COLUMN id_externo text;
ALTER TABLE mensajes ADD COLUMN remitente text;
CREATE UNIQUE INDEX mensajes_id_externo ON mensajes (despacho_id, canal, id_externo) WHERE id_externo IS NOT NULL;

-- ---------- Publicaciones (staging → producción con aprobación de Gil) ----------
CREATE TABLE publicaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id   uuid NOT NULL REFERENCES despachos(id),
  version       text NOT NULL,                 -- commit o etiqueta de git
  entorno       text NOT NULL DEFAULT 'produccion' CHECK (entorno IN ('staging','produccion')),
  cambios       text NOT NULL,                 -- qué cambió, en español
  estado        text NOT NULL DEFAULT 'solicitada'
                CHECK (estado IN ('solicitada','aprobada','rechazada','publicada','regresada')),
  solicitada_por text NOT NULL,                -- persona o 'Marce'
  aprobada_por  uuid REFERENCES usuarios(id),
  aprobada_en   timestamptz,
  publicada_en  timestamptz,
  nota          text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  archivado_en  timestamptz,
  CONSTRAINT publicacion_aprobada_por_persona CHECK (
    estado IN ('solicitada','rechazada') OR (aprobada_por IS NOT NULL AND aprobada_en IS NOT NULL))
);

-- Solo el director aprueba publicaciones a producción, y solo como persona.
CREATE OR REPLACE FUNCTION validar_aprobacion_publicacion() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  IF NEW.aprobada_por IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.aprobada_por IS DISTINCT FROM NEW.aprobada_por) THEN
    IF actor_actual() <> 'usuario' OR NEW.aprobada_por IS DISTINCT FROM usuario_actual() THEN
      RAISE EXCEPTION 'SOLO_PERSONAS: una publicación solo la aprueba la persona que hace la petición.' USING ERRCODE = 'P0001';
    END IF;
    SELECT rol INTO r FROM usuarios WHERE id = NEW.aprobada_por AND despacho_id = NEW.despacho_id AND archivado_en IS NULL;
    IF r IS DISTINCT FROM 'director' THEN
      RAISE EXCEPTION 'SOLO_DIRECTOR: solo el director aprueba publicar a producción.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER publicaciones_aprobacion BEFORE INSERT OR UPDATE ON publicaciones
  FOR EACH ROW EXECUTE FUNCTION validar_aprobacion_publicacion();

-- Consulta acotada para el script de publicación (sin sesión de usuario):
-- ¿esta versión tiene aprobación vigente para producción?
CREATE OR REPLACE FUNCTION publicacion_aprobada(p_version text)
RETURNS TABLE (id uuid, aprobada_por text, aprobada_en timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, u.nombre, p.aprobada_en FROM publicaciones p JOIN usuarios u ON u.id = p.aprobada_por
  WHERE p.version = p_version AND p.entorno = 'produccion' AND p.estado = 'aprobada' AND p.archivado_en IS NULL
  ORDER BY p.aprobada_en DESC LIMIT 1
$$;

-- Buscar despacho de un mensaje entrante por el número de WhatsApp receptor
CREATE OR REPLACE FUNCTION despacho_por_whatsapp(p_numero text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM despachos
  WHERE regexp_replace(coalesce(whatsapp_numero,''), '\D', '', 'g') = regexp_replace(p_numero, '\D', '', 'g')
    AND archivado_en IS NULL LIMIT 1
$$;

-- ---------- Reglas generales para las tablas nuevas ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invitaciones','publicaciones'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prohibir_borrado()', t || '_sin_borrar', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION prohibir_borrado()', t || '_sin_truncar', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION registrar_en_bitacora()', t || '_bitacora', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY aislamiento_despacho ON %I USING (despacho_id = despacho_actual()) WITH CHECK (despacho_id = despacho_actual())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO logistics_app', t);
  END LOOP;
END $$;
-- La huella de la invitación no se registra en la bitácora en claro
CREATE OR REPLACE FUNCTION registrar_en_bitacora() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cambios jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(n.key, n.value) INTO cambios
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
    WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('actualizado_en','clave_hash','huella','texto_extraido');
    IF cambios IS NULL THEN RETURN NEW; END IF;
  ELSE
    cambios := to_jsonb(NEW) - 'clave_hash' - 'huella' - 'texto_extraido';
  END IF;
  INSERT INTO bitacora (despacho_id, actor, usuario_id, accion, tabla, registro_id, detalle)
  VALUES (NEW.despacho_id, actor_actual(), usuario_actual(), TG_OP, TG_TABLE_NAME, NEW.id, cambios);
  RETURN NEW;
END $$;

GRANT EXECUTE ON FUNCTION publicacion_aprobada(text), despacho_por_whatsapp(text) TO logistics_app;
