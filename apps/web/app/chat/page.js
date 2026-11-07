'use client';
// Chat de consultores + publicaciones. Producción solo con el clic del director.
import { useState } from 'react';
import { api, fechaHora } from '../../lib/api';
import { EncabezadoConsultor, Tarjeta, Aviso, Cargando, Campo, Formulario, estiloEntrada, usarDatos, Etiqueta } from '../componentes';
import { ChatMarce } from '../chat-marce';

const ESTADO_PUB = {
  solicitada: 'bg-amber-100 text-amber-900', aprobada: 'bg-emerald-100 text-emerald-800', rechazada: 'bg-red-100 text-red-800',
  publicada: 'bg-sky-100 text-sky-800', regresada: 'bg-slate-200 text-slate-700',
};

export default function Chat() {
  const { yo, datos, error, cargar } = usarDatos('/api/chat');
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState('');
  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  const esDirector = yo?.usuario?.rol === 'director';

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    try { await api('/api/chat', { metodo: 'POST', datos: { texto } }); setTexto(''); await cargar(); } catch (err) { setAviso(err.message); }
  }
  async function decidir(p, que) {
    const nota = que === 'rechazar' ? prompt('¿Por qué se rechaza? (opcional)') ?? '' : '';
    try { await api(`/api/publicaciones/${p.id}/${que}`, { metodo: 'POST', datos: nota ? { nota } : {} }); await cargar(); } catch (err) { setAviso(err.message); }
  }

  return (
    <>
      <EncabezadoConsultor yo={yo} />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <h1 className="text-2xl font-semibold">Chat de consultores</h1>
        <Aviso>{aviso}</Aviso>
        <div className="grid gap-5 lg:grid-cols-3">
          <Tarjeta className="lg:col-span-2">
            <ul className="mb-3 max-h-[60vh] space-y-2 overflow-y-auto text-sm">
              {datos.mensajes.map(m => (
                <li key={m.id} className={`rounded-lg p-2 ${m.autor_tipo === 'sistema' ? 'bg-sky-50' : m.autor_tipo === 'ia' ? 'bg-slate-100' : 'bg-amber-50'}`}>
                  <div className="text-xs text-slate-500">{m.autor_nombre} · {fechaHora(m.creado_en)}</div>
                  <p className="whitespace-pre-line">{m.texto}</p>
                </li>
              ))}
              {!datos.mensajes.length && <li className="text-slate-500">Sin mensajes todavía.</li>}
            </ul>
            <form onSubmit={enviar} className="flex gap-2">
              <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escriba al equipo…" className={`${estiloEntrada} flex-1`} aria-label="Mensaje" />
              <button className="boton-accion rounded-lg px-4 py-2 text-sm font-medium">Enviar</button>
            </form>
          </Tarjeta>
          <div className="space-y-5">
            <Tarjeta titulo="Publicaciones">
              <ul className="space-y-3 text-sm">
                {datos.publicaciones.map(p => (
                  <li key={p.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2"><b>Versión {p.version}</b><Etiqueta clase={ESTADO_PUB[p.estado]}>{p.estado}</Etiqueta></div>
                    <p className="text-xs text-slate-500">{p.entorno === 'produccion' ? 'Producción' : 'Staging'} · pidió {p.solicitada_por} · {fechaHora(p.creado_en)}</p>
                    <p className="mt-1 whitespace-pre-line">{p.cambios}</p>
                    {p.aprobada_por_nombre && <p className="mt-1 text-xs text-emerald-700">Aprobó {p.aprobada_por_nombre}</p>}
                    {p.nota && <p className="text-xs text-slate-600">Nota: {p.nota}</p>}
                    {p.estado === 'solicitada' && esDirector && (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => decidir(p, 'aprobar')} className="boton-accion rounded-md px-3 py-1.5 text-xs font-medium">Aprobar publicación</button>
                        <button onClick={() => decidir(p, 'rechazar')} className="rounded-md px-3 py-1.5 text-xs ring-1 ring-slate-300">Rechazar</button>
                      </div>
                    )}
                    {p.estado === 'solicitada' && !esDirector && <p className="mt-1 text-xs text-amber-800">Esperando la aprobación del director.</p>}
                  </li>
                ))}
                {!datos.publicaciones.length && <li className="text-slate-500">Sin publicaciones.</li>}
              </ul>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-marca-acento-texto">Pedir publicación</summary>
                <Formulario className="mt-2" textoBoton="Pedir aprobación" alEnviar={async (d) => { await api('/api/publicaciones', { metodo: 'POST', datos: d }); await cargar(); return 'Solicitud enviada al director.'; }}>
                  <Campo etiqueta="Versión (commit)"><input name="version" required className={estiloEntrada} placeholder="809fed1" /></Campo>
                  <Campo etiqueta="Qué cambió (ya probado en staging)"><textarea name="cambios" required minLength={10} rows={3} className={estiloEntrada} /></Campo>
                </Formulario>
              </details>
            </Tarjeta>
            <ChatMarce alCambiar={cargar} />
          </div>
        </div>
      </main>
    </>
  );
}
