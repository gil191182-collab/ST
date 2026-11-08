-- Datos estructurados de una acción (p. ej. las variables de la plantilla de WhatsApp).
ALTER TABLE acciones ADD COLUMN datos jsonb NOT NULL DEFAULT '{}'::jsonb;
