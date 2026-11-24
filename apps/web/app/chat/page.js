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
  const [enviando, setEnviando] = useState(false);
  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  const esDirector = yo?.usuario?.rol === 'director';

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try { await api('/api/chat', { metodo: 'POST', datos: { texto } }); setTexto(''); await cargar(); } catch (err) { setAviso(err.message); } finally { setEnviando(false); }
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
              <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escriba al equipo… (para preguntarle a Marce aquí, empiece con «@Marce»)" className={`${estiloEntrada} flex-1`} aria-label="Mensaje" />
              <button disabled={enviando} className="boton-accion rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">{enviando ? (/^\s*@?marce\b/i.test(texto) ? 'Marce está pensando…' : 'Enviando…') : 'Enviar'}</button>
            </form>
            <p className="mt-1 text-xs text-slate-500">Este chat es entre personas del equipo. Marce contesta aquí solo si la menciona; también puede usar «Chat con Marce».</p>
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
            <Solicitudes lista={datos.solicitudes ?? []} alCambiar={cargar} setAviso={setAviso} />
            <ChatMarce alCambiar={cargar} />
          </div>
        </div>
      </main>
    </>
  );
}

const ESTADO_SOL = { nueva: 'bg-amber-100 text-amber-900', en_desarrollo: 'bg-sky-100 text-sky-800', hecha: 'bg-emerald-100 text-emerald-800', descartada: 'bg-slate-200 text-slate-700' };
const NOMBRE_SOL = { nueva: 'Nueva', en_desarrollo: 'En desarrollo', hecha: 'Hecha', descartada: 'Descartada' };

/** Cambios al sistema que pidió el equipo a través de Marce, para llevarlos a desarrollo (Claude Code). */
function Solicitudes({ lista, alCambiar, setAviso }) {
  const [copiada, setCopiada] = useState(null);
  async function copiar(s) {
    const texto = `Solicitud de cambio para Strateggia Logistics (pedida por ${s.pedida_por}, vía Marce)\n\n${s.titulo}\n\nQué hacer:\n${s.descripcion}\n\nPor qué:\n${s.motivo ?? '—'}`;
    try { await navigator.clipboard.writeText(texto); setCopiada(s.id); setTimeout(() => setCopiada(null), 2500); } catch { setAviso('No se pudo copiar; seleccione el texto a mano.'); }
  }
  async function estado(s, e) {
    try { await api(`/api/solicitudes/${s.id}`, { metodo: 'PATCH', datos: { estado: e } }); await alCambiar(); } catch (err) { setAviso(err.message); }
  }
  return (
    <Tarjeta titulo="Solicitudes de cambio al sistema">
      <p className="mb-2 text-xs text-slate-500">Las deja Marce cuando alguien pide una función o reporta un error. Cópiela y llévela a Claude Code.</p>
      <ul className="space-y-3 text-sm">
        {lista.map(s => (
          <li key={s.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2"><b>{s.titulo}</b><Etiqueta clase={ESTADO_SOL[s.estado]}>{NOMBRE_SOL[s.estado]}</Etiqueta></div>
            <p className="text-xs text-slate-500">Pidió {s.pedida_por} · {fechaHora(s.creado_en)}</p>
            <p className="mt-1 whitespace-pre-line text-xs">{s.descripcion}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => copiar(s)} className="boton-accion rounded-md px-3 py-1.5 text-xs font-medium">{copiada === s.id ? '¡Copiada!' : 'Copiar para Claude Code'}</button>
              {s.estado === 'nueva' && <button onClick={() => estado(s, 'en_desarrollo')} className="rounded-md px-3 py-1.5 text-xs ring-1 ring-slate-300">En desarrollo</button>}
              {['nueva', 'en_desarrollo'].includes(s.estado) && <button onClick={() => estado(s, 'hecha')} className="rounded-md px-3 py-1.5 text-xs ring-1 ring-slate-300">Hecha</button>}
              {s.estado === 'nueva' && <button onClick={() => estado(s, 'descartada')} className="rounded-md px-3 py-1.5 text-xs ring-1 ring-slate-300">Descartar</button>}
            </div>
          </li>
        ))}
        {!lista.length && <li className="text-slate-500">Sin solicitudes. Pídale a Marce: «Marce, necesito que el sistema…».</li>}
      </ul>
    </Tarjeta>
  );
}
