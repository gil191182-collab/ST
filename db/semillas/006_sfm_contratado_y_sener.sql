-- Copia de la migración 008 para instalaciones nuevas. Idempotente.

-- Servicio Ferrovial Monterrey: lo que avanzó Mayela (conversación compartida por Gil, nov 2026).
-- 1) Nuevo trámite en el catálogo: consulta ante SENER y validación con SICT / ATTRAPI
--    para operar el permiso de transbordo y transvase bajo el Reglamento de la Ley del
--    Sector Hidrocarburos (vigente desde el 4 oct 2025; arts. 97 a 99).
-- 2) SFM contrató los dos servicios (propuesta v3, 5% de descuento): se abre el expediente
--    SENER y se registran los hitos de cobro. La factura F-2707 del anticipo quedó EMITIDA;
--    el pago NO se marca: eso lo confirma una persona.
-- 3) Checklist del Programa de Contingencias actualizado con el registro de Protección Civil
--    2026 y lo que se le pidió al cliente.

-- ---------- 1. Catálogo ----------
INSERT INTO tramites (clave, nombre, etapa, requiere_clave, periodicidad_meses, descripcion)
SELECT 'consulta_sener_trasvase', 'Consulta ante SENER y validación SICT / ATTRAPI (transvase)', 4, 'permiso', NULL,
       'Criterio de SENER para operar el permiso de transbordo y transvase en las condiciones en que fue emitido, frente al Reglamento de la Ley del Sector Hidrocarburos. No es un permiso de la CNE: el art. 98 prohíbe el trasvase directo entre medios de transporte y el art. 99 solo prevé autorizaciones provisionales de emergencia.'
WHERE NOT EXISTS (SELECT 1 FROM tramites WHERE clave = 'consulta_sener_trasvase')
  AND EXISTS (SELECT 1 FROM tramites WHERE clave = 'permiso');  -- en una instalación nueva el catálogo llega después (semillas)

INSERT INTO tramite_versiones (tramite_id, homoclave_actual, homoclaves_anteriores, vigente_desde, fuente, por_confirmar)
SELECT t.id, NULL, '{}', DATE '2026-11-08', 'Propuesta Strateggia a Servicio Ferrovial Monterrey v3 (nov 2026) y análisis del Reglamento LSH', true
FROM tramites t WHERE t.clave = 'consulta_sener_trasvase'
  AND NOT EXISTS (SELECT 1 FROM tramite_versiones v WHERE v.tramite_id = t.id);

INSERT INTO requisitos_catalogo (tramite_version_id, clave, seccion, nombre, responsable, ayuda, orden, vigente_desde)
SELECT v.id, r.clave, r.seccion, r.nombre, r.resp, r.ayuda, r.orden, DATE '2026-11-08'
FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id AND t.clave = 'consulta_sener_trasvase'
CROSS JOIN (VALUES
  ('diagnostico', '1. Diagnóstico', 'Diagnóstico de cumplimiento del permiso (obligaciones permanentes vs. evidencia)', 'despacho',
   'No es recomendable ingresar ante SENER sin las obligaciones del permiso cubiertas: el escrito se apoya en que el permiso está al corriente.', 1),
  ('evidencias_permiso', '1. Diagnóstico', 'Evidencias de cumplimiento: constancia de inicio, tarifas, póliza vigente, PML, bases de coordinación y contrato con el concesionario', 'cliente', NULL, 2),
  ('asea', '1. Diagnóstico', 'Situación ante ASEA (resolutivo de impacto ambiental, SASISOPA, seguros)', 'cliente',
   'Validar con un gestor especializado en ASEA. Citar el resolutivo solo por lo que realmente autoriza.', 3),
  ('acuse_contingencias', '2. Escrito', 'Acuse del Programa de Contingencias vigente ante la ATTRAPI', 'despacho',
   'Se ingresa primero el Programa de Contingencias; su acuse se anexa al escrito a SENER.', 4),
  ('escrito_consulta', '2. Escrito', 'Escrito de consulta a SENER (con criterio transitorio y orientación sobre el permiso idóneo)', 'ambos',
   'Lo redacta el despacho y lo firma el representante legal. Conviene que lo valide un abogado regulatorio antes de ingresar.', 5),
  ('anexos', '2. Escrito', 'Anexos: copia del permiso, poder del representante y antecedentes de autorización del transvase', 'cliente', NULL, 6),
  ('ingreso_sener', '3. Ingreso y seguimiento', 'Ingreso ante SENER (acuse)', 'ambos', 'Lo hace una persona; el sistema nunca ingresa solo.', 7),
  ('observaciones', '3. Ingreso y seguimiento', 'Atención de requerimientos u observaciones de SENER (y reingreso si hace falta)', 'despacho', NULL, 8),
  ('resolucion_sener', '4. Resolución', 'Resolución o criterio de SENER', 'autoridad', NULL, 9),
  ('notificacion_attrapi', '4. Resolución', 'Notificación de la resolución a la SICT y a la ATTRAPI', 'ambos',
   'Para que se considere en la operación del permiso.', 10)
) AS r(clave, seccion, nombre, resp, ayuda, orden)
ON CONFLICT (tramite_version_id, clave) DO NOTHING;

-- ---------- 2. Expediente SENER de SFM y cobros (solo si existe el piloto SFM) ----------
INSERT INTO expedientes (id, despacho_id, cliente_id, terminal_id, permiso_id, tramite_version_id, alcance, estado,
                         consultor_id, siguiente_paso, abierto_en)
SELECT '00000000-0000-4000-8000-000000000206', e.despacho_id, e.cliente_id, e.terminal_id, e.permiso_id, v.id,
       'Servicio 2 de la propuesta v3: $149,910 + IVA con 5% de descuento. Pagos 30% anticipo / 20% al ingreso / 50% contra resolución favorable; si no es favorable, se atienden observaciones y se reingresa.',
       'en_integracion', e.consultor_id,
       'Ingresar primero el Programa de Contingencias; pendiente el anticipo (factura F-2707).', DATE '2026-11-08'
FROM expedientes e
JOIN tramite_versiones v ON v.tramite_id = (SELECT id FROM tramites WHERE clave = 'consulta_sener_trasvase')
WHERE e.id = '00000000-0000-4000-8000-000000000203'
  AND NOT EXISTS (SELECT 1 FROM expedientes WHERE id = '00000000-0000-4000-8000-000000000206');

INSERT INTO expediente_requisitos (despacho_id, expediente_id, requisito_catalogo_id, seccion, nombre, responsable, estado, nota, orden)
SELECT e.despacho_id, e.id, r.id, r.seccion, r.nombre, r.responsable,
       CASE r.clave WHEN 'diagnostico' THEN 'revision_cliente' WHEN 'evidencias_permiso' THEN 'parcial' ELSE 'pendiente' END,
       CASE r.clave
         WHEN 'diagnostico' THEN 'Diagnóstico entregado (PDF y Word con logo). Al corriente con evidencia: póliza 2026-2027 y tarifas 2022. Sin evidencia: constancia de inicio, PML vigente, bases de coordinación y plan 2024.'
         WHEN 'evidencias_permiso' THEN 'PML 2022 de SICA (tercero autorizado ASEA TA-DA-A10-01/20): RC USD 675,093.78 y daño ambiental USD 209,968.19; evaluó solo Gas LP con 1 transloader, probablemente requiere actualización. Verificar que la póliza 2026 cubra esos límites.'
         WHEN 'asea' THEN 'El resolutivo ASEA-UGI-DGGPI-1393-2020 autoriza una terminal de almacenamiento con 10 tanques, no el trasvase directo; el propio PML recomienda reevaluar impacto ambiental y riesgo. Sin evidencia de SASISOPA ni seguro ambiental.'
         WHEN 'escrito_consulta' THEN 'Hay un borrador sugerido con errores de forma y argumentos por reforzar (derechos adquiridos, transitorio 18º, art. 8 constitucional, oficio 4.3.-1414/2021 que autorizó el trasvase).'
       END,
       r.orden
FROM expedientes e JOIN requisitos_catalogo r ON r.tramite_version_id = e.tramite_version_id
WHERE e.id = '00000000-0000-4000-8000-000000000206'
  AND NOT EXISTS (SELECT 1 FROM expediente_requisitos x WHERE x.expediente_id = e.id);

INSERT INTO hitos_cobro (despacho_id, expediente_id, descripcion, porcentaje, folio_factura, estatus)
SELECT e.despacho_id, e.id, h.descripcion, h.pct, h.folio, h.estatus
FROM expedientes e
JOIN (VALUES
  ('00000000-0000-4000-8000-000000000203'::uuid, 'Anticipo 50% · $64,980.00 + IVA', 50, 'F-2707', 'facturado'),
  ('00000000-0000-4000-8000-000000000203'::uuid, 'Al ingreso ante ATTRAPI 30% · $38,988.00 + IVA', 30, NULL, 'pendiente'),
  ('00000000-0000-4000-8000-000000000203'::uuid, 'Con el oficio de resolución 20% · $25,992.00 + IVA', 20, NULL, 'pendiente'),
  ('00000000-0000-4000-8000-000000000206'::uuid, 'Anticipo 30% · $44,973.00 + IVA', 30, 'F-2707', 'facturado'),
  ('00000000-0000-4000-8000-000000000206'::uuid, 'Al ingreso ante SENER 20% · $29,982.00 + IVA', 20, NULL, 'pendiente'),
  ('00000000-0000-4000-8000-000000000206'::uuid, 'Contra resolución favorable 50% · $74,955.00 + IVA', 50, NULL, 'pendiente')
) AS h(exp, descripcion, pct, folio, estatus) ON h.exp = e.id
WHERE NOT EXISTS (SELECT 1 FROM hitos_cobro x WHERE x.expediente_id = e.id AND x.descripcion = h.descripcion);

-- ---------- 3. Programa de Contingencias de SFM ----------
UPDATE expedientes SET
  alcance = 'Plan de Contingencias Especializado en Ferrocarril (Servicio 1 de la propuesta v3): $129,960 + IVA con 5% de descuento. DC-3 ferroviarias aparte: $13,000 + IVA por curso en línea.',
  siguiente_paso = 'Reunión con la ATTRAPI (Lic. Nayeli Reyes) para validar el plan. Pedidas al cliente: copias certificadas de poder, acta y oficio de Protección Civil; pendiente el anticipo (F-2707).'
WHERE id = '00000000-0000-4000-8000-000000000203' AND alcance = 'completo';

UPDATE expediente_requisitos SET estado = 'parcial', actualizado_en = now(),
  nota = 'Oficio DPCE-SAP-PI/002218-2026 (Protección Civil de Nuevo León), vigente al 27 abr 2027. Lo recibido es escaneo simple: se pidió copia certificada.'
WHERE expediente_id = '00000000-0000-4000-8000-000000000203' AND nombre = 'Registro de protección civil estatal' AND estado = 'recibido';

INSERT INTO expediente_requisitos (despacho_id, expediente_id, requisito_catalogo_id, seccion, nombre, responsable, estado, nota, orden)
SELECT e.despacho_id, e.id, NULL, x.seccion, x.nombre, 'cliente', 'pendiente', x.nota, x.orden
FROM expedientes e
CROSS JOIN (VALUES
  ('Soporte', 'Carta o contrato vigente con CPKC', 'Solicitado al cliente.', 20),
  ('Capacitación', 'Lista del personal que tomará los cursos DC-3 de ferrocarril (hasta 10 personas)', 'Solicitado al cliente.', 21)
) AS x(seccion, nombre, nota, orden)
WHERE e.id = '00000000-0000-4000-8000-000000000203'
  AND NOT EXISTS (SELECT 1 FROM expediente_requisitos r WHERE r.expediente_id = e.id AND r.nombre = x.nombre);
