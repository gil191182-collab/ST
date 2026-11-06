-- Permisos del rol con el que se conecta la aplicación (API, worker, Marce).
-- No puede borrar, ni vaciar tablas, ni saltarse el aislamiento por despacho,
-- ni editar el catálogo ni la bitácora. Esto implementa en la base lo que
-- CLAUDE.md dice de Marce: "no puede borrar datos ni apagar la bitácora".

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM logistics_app;
GRANT USAGE ON SCHEMA public TO logistics_app;

GRANT SELECT, INSERT, UPDATE ON
  despachos, usuarios, clientes, contactos, terminales, permisos, prorrogas,
  expedientes, antecedentes_externos, expediente_requisitos, documentos,
  plantillas_referencia, mensajes, plazos, acciones, hitos_cobro
TO logistics_app;

-- Catálogo: solo lectura para la aplicación (se cambia con migraciones revisadas).
GRANT SELECT ON tramites, tramite_versiones, requisitos_catalogo, textos_catalogo TO logistics_app;

-- Bitácora: solo leer y agregar.
GRANT SELECT, INSERT ON bitacora TO logistics_app;

GRANT EXECUTE ON FUNCTION despacho_por_subdominio(text), despachos_activos(),
  despacho_actual(), usuario_actual(), actor_actual() TO logistics_app;

-- Por si alguien lo intenta: el rol de la app nunca tiene BYPASSRLS.
ALTER ROLE logistics_app NOBYPASSRLS NOSUPERUSER NOCREATEROLE NOCREATEDB;
