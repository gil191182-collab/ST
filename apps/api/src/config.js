// Configuración leída de variables de entorno (.env). Nada sensible va en el código.
function requerida(env, nombre, porDefecto) {
  const v = env[nombre] ?? porDefecto;
  if (v === undefined || v === '') throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

export function cargarConfig(env = process.env) {
  const produccion = env.NODE_ENV === 'production';
  return {
    produccion,
    puerto: Number(env.API_PUERTO ?? 3101),
    databaseUrl: requerida(env, 'DATABASE_URL'),
    // Secreto para firmar sesiones y URLs de archivos (mínimo 32 caracteres)
    secreto: (() => {
      const s = env.APP_SECRETO ?? (produccion ? undefined : 'solo-desarrollo-solo-desarrollo-123456');
      if (!s || s.length < 32) throw new Error('APP_SECRETO debe tener al menos 32 caracteres');
      return s;
    })(),
    // Llave para cifrar archivos en disco: 32 bytes en base64
    llaveArchivos: (() => {
      const k = env.ARCHIVOS_LLAVE ?? (produccion ? undefined : Buffer.alloc(32, 7).toString('base64'));
      if (!k || Buffer.from(k, 'base64').length !== 32) throw new Error('ARCHIVOS_LLAVE debe ser 32 bytes en base64 (openssl rand -base64 32)');
      return Buffer.from(k, 'base64');
    })(),
    carpetaArchivos: env.ARCHIVOS_CARPETA ?? './datos/archivos',
    dominioBase: env.DOMINIO_BASE ?? 'logistics.strateggia.mx',
    despachoPorDefecto: env.DESPACHO_POR_DEFECTO ?? 'strateggia',
    anthropicModelo: env.ANTHROPIC_MODELO ?? 'claude-opus-5-5',
    marceActivo: Boolean(env.ANTHROPIC_API_KEY),
    // Ficha secreta que deben enviar WATI y el reenvío de correo a /api/entradas/*
    entradasToken: env.ENTRADAS_TOKEN ?? null,
    // Secreto del callback de wa-mcp (npm run espacio -- callback ...)
    waSecretoWebhook: env.WA_SECRETO_WEBHOOK ?? null,
  };
}
