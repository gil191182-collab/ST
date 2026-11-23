-- Carpetas de Drive ya conocidas, ligadas a sus expedientes (solo si aún no tienen una).
-- El sistema las lee en cuanto se compartan con logistics-drive@strateggia-logistics.iam.gserviceaccount.com.
--   SFM · Programa de Contingencias → carpeta "SERVICIOS FERROVIAL MONTERREY" (Drive de Mayela)
--   KERI · Inicio de Operaciones     → carpeta "Energeticos Keri" (Drive de Strateggia)
UPDATE expedientes SET drive_carpeta_id = '1IqeILIi2eQj53mnGoeSmmGKWyy63QaAN'
WHERE id = '00000000-0000-4000-8000-000000000203' AND drive_carpeta_id IS NULL;
UPDATE expedientes SET drive_carpeta_id = '1hgC5AgCbtixIiRJquOTc9lm29natcB6j'
WHERE id = '00000000-0000-4000-8000-000000000201' AND drive_carpeta_id IS NULL;
