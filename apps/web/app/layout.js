import './globals.css';
import { headers } from 'next/headers';
import { RegistrarSW } from './registrar-sw';

const API = process.env.API_INTERNA ?? 'http://localhost:3101';

// Tema por defecto solo si la API no responde (para que la pantalla no quede en blanco).
const RESPALDO = {
  despacho: 'Strateggia Logistics', lema: 'Contigo hasta el final',
  css: "--color-fondo:#1B2440;--color-texto-fondo:#FFFFFF;--color-acento:#D68C28;--color-acento-texto:#9A5A10;--color-accion:#B35A0C;--color-texto-accion:#FFFFFF;--color-superficie:#FFFFFF;--color-texto:#1F2937;--fuente:'Poppins'",
  tema: { tipografia: 'Poppins' },
};

async function cargarTema() {
  try {
    const h = await headers();
    const r = await fetch(`${API}/api/tema`, {
      headers: { 'x-forwarded-host': h.get('x-forwarded-host') ?? h.get('host') ?? '' },
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return RESPALDO;
  }
}

export async function generateMetadata() {
  const t = await cargarTema();
  return {
    title: `${t.despacho} · Trámites ferroviarios`,
    description: t.lema,
    applicationName: t.despacho,
    // En iPhone: abrir a pantalla completa al instalarla desde "Agregar a inicio"
    appleWebApp: { capable: true, title: t.despacho, statusBarStyle: 'black-translucent' },
  };
}

export async function generateViewport() {
  const t = await cargarTema();
  return { themeColor: t.tema?.fondo ?? '#1B2440', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
}

export default async function RootLayout({ children }) {
  const t = await cargarTema();
  const estilo = Object.fromEntries(t.css.split(';').filter(Boolean).map(par => {
    const i = par.indexOf(':');
    return [par.slice(0, i), par.slice(i + 1)];
  }));
  const fuente = encodeURIComponent(t.tema?.tipografia ?? 'Poppins');
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${fuente}:wght@400;500;600;700&display=swap`} />
      </head>
      <body style={estilo} className="bg-slate-100 text-slate-800 antialiased">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
