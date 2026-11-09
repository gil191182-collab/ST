-- Programa de Contingencias, versión 2: el checklist de 20 puntos que Mayela armó para
-- Servicio Ferrovial Monterrey (4 nov 2026), con base en el expediente autorizado de KERI.
-- Trámite ARTF-03-003 "Presentación del Programa de Contingencias y Siniestros"
-- (art. 200 del Reglamento del Servicio Ferroviario; condición sexta del permiso).
-- La homoclave ATTRAPI actual queda por confirmar: no se inventa.
--
-- El expediente SFM sigue en la versión 1 (no se cambia); solo se le AGREGAN los puntos
-- que le faltaban, con el estatus del checklist. Nada se marca como aprobado.

UPDATE tramite_versiones v SET vigente_hasta = DATE '2026-11-08'
FROM tramites t
WHERE t.id = v.tramite_id AND t.clave = 'programa_contingencias' AND v.vigente_hasta IS NULL
  AND v.vigente_desde < DATE '2026-11-08';

INSERT INTO tramite_versiones (tramite_id, homoclave_actual, homoclaves_anteriores, vigente_desde, fuente, por_confirmar)
SELECT t.id, NULL, ARRAY['ARTF-03-003'], DATE '2026-11-08',
       'Checklist Plan de Contingencias SFM (Strateggia, 4 nov 2026), basado en el expediente autorizado de KERI (Acuerdo ATTRAPI jun 2026)',
       true
FROM tramites t WHERE t.clave = 'programa_contingencias'
  AND NOT EXISTS (SELECT 1 FROM tramite_versiones v WHERE v.tramite_id = t.id AND v.vigente_desde = DATE '2026-11-08');

INSERT INTO requisitos_catalogo (tramite_version_id, clave, seccion, nombre, responsable, ayuda, orden, vigente_desde)
SELECT v.id, r.clave, r.seccion, r.nombre, r.resp, r.ayuda, r.orden, DATE '2026-11-08'
FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id AND t.clave = 'programa_contingencias'
CROSS JOIN (VALUES
  -- A. Lo que elabora el despacho
  ('oficio_presentacion', 'A. Lo que elabora el despacho', 'Oficio de presentación del Programa de Contingencias (escrito libre)', 'despacho',
   'Cita el documento con el que la autoridad ya reconoció la personalidad del representante, si existe.', 1),
  ('formato_tramite', 'A. Lo que elabora el despacho', 'Formato del trámite "Presentación del Programa de Contingencias y Siniestros"', 'despacho', NULL, 2),
  ('programa', 'A. Lo que elabora el despacho', 'Programa de Contingencias de Ferrocarril (Procedimientos Especializados de Atención a Emergencias Ferroviarias)', 'despacho',
   'Documento principal. Base: Programa Interno de Protección Civil y estudio PML del cliente. Atender las observaciones previas de la autoridad.', 3),
  ('escrito_autorizados', 'A. Lo que elabora el despacho', 'Escrito de designación de autorizados para oír y recibir notificaciones', 'ambos',
   'Lo firma el representante legal.', 4),
  -- B. Documentos del expediente
  ('pipc', 'B. Documentos del expediente', 'Programa Interno de Protección Civil (original y copia)', 'cliente', NULL, 5),
  ('registro_pc_estatal', 'B. Documentos del expediente', 'Registro / resolución de Protección Civil del estado', 'cliente',
   'Revisar vigencia (normalmente 1 año). Pedir copia certificada para el ingreso.', 6),
  ('dc3_ferrocarril', 'B. Documentos del expediente', 'Constancias DC-3 especializadas en ferrocarril (mínimo 2 cursos)', 'despacho',
   'Cursos que imparte el despacho: Mantenimiento y Conservación de Vías; Manejo y Operación de Equipos de Arrastre.', 7),
  ('dc3_brigadas', 'B. Documentos del expediente', 'Constancias DC-3 de brigadas vigentes', 'cliente', NULL, 8),
  ('poder', 'B. Documentos del expediente', 'Poder notarial del representante legal (copia certificada)', 'cliente', NULL, 9),
  ('acta_objeto', 'B. Documentos del expediente', 'Acta constitutiva y modificación del objeto social (copia certificada)', 'cliente', NULL, 10),
  ('permiso', 'B. Documentos del expediente', 'Permiso del servicio auxiliar', 'cliente', NULL, 11),
  ('permiso_energia', 'B. Documentos del expediente', 'Permiso en materia energética (CRE), si aplica', 'cliente',
   'Si no aplica, anotar por qué (por ejemplo, lo que justifica el estudio PML).', 12),
  -- C. Información de soporte para elaborar el programa
  ('acuse_anterior', 'C. Soporte para elaborar el programa', 'Acuse y observaciones del Programa de Contingencias anterior', 'cliente', NULL, 13),
  ('poliza', 'C. Soporte para elaborar el programa', 'Póliza de seguro vigente y oficio de aprobación', 'cliente', NULL, 14),
  ('pml', 'C. Soporte para elaborar el programa', 'Estudio de Pérdida Máxima Probable (PML)', 'cliente',
   'Evaluar si debe actualizarse por cambios en la operación.', 15),
  ('constancia_inicio', 'C. Soporte para elaborar el programa', 'Constancia de Inicio de Operaciones', 'cliente', NULL, 16),
  ('productos_hds', 'C. Soporte para elaborar el programa', 'Productos operados, volúmenes por carrotanque y hojas de datos de seguridad (HDS)', 'cliente', NULL, 17),
  ('planos_emergencia', 'C. Soporte para elaborar el programa', 'Planos de la terminal y de emergencia', 'cliente', NULL, 18),
  ('directorio_emergencias', 'C. Soporte para elaborar el programa', 'Directorio de emergencias y coordinación con el concesionario y vecinos (áreas compartidas)', 'cliente',
   'Requerido para los procedimientos ferroviarios y el plan de ayuda mutua.', 19),
  ('pago_derechos', 'D. Pago e ingreso', 'Pago de derechos del trámite', 'cliente', 'Monto por confirmar al momento del ingreso.', 20)
) AS r(clave, seccion, nombre, resp, ayuda, orden)
WHERE v.vigente_desde = DATE '2026-11-08'
ON CONFLICT (tramite_version_id, clave) DO NOTHING;

-- ---------- Expediente SFM: agregar lo que faltaba con el estatus del checklist del 4 nov ----------
INSERT INTO expediente_requisitos (despacho_id, expediente_id, requisito_catalogo_id, seccion, nombre, responsable, estado, nota, orden)
SELECT e.despacho_id, e.id, NULL, x.seccion, x.nombre, x.resp, x.estado, x.nota, x.orden
FROM expedientes e
CROSS JOIN (VALUES
  ('Documento', 'Oficio de presentación del Programa de Contingencias (escrito libre)', 'despacho', 'por_elaborar',
   'Con base en el oficio ingresado para KERI; cita el Acuerdo ARTF 444/2022 para acreditar la personalidad del Lic. Samuel Garza Ibarra.', 6),
  ('Documento', 'Formato del trámite "Presentación del Programa de Contingencias y Siniestros"', 'despacho', 'por_elaborar',
   'Mismo formato utilizado en KERI (ARTF-03-003).', 7),
  ('Documento', 'Escrito de designación de autorizados para oír y recibir notificaciones', 'ambos', 'por_elaborar',
   'Equivalente al acuse del 11 dic 2025 de KERI. Firma del representante legal.', 8),
  ('Protección civil', 'Programa Interno de Protección Civil (original y copia)', 'cliente', 'recibido',
   'PIPC 2026 (Regia Consultores), registrado ante PC Nuevo León. Lo que no atiende de las observaciones ARTF 528/2022 (atlas, productos y volúmenes) se cubre en el Programa de Contingencias de Ferrocarril.', 9),
  ('Capacitación', 'Constancias DC-3 especializadas en ferrocarril (mínimo 2 cursos)', 'despacho', 'pendiente',
   'Por impartir: Mantenimiento y Conservación de Vías / Manejo y Operación de Equipos de Arrastre ($13,000 + IVA c/u, en línea, hasta 10 personas).', 10),
  ('Personalidad jurídica', 'Permiso del servicio auxiliar', 'cliente', 'recibido',
   'SCT-DGDFM-04-010-B/0036, oficio 4.3.-223/2022 (14 feb 2022), inscrito en el RFM el 20 abr 2022. Vigente al 31 dic 2029. Permiso CRE: no aplica (PML 2022, numeral 1.10).', 11),
  ('Soporte', 'Acuse y observaciones del Programa de Contingencias anterior', 'cliente', 'parcial',
   'Recibido: acuse 2022 (ARTF 0494, 17 mar 2022) y Acuerdo ARTF 528/2022. Falta acuse 2024, en su caso.', 12),
  ('Soporte', 'Póliza de seguro vigente y oficio de aprobación', 'cliente', 'recibido',
   'Inbursa 16211 30062280, vigente al 18 mar 2027; aprobada con oficio ATTRAPI/1.4.-300/2026.', 13),
  ('Soporte', 'Estudio de Pérdida Máxima Probable (PML)', 'cliente', 'parcial',
   'PML marzo 2022 (SICA, tercero autorizado ASEA TA-DA-A10-01/20). Evaluar actualización por cambios en la operación.', 14),
  ('Soporte', 'Constancia de Inicio de Operaciones', 'cliente', 'pendiente',
   'El cliente indica que cuenta con ella; falta recibir copia.', 15),
  ('Soporte', 'Productos operados, volúmenes por carrotanque y hojas de datos de seguridad (HDS)', 'cliente', 'pendiente',
   'El PML 2022 reporta solo Gas LP y gasolina; confirmar la operación actual.', 16),
  ('Soporte', 'Planos de la terminal y de emergencia', 'cliente', 'parcial',
   'Hay planos del proyecto ejecutivo (oficio 4.3.-1414/2021). Faltan planos de emergencia vigentes.', 17),
  ('Soporte', 'Directorio de emergencias y coordinación con CPKC y Nuevo Gas (áreas compartidas)', 'cliente', 'pendiente',
   'Requerido para los procedimientos ferroviarios y el plan de ayuda mutua.', 18),
  ('Pago e ingreso', 'Pago de derechos del trámite', 'cliente', 'pendiente', 'Monto por confirmar al momento del ingreso.', 19)
) AS x(seccion, nombre, resp, estado, nota, orden)
WHERE e.id = '00000000-0000-4000-8000-000000000203'
  AND NOT EXISTS (SELECT 1 FROM expediente_requisitos r WHERE r.expediente_id = e.id AND r.nombre = x.nombre);

-- Los 5 puntos que ya tenía: notas del checklist (solo si nadie los ha movido desde la carga inicial).
UPDATE expediente_requisitos r SET estado = x.estado, nota = x.nota, actualizado_en = now()
FROM (VALUES
  ('Programa de Contingencias', 'en_integracion', 'en_integracion',
   'Primera versión elaborada por Mayela (en el Drive de SFM). Base: PIPC 2026 y PML 2022 (escenarios BLEVE de carrotanque de Gas LP y derrame de gasolina). Atender las observaciones del Acuerdo ARTF 528/2022.'),
  ('Copias certificadas de acta y poder', 'pendiente', 'parcial',
   'Escrituras 19,866 (10 jun 2014, reconocida en el Acuerdo ARTF 444/2022) y 59,230 (2021) identificadas. Falta copia certificada vigente.'),
  ('Constancias DC-3 de brigadas vigentes', 'pendiente', 'parcial',
   'Solo hay DC-3 de 2016–2021 (citadas en el permiso y anexas al PML). Solicitar constancias 2024–2026.'),
  ('Registro de protección civil estatal', 'recibido', 'recibido',
   'Oficio DPCE-SAP-PI/002218-2026 del 27 abr 2026 (Plan de Contingencias y UIRI). Vigencia 1 año: renovar antes del 27 abr 2027. Pedir copia certificada para el ingreso.')
) AS x(nombre, estado_inicial, estado, nota)
WHERE r.expediente_id = '00000000-0000-4000-8000-000000000203' AND r.nombre = x.nombre AND r.estado = x.estado_inicial;
