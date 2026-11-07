'use client';
// Tablero interno de seguimiento (consultores).
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, ESTADOS_EXPEDIENTE, COLOR_URGENCIA, ETIQUETA_URGENCIA, fechaHora } from '../lib/api';
import { EncabezadoConsultor, Etiqueta, Tarjeta, Barra, Aviso, Cargando } from './componentes';
import { ChatMarce } from './chat-marce';

const TIPO_ACCION = { recordatorio: 'Recordatorio', correo: 'Correo', whatsapp: 'WhatsApp', alerta_interna: 'Alerta interna',
  ingreso_autoridad: 'Ingreso ante la autoridad', firma: 'Firma', escrito_oficial: 'Escrito oficial', registro_cobro: 'Registro de cobro' };

export default function Tablero() {
  const [yo, setYo] = useState(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const y = await api('/api/yo');
      if (y.usuario.rol === 'cliente') { location.href = '/portal'; return; }
      setYo(y);
      setDatos(await api('/api/tablero'));
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  const { indicadores: k, expedientes, acciones, cobros } = datos;
  const activos = expedientes.filter(e => e.estado !== 'comercial');
  const comerciales = expedientes.filter(e => e.estado === 'comercial');
  const hoy = new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeZone: 'America/Mexico_City' }).format(new Date());

  return (
    <>
      <EncabezadoConsultor yo={yo} />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <p className="text-sm text-slate-500 first-letter:uppercase">{hoy}</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador titulo="Expedientes activos" valor={k.expedientesActivos} detalle={k.activosNombres.join(', ')} />
          <Indicador titulo="Vencen en menos de 30 días" valor={k.vencenEn30} detalle={k.vencenEn30Detalle.join(', ') || '—'} alerta={k.vencenEn30 > 0} />
          <Indicador titulo="Esperando al cliente" valor={k.esperandoCliente} detalle={`${k.pendientesCliente} documentos o datos pendientes`} />
          <Indicador titulo="Propuestas abiertas" valor={k.propuestasAbiertas} detalle={k.propuestasNombres.join(' y ') || '—'} />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Tarjeta titulo="Seguimiento de expedientes · ordenado por urgencia">
              <TablaExpedientes filas={activos} />
            </Tarjeta>
            <Tarjeta titulo="Comercial">
              <TablaExpedientes filas={comerciales} comercial />
            </Tarjeta>
            {cobros.length > 0 && (
              <Tarjeta titulo="Cobro (registro; la factura vive fuera del sistema)">
                <ul className="divide-y divide-slate-100 text-sm">
                  {cobros.map(c => (
                    <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span><b>{c.cliente}</b> · {c.descripcion}{c.folio_factura ? ` · Folio ${c.folio_factura}` : ''}{c.orden_compra ? ` · OC ${c.orden_compra}` : ''}</span>
                      <Etiqueta clase="bg-slate-100 text-slate-700">{c.estatus.replaceAll('_', ' ')}</Etiqueta>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            )}
          </div>
          <div className="space-y-5">
            <PilotoAutomatico acciones={acciones} alCambiar={cargar} />
            <ChatMarce alCambiar={cargar} />
          </div>
        </div>
      </main>
    </>
  );
}

function Indicador({ titulo, valor, detalle, alerta }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className={`mt-1 text-3xl font-semibold ${alerta ? 'text-red-700' : 'text-slate-900'}`}>{valor}</p>
      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

function TablaExpedientes({ filas, comercial }) {
  if (!filas.length) return <p className="text-sm text-slate-500">Sin expedientes.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="py-2 pr-3">Cliente · terminal</th><th className="pr-3">Trámite</th>{!comercial && <th className="pr-3">Avance</th>}<th className="pr-3">Plazo</th><th className="pr-3">Estado</th><th>Siguiente paso</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          {filas.map(e => (
            <tr key={e.id} className="hover:bg-slate-50">
              <td className="py-3 pr-3">
                <Link href={`/expedientes/${e.id}`} className="font-medium text-slate-900 hover:underline">{e.cliente}</Link>
                <div className="text-xs text-slate-500">{e.ubicacion || e.terminal}</div>
              </td>
              <td className="pr-3">
                <div>{e.tramite}</div>
                <div className="text-xs text-slate-500">{e.permiso ?? e.alcance}</div>
              </td>
              {!comercial && (
                <td className="w-36 pr-3">
                  <div className="mb-1 text-xs">{e.aprobados} de {e.total} requisitos</div>
                  <Barra valor={e.aprobados} total={e.total} />
                </td>
              )}
              <td className="pr-3">
                {e.plazo ? (
                  <>
                    <div className="font-medium">{e.plazo.fechaTexto}</div>
                    <div className="text-xs text-slate-500">
                      {e.plazo.dias >= 0 ? `faltan ${e.plazo.dias} días` : `vencido hace ${-e.plazo.dias} días`}{e.plazo.definitivo ? ' · sin más prórroga' : ''}
                    </div>
                  </>
                ) : <span className="text-slate-500">{comercial ? '—' : 'Sin fecha fija'}</span>}
              </td>
              <td className="pr-3">
                {comercial
                  ? <Etiqueta clase="bg-slate-200 text-slate-700">Comercial</Etiqueta>
                  : <Etiqueta clase={COLOR_URGENCIA[e.urgencia]}>{e.urgencia === 'critico' || e.urgencia === 'vencido' ? ETIQUETA_URGENCIA[e.urgencia] : ESTADOS_EXPEDIENTE[e.estado]}</Etiqueta>}
              </td>
              <td className="text-slate-700">{e.siguiente_paso}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PilotoAutomatico({ acciones, alCambiar }) {
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(null);
  const pendientes = acciones.filter(a => a.estado === 'propuesta');
  async function hacer(a, que, borrador, destinatario) {
    setError('');
    try { await api(`/api/acciones/${a.id}/${que}`, { metodo: 'POST', datos: { ...(borrador ? { borrador } : {}), ...(destinatario ? { destinatario } : {}) } }); setEditando(null); alCambiar(); }
    catch (e) { setError(e.message); }
  }
  return (
    <Tarjeta titulo="Piloto automático" accion={<Etiqueta clase="bg-amber-100 text-amber-900">{pendientes.length} esperan su aprobación</Etiqueta>}>
      <Aviso>{error}</Aviso>
      <ul className="space-y-3">
        {acciones.map(a => (
          <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{TIPO_ACCION[a.tipo]}{a.cliente ? ` · ${a.cliente}` : ''}</span>
              <span className="text-xs text-slate-500">{fechaHora(a.creado_en)} · {a.propuesta_por === 'ia' ? 'Marce' : 'Sistema'}</span>
            </div>
            {a.destinatario && <div className="text-xs text-slate-500">Para: {a.destinatario}{a.canal ? ` · ${a.canal}` : ''}</div>}
            {editando === a.id ? (
              <EditorBorrador inicial={a.borrador} destinatario={a.destinatario} alGuardar={(b, d) => hacer(a, 'aprobar', b, d)} alCancelar={() => setEditando(null)} />
            ) : (
              <p className="mt-2 whitespace-pre-line text-slate-700">{a.borrador}</p>
            )}
            {a.error && <p className="mt-2 text-xs text-red-700">No se envió: {a.error}</p>}
            {a.estado === 'propuesta' && editando !== a.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                {a.tipo === 'alerta_interna' ? (
                  <button onClick={() => hacer(a, 'hecha')} className="boton-accion rounded-md px-3 py-1.5 text-xs font-medium">Enterado</button>
                ) : ['ingreso_autoridad', 'firma', 'escrito_oficial', 'registro_cobro'].includes(a.tipo) ? (
                  <button onClick={() => hacer(a, 'hecha')} className="boton-accion rounded-md px-3 py-1.5 text-xs font-medium">Ya lo hice yo</button>
                ) : (
                  <>
                    <button onClick={() => hacer(a, 'aprobar')} className="boton-accion rounded-md px-3 py-1.5 text-xs font-medium">Aprobar y enviar</button>
                    <button onClick={() => setEditando(a.id)} className="boton-sec rounded-md px-3 py-1.5 text-xs ring-1 ring-slate-300">Editar</button>
                  </>
                )}
                <button onClick={() => hacer(a, 'rechazar')} className="boton-sec rounded-md px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-300">Descartar</button>
              </div>
            )}
            {a.estado === 'aprobada' && !a.error && <p className="mt-2 text-xs text-emerald-700">Aprobada · sale en el próximo ciclo</p>}
          </li>
        ))}
        {!acciones.length && <li className="text-sm text-slate-500">Nada pendiente.</li>}
      </ul>
    </Tarjeta>
  );
}

function EditorBorrador({ inicial, destinatario, alGuardar, alCancelar }) {
  const [texto, setTexto] = useState(inicial);
  const [para, setPara] = useState(destinatario ?? '');
  return (
    <div className="mt-2 space-y-2">
      <input value={para} onChange={e => setPara(e.target.value)} className="w-full rounded-md border border-slate-300 p-2 text-sm" aria-label="Destinatario" placeholder="Nombre del contacto, correo o teléfono" />
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} className="w-full rounded-md border border-slate-300 p-2 text-sm" aria-label="Borrador" />
      <div className="flex gap-2">
        <button onClick={() => alGuardar(texto, para)} className="boton-accion rounded-md px-3 py-1.5 text-xs font-medium">Aprobar con cambios</button>
        <button onClick={alCancelar} className="boton-sec rounded-md px-3 py-1.5 text-xs ring-1 ring-slate-300">Cancelar</button>
      </div>
    </div>
  );
}
