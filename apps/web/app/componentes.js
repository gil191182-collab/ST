'use client';
import Link from 'next/link';
import { api } from '../lib/api';

export function Encabezado({ despacho, subtitulo, usuario, enlaces = [] }) {
  async function salir() {
    await api('/api/sesion', { metodo: 'DELETE' }).catch(() => {});
    location.href = '/entrar';
  }
  return (
    <header className="bg-marca-fondo text-marca-texto-fondo">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-marca-acento font-bold text-marca-fondo">
            {(despacho ?? 'S').slice(0, 1)}
          </span>
          <span className="leading-tight">
            <span className="block font-semibold">{despacho}</span>
            {subtitulo && <span className="block text-xs opacity-80">{subtitulo}</span>}
          </span>
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          {enlaces.map(e => <Link key={e.href} href={e.href} className="opacity-90 hover:opacity-100 hover:underline">{e.texto}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {usuario && <span className="opacity-90">{usuario}</span>}
          <button onClick={salir} className="rounded-md border border-white/30 px-3 py-1 hover:bg-white/10">Salir</button>
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
