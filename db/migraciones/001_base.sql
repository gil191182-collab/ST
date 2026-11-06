-- =====================================================================
-- Strateggia Logistics — esquema base
-- Reglas que viven AQUÍ (en la base) y no en el código:
--   1. Aislamiento por despacho con Row Level Security (RLS).
--   2. Nunca se borra: DELETE y TRUNCATE prohibidos; se archiva.
--   3. Nada se marca como aprobado/cumplido sin una persona.
--   4. Cadena de trámites: no se abre un trámite si falta el anterior.
--   5. Bitácora de solo escritura: no se edita ni se borra.
-- La aplicación se conecta con el rol "logistics_app", que NO puede
-- saltarse RLS. Cada petición fija app.despacho_id y app.usuario_id.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Funciones de contexto ----------------------------------
CREATE OR REPLACE FUNCTION despacho_actual() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.despacho_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION usuario_actual() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.usuario_id', true), '')::uuid
$$;

-- 'usuario' (persona), 'ia' (Marce) o 'sistema' (trabajos automáticos)
CREATE OR REPLACE FUNCTION actor_actual() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.actor', true), ''), 'sistema')
$$;

-- ---------- Nunca se borra -----------------------------------------
CREATE OR REPLACE FUNCTION prohibir_borrado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'NUNCA_SE_BORRA: en % no se borra; se archiva (archivado_en).', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END $$;

-- =====================================================================
-- DESPACHOS (inquilinos)
-- =====================================================================
CREATE TABLE despachos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL,
  subdominio    text NOT NULL UNIQUE,          -- strateggia → strateggia.logistics.strateggia.mx
  tema          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {fondo, acento, accion, tipografia, logo}
  lema          text,
  correo_notificaciones text,
  whatsapp_numero text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  archivado_en  timestamptz
);

CREATE TABLE usuarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id   uuid NOT NULL REFERENCES despachos(id),
  nombre        text NOT NULL,
  correo        text NOT NULL,
  telefono      text,
  rol           text NOT NULL CHECK (rol IN ('director','consultor','cliente')),
  cliente_id    uuid,                          -- solo para rol cliente
  clave_hash    text,                          -- scrypt; null = aún no define contraseña
  creado_en     timestamptz NOT NULL DEFAULT now(),
  archivado_en  timestamptz,
  UNIQUE (despacho_id, correo)
);

CREATE TABLE clientes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id   uuid NOT NULL REFERENCES despachos(id),
  razon_social  text NOT NULL,
  nombre_corto  text NOT NULL,
  rfc           text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  archivado_en  timestamptz
);
ALTER TABLE usuarios ADD CONSTRAINT usuarios_cliente_fk FOREIGN KEY (cliente_id) REFERENCES clientes(id);
ALTER TABLE usuarios ADD CONSTRAINT usuarios_cliente_rol CHECK ((rol = 'cliente') = (cliente_id IS NOT NULL));

CREATE TABLE contactos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id   uuid NOT NULL REFERENCES despachos(id),
  cliente_id    uuid NOT NULL REFERENCES clientes(id),
  nombre        text NOT NULL,
  cargo         text,
  correo        text,
  telefono      text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  archivado_en  timestamptz
);

-- Terminal = el sitio físico. La cadena de trámites se sigue por terminal.
CREATE TABLE terminales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id   uuid NOT NULL REFERENCES despachos(id),
  cliente_id    uuid NOT NULL REFERENCES clientes(id),
  nombre        text NOT NULL,                 -- "Cosío, Ags."
  municipio     text,
  estado        text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  archivado_en  timestamptz
);

-- =====================================================================
-- CATÁLOGO (compartido por todos los despachos, versionado)
-- =====================================================================
CREATE TABLE tramites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave         text NOT NULL UNIQUE,          -- 'proyecto_ejecutivo', 'permiso', 'inicio_operaciones', ...
  nombre        text NOT NULL,
  etapa         int  NOT NULL CHECK (etapa BETWEEN 1 AND 4), -- 1 PE, 2 Permiso, 3 Inicio, 4 Periódicas
  requiere_clave text REFERENCES tramites(clave), -- trámite anterior en la cadena
  periodicidad_meses int,                      -- null = no periódico
  descripcion   text
);

CREATE TABLE tramite_versiones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id            uuid NOT NULL REFERENCES tramites(id),
  homoclave_actual      text,                  -- ATTRAPI-xx (null = por confirmar)
  homoclaves_anteriores text[] NOT NULL DEFAULT '{}', -- ARTF-xx
  vigente_desde         date NOT NULL,
  vigente_hasta         date,
  fuente                text,                  -- de dónde sale (DOF, ficha CONAMER, oficio...)
  por_confirmar         boolean NOT NULL DEFAULT false,
  CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);

CREATE TABLE requisitos_catalogo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_version_id  uuid NOT NULL REFERENCES tramite_versiones(id),
  clave               text NOT NULL,
  seccion             text,                    -- "Formato y anexos", "Datos de la terminal", ...
  nombre              text NOT NULL,
  responsable         text NOT NULL DEFAULT 'despacho' CHECK (responsable IN ('despacho','cliente','ambos','autoridad')),
  ayuda               text,
  orden               int NOT NULL DEFAULT 0,
  vigente_desde       date NOT NULL,
  vigente_hasta       date,
  UNIQUE (tramite_version_id, clave)
);

-- Textos que se comparan palabra por palabra (endosos de pólizas, etc.)
CREATE TABLE textos_catalogo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave          text NOT NULL,
  descripcion    text,
  texto          text NOT NULL,
  vigente_desde  date NOT NULL,
  vigente_hasta  date,
  por_confirmar  boolean NOT NULL DEFAULT false
);

-- =====================================================================
-- PERMISOS, EXPEDIENTES Y REQUISITOS
-- =====================================================================
CREATE TABLE permisos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id        uuid NOT NULL REFERENCES despachos(id),
  terminal_id        uuid NOT NULL REFERENCES terminales(id),
  numero             text NOT NULL,            -- ATTRAPI-04-010-B/0056
  tipo               text NOT NULL CHECK (tipo IN ('04-010-A','04-010-B')),
  servicio           text NOT NULL,            -- "Transbordo y Transvase de Líquidos"
  domicilio_textual  text NOT NULL,            -- idéntico al permiso, mismo orden, con km y línea
  fecha_otorgamiento date,                     -- null = aún no capturada (no se calculan plazos)
  vigencia_hasta     date,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  archivado_en       timestamptz,
  UNIQUE (despacho_id, numero)
);

CREATE TABLE prorrogas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id              uuid NOT NULL REFERENCES despachos(id),
  permiso_id               uuid NOT NULL REFERENCES permisos(id),
  concepto                 text NOT NULL DEFAULT 'inicio_operaciones',
  nueva_fecha              date NOT NULL,
  oficio                   text,
  admite_otra_prorroga     boolean NOT NULL DEFAULT false,
  registrado_por           uuid NOT NULL REFERENCES usuarios(id),
  creado_en                timestamptz NOT NULL DEFAULT now(),
  archivado_en             timestamptz
);

CREATE TABLE expedientes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id         uuid NOT NULL REFERENCES despachos(id),
  cliente_id          uuid NOT NULL REFERENCES clientes(id),
  terminal_id         uuid NOT NULL REFERENCES terminales(id),
  permiso_id          uuid REFERENCES permisos(id),
  tramite_version_id  uuid NOT NULL REFERENCES tramite_versiones(id), -- versión con la que se abrió: no cambia
  alcance             text NOT NULL DEFAULT 'completo', -- 'completo' o descripción de la parte contratada
  estado              text NOT NULL DEFAULT 'en_integracion'
                      CHECK (estado IN ('comercial','en_integracion','esperando_cliente','en_revision_autoridad',
                                        'con_observaciones','concluido','suspendido')),
  resultado           text,                    -- oficio/acuerdo que lo resolvió
  resultado_documento_id uuid,
  consultor_id        uuid REFERENCES usuarios(id),
  contacto_id         uuid REFERENCES contactos(id),
  piloto_automatico   boolean NOT NULL DEFAULT false,
  siguiente_paso      text,
  abierto_en          date NOT NULL DEFAULT current_date,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  archivado_en        timestamptz
);

-- "Ya existe fuera del sistema": rompe la cadena solo con documento y persona.
CREATE TABLE antecedentes_externos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id    uuid NOT NULL REFERENCES despachos(id),
  terminal_id    uuid NOT NULL REFERENCES terminales(id),
  tramite_clave  text NOT NULL REFERENCES tramites(clave),
  documento_id   uuid NOT NULL,                -- obligatorio
  descripcion    text NOT NULL,                -- "Permiso ATTRAPI-04-010-B/0056 del 23 feb 2026"
  marcado_por    uuid NOT NULL REFERENCES usuarios(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  archivado_en   timestamptz
);

CREATE TABLE expediente_requisitos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id            uuid NOT NULL REFERENCES despachos(id),
  expediente_id          uuid NOT NULL REFERENCES expedientes(id),
  requisito_catalogo_id  uuid REFERENCES requisitos_catalogo(id),
  seccion                text,
  nombre                 text NOT NULL,
  responsable            text NOT NULL DEFAULT 'despacho' CHECK (responsable IN ('despacho','cliente','ambos','autoridad')),
  estado                 text NOT NULL DEFAULT 'pendiente'
                         CHECK (estado IN ('pendiente','por_elaborar','en_integracion','parcial','recibido',
                                           'revision_cliente','en_revision','observacion','por_confirmar','aprobado')),
  nota                   text,
  propuesta_ia           jsonb,                -- lo que Marce sugiere; nunca cambia el estado por sí solo
  aprobado_por           uuid REFERENCES usuarios(id),
  aprobado_en            timestamptz,
  orden                  int NOT NULL DEFAULT 0,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_en         timestamptz NOT NULL DEFAULT now(),
  archivado_en           timestamptz,
  -- Nada se marca como cumplido sin una persona:
  CONSTRAINT aprobado_requiere_persona CHECK (
    (estado = 'aprobado') = (aprobado_por IS NOT NULL AND aprobado_en IS NOT NULL)
  )
);

CREATE TABLE documentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id      uuid NOT NULL REFERENCES despachos(id),
  expediente_id    uuid REFERENCES expedientes(id),
  requisito_id     uuid REFERENCES expediente_requisitos(id),
  nombre           text NOT NULL,
  tipo_mime        text,
  tamano_bytes     bigint,
  sha256           text,
  ruta_cifrada     text,                       -- ruta en disco del archivo cifrado; null = pendiente de subir
  version          int NOT NULL DEFAULT 1,
  reemplaza_a      uuid REFERENCES documentos(id),
  referencia_autorizada boolean NOT NULL DEFAULT false, -- aprobado por la autoridad; reutilizable anónimo
  subido_por       uuid REFERENCES usuarios(id),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  archivado_en     timestamptz
);
ALTER TABLE antecedentes_externos ADD CONSTRAINT antecedentes_documento_fk FOREIGN KEY (documento_id) REFERENCES documentos(id);
ALTER TABLE expedientes ADD CONSTRAINT expedientes_resultado_doc_fk FOREIGN KEY (resultado_documento_id) REFERENCES documentos(id);

-- Plantillas anónimas sacadas de referencias autorizadas (sin nombre ni datos del cliente)
CREATE TABLE plantillas_referencia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id     uuid NOT NULL REFERENCES despachos(id),
  tramite_clave   text NOT NULL REFERENCES tramites(clave),
  nombre          text NOT NULL,
  contenido_anonimo text NOT NULL,
  origen_documento_id uuid REFERENCES documentos(id), -- solo interno; nunca se muestra
  revisada_por    uuid NOT NULL REFERENCES usuarios(id), -- una persona confirmó que no quedan datos
  creado_en       timestamptz NOT NULL DEFAULT now(),
  archivado_en    timestamptz
);

CREATE TABLE mensajes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id    uuid NOT NULL REFERENCES despachos(id),
  expediente_id  uuid REFERENCES expedientes(id),
  canal          text NOT NULL CHECK (canal IN ('portal','whatsapp','correo','interno')),
  direccion      text NOT NULL CHECK (direccion IN ('entrante','saliente','interno')),
  autor_tipo     text NOT NULL CHECK (autor_tipo IN ('usuario','cliente','ia','sistema','externo')),
  autor_id       uuid REFERENCES usuarios(id),
  autor_nombre   text,
  texto          text NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  archivado_en   timestamptz
);

-- Plazos calculados (se recalculan; los anteriores se archivan, no se borran)
CREATE TABLE plazos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id    uuid NOT NULL REFERENCES despachos(id),
  permiso_id     uuid REFERENCES permisos(id),
  expediente_id  uuid REFERENCES expedientes(id),
  tipo           text NOT NULL,                -- 'inicio_operaciones', 'contingencias', 'polizas', ...
  fecha          date NOT NULL,
  descripcion    text NOT NULL,
  regla          text NOT NULL,                -- explicación legible del cálculo
  definitivo     boolean NOT NULL DEFAULT false, -- sin más prórroga
  creado_en      timestamptz NOT NULL DEFAULT now(),
  archivado_en   timestamptz
);

-- Acciones que el sistema PREPARA y una persona APRUEBA.
CREATE TABLE acciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id     uuid NOT NULL REFERENCES despachos(id),
  expediente_id   uuid REFERENCES expedientes(id),
  tipo            text NOT NULL CHECK (tipo IN (
                     'recordatorio','correo','whatsapp','alerta_interna',
                     -- Estas cuatro NUNCA las ejecuta el sistema; solo se preparan:
                     'ingreso_autoridad','firma','escrito_oficial','registro_cobro')),
  canal           text CHECK (canal IN ('whatsapp','correo','portal','interno')),
  destinatario    text,
  asunto          text,
  borrador        text NOT NULL,
  programada_para timestamptz,
  estado          text NOT NULL DEFAULT 'propuesta'
                  CHECK (estado IN ('propuesta','aprobada','enviada','rechazada','hecha_por_persona','fallida')),
  propuesta_por   text NOT NULL CHECK (propuesta_por IN ('ia','sistema','usuario')),
  aprobada_por    uuid REFERENCES usuarios(id),
  aprobada_en     timestamptz,
  ejecutada_en    timestamptz,
  ejecutada_por   uuid REFERENCES usuarios(id),
  error           text,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  archivado_en    timestamptz,
  CONSTRAINT accion_aprobada_por_persona CHECK (
    estado IN ('propuesta','rechazada') OR (aprobada_por IS NOT NULL AND aprobada_en IS NOT NULL)
  ),
  -- Ingresar, firmar, escritos oficiales y cobros: el sistema nunca los "envía"; una persona los hace.
  CONSTRAINT acciones_solo_humanas CHECK (
    tipo NOT IN ('ingreso_autoridad','firma','escrito_oficial','registro_cobro')
    OR estado IN ('propuesta','aprobada','rechazada','hecha_por_persona')
  ),
  CONSTRAINT hecha_por_persona_requiere_persona CHECK (
    estado <> 'hecha_por_persona' OR ejecutada_por IS NOT NULL
  )
);

-- Facturación fuera del sistema: aquí solo hitos, OC, folio y estatus.
CREATE TABLE hitos_cobro (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despacho_id    uuid NOT NULL REFERENCES despachos(id),
  expediente_id  uuid NOT NULL REFERENCES expedientes(id),
  descripcion    text NOT NULL,                -- "Anticipo 50%"
  porcentaje     numeric(5,2),
  orden_compra   text,
  folio_factura  text,
  estatus        text NOT NULL DEFAULT 'pendiente'
                 CHECK (estatus IN ('pendiente','oc_pendiente','facturado','pago_por_confirmar','pagado')),
  actualizado_por uuid REFERENCES usuarios(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  archivado_en   timestamptz
);

-- =====================================================================
-- BITÁCORA (solo se agrega; nunca se edita ni se borra)
-- =====================================================================
CREATE TABLE bitacora (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  despacho_id   uuid NOT NULL REFERENCES despachos(id),
  cuando        timestamptz NOT NULL DEFAULT now(),
  actor         text NOT NULL,                 -- usuario | ia | sistema
  usuario_id    uuid,                          -- quién lo pidió (si fue una persona o lo aprobó)
  accion        text NOT NULL,                 -- INSERT / UPDATE / o verbo de negocio
  tabla         text,
  registro_id   uuid,
  detalle       jsonb
);

CREATE OR REPLACE FUNCTION bitacora_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'BITACORA_INMUTABLE: la bitácora no se edita ni se borra.' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER bitacora_sin_update BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION bitacora_inmutable();
CREATE TRIGGER bitacora_sin_truncate BEFORE TRUNCATE ON bitacora
  FOR EACH STATEMENT EXECUTE FUNCTION bitacora_inmutable();

-- Registro automático en bitácora de todo cambio en tablas operativas.
CREATE OR REPLACE FUNCTION registrar_en_bitacora() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cambios jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(n.key, n.value) INTO cambios
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
    WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('actualizado_en','clave_hash');
    IF cambios IS NULL THEN RETURN NEW; END IF;
  ELSE
    cambios := to_jsonb(NEW) - 'clave_hash';
  END IF;
  INSERT INTO bitacora (despacho_id, actor, usuario_id, accion, tabla, registro_id, detalle)
  VALUES (NEW.despacho_id, actor_actual(), usuario_actual(), TG_OP, TG_TABLE_NAME, NEW.id, cambios);
  RETURN NEW;
END $$;

-- =====================================================================
-- REGLAS DE DOMINIO EN LA BASE
-- =====================================================================

-- Aprobación: solo un director o consultor del mismo despacho, y solo actor 'usuario'.
CREATE OR REPLACE FUNCTION validar_aprobacion_requisito() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  IF NEW.estado = 'aprobado' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'aprobado') THEN
    IF actor_actual() <> 'usuario' THEN
      RAISE EXCEPTION 'SOLO_PERSONAS: la IA o el sistema no pueden aprobar requisitos; un consultor debe hacerlo.'
        USING ERRCODE = 'P0001';
    END IF;
    SELECT rol INTO r FROM usuarios WHERE id = NEW.aprobado_por AND despacho_id = NEW.despacho_id AND archivado_en IS NULL;
    IF r IS NULL OR r NOT IN ('director','consultor') THEN
      RAISE EXCEPTION 'SOLO_CONSULTORES: solo un consultor o director del despacho aprueba requisitos.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.aprobado_por IS DISTINCT FROM usuario_actual() THEN
      RAISE EXCEPTION 'APROBADOR_DISTINTO: quien aprueba debe ser la persona que hace la petición.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;
CREATE TRIGGER requisitos_aprobacion BEFORE INSERT OR UPDATE ON expediente_requisitos
  FOR EACH ROW EXECUTE FUNCTION validar_aprobacion_requisito();

-- Acciones: aprobar o marcar como hecha solo lo hace una persona del despacho.
CREATE OR REPLACE FUNCTION validar_aprobacion_accion() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  IF NEW.aprobada_por IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.aprobada_por IS DISTINCT FROM NEW.aprobada_por) THEN
    IF actor_actual() <> 'usuario' OR NEW.aprobada_por IS DISTINCT FROM usuario_actual() THEN
      RAISE EXCEPTION 'SOLO_PERSONAS: una acción solo la aprueba la persona que hace la petición.' USING ERRCODE = 'P0001';
    END IF;
    SELECT rol INTO r FROM usuarios WHERE id = NEW.aprobada_por AND despacho_id = NEW.despacho_id AND archivado_en IS NULL;
    IF r IS NULL OR r NOT IN ('director','consultor') THEN
      RAISE EXCEPTION 'SOLO_CONSULTORES: solo un consultor o director aprueba acciones.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.estado = 'hecha_por_persona' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM NEW.estado) THEN
    IF actor_actual() <> 'usuario' OR NEW.ejecutada_por IS DISTINCT FROM usuario_actual() THEN
      RAISE EXCEPTION 'SOLO_PERSONAS: ingresar, firmar, escritos y cobros los registra una persona.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER acciones_aprobacion BEFORE INSERT OR UPDATE ON acciones
  FOR EACH ROW EXECUTE FUNCTION validar_aprobacion_accion();

-- Catálogo versionado: el expediente no cambia de versión una vez abierto.
CREATE OR REPLACE FUNCTION congelar_version_expediente() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tramite_version_id IS DISTINCT FROM OLD.tramite_version_id THEN
    RAISE EXCEPTION 'VERSION_CONGELADA: el expediente queda ligado a la versión del catálogo con la que se abrió.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expedientes_version_fija BEFORE UPDATE ON expedientes
  FOR EACH ROW EXECUTE FUNCTION congelar_version_expediente();

-- Cadena de trámites: no se abre si falta el resultado del anterior,
-- salvo antecedente externo con documento.
CREATE OR REPLACE FUNCTION validar_cadena_tramites() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  previo text;
  clave_actual text;
  ok boolean;
BEGIN
  SELECT t.clave, t.requiere_clave INTO clave_actual, previo
  FROM tramite_versiones v JOIN tramites t ON t.id = v.tramite_id
  WHERE v.id = NEW.tramite_version_id;

  IF previo IS NULL OR NEW.estado = 'comercial' THEN
    RETURN NEW;  -- inicio de la cadena, o aún es solo una propuesta comercial
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM expedientes e
    JOIN tramite_versiones v ON v.id = e.tramite_version_id
    JOIN tramites t ON t.id = v.tramite_id
    WHERE e.terminal_id = NEW.terminal_id AND e.despacho_id = NEW.despacho_id
      AND t.clave = previo AND e.estado = 'concluido' AND e.resultado_documento_id IS NOT NULL
      AND e.archivado_en IS NULL
  ) OR EXISTS (
    SELECT 1 FROM antecedentes_externos a
    WHERE a.terminal_id = NEW.terminal_id AND a.despacho_id = NEW.despacho_id
      AND a.tramite_clave = previo AND a.archivado_en IS NULL
  ) INTO ok;

  IF NOT ok THEN
    RAISE EXCEPTION 'CADENA_INCOMPLETA: para abrir "%" falta el resultado de "%" en esta terminal (o márquelo como ya existente fuera del sistema, con su documento).',
      clave_actual, previo USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expedientes_cadena BEFORE INSERT ON expedientes
  FOR EACH ROW EXECUTE FUNCTION validar_cadena_tramites();
CREATE TRIGGER expedientes_cadena_al_activar BEFORE UPDATE OF estado ON expedientes
  FOR EACH ROW WHEN (OLD.estado = 'comercial' AND NEW.estado <> 'comercial')
  EXECUTE FUNCTION validar_cadena_tramites();

-- =====================================================================
-- TRIGGERS GENERALES: nunca se borra + bitácora; RLS por despacho
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['despachos','usuarios','clientes','contactos','terminales','permisos','prorrogas',
                           'expedientes','antecedentes_externos','expediente_requisitos','documentos',
                           'plantillas_referencia','mensajes','plazos','acciones','hitos_cobro',
                           'tramites','tramite_versiones','requisitos_catalogo','textos_catalogo']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prohibir_borrado()', t || '_sin_borrar', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION prohibir_borrado()', t || '_sin_truncar', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['usuarios','clientes','contactos','terminales','permisos','prorrogas',
                           'expedientes','antecedentes_externos','expediente_requisitos','documentos',
                           'plantillas_referencia','mensajes','plazos','acciones','hitos_cobro']
  LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION registrar_en_bitacora()', t || '_bitacora', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY aislamiento_despacho ON %I USING (despacho_id = despacho_actual()) WITH CHECK (despacho_id = despacho_actual())', t);
  END LOOP;
END $$;

ALTER TABLE despachos ENABLE ROW LEVEL SECURITY;
ALTER TABLE despachos FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_despacho ON despachos USING (id = despacho_actual()) WITH CHECK (id = despacho_actual());

ALTER TABLE bitacora ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_despacho ON bitacora USING (despacho_id = despacho_actual()) WITH CHECK (despacho_id = despacho_actual());

-- Funciones que necesitan ver "por encima" del aislamiento, de forma acotada:
-- 1) Saber qué despacho corresponde a un subdominio (antes de iniciar sesión).
CREATE OR REPLACE FUNCTION despacho_por_subdominio(p_subdominio text)
RETURNS TABLE (id uuid, nombre text, tema jsonb, lema text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, nombre, tema, lema FROM despachos WHERE subdominio = p_subdominio AND archivado_en IS NULL
$$;
-- 2) Lista de despachos activos para el trabajador en segundo plano.
CREATE OR REPLACE FUNCTION despachos_activos() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM despachos WHERE archivado_en IS NULL
$$;

-- Índices útiles
CREATE INDEX ON expedientes (despacho_id, estado);
CREATE INDEX ON expediente_requisitos (expediente_id);
CREATE INDEX ON mensajes (expediente_id, creado_en);
CREATE INDEX ON plazos (despacho_id, fecha) WHERE archivado_en IS NULL;
CREATE INDEX ON acciones (despacho_id, estado);
CREATE INDEX ON bitacora (despacho_id, cuando);
