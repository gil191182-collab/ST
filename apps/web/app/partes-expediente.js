'use client';
import { useState } from 'react';
import { api, fechaHora } from '../lib/api';
import { Tarjeta, Aviso } from './componentes';

export function Documentos({ e, alCambiar }) {
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  async function subir(ev) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    if (!f.get('archivo')?.size) return;
    setSubiendo(true); setError('');
    try { await api(`/api/expedientes/${e.id}/documentos`, { metodo: 'POST', formulario: f }); ev.target.reset(); alCambiar(); }
    catch (err) { setError(err.message); } finally { setSubiendo(false); }
  }
  async function abrir(d) {
    try { const { url } = await api(`/api/documentos/${d.id}/url`); window.open(url, '_blank', 'noopener'); }
    catch (err) { setError(err.message); }
  }
  return (
    <Tarjeta titulo="Documentos">
      <Aviso>{error}</Aviso>
      <form onSubmit={subir} className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <select name="requisito_id" className="rounded-md border border-slate-300 px-2 py-1.5" aria-label="Requisito">
          <option value="">Sin requisito</option>
          {e.requisitos.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <input type="file" name="archivo" className="text-sm" aria-label="Archivo" />
        <button disabled={subiendo} className="boton-accion rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60">{subiendo ? 'Subiendo…' : 'Subir'}</button>
      </form>
      <ul className="divide-y divide-slate-100 text-sm">
        {e.documentos.map(d => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{d.nombre}</span>
            {d.disponible ? <button onClick={() => abrir(d)} className="text-xs text-marca-acento-texto underline">Ver</button> : <span className="text-xs text-slate-500">Por subir</span>}
          </li>
        ))}
        {!e.documentos.length && <li className="text-slate-500">Aún no hay documentos.</li>}
      </ul>
    </Tarjeta>
  );
}

export function Mensajes({ e, alCambiar, esCliente = false }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  async function enviar(ev) {
    ev.preventDefault();
    if (!texto.trim()) return;
    try { await api(`/api/expedientes/${e.id}/mensajes`, { metodo: 'POST', datos: { texto } }); setTexto(''); alCambiar(); }
    catch (err) { setError(err.message); }
  }
  return (
    <Tarjeta titulo="Mensajes" accion={<span className="text-xs text-slate-500">También por WhatsApp</span>}>
      <Aviso>{error}</Aviso>
      <ul className="mb-3 max-h-96 space-y-2 overflow-y-auto text-sm">
        {e.mensajes.map(m => {
          const mio = esCliente ? m.autor_tipo === 'cliente' : m.autor_tipo !== 'cliente';
          return (
            <li key={m.id} className={`max-w-[85%] rounded-lg p-2 ${mio ? 'ml-auto bg-slate-100' : 'bg-amber-50'} ${m.canal === 'interno' ? 'ring-1 ring-dashed ring-slate-300' : ''}`}>
              <div className="text-xs text-slate-500">{m.autor_nombre ?? m.autor_tipo} · {fechaHora(m.creado_en)}{m.canal === 'interno' ? ' · interno' : ''}</div>
              <p className="whitespace-pre-line">{m.texto}</p>
            </li>
          );
        })}
      </ul>
      <form onSubmit={enviar} className="flex gap-2">
        <input value={texto} onChange={ev => setTexto(ev.target.value)} placeholder="Escriba un mensaje…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Mensaje" />
        <button className="boton-accion rounded-lg px-4 py-2 text-sm font-medium">Enviar</button>
      </form>
    </Tarjeta>
  );
}
