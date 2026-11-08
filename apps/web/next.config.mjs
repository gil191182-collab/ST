// En producción Nginx manda /api y /archivos directo a la API.
// En desarrollo, Next los reenvía a la API local.
const API = process.env.API_INTERNA ?? 'http://localhost:3101';

/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    // El service worker nunca se guarda en caché, para que las actualizaciones lleguen de inmediato
    return [{ source: '/sw.js', headers: [
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
    ] }];
  },
  async rewrites() {
    return [
      { source: '/api/:ruta*', destination: `${API}/api/:ruta*` },
      { source: '/archivos/:ruta*', destination: `${API}/archivos/:ruta*` },
    ];
  },
};
