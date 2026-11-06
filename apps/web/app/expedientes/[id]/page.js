'use client';
// Detalle de expediente (consultores): checklist por requisito, revisión automática,
// documentos, mensajes, plazos, bitácora y cobro.
import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, ESTADOS_EXPEDIENTE, ESTADOS_REQUISITO, RESPONSABLE, COLOR_ESTADO, COLOR_URGENCIA, fechaHora, fechaCorta } from '../../../lib/api';
import { Encabezado, Etiqueta, Tarjeta, Barra, Aviso, Cargando } from '../../componentes';
import { ChatMarce } from '../../chat-marce';
import { Documentos, Mensajes } from '../../partes-expediente';

const PESTANAS = ['Checklist', 'Documentos', 'Mensajes', 'Plazos', 'Bitácora'];
const COLOR_RESULTADO = { OK: 'text-emerald-700', REVISAR: 'text-amber-800', FALTA: 'text-red-700', FALLA: 'text-red-700' };

export default function Expediente({ params }) {
  const { id } = use(params);
  const [yo, setYo] = useState(null);
  const [e, setE] = useState(null);
  const [pestana, setPestana] = useState('Checklist');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setYo(await api('/api/yo'));
      setE(await api(`/api/expedientes/${id}`));
    } catch (err) { setError(err.message); }
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!e) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  const secciones = [...new Set(e.requisitos.map(r => r.seccion ?? 'Requisitos'))];

  return (
    <>
      <Encabezado despacho={yo?.despacho} subtitulo="Consultores" usuario={yo?.usuario?.nombre} enlaces={[{ href: '/', texto: 'Seguimiento' }]} />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <nav className="text-sm text-slate-500"><Link href="/" className="hover:underline">Seguimiento</Link> / {e.cliente} · {e.terminal}</nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{e.tramite}{e.homoclave ? ` ${e.homoclave}` : ''}</h1>
            <p className="text-sm text-slate-600">{e.permiso ? `Permiso ${e.permiso} · ${e.servicio}` : e.alcance}{e.fecha_otorgamiento ? ` · otorgado el ${fechaCorta(e.fecha_otorgamiento)}` : ''}</p>
          </div>
          {e.plazo && (
            <div className={`rounded-xl px-4 py-2 text-sm ${COLOR_URGENCIA[e.urgencia]}`}>
              <div className="font-semibold">{e.plazo.descripcion?.split(' · ')[0] ?? 'Fecha límite'}: {e.plazo.fechaTexto}</div>
              <div>{e.plazo.dias} días · {e.plazo.regla}</div>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Dato titulo="Alcance contratado" valor={e.alcance === 'completo' ? 'Trámite completo' : e.alcance} />
          <Dato titulo="Consultora" valor={e.consultor ?? '—'} />
          <Dato titulo="Contacto del cliente" valor={e.contacto ?? '—'} extra={<Etiqueta clase="bg-slate-100 text-slate-700">{ESTADOS_EXPEDIENTE[e.estado]}</Etiqueta>} />
          <Dato titulo="Avance" valor={`${e.aprobados} de ${e.total} aprobados`} extra={<Barra valor={e.aprobados} total={e.total} />} />
        </div>

        <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
          {PESTANAS.map(p => (
            <button key={p} role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}
              className={`rounded-t-lg px-4 py-2 text-sm ${pestana === p ? 'bg-white font-semibold ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`}>
              {p}{p === 'Documentos' ? ` (${e.documentos.length})` : ''}
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {pestana === 'Checklist' && secciones.map(s => (
              <Tarjeta key={s} titulo={s}>
                <ul className="divide-y divide-slate-100">
                  {e.requisitos.filter(r => (r.seccion ?? 'Requisitos') === s).map(r => <Requisito key={r.id} r={r} alCambiar={cargar} />)}
                </ul>
              </Tarjeta>
            ))}
            {pestana === 'Documentos' && <Documentos e={e} alCambiar={cargar} />}
            {pestana === 'Mensajes' && <Mensajes e={e} alCambiar={cargar} />}
            {pestana === 'Plazos' && (
              <Tarjeta titulo="Plazos calculados">
                <ul className="divide-y divide-slate-100 text-sm">
                  {e.plazos.map((p, i) => (
                    <li key={i} className="py-2"><b>{p.fechaTexto}</b> — {p.descripcion}<div className="text-xs text-slate-500">{p.regla}</div></li>
                  ))}
                  {!e.plazos.length && <li className="text-slate-500">Sin plazos calculados (falta la fecha del permiso o ya inició operaciones).</li>}
                </ul>
              </Tarjeta>
            )}
            {pestana === 'Bitácora' && (
              <Tarjeta titulo="Bitácora (no se edita ni se borra)">
                <ul className="divide-y divide-slate-100 text-sm">
                  {e.bitacora.map((b, i) => (
                    <li key={i} className="py-2">
                      <span className="text-slate-500">{fechaHora(b.cuando)}</span> · <b>{b.actor === 'ia' ? 'Marce' : b.actor === 'sistema' ? 'Sistema' : b.persona}</b>
                      {' '}{b.accion === 'INSERT' ? 'creó' : 'cambió'} {b.tabla?.replaceAll('_', ' ')}
                      {b.accion === 'UPDATE' && b.detalle && <span className="text-slate-500"> ({Object.keys(b.detalle).join(', ')})</span>}
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            )}
          </div>
          <div className="space-y-5">
            {e.cobros.length > 0 && (
              <Tarjeta titulo="Cobro">
                {e.cobros.map(c => <p key={c.id} className="text-sm">{c.descripcion}: <b>{c.estatus.replaceAll('_', ' ')}</b>{c.folio_factura ? ` · ${c.folio_factura}` : ''}</p>)}
              </Tarjeta>
            )}
            <Tarjeta titulo="Siguiente paso"><p className="text-sm">{e.siguiente_paso ?? '—'}</p></Tarjeta>
            <ChatMarce expedienteId={e.id} alCambiar={cargar} />
          </div>
        </div>
      </main>
    </>
  );
}

function Dato({ titulo, valor, extra }) {
  return (
    <div className="space-y-1 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="text-sm font-medium">{valor}</p>
      {extra}
    </div>
  );
}

function Requisito({ r, alCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const revision = r.propuesta_ia?.resultados;
  async function aprobar() {
    setError('');
    try { await api(`/api/requisitos/${r.id}/aprobar`, { metodo: 'POST', datos: {} }); alCambiar(); } catch (e) { setError(e.message); }
  }
  async function cambiarEstado(estado) {
    setError('');
    try { await api(`/api/requisitos/${r.id}`, { metodo: 'PATCH', datos: { estado } }); alCambiar(); } catch (e) { setError(e.message); }
  }
  async function revisar() {
    setError('');
    try { await api(`/api/requisitos/${r.id}/revisar`, { metodo: 'POST', datos: { texto, solo_pesos: true } }); setTexto(''); alCambiar(); } catch (e) { setError(e.message); }
  }
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{r.nombre}</p>
          {r.nota && <p className="text-xs text-slate-600">{r.nota}</p>}
          {r.aprobado_por_nombre && <p className="text-xs text-emerald-700">Aprobó {r.aprobado_por_nombre}</p>}
        </div>
        <span className="text-xs text-slate-500">{RESPONSABLE[r.responsable]}</span>
        <Etiqueta clase={COLOR_ESTADO[r.estado] ?? 'bg-slate-100'}>{ESTADOS_REQUISITO[r.estado]}</Etiqueta>
        <button onClick={() => setAbierto(!abierto)} className="text-xs text-marca-acento-texto underline" aria-expanded={abierto}>{abierto ? 'Cerrar' : 'Revisar'}</button>
      </div>
      {revision && (
        <ul className="mt-2 space-y-0.5 rounded-lg bg-slate-50 p-2 text-xs">
          <li className="text-slate-500">Revisión automática · un consultor confirma cada resultado</li>
          {revision.map((x, i) => <li key={i}><b className={COLOR_RESULTADO[x.resultado]}>{x.resultado}</b> {x.mensaje}</li>)}
        </ul>
      )}
      {abierto && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
          <Aviso>{error}</Aviso>
          <div className="flex flex-wrap gap-2">
            {r.estado !== 'aprobado' && <button onClick={aprobar} className="boton-accion rounded-md px-3 py-1.5 text-xs font-medium">Aprobar requisito</button>}
            <select onChange={ev => ev.target.value && cambiarEstado(ev.target.value)} defaultValue="" className="rounded-md border border-slate-300 px-2 py-1 text-xs" aria-label="Cambiar estado">
              <option value="">Cambiar estado…</option>
              {Object.entries(ESTADOS_REQUISITO).filter(([k]) => k !== 'aprobado').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block text-slate-600">Pegue el texto del documento para la revisión automática (domicilio, antigua Agencia, solo pesos):</span>
            <textarea value={texto} onChange={ev => setTexto(ev.target.value)} rows={3} className="w-full rounded-md border border-slate-300 p-2" />
          </label>
          <button onClick={revisar} disabled={!texto} className="boton-sec rounded-md px-3 py-1.5 text-xs ring-1 ring-slate-300 disabled:opacity-50">Correr revisión</button>
        </div>
      )}
    </li>
  );
}
