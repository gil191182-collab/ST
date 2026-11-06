SELECT set_config('app.despacho_id', '00000000-0000-4000-8000-000000000001', true);
SELECT set_config('app.actor', 'usuario', true);
SELECT set_config('app.usuario_id', '00000000-0000-4000-8000-0000000000a2', true);
-- KERI: Programa de Contingencias aprobado (Acuerdo 069/2026 del 12 jun 2026)
INSERT INTO resoluciones (despacho_id, permiso_id, tramite_clave, oficio, fecha, documento_id, registrado_por) VALUES
('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f1', 'programa_contingencias',
 'Acuerdo ATTRAPI/UVSR/DSF/069/2026', DATE '2026-06-12', '00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000000a2');
