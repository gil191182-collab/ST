'use client';
import { useState } from 'react';
import { api, fechaHora } from '../lib/api';
import { Tarjeta, Aviso } from './componentes';

const COLOR_RES = { OK: 'text-emerald-700', REVISAR: 'text-amber-800', FALTA: 'text-red-700', FALLA: 'text-red-700' };

export function Documentos({ e, alCambiar, consultor = false }) {
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [trabajando, setTrabajando] = useState(null);
  const [plantilla, setPlantilla] = useState(null);
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
  async function hacer(d, ruta, datos) {
    setError(''); setTrabajando(d.id + ruta);
    try { const r = await api(`/api/documentos/${d.id}/${ruta}`, { metodo: 'POST', datos: datos ?? {} }); await alCambiar(); return r; }
    catch (err) { setError(err.message); } finally { setTrabajando(null); }
  }
  async function borradorPlantilla(d) {
    setError('');
    try { const r = await api('/api/plantillas/borrador', { metodo: 'POST', datos: { documento_id: d.id } }); setPlantilla({ documento_id: d.id, nombre: d.nombre, ...r }); }
    catch (err) { setError(err.message); }
  }
  async function guardarPlantilla(ev) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    try {
      await api('/api/plantillas', { metodo: 'POST', datos: { documento_id: plantilla.documento_id, nombre: f.get('nombre'), tramite_clave: plantilla.tramite_clave ?? e.tramite_clave, contenido_anonimo: f.get('contenido') } });
      setPlantilla(null); setError('');
    } catch (err) { setError(err.message); }
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
      {plantilla && (
        <form onSubmit={guardarPlantilla} className="mb-4 space-y-2 rounded-lg bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
          <p className="font-medium">Plantilla anónima desde «{plantilla.nombre}»</p>
          <p className="text-xs text-amber-900">{plantilla.nota}</p>
          <input name="nombre" required minLength={3} placeholder="Nombre de la plantilla" className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
          <textarea name="contenido" defaultValue={plantilla.contenido_anonimo} rows={10} className="w-full rounded-md border border-slate-300 p-2 text-xs" aria-label="Texto anónimo" />
          <div className="flex gap-2">
            <button className="boton-accion rounded-md px-3 py-1.5 text-xs font-medium">Revisé que no tiene datos del cliente: guardar</button>
            <button type="button" onClick={() => setPlantilla(null)} className="rounded-md px-3 py-1.5 text-xs ring-1 ring-slate-300">Cancelar</button>
          </div>
        </form>
      )}
      <ul className="divide-y divide-slate-100 text-sm">
        {e.documentos.map(d => (
          <li key={d.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {d.nombre}
                {d.origen === 'generado' && <span className="ml-2 text-xs text-slate-500">(generado)</span>}
                {d.referencia_autorizada && <span className="ml-2 text-xs text-emerald-700">✔ aprobado por la autoridad</span>}
                {consultor && d.disponible && !d.con_texto && <span className="ml-2 text-xs text-amber-800">sin texto legible</span>}
              </span>
              <span className="flex flex-wrap gap-3 text-xs">
                {d.disponible ? <button onClick={() => abrir(d)} className="text-marca-acento-texto underline">Ver</button> : <span className="text-slate-500">Por subir</span>}
                {consultor && d.disponible && <>
                  <button onClick={() => hacer(d, 'revisar')} disabled={trabajando} className="text-marca-acento-texto underline">Revisar con reglas</button>
                  <button onClick={() => hacer(d, 'revisar-con-marce')} disabled={trabajando} className="text-marca-acento-texto underline">{trabajando === d.id + 'revisar-con-marce' ? 'Marce revisando…' : 'Pre-revisión de Marce'}</button>
                  <button onClick={() => hacer(d, 'referencia-autorizada', { valor: !d.referencia_autorizada })} className="text-slate-600 underline">{d.referencia_autorizada ? 'Quitar «aprobado»' : 'Aprobado por la autoridad'}</button>
                  {d.referencia_autorizada && <button onClick={() => borradorPlantilla(d)} className="text-slate-600 underline">Crear plantilla</button>}
                </>}
              </span>
            </div>
            {consultor && d.revision && (
              <ul className="mt-2 space-y-0.5 rounded-lg bg-slate-50 p-2 text-xs">
                <li className="text-slate-500">Propuestas · un consultor confirma cada resultado</li>
                {(d.revision.reglas?.resultados ?? []).map((x, i) => <li key={'r' + i}><b className={COLOR_RES[x.resultado]}>{x.resultado}</b> {x.mensaje}</li>)}
                {d.revision.marce && <li className="pt-1"><b>Marce:</b> {d.revision.marce.resumen}</li>}
                {(d.revision.marce?.observaciones ?? []).map((x, i) => <li key={'m' + i}><b className={COLOR_RES[x.nivel]}>{x.nivel}</b> {x.mensaje}</li>)}
              </ul>
            )}
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
