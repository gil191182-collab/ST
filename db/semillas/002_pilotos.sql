-- Despacho Strateggia y expedientes piloto (KERI, Bulkmatic Atitalaquia, SFM).
-- Datos tomados de las pantallas del lienzo y de los documentos en Drive.
-- Lo que no se conocía se dejó marcado "[CAPTURAR ...]" para que Mayela lo complete;
-- el sistema lo señala como pendiente y no calcula nada con ello.

-- La carga se hace "como Mayela" para que la bitácora diga quién la hizo.
SELECT set_config('app.despacho_id', '00000000-0000-4000-8000-000000000001', true);
SELECT set_config('app.actor', 'usuario', true);
SELECT set_config('app.usuario_id', '00000000-0000-4000-8000-0000000000a2', true);

INSERT INTO despachos (id, nombre, subdominio, tema, lema) VALUES
('00000000-0000-4000-8000-000000000001', 'Strateggia Logistics', 'strateggia',
 '{"fondo":"#1B2440","acento":"#D68C28","accion":"#B35A0C","tipografia":"Poppins"}', 'Contigo hasta el final');

INSERT INTO usuarios (id, despacho_id, nombre, correo, rol) VALUES
('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'Gil Romero Pérez', 'gil191182@gmail.com', 'director'),
('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'Mayela Romero Pérez', 'mayela@capturar-correo.invalid', 'consultor');

-- ---------- Clientes ----------
INSERT INTO clientes (id, despacho_id, razon_social, nombre_corto, rfc) VALUES
('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', 'Energéticos Keri, S.A.P.I. de C.V.', 'Energéticos Keri', NULL),
('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000001', 'Bulkmatic de México', 'Bulkmatic', 'BME960110PM8'),
('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000001', 'Servicio Ferrovial Monterrey, S.A. de C.V.', 'Servicio Ferrovial Monterrey', 'SFM140610DW7');

INSERT INTO contactos (id, despacho_id, cliente_id, nombre, cargo) VALUES
('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'Omar Israel Abarca Torres', 'Representante legal'),
('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 'Lic. Carlos Gómez', 'Representante legal'),
('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 'Román Cisneros', 'Contacto Querétaro');

-- Usuario de portal para el cliente KERI (ejemplo del lienzo)
INSERT INTO usuarios (id, despacho_id, nombre, correo, rol, cliente_id) VALUES
('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000001', 'Omar Abarca Torres', 'omar@capturar-correo.invalid', 'cliente', '00000000-0000-4000-8000-0000000000c1');

-- ---------- Terminales ----------
INSERT INTO terminales (id, despacho_id, cliente_id, nombre, municipio, estado) VALUES
('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'Terminal Cosío', 'Cosío', 'Aguascalientes'),
('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 'Terminal Atitalaquia', 'Atitalaquia', 'Hidalgo'),
('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', 'Terminal Escobedo', 'Gral. Escobedo', 'Nuevo León'),
('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 'Terminal Querétaro', 'Querétaro', 'Querétaro'),
('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 'Terminal Pesquería', 'Pesquería', 'Nuevo León');

-- ---------- Permisos ----------
INSERT INTO permisos (id, despacho_id, terminal_id, numero, tipo, servicio, domicilio_textual, fecha_otorgamiento, vigencia_hasta) VALUES
('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1',
 'ATTRAPI-04-010-B/0056', '04-010-B', 'Transbordo y Transvase de Líquidos',
 '[CAPTURAR TEXTUAL DEL PERMISO] Carretera Panamericana, Km. 59.8, Soledad de Abajo, Cosío, Aguascalientes',
 DATE '2026-02-23', DATE '2047-06-22'),
('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e2',
 'ATTRAPI-04-010-B/0058', '04-010-B', 'Transbordo y Transvase de Líquidos',
 '[CAPTURAR TEXTUAL DEL PERMISO]', DATE '2026-08-20', NULL),
('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e3',
 'SCT-DGDFM-04-010-B/0036', '04-010-B', 'Transbordo y Transvase de Líquidos',
 '[CAPTURAR TEXTUAL DEL PERMISO]', NULL, NULL);

-- KERI: la autoridad dio prórroga al 2 dic 2026 y dijo que no habrá otra.
INSERT INTO prorrogas (despacho_id, permiso_id, concepto, nueva_fecha, oficio, admite_otra_prorroga, registrado_por) VALUES
('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f1', 'inicio_operaciones', DATE '2026-12-02',
 '[CAPTURAR NÚMERO DE OFICIO]', false, '00000000-0000-4000-8000-0000000000a2');

-- ---------- Documentos base (por subir) y antecedentes fuera del sistema ----------
INSERT INTO documentos (id, despacho_id, nombre, subido_por) VALUES
('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Permiso ATTRAPI-04-010-B/0056 (PDF por subir)', '00000000-0000-4000-8000-0000000000a2'),
('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Permiso ATTRAPI-04-010-B/0058 (PDF por subir)', '00000000-0000-4000-8000-0000000000a2'),
('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Permiso SCT-DGDFM-04-010-B/0036 (PDF por subir)', '00000000-0000-4000-8000-0000000000a2'),
('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'Acuerdo ATTRAPI/UVSR/DSF/069/2026 — Programa de Contingencias KERI (PDF en Drive)', '00000000-0000-4000-8000-0000000000a2');

INSERT INTO antecedentes_externos (despacho_id, terminal_id, tramite_clave, documento_id, descripcion, marcado_por)
SELECT '00000000-0000-4000-8000-000000000001', t, c, d, x, '00000000-0000-4000-8000-0000000000a2' FROM (VALUES
  ('00000000-0000-4000-8000-0000000000e1'::uuid, 'proyecto_ejecutivo', '00000000-0000-4000-8000-000000000101'::uuid, 'Proyecto ejecutivo previo al permiso 0056 (implícito en el permiso)'),
  ('00000000-0000-4000-8000-0000000000e1'::uuid, 'permiso', '00000000-0000-4000-8000-000000000101'::uuid, 'Permiso ATTRAPI-04-010-B/0056 otorgado el 23 feb 2026'),
  ('00000000-0000-4000-8000-0000000000e2'::uuid, 'proyecto_ejecutivo', '00000000-0000-4000-8000-000000000102'::uuid, 'Proyecto ejecutivo previo al permiso 0058 (planos aprobados, oficio ATTRAPI/1.4.-509/2026)'),
  ('00000000-0000-4000-8000-0000000000e2'::uuid, 'permiso', '00000000-0000-4000-8000-000000000102'::uuid, 'Permiso ATTRAPI-04-010-B/0058 otorgado el 20 ago 2026'),
  ('00000000-0000-4000-8000-0000000000e3'::uuid, 'proyecto_ejecutivo', '00000000-0000-4000-8000-000000000103'::uuid, 'Terminal en operación con permiso SCT-DGDFM-04-010-B/0036'),
  ('00000000-0000-4000-8000-0000000000e3'::uuid, 'permiso', '00000000-0000-4000-8000-000000000103'::uuid, 'Permiso SCT-DGDFM-04-010-B/0036'),
  ('00000000-0000-4000-8000-0000000000e3'::uuid, 'inicio_operaciones', '00000000-0000-4000-8000-000000000103'::uuid, 'Terminal ya opera (falta evidencia de la constancia, ver diagnóstico 27 oct 2026)')
) AS a(t, c, d, x);

-- ---------- Expedientes ----------
INSERT INTO expedientes (id, despacho_id, cliente_id, terminal_id, permiso_id, tramite_version_id, alcance, estado,
                         consultor_id, contacto_id, piloto_automatico, siguiente_paso, abierto_en)
SELECT x.id, '00000000-0000-4000-8000-000000000001', x.cli, x.ter, x.per,
       (SELECT v.id FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id WHERE t.clave = x.tram),
       x.alc, x.est, '00000000-0000-4000-8000-0000000000a2', x.con, x.piloto, x.sig, x.ab
FROM (VALUES
 ('00000000-0000-4000-8000-000000000201'::uuid, '00000000-0000-4000-8000-0000000000c1'::uuid, '00000000-0000-4000-8000-0000000000e1'::uuid, '00000000-0000-4000-8000-0000000000f1'::uuid,
  'inicio_operaciones', 'completo', 'con_observaciones', '00000000-0000-4000-8000-0000000000d1'::uuid, true,
  'Berkley: corregir domicilio y giro en ambas pólizas; comprobante de pago de derechos.', DATE '2026-03-01'),
 ('00000000-0000-4000-8000-000000000202'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, '00000000-0000-4000-8000-0000000000e2'::uuid, '00000000-0000-4000-8000-0000000000f2'::uuid,
  'registro_tarifas', 'Solo Registro de Tarifas', 'esperando_cliente', '00000000-0000-4000-8000-0000000000d2'::uuid, true,
  'Coordenadas de la terminal, línea ferroviaria y datos de Finanzas para el modelo.', DATE '2026-09-01'),
 ('00000000-0000-4000-8000-000000000203'::uuid, '00000000-0000-4000-8000-0000000000c3'::uuid, '00000000-0000-4000-8000-0000000000e3'::uuid, '00000000-0000-4000-8000-0000000000f3'::uuid,
  'programa_contingencias', 'completo', 'esperando_cliente', NULL::uuid, false,
  'Copias certificadas de acta y poder; DC-3 de brigadas 2024-2026.', DATE '2026-10-27'),
 ('00000000-0000-4000-8000-000000000204'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, '00000000-0000-4000-8000-0000000000e4'::uuid, NULL::uuid,
  'registro_tarifas', 'Contingencias + Tarifas', 'comercial', '00000000-0000-4000-8000-0000000000d3'::uuid, false,
  'Preguntar estatus de la OC y ofrecer iniciar la integración documental.', DATE '2026-10-15'),
 ('00000000-0000-4000-8000-000000000205'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, '00000000-0000-4000-8000-0000000000e5'::uuid, NULL::uuid,
  'registro_tarifas', 'Contingencias + Tarifas (propuesta: contingencias $138,500; tarifas $101,450)', 'comercial', NULL::uuid, false,
  'Esperar a que el cliente obtenga el permiso.', DATE '2026-10-15')
) AS x(id, cli, ter, per, tram, alc, est, con, piloto, sig, ab);

-- Requisitos copiados del catálogo de la versión con que se abrió cada expediente
INSERT INTO expediente_requisitos (despacho_id, expediente_id, requisito_catalogo_id, seccion, nombre, responsable, orden)
SELECT e.despacho_id, e.id, r.id, r.seccion, r.nombre, r.responsable, r.orden
FROM expedientes e JOIN requisitos_catalogo r ON r.tramite_version_id = e.tramite_version_id
WHERE e.estado <> 'comercial';

-- Estados reales al 5 nov 2026 (KERI: 3 de 8 aprobados, 2 con observación)
UPDATE expediente_requisitos er SET estado = s.estado, nota = s.nota,
  aprobado_por = CASE WHEN s.estado = 'aprobado' THEN '00000000-0000-4000-8000-0000000000a2'::uuid END,
  aprobado_en  = CASE WHEN s.estado = 'aprobado' THEN now() END
FROM (VALUES
  ('00000000-0000-4000-8000-000000000201'::uuid, 'Estudio de Pérdida Máxima Probable', 'aprobado', 'Límite de RC: USD 1,116,905'),
  ('00000000-0000-4000-8000-000000000201'::uuid, 'Póliza de Responsabilidad Civil', 'observacion', 'Domicilio y giro deben quedar igual que en el permiso'),
  ('00000000-0000-4000-8000-000000000201'::uuid, 'Póliza de desastres naturales e incendio', 'observacion', 'Misma corrección de domicilio y giro'),
  ('00000000-0000-4000-8000-000000000201'::uuid, 'Registro de Tarifas', 'aprobado', 'Resolución de la autoridad'),
  ('00000000-0000-4000-8000-000000000201'::uuid, 'Programa de Contingencias', 'aprobado', 'Acuerdo ATTRAPI/UVSR/DSF/069/2026'),
  ('00000000-0000-4000-8000-000000000201'::uuid, 'Bases de Coordinación', 'en_revision', 'Strateggia lo integra en hojas membretadas'),
  ('00000000-0000-4000-8000-000000000201'::uuid, 'Relación comercial con el concesionario', 'en_revision', 'Documento con Ferromex'),
  ('00000000-0000-4000-8000-000000000201'::uuid, 'Pago de derechos de verificación', 'pendiente', 'Pendiente de pago. Hoja de ayuda ya recibida'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Formato ATTRAPI-03-005', 'en_integracion', 'Se llena con los datos confirmados'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Anexo 1 - Catálogo de Servicios Diversos', 'revision_cliente', 'Solo pesos; ferrotolva cambiado a carrotanque'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Anexo 2 - Reglas de aplicación', 'revision_cliente', 'Texto en azul: cuándo aplica cada concepto'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Anexo 3 - Datos del permiso', 'parcial', 'Domicilio textual del permiso; coordenadas por confirmar'),
  ('00000000-0000-4000-8000-000000000202'::uuid, '4 vértices con datum', 'pendiente', 'Tabla de coordenadas enviada en Excel'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Línea ferroviaria y kilómetros', 'por_confirmar', '¿Línea Industrial Atitalaquia?'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Planos aprobados', 'recibido', 'Oficio ATTRAPI/1.4.-509/2026'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Página web de publicación', 'recibido', 'www.bulkmatic.com.mx'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Escritura constitutiva (objeto ferroviario)', 'recibido', 'Escritura 3,485; falta copia de la reforma de 2021'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Poder del firmante', 'recibido', 'Escritura 34,201. Firma Carlos Gómez como representante legal'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Identificación del firmante', 'recibido', 'INE'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Modelo matemático / financiero', 'pendiente', 'Celdas amarillas de la plantilla (Finanzas)'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Estudio especializado y comparativo', 'por_elaborar', 'Contra referencias autorizadas'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Estados financieros del último ejercicio', 'pendiente', 'Estados financieros 2025 con proyección firmada'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Hoja de ayuda DPA y pago de derechos', 'por_elaborar', 'Al final, antes del ingreso'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'Firma e ingreso ante ATTRAPI', 'por_elaborar', 'Tras validación previa con la autoridad'),
  ('00000000-0000-4000-8000-000000000203'::uuid, 'Programa de Contingencias', 'en_integracion', 'Repite 6 de 8 observaciones del Acuerdo ARTF 528/2022: atenderlas'),
  ('00000000-0000-4000-8000-000000000203'::uuid, 'Atlas de riesgos', 'por_elaborar', 'Sección vacía en el borrador 2026'),
  ('00000000-0000-4000-8000-000000000203'::uuid, 'Copias certificadas de acta y poder', 'pendiente', NULL),
  ('00000000-0000-4000-8000-000000000203'::uuid, 'Constancias DC-3 de brigadas vigentes', 'pendiente', 'DC-3 de brigadas 2024-2026'),
  ('00000000-0000-4000-8000-000000000203'::uuid, 'Registro de protección civil estatal', 'recibido', 'Vence 27 abr 2027')
) AS s(exp, nombre, estado, nota)
WHERE er.expediente_id = s.exp AND er.nombre = s.nombre;

-- ---------- Mensajes ----------
INSERT INTO mensajes (despacho_id, expediente_id, canal, direccion, autor_tipo, autor_id, autor_nombre, texto, creado_en) VALUES
('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 'portal', 'saliente', 'usuario', '00000000-0000-4000-8000-0000000000a2', 'Mayela Romero',
 'La ATTRAPI revisó las pólizas: PML y endosos están bien. Pide que el domicilio quede textual como en el permiso; ya lo solicitamos a Berkley.', TIMESTAMPTZ '2026-11-04 18:40-06'),
('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 'portal', 'saliente', 'ia', NULL, 'Marce',
 'Recordatorio: faltan 27 días para el 2 de diciembre. Queda pendiente el comprobante del pago de derechos.', TIMESTAMPTZ '2026-11-05 08:00-06'),
('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 'portal', 'entrante', 'cliente', '00000000-0000-4000-8000-0000000000a3', 'Omar Abarca Torres',
 'Gracias, hoy realizamos el pago.', TIMESTAMPTZ '2026-11-05 09:12-06');

-- ---------- Acciones esperando aprobación (del piloto automático) ----------
SELECT set_config('app.actor', 'ia', true);
INSERT INTO acciones (despacho_id, expediente_id, tipo, canal, destinatario, asunto, borrador, propuesta_por) VALUES
('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 'correo', 'correo', 'Berkley (aseguradora)',
 'Corrección de domicilio y giro — pólizas RC y daños, Energéticos Keri',
 'Buen día. Por indicación de la ATTRAPI, les pedimos que el domicilio en ambas pólizas (RC y daños) quede textual como en el permiso ATTRAPI-04-010-B/0056, en el mismo orden, y con el mismo giro en las dos. Adjuntamos copia del permiso. Gracias.', 'ia'),
('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', 'whatsapp', 'whatsapp', 'Lic. Carlos Gómez',
 NULL, 'Buen día, Lic. Gómez. Para cerrar el Anexo 3 nos faltan: los 4 vértices de coordenadas con datum, el nombre exacto de la línea ferroviaria y los datos de Finanzas para el modelo. ¿Nos los puede compartir esta semana? Gracias.', 'ia');
SELECT set_config('app.actor', 'usuario', true);

-- ---------- Cobro (solo registro de hitos; la factura vive fuera del sistema) ----------
INSERT INTO hitos_cobro (despacho_id, expediente_id, descripcion, porcentaje, folio_factura, estatus, actualizado_por) VALUES
('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', 'Anticipo 50%', 50, 'F-10', 'pago_por_confirmar', '00000000-0000-4000-8000-0000000000a2'),
('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204', 'Orden de compra', NULL, NULL, 'oc_pendiente', '00000000-0000-4000-8000-0000000000a2');
