'use client';
import { useState } from 'react';
import { api } from '../lib/api';
import { Tarjeta } from './componentes';

export function ChatMarce({ expedienteId, alCambiar }) {
  const [conversacion, setConversacion] = useState([]);
  const [pregunta, setPregunta] = useState('');
  const [pensando, setPensando] = useState(false);
  async function enviar(e) {
    e.preventDefault();
    if (!pregunta.trim()) return;
    const p = pregunta;
    setConversacion(c => [...c, { quien: 'Usted', texto: p }]);
    setPregunta(''); setPensando(true);
    try {
      const r = await api('/api/marce', { metodo: 'POST', datos: { pregunta: p, ...(expedienteId ? { expediente_id: expedienteId } : {}) } });
      setConversacion(c => [...c, { quien: 'Marce', texto: r.respuesta + (r.propuestas.length ? `\n\nDejé ${r.propuestas.length} mensaje(s) en el piloto automático para su aprobación.` : '') }]);
      if (r.propuestas.length) alCambiar?.();
    } catch (err) {
      setConversacion(c => [...c, { quien: 'Marce', texto: `No pude contestar: ${err.message}` }]);
    } finally { setPensando(false); }
  }
  return (
    <Tarjeta titulo="Chat con Marce">
      <div className="mb-3 max-h-80 space-y-2 overflow-y-auto text-sm">
        {conversacion.map((m, i) => (
          <p key={i} className={`whitespace-pre-line rounded-lg p-2 ${m.quien === 'Marce' ? 'bg-slate-100' : 'bg-marca-fondo text-marca-texto-fondo'}`}>
            <b>{m.quien}:</b> {m.texto}
          </p>
        ))}
        {pensando && <p className="text-slate-500">Marce está revisando los expedientes…</p>}
        {!conversacion.length && <p className="text-slate-500">Pregúntele o pídale algo a Marce. Ej.: «¿Qué le falta a Bulkmatic para ingresar tarifas?»</p>}
      </div>
      <form onSubmit={enviar} className="flex gap-2">
        <input value={pregunta} onChange={e => setPregunta(e.target.value)} placeholder="Pregúntele o pídale algo a Marce"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Pregunta para Marce" />
        <button disabled={pensando} className="boton-accion rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">Enviar</button>
      </form>
    </Tarjeta>
  );
}
