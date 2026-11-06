-- Resoluciones de la autoridad (oficios/acuerdos) con su fecha.
-- De aquí salen los plazos periódicos: contingencias cada 2 años, pólizas cada año, etc.
CREATE TABLE resoluciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id    uuid NOT NULL REFERENCES despachos(id),
  permiso_id     uuid NOT NULL REFERENCES permisos(id),
  tramite_clave  text NOT NULL REFERENCES tramites(clave),
  oficio         text NOT NULL,                -- "Acuerdo ATTRAPI/UVSR/DSF/069/2026"
  fecha          date NOT NULL,                -- fecha de la resolución (o de emisión, para pólizas)
  documento_id   uuid REFERENCES documentos(id),
  expediente_id  uuid REFERENCES expedientes(id),
  registrado_por uuid NOT NULL REFERENCES usuarios(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  archivado_en   timestamptz
);
CREATE TRIGGER resoluciones_sin_borrar BEFORE DELETE ON resoluciones FOR EACH ROW EXECUTE FUNCTION prohibir_borrado();
CREATE TRIGGER resoluciones_sin_truncar BEFORE TRUNCATE ON resoluciones FOR EACH STATEMENT EXECUTE FUNCTION prohibir_borrado();
CREATE TRIGGER resoluciones_bitacora AFTER INSERT OR UPDATE ON resoluciones FOR EACH ROW EXECUTE FUNCTION registrar_en_bitacora();
ALTER TABLE resoluciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE resoluciones FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_despacho ON resoluciones USING (despacho_id = despacho_actual()) WITH CHECK (despacho_id = despacho_actual());
GRANT SELECT, INSERT, UPDATE ON resoluciones TO logistics_app;
CREATE INDEX ON resoluciones (permiso_id, tramite_clave, fecha);
