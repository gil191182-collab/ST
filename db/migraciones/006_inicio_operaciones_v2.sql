-- Catálogo: segunda versión del Inicio de Operaciones, armada con el caso real de KERI
-- (Plan de Trabajo de Strateggia, marzo 2026) y la explicación de Mayela sobre la
-- visita de verificación (8 nov 2026).
--
-- Regla del catálogo versionado: los expedientes abiertos con la versión 1 se quedan
-- con ella. Los que se abran desde hoy usan la versión 2. Al expediente piloto de KERI
-- solo se le AGREGAN los pasos que faltaban (escrito, ingreso y visita); no se cambia
-- su versión ni el estado de lo que ya tenía.

-- ---------- 1. Cerrar la versión 1 y abrir la versión 2 ----------
UPDATE tramite_versiones v SET vigente_hasta = DATE '2026-11-08'
FROM tramites t
WHERE t.id = v.tramite_id AND t.clave = 'inicio_operaciones' AND v.vigente_hasta IS NULL
  AND v.vigente_desde < DATE '2026-11-08';

INSERT INTO tramite_versiones (tramite_id, homoclave_actual, homoclaves_anteriores, vigente_desde, fuente, por_confirmar)
SELECT t.id, NULL, '{}', DATE '2026-11-08',
       'Plan de Trabajo Inicio de Operaciones KERI (Strateggia, mar 2026); escrito sugerido de Strateggia; proceso de visita descrito por Mayela (8 nov 2026)',
       true
FROM tramites t WHERE t.clave = 'inicio_operaciones'
  AND NOT EXISTS (SELECT 1 FROM tramite_versiones v WHERE v.tramite_id = t.id AND v.vigente_desde = DATE '2026-11-08');

-- responsable: cliente = lo entrega el cliente · despacho = lo elabora el despacho ·
--              ambos = el despacho lo prepara y el cliente firma, paga o entrega ·
--              autoridad = lo emite la autoridad (una persona lo registra).
INSERT INTO requisitos_catalogo (tramite_version_id, clave, seccion, nombre, responsable, ayuda, orden, vigente_desde)
SELECT v.id, r.clave, r.seccion, r.nombre, r.resp, r.ayuda, r.orden, DATE '2026-11-08'
FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id AND t.clave = 'inicio_operaciones'
CROSS JOIN (VALUES
  -- 1. Lo que entrega el cliente
  ('permiso_copia', '1. Lo que entrega el cliente', 'Copia del permiso vigente', 'cliente',
   'Se revisan sus condiciones: ahí vienen los requisitos del inicio de operaciones y el plazo de 180 días.', 1),
  ('acta_poder', '1. Lo que entrega el cliente', 'Acta constitutiva, poder e identificación del representante legal', 'cliente',
   'El escrito de solicitud cita la escritura del poder; quien firma debe ser ese representante.', 2),
  ('hojas_membretadas', '1. Lo que entrega el cliente', 'Hojas membretadas de la empresa (en Word)', 'cliente',
   'Las Bases de Coordinación y el escrito de solicitud van en hojas membretadas del cliente.', 3),
  ('procedimientos_operacion', '1. Lo que entrega el cliente', 'Procedimientos de operación de la terminal', 'cliente',
   'Insumo para las Bases de Coordinación. Si no los tiene, se agenda un recorrido de la terminal.', 4),
  ('plan_proteccion_civil', '1. Lo que entrega el cliente', 'Plan de contingencias presentado ante Protección Civil', 'cliente',
   'Insumo para el Programa de Contingencias ferroviario.', 5),
  ('relacion_concesionario', '1. Lo que entrega el cliente', 'Documento de relación comercial con el concesionario ferroviario', 'cliente',
   'Debe garantizar que el concesionario le dará el servicio ferroviario a la terminal.', 6),
  ('resoluciones_asea', '1. Lo que entrega el cliente', 'Resoluciones de ASEA (MIA-P y Estudio de Riesgo), si aplican', 'cliente',
   'Al recibirlas, se avisa a la ATTRAPI dentro de los 15 días hábiles siguientes.', 7),
  -- 2. Seguros
  ('pml', '2. Seguros', 'Estudio de Pérdida Máxima Probable (copia certificada)', 'ambos',
   'Lo elabora un proveedor autorizado por ASEA; el despacho cotiza y coordina. Define la suma asegurada de la póliza de RC.', 8),
  ('poliza_rc', '2. Seguros', 'Póliza de Responsabilidad Civil y comprobante de pago de la prima', 'cliente',
   'Domicilio y giro idénticos al permiso; endosos palabra por palabra. Se pide su aprobación conforme al artículo 194 del Reglamento del Servicio Ferroviario.', 9),
  ('poliza_danos', '2. Seguros', 'Póliza contra desastres naturales e incendio (si es separada)', 'cliente',
   'Mismo domicilio y giro que la de RC. Si la RC ya la cubre, se marca como no aplica en la nota.', 10),
  -- 3. Lo que elabora el despacho
  ('registro_tarifas', '3. Lo que elabora el despacho', 'Resolución del Registro de Tarifas', 'despacho',
   'Es un trámite propio (por permiso). Aquí se adjunta la resolución.', 11),
  ('programa_contingencias', '3. Lo que elabora el despacho', 'Resolución del Programa de Contingencias', 'despacho',
   'Trámite propio: 15 días naturales antes de iniciar y cada 2 años. Aquí se adjunta la resolución.', 12),
  ('bases_coordinacion', '3. Lo que elabora el despacho', 'Bases de Coordinación (original firmado, en hojas membretadas del cliente)', 'ambos',
   'Artículo 143 del Reglamento del Servicio Ferroviario: reglas entre modos de transporte, seguridad, vigilancia y control de acceso. El despacho las redacta; el cliente las firma.', 13),
  ('hoja_ayuda_pago', '3. Lo que elabora el despacho', 'Hoja de ayuda para el pago de derechos de verificación', 'despacho',
   'Con el monto vigente. Se la manda al cliente para que pague.', 14),
  ('escrito_solicitud', '3. Lo que elabora el despacho', 'Escrito de solicitud de la Constancia de Inicio de Operaciones', 'ambos',
   'El despacho lo genera con los datos del expediente; lo revisa y firma el representante legal del cliente.', 15),
  -- 4. Pago e ingreso
  ('pago_derechos', '4. Pago e ingreso', 'Comprobante de pago de derechos de verificación', 'cliente',
   'Sin este pago la autoridad no programa la visita.', 16),
  ('ingreso', '4. Pago e ingreso', 'Ingreso de la solicitud ante la ATTRAPI (acuse)', 'ambos',
   'Lo hace una persona; el sistema nunca ingresa solo. Se adjunta el acuse con sello y fecha.', 17),
  -- 5. Lo que hace la autoridad
  ('oficio_visita', '5. Lo que hace la autoridad', 'Oficio de la ATTRAPI al Centro SICT del estado pidiendo la visita', 'autoridad',
   'Normalmente el cliente no lo ve. Se registra cuando se sepa que ya salió.', 18),
  ('visita', '5. Lo que hace la autoridad', 'Visita de verificación a la terminal (Centro SICT del estado)', 'autoridad',
   'Validan en sitio todo lo que declaró el cliente. Anotar la fecha y quién atendió.', 19),
  ('oficio_resultado_visita', '5. Lo que hace la autoridad', 'Oficio con el resultado de la visita (aprobación u observaciones)', 'autoridad',
   'Si trae observaciones, se atienden y se vuelve a revisar. Si aprueba, el Centro SICT lo manda a la ATTRAPI.', 20),
  ('constancia', '5. Lo que hace la autoridad', 'Oficio de entrega de la Constancia de Inicio de Operaciones', 'autoridad',
   'Con esto la terminal ya puede usar su permiso. Se registra como resultado del expediente.', 21)
) AS r(clave, seccion, nombre, resp, ayuda, orden)
WHERE v.vigente_desde = DATE '2026-11-08'
ON CONFLICT (tramite_version_id, clave) DO NOTHING;

-- ---------- 2. Requisitos del Permiso 04-010-B (del escrito de solicitud de KERI, nov 2025) ----------
-- Solo se agregan si la versión del permiso todavía no tiene requisitos.
INSERT INTO requisitos_catalogo (tramite_version_id, clave, seccion, nombre, responsable, ayuda, orden, vigente_desde)
SELECT v.id, r.clave, r.seccion, r.nombre, r.resp, r.ayuda, r.orden, v.vigente_desde
FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id AND t.clave = 'permiso'
CROSS JOIN (VALUES
  ('acta_constitutiva', 'Capacidad jurídica', 'Acta constitutiva (copia certificada)', 'cliente', NULL, 1),
  ('objeto_social', 'Capacidad jurídica', 'Escritura donde el objeto social incluye el servicio auxiliar (copia certificada)', 'cliente', 'El nombre del servicio debe coincidir con el que se solicita.', 2),
  ('poder', 'Capacidad jurídica', 'Poder del representante legal inscrito en el Registro Público (copia certificada)', 'cliente', NULL, 3),
  ('cedula_fiscal', 'Capacidad jurídica', 'Cédula fiscal de la empresa', 'cliente', NULL, 4),
  ('declaracion_isr', 'Capacidad financiera', 'Declaración del ISR del último ejercicio (con su archivo Excel)', 'cliente', NULL, 5),
  ('flujos_10_anios', 'Capacidad financiera', 'Flujos de efectivo proyectados a 10 años', 'ambos', 'El despacho arma el modelo con los datos de Finanzas del cliente.', 6),
  ('estados_auditados', 'Capacidad financiera', 'Estados financieros auditados del último ejercicio, con cédula y registro del auditor', 'cliente', NULL, 7),
  ('estados_cuenta', 'Capacidad financiera', 'Carátulas de estados de cuenta bancarios de los últimos 3 meses', 'cliente', NULL, 8),
  ('plano_conjunto', 'Capacidad técnica', 'Plano de conjunto (ruta ferroviaria, concesionario, áreas, coordenadas y superficie)', 'cliente', NULL, 9),
  ('relacion_areas', 'Capacidad técnica', 'Relación de áreas e instalaciones (características, uso, superficie e inversión)', 'ambos', NULL, 10),
  ('relacion_servicios', 'Capacidad técnica', 'Relación de servicios, mercado y tipo de carga', 'ambos', NULL, 11),
  ('experiencia', 'Capacidad técnica', 'Documento que acredita al menos 2 años de experiencia en la actividad', 'cliente', NULL, 12),
  ('equipo_operacion', 'Capacidad técnica', 'Relación del equipo de operación (cantidad, marca, modelo, capacidad, serie y año)', 'ambos', NULL, 13),
  ('equipo_seguridad', 'Capacidad técnica', 'Relación del equipo de seguridad (cantidad, marca, modelo, capacidad, serie y año)', 'ambos', NULL, 14),
  ('dictamen_uvie', 'Capacidad técnica', 'Dictamen de la Unidad de Verificación de Instalaciones Eléctricas (UVIE)', 'cliente', NULL, 15),
  ('proyecto_ejecutivo', 'Capacidad técnica', 'Oficio de autorización del Proyecto Ejecutivo con planos, inicio y término de obra y acta de visto bueno', 'cliente', NULL, 16),
  ('dc3_dc5', 'Capacidad técnica', 'Constancias DC-3 del personal y DC-5 del capacitador', 'cliente', NULL, 17),
  ('constancias_autoridades', 'Capacidad técnica', 'Constancias de autoridades federales, estatales y municipales para la actividad', 'cliente', NULL, 18),
  ('propiedad_inmueble', 'Inmueble', 'Escritura de propiedad o autorización para usar el inmueble, inscrita en el Registro Público', 'cliente', NULL, 19),
  ('uso_suelo', 'Inmueble', 'Constancia de uso de suelo / compatibilidad urbanística vigente', 'cliente', NULL, 20),
  ('escrito_solicitud', 'Pago e ingreso', 'Escrito de solicitud del permiso', 'ambos', 'El despacho lo genera; lo firma el representante legal.', 21),
  ('pago_derechos', 'Pago e ingreso', 'Comprobante de pago de derechos del permiso', 'cliente', NULL, 22)
) AS r(clave, seccion, nombre, resp, ayuda, orden)
WHERE NOT EXISTS (SELECT 1 FROM requisitos_catalogo x WHERE x.tramite_version_id = v.id)
ON CONFLICT (tramite_version_id, clave) DO NOTHING;

-- ---------- 3. Expediente piloto KERI: agregar los pasos que faltaban ----------
-- Solo si existe (en una instalación nueva los pilotos se cargan después y ya nacen así).
INSERT INTO expediente_requisitos (despacho_id, expediente_id, requisito_catalogo_id, seccion, nombre, responsable, estado, nota, orden)
SELECT e.despacho_id, e.id, NULL, x.seccion, x.nombre, x.resp, x.estado, x.nota, x.orden
FROM expedientes e
CROSS JOIN (VALUES
  ('Pago e ingreso', 'Escrito de solicitud de la Constancia de Inicio de Operaciones', 'ambos', 'revision_cliente',
   'Según Mayela (8 nov 2026): escrito ya lleno, en revisión para firma del representante legal de KERI. Subirlo aquí.', 9),
  ('Pago e ingreso', 'Ingreso de la solicitud ante la ATTRAPI (acuse)', 'ambos', 'pendiente', NULL, 10),
  ('Lo que hace la autoridad', 'Oficio de la ATTRAPI al Centro SICT del estado pidiendo la visita', 'autoridad', 'pendiente',
   'Centro SICT Aguascalientes. Normalmente el cliente no lo ve.', 11),
  ('Lo que hace la autoridad', 'Visita de verificación a la terminal (Centro SICT del estado)', 'autoridad', 'pendiente', NULL, 12),
  ('Lo que hace la autoridad', 'Oficio con el resultado de la visita (aprobación u observaciones)', 'autoridad', 'pendiente', NULL, 13),
  ('Lo que hace la autoridad', 'Oficio de entrega de la Constancia de Inicio de Operaciones', 'autoridad', 'pendiente', NULL, 14)
) AS x(seccion, nombre, resp, estado, nota, orden)
WHERE e.id = '00000000-0000-4000-8000-000000000201'
  AND NOT EXISTS (SELECT 1 FROM expediente_requisitos r WHERE r.expediente_id = e.id AND r.nombre = x.nombre);

-- El pago: Mayela dice que ya está hecho, pero el comprobante está solo en Drive.
-- No se marca nada como cumplido: se deja la nota para que una persona lo suba y lo apruebe.
UPDATE expediente_requisitos
SET nota = 'Según Mayela (8 nov 2026) ya está pagado; el comprobante está en Drive (carpeta PAGOS / VISITA). Subirlo aquí y aprobarlo.',
    actualizado_en = now()
WHERE expediente_id = '00000000-0000-4000-8000-000000000201'
  AND nombre = 'Pago de derechos de verificación' AND estado <> 'aprobado';
