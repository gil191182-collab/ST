-- Marce con herramientas: su propia conversación (canal 'marce', aparte del chat del equipo)
-- y solicitudes de cambio al sistema que una persona lleva a desarrollo.
ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_canal_check;
ALTER TABLE mensajes ADD CONSTRAINT mensajes_canal_check
  CHECK (canal IN ('portal','whatsapp','correo','interno','marce'));

CREATE TABLE IF NOT EXISTS solicitudes_cambio (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id  uuid NOT NULL REFERENCES despachos(id),
  titulo       text NOT NULL,
  descripcion  text NOT NULL,                -- qué cambiar, redactado por Marce para desarrollo
  motivo       text,                         -- por qué lo pidió el consultor
  pedida_por   text NOT NULL,                -- persona que conversaba con Marce
  estado       text NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva','en_desarrollo','hecha','descartada')),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  archivado_en timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'solicitudes_cambio_sin_borrar') THEN
    CREATE TRIGGER solicitudes_cambio_sin_borrar BEFORE DELETE ON solicitudes_cambio FOR EACH ROW EXECUTE FUNCTION prohibir_borrado();
    CREATE TRIGGER solicitudes_cambio_sin_truncar BEFORE TRUNCATE ON solicitudes_cambio FOR EACH STATEMENT EXECUTE FUNCTION prohibir_borrado();
    CREATE TRIGGER solicitudes_cambio_bitacora AFTER INSERT OR UPDATE ON solicitudes_cambio FOR EACH ROW EXECUTE FUNCTION registrar_en_bitacora();
    ALTER TABLE solicitudes_cambio ENABLE ROW LEVEL SECURITY;
    ALTER TABLE solicitudes_cambio FORCE ROW LEVEL SECURITY;
    CREATE POLICY aislamiento_despacho ON solicitudes_cambio USING (despacho_id = despacho_actual()) WITH CHECK (despacho_id = despacho_actual());
    GRANT SELECT, INSERT, UPDATE ON solicitudes_cambio TO logistics_app;
  END IF;
END $$;

-- Las preguntas a Marce que antes se guardaban en el chat del equipo pasan a su canal.
-- (La pregunta y la respuesta se guardaban en la misma transacción: misma hora exacta.)
UPDATE mensajes u SET canal = 'marce'
WHERE u.canal = 'interno' AND u.expediente_id IS NULL
  AND (u.autor_tipo = 'ia' OR EXISTS (
    SELECT 1 FROM mensajes m WHERE m.autor_tipo = 'ia' AND m.canal IN ('interno','marce')
      AND m.expediente_id IS NULL AND m.creado_en = u.creado_en AND m.despacho_id = u.despacho_id));
