// Ficha de la app instalable (PWA). Toma nombre y colores del despacho del subdominio.
import { headers } from 'next/headers';

const API = process.env.API_INTERNA ?? 'http://localhost:3101';

export default async function manifest() {
  let despacho = 'Strateggia Logistics';
  let fondo = '#1B2440';
  try {
    const h = await headers();
    const r = await fetch(`${API}/api/tema`, {
      headers: { 'x-forwarded-host': h.get('x-forwarded-host') ?? h.get('host') ?? '' },
      cache: 'no-store',
    });
    if (r.ok) {
      const t = await r.json();
      despacho = t.despacho ?? despacho;
      fondo = t.tema?.fondo ?? fondo;
    }
  } catch { /* se usan los valores por defecto */ }

  return {
    name: despacho,
    short_name: despacho.replace(/\s+Logistics$/i, '') || despacho,
    description: 'Trámites ferroviarios ante la ATTRAPI',
    lang: 'es-MX',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: fondo,
    theme_color: fondo,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
