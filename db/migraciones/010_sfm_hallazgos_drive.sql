-- Hallazgos en la carpeta de Drive de Mayela "SERVICIOS FERROVIAL MONTERREY" (9 nov 2026):
-- 1) Formato oficial "Presentación del Programa de Contingencias y Siniestros",
--    homoclave ATTRAPI-03-003 (DOF 22 oct 2026). Anexos que pide el formato: el programa
--    (PDF e impreso) y el registro de Protección Civil; INE y copia certificada del
--    instrumento notarial SOLO si la personalidad no está acreditada ante la ATTRAPI.
-- 2) Acuse ARTF 0869 del 14 mar 2024: SFM presentó su programa con el visto bueno de
--    Protección Civil NL vigente del 21 feb 2024 al 21 feb 2026.
-- 3) Aviso a ASEA de entrega del Dictamen de Pre-Arranque (11 may 2022) para instalaciones
--    y operaciones de trasvase por medios distintos a ductos (dictamen DT-0002-2022).
-- Solo cambia notas y estatus que nadie ha movido; nada queda aprobado.

-- ---------- 1. Catálogo: homoclave actual confirmada ----------
UPDATE tramite_versiones v SET homoclave_actual = 'ATTRAPI-03-003',
  fuente = 'Formato oficial ATTRAPI-03-003 (DOF 22 oct 2026) y checklist SFM (Strateggia, 4 nov 2026), basado en el expediente autorizado de KERI'
FROM tramites t
WHERE t.id = v.tramite_id AND t.clave = 'programa_contingencias' AND v.vigente_desde = DATE '2026-11-08'
  AND v.homoclave_actual IS NULL;

UPDATE requisitos_catalogo r SET ayuda = 'Formato oficial ATTRAPI-03-003 (DOF 22 oct 2026). Marcar "Presentación" o "Actualización de Programa".'
FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id AND t.clave = 'programa_contingencias'
WHERE r.tramite_version_id = v.id AND v.vigente_desde = DATE '2026-11-08' AND r.clave = 'formato_tramite';

UPDATE requisitos_catalogo r SET ayuda = 'El formato ATTRAPI-03-003 solo pide INE y copia certificada del instrumento notarial si la personalidad NO está acreditada ante la ATTRAPI. Si ya hay oficio o acuerdo que la reconoce, se cita en el formato.'
FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id AND t.clave = 'programa_contingencias'
WHERE r.tramite_version_id = v.id AND v.vigente_desde = DATE '2026-11-08' AND r.clave IN ('poder', 'acta_objeto');

-- ---------- 2. SFM · Programa de Contingencias ----------
UPDATE expediente_requisitos SET estado = 'recibido', actualizado_en = now(),
  nota = 'Recibidos: acuse 2022 (ARTF 0494, 17 mar 2022) con el Acuerdo ARTF 528/2022, y acuse 2024 (ARTF 0869, 14 mar 2024) con el visto bueno de PC NL vigente del 21 feb 2024 al 21 feb 2026. El programa 2026 ya debía presentarse.'
WHERE expediente_id = '00000000-0000-4000-8000-000000000203'
  AND nombre = 'Acuse y observaciones del Programa de Contingencias anterior' AND estado = 'parcial';

UPDATE expediente_requisitos SET actualizado_en = now(),
  nota = 'Usar el formato oficial ATTRAPI-03-003 (DOF 22 oct 2026), opción "Actualización de Programa". Está en el Drive de Mayela: NUEVOS ANEXOS.'
WHERE expediente_id = '00000000-0000-4000-8000-000000000203'
  AND nombre = 'Formato del trámite "Presentación del Programa de Contingencias y Siniestros"' AND estado = 'por_elaborar';

UPDATE expediente_requisitos SET actualizado_en = now(),
  nota = nota || ' OJO: el formato ATTRAPI-03-003 pide copia certificada solo si la personalidad no está acreditada; la del Lic. Samuel Garza ya la reconoce el Acuerdo ARTF 444/2022. Confirmarlo en la reunión con la ATTRAPI.'
WHERE expediente_id = '00000000-0000-4000-8000-000000000203'
  AND nombre = 'Copias certificadas de acta y poder' AND nota NOT LIKE '%ATTRAPI-03-003%';

UPDATE expedientes SET siguiente_paso = siguiente_paso || ' Confirmar con la ATTRAPI si bastan las copias simples (personalidad ya acreditada, Acuerdo ARTF 444/2022).'
WHERE id = '00000000-0000-4000-8000-000000000203' AND siguiente_paso NOT LIKE '%444/2022%';

-- ---------- 3. SFM · Consulta SENER ----------
UPDATE expediente_requisitos SET estado = 'parcial', actualizado_en = now(),
  nota = 'Hay aviso a ASEA (11 may 2022) de entrega del Dictamen de Pre-Arranque DT-0002-2022 (Servicios Marítimos y Terrestres, tercero autorizado) para instalaciones y operaciones de TRASVASE por medios distintos a ductos: sirve como antecedente en el escrito a SENER. El resolutivo ASEA-UGI-DGGPI-1393-2020 autoriza una terminal de almacenamiento con 10 tanques. Faltan evidencias de SASISOPA y seguro ambiental; validar con el gestor ASEA.'
WHERE expediente_id = '00000000-0000-4000-8000-000000000206' AND nombre LIKE 'Situación ante ASEA%' AND estado = 'pendiente';

UPDATE expediente_requisitos SET actualizado_en = now(),
  nota = nota || ' Actualización 9 nov: sí hay plan 2024 (acuse ARTF 0869, 14 mar 2024), con vigencia de PC NL al 21 feb 2026.'
WHERE expediente_id = '00000000-0000-4000-8000-000000000206'
  AND nombre LIKE 'Diagnóstico de cumplimiento%' AND nota NOT LIKE '%ARTF 0869%';
