'use client';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export function Encabezado({ despacho, subtitulo, usuario, enlaces = [], logo }) {
  async function salir() {
    await api('/api/sesion', { metodo: 'DELETE' }).catch(() => {});
    location.href = '/entrar';
  }
  return (
    <header className="bg-marca-fondo text-marca-texto-fondo">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          {logo
            ? <img src={logo} alt="" className="h-9 w-9 rounded-lg bg-white object-contain" />
            : <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-marca-acento font-bold text-marca-fondo">{(despacho ?? 'S').slice(0, 1)}</span>}
          <span className="leading-tight">
            <span className="block font-semibold">{despacho}</span>
            {subtitulo && <span className="block text-xs opacity-80">{subtitulo}</span>}
          </span>
        </Link>
        <nav className={`flex-wrap gap-4 text-sm ${enlaces.length > 2 ? 'hidden md:flex' : 'flex'}`}>
          {enlaces.map(e => <Link key={e.href} href={e.href} className="opacity-90 hover:opacity-100 hover:underline">{e.texto}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {usuario && <span className="hidden opacity-90 sm:inline">{usuario}</span>}
          <button onClick={salir} className={`rounded-md border border-white/30 px-3 py-1 hover:bg-white/10 ${enlaces.length > 2 ? 'hidden md:inline-block' : ''}`}>Salir</button>
        </div>
      </div>
    </header>
  );
}

export function Etiqueta({ clase, children }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${clase}`}>{children}</span>;
}

export function Tarjeta({ titulo, accion, children, className = '' }) {
  return (
    <section className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>
      {(titulo || accion) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

export function Barra({ valor, total }) {
  const pct = total ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={valor} aria-valuemax={total} aria-label={`${valor} de ${total}`}>
      <div className="h-full bg-marca-acento" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Aviso({ tipo = 'error', children }) {
  if (!children) return null;
  const c = tipo === 'error' ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  return <p role="status" className={`rounded-lg px-3 py-2 text-sm ring-1 ${c}`}>{children}</p>;
}

export function Cargando() {
  return <p className="p-8 text-center text-slate-500">Cargando…</p>;
}

const MENU_CONSULTOR = [
  { href: '/', texto: 'Seguimiento' },
  { href: '/clientes', texto: 'Clientes y permisos' },
  { href: '/chat', texto: 'Chat de consultores' },
  { href: '/plantillas', texto: 'Plantillas' },
  { href: '/personas', texto: 'Personas' },
  { href: '/configuracion', texto: 'Configuración' },
];

export function EncabezadoConsultor({ yo }) {
  return (
    <>
      <Encabezado despacho={yo?.despacho} subtitulo="Consultores" usuario={yo?.usuario?.nombre} enlaces={MENU_CONSULTOR} logo={yo?.logo} />
      <BarraInferior />
    </>
  );
}

// Íconos simples (trazo) para la barra inferior del celular
const ICONOS = {
  inicio: 'M3 12l9-8 9 8M5 10v10h14V10',
  clientes: 'M4 21V7l8-4 8 4v14M9 21v-6h6v6',
  chat: 'M4 5h16v11H8l-4 4z',
  mas: 'M5 12h.01M12 12h.01M19 12h.01',
};
function Icono({ d }) {
  return <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/** Barra de navegación inferior, solo en celular (como en una app). */
export function BarraInferior() {
  const [mas, setMas] = useState(false);
  const [ruta, setRuta] = useState('');
  useEffect(() => { setRuta(location.pathname); }, []);
  const activo = (href) => (href === '/' ? ruta === '/' || ruta.startsWith('/expedientes') : ruta.startsWith(href));
  const boton = 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]';
  async function salir() {
    await api('/api/sesion', { metodo: 'DELETE' }).catch(() => {});
    location.href = '/entrar';
  }
  return (
    <>
      {mas && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMas(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-24 shadow-xl" onClick={e => e.stopPropagation()}>
            {[['/plantillas', 'Plantillas'], ['/personas', 'Personas'], ['/configuracion', 'Configuración']].map(([href, t]) => (
              <Link key={href} href={href} className="block rounded-lg px-3 py-3 text-base hover:bg-slate-100">{t}</Link>
            ))}
            <button onClick={salir} className="mt-1 block w-full rounded-lg px-3 py-3 text-left text-base text-red-700 hover:bg-red-50">Salir</button>
          </div>
        </div>
      )}
      <nav className="barra-inferior fixed inset-x-0 bottom-0 z-50 flex border-t border-white/10 bg-marca-fondo text-marca-texto-fondo md:hidden" aria-label="Navegación">
        {[['/', 'Seguimiento', ICONOS.inicio], ['/clientes', 'Clientes', ICONOS.clientes], ['/chat', 'Chat', ICONOS.chat]].map(([href, t, d]) => (
          <Link key={href} href={href} className={`${boton} ${activo(href) ? 'text-marca-acento' : 'opacity-80'}`} aria-current={activo(href) ? 'page' : undefined}>
            <Icono d={d} />{t}
          </Link>
        ))}
        <button onClick={() => setMas(!mas)} className={`${boton} ${mas ? 'text-marca-acento' : 'opacity-80'}`} aria-expanded={mas}>
          <Icono d={ICONOS.mas} />Más
        </button>
      </nav>
    </>
  );
}

export function Campo({ etiqueta, ayuda, children, className = '' }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-slate-700">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-slate-500">{ayuda}</span>}
    </label>
  );
}

export const estiloEntrada = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

/** Formulario simple: junta los campos con name y llama a alEnviar(datos). */
export function Formulario({ alEnviar, textoBoton = 'Guardar', children, className = '' }) {
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function enviar(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const datos = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') datos[el.name] = el.checked;
      else if (el.type === 'number') { if (el.value !== '') datos[el.name] = Number(el.value); }
      else if (el.value !== '') datos[el.name] = el.value;
    }
    setError(''); setOk(''); setEnviando(true);
    try {
      const r = await alEnviar(datos, form);
      setOk(typeof r === 'string' ? r : 'Guardado.');
      form.reset();
    } catch (e) { setError(e.message); } finally { setEnviando(false); }
  }
  return (
    <form onSubmit={enviar} className={`space-y-3 ${className}`}>
      {children}
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      <button disabled={enviando} className="boton-accion rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">{enviando ? 'Guardando…' : textoBoton}</button>
    </form>
  );
}

/** Cargar /api/yo y una ruta de datos; redirige a clientes al portal. */
export function usarDatos(ruta) {
  const [yo, setYo] = useState(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    try {
      const y = await api('/api/yo');
      if (y.usuario.rol === 'cliente') { location.href = '/portal'; return; }
      setYo(y);
      if (ruta) setDatos(await api(ruta));
    } catch (e) { setError(e.message); }
  }, [ruta]);
  useEffect(() => { cargar(); }, [cargar]);
  return { yo, datos, error, cargar };
}
