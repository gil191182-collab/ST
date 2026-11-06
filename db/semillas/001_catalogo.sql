-- Catálogo inicial de trámites ATTRAPI.
-- IMPORTANTE: lo marcado "por_confirmar" lo debe validar Mayela contra la
-- normativa vigente antes de usarse con clientes. No se inventaron homoclaves:
-- solo se capturó ATTRAPI-03-005 (Registro de Tarifas), que aparece en el
-- expediente real de Bulkmatic Atitalaquia.

INSERT INTO tramites (clave, nombre, etapa, requiere_clave, periodicidad_meses, descripcion) VALUES
 ('proyecto_ejecutivo', 'Proyecto Ejecutivo', 1, NULL, NULL, 'Autorización del proyecto ejecutivo de la terminal.'),
 ('permiso', 'Permiso de servicios auxiliares (04-010-A / 04-010-B)', 2, 'proyecto_ejecutivo', NULL, 'Permiso de la terminal.'),
 ('inicio_operaciones', 'Constancia de Inicio de Operaciones', 3, 'permiso', NULL, '180 días naturales desde el permiso, con prórroga si existe.'),
 ('registro_tarifas', 'Registro de Tarifas', 4, 'permiso', 24, 'Por permiso, no por terminal. Actualización cada 2 años (por confirmar).'),
 ('programa_contingencias', 'Programa de Contingencias', 4, 'permiso', 24, '15 días naturales antes de iniciar operaciones y cada 2 años.'),
 ('renovacion_polizas', 'Renovación de pólizas (RC y daños)', 4, 'inicio_operaciones', 12, 'Cada año desde la emisión.'),
 ('aviso_cambios_terminal', 'Aviso de cambios en la terminal', 4, 'inicio_operaciones', NULL, '15 días naturales desde el cambio.'),
 ('renovacion_permiso', 'Renovación del permiso', 4, 'inicio_operaciones', NULL, 'Iniciar 6 meses antes del vencimiento.');

INSERT INTO tramite_versiones (tramite_id, homoclave_actual, homoclaves_anteriores, vigente_desde, fuente, por_confirmar)
SELECT id, h, '{}', DATE '2025-01-01', f, pc FROM tramites JOIN (VALUES
  ('proyecto_ejecutivo', NULL, NULL, true),
  ('permiso', NULL, NULL, true),
  ('inicio_operaciones', NULL, NULL, true),
  ('registro_tarifas', 'ATTRAPI-03-005', 'Expediente Bulkmatic Atitalaquia (Formato ATTRAPI-03-005)', true),
  ('programa_contingencias', NULL, NULL, true),
  ('renovacion_polizas', NULL, NULL, true),
  ('aviso_cambios_terminal', NULL, NULL, true),
  ('renovacion_permiso', NULL, NULL, true)
) AS x(clave, h, f, pc) USING (clave);

-- Requisitos del Inicio de Operaciones (los 8 del expediente KERI)
INSERT INTO requisitos_catalogo (tramite_version_id, clave, seccion, nombre, responsable, ayuda, orden, vigente_desde)
SELECT v.id, r.clave, r.seccion, r.nombre, r.resp, r.ayuda, r.orden, DATE '2025-01-01'
FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id AND t.clave = 'inicio_operaciones'
CROSS JOIN (VALUES
  ('pml', 'Seguros', 'Estudio de Pérdida Máxima Probable', 'ambos', 'Define el límite de la póliza de RC.', 1),
  ('poliza_rc', 'Seguros', 'Póliza de Responsabilidad Civil', 'cliente', 'Domicilio y giro idénticos al permiso; endosos palabra por palabra.', 2),
  ('poliza_danos', 'Seguros', 'Póliza de desastres naturales e incendio', 'cliente', 'Mismo domicilio y giro que la de RC.', 3),
  ('registro_tarifas', 'Resoluciones previas', 'Registro de Tarifas', 'despacho', 'Resolución de la autoridad.', 4),
  ('programa_contingencias', 'Resoluciones previas', 'Programa de Contingencias', 'despacho', 'Acuerdo de la autoridad; 15 días naturales antes de iniciar.', 5),
  ('bases_coordinacion', 'Operación', 'Bases de Coordinación', 'despacho', 'Se integra en hojas membretadas.', 6),
  ('relacion_concesionario', 'Operación', 'Relación comercial con el concesionario', 'cliente', 'Documento con el concesionario ferroviario.', 7),
  ('pago_derechos', 'Pago e ingreso', 'Pago de derechos de verificación', 'cliente', 'Con la hoja de ayuda. Sin este pago la ATTRAPI no programa la visita.', 8)
) AS r(clave, seccion, nombre, resp, ayuda, orden);

-- Requisitos del Registro de Tarifas (los visibles en el expediente Bulkmatic;
-- el expediente real tiene 27: faltan por capturar)
INSERT INTO requisitos_catalogo (tramite_version_id, clave, seccion, nombre, responsable, ayuda, orden, vigente_desde)
SELECT v.id, r.clave, r.seccion, r.nombre, r.resp, r.ayuda, r.orden, DATE '2025-01-01'
FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id AND t.clave = 'registro_tarifas'
CROSS JOIN (VALUES
  ('formato', 'Formato y anexos ATTRAPI', 'Formato ATTRAPI-03-005', 'despacho', 'Se llena con los datos confirmados.', 1),
  ('anexo1', 'Formato y anexos ATTRAPI', 'Anexo 1 - Catálogo de Servicios Diversos', 'despacho', 'Solo pesos.', 2),
  ('anexo2', 'Formato y anexos ATTRAPI', 'Anexo 2 - Reglas de aplicación', 'despacho', 'Cuándo aplica cada concepto y unidad de cobro.', 3),
  ('anexo3', 'Formato y anexos ATTRAPI', 'Anexo 3 - Datos del permiso', 'despacho', 'Domicilio textual del permiso, en el mismo orden.', 4),
  ('coordenadas', 'Datos de la terminal', '4 vértices con datum', 'cliente', NULL, 5),
  ('linea_km', 'Datos de la terminal', 'Línea ferroviaria y kilómetros', 'cliente', NULL, 6),
  ('planos', 'Datos de la terminal', 'Planos aprobados', 'cliente', NULL, 7),
  ('pagina_web', 'Datos de la terminal', 'Página web de publicación', 'cliente', NULL, 8),
  ('escritura_objeto', 'Personalidad jurídica', 'Escritura constitutiva (objeto ferroviario)', 'cliente', NULL, 9),
  ('poder', 'Personalidad jurídica', 'Poder del firmante', 'cliente', NULL, 10),
  ('identificacion', 'Personalidad jurídica', 'Identificación del firmante', 'cliente', NULL, 11),
  ('modelo_financiero', 'Sustento de las tarifas', 'Modelo matemático / financiero', 'cliente', 'Con datos de Finanzas.', 12),
  ('estudio_comparativo', 'Sustento de las tarifas', 'Estudio especializado y comparativo', 'despacho', 'Contra referencias autorizadas.', 13),
  ('estados_financieros', 'Sustento de las tarifas', 'Estados financieros del último ejercicio', 'cliente', 'Con proyección firmada.', 14),
  ('pago_derechos', 'Pago e ingreso', 'Hoja de ayuda DPA y pago de derechos', 'ambos', 'Strateggia prepara, el cliente paga.', 15),
  ('firma_ingreso', 'Pago e ingreso', 'Firma e ingreso ante ATTRAPI', 'ambos', 'Tras validación previa con la autoridad. Lo hace una persona.', 16)
) AS r(clave, seccion, nombre, resp, ayuda, orden);

-- Programa de Contingencias (lista parcial; el expediente SFM tiene 20)
INSERT INTO requisitos_catalogo (tramite_version_id, clave, seccion, nombre, responsable, ayuda, orden, vigente_desde)
SELECT v.id, r.clave, r.seccion, r.nombre, r.resp, r.ayuda, r.orden, DATE '2025-01-01'
FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id AND t.clave = 'programa_contingencias'
CROSS JOIN (VALUES
  ('programa', 'Documento', 'Programa de Contingencias', 'despacho', 'Atender observaciones previas de la autoridad.', 1),
  ('atlas_riesgos', 'Documento', 'Atlas de riesgos', 'despacho', NULL, 2),
  ('acta_poder', 'Personalidad jurídica', 'Copias certificadas de acta y poder', 'cliente', NULL, 3),
  ('dc3_brigadas', 'Capacitación', 'Constancias DC-3 de brigadas vigentes', 'cliente', NULL, 4),
  ('registro_pc_estatal', 'Protección civil', 'Registro de protección civil estatal', 'cliente', NULL, 5)
) AS r(clave, seccion, nombre, resp, ayuda, orden);
