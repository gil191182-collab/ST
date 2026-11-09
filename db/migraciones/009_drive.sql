-- Conexión con Google Drive: cada expediente puede tener su carpeta. El sistema la
-- revisa, guarda cifrado lo nuevo y PROPONE a qué requisito corresponde. No aprueba nada.

ALTER TABLE expedientes ADD COLUMN IF NOT EXISTS drive_carpeta_id text;
ALTER TABLE expedientes ADD COLUMN IF NOT EXISTS drive_revisado_en timestamptz;

ALTER TABLE documentos ADD COLUMN IF NOT EXISTS drive_id text;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS drive_modificado timestamptz;

ALTER TABLE documentos DROP CONSTRAINT IF EXISTS documentos_origen_check;
ALTER TABLE documentos ADD CONSTRAINT documentos_origen_check
  CHECK (origen IN ('subido','generado','whatsapp','correo','drive'));

-- La misma versión de un archivo de Drive no se importa dos veces en el mismo expediente
CREATE UNIQUE INDEX IF NOT EXISTS documentos_drive_unico
  ON documentos (expediente_id, drive_id, drive_modificado) WHERE drive_id IS NOT NULL;
