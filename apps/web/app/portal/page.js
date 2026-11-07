'use client';
// Portal del cliente: su trámite, lo que necesitamos de usted, mensajes y vencimientos.
import { useEffect, useState, useCallback, useRef } from 'react';
import { api, ESTADOS_REQUISITO, COLOR_ESTADO, COLOR_URGENCIA, fechaCorta } from '../../lib/api';
import { Encabezado, Etiqueta, Tarjeta, Barra, Aviso, Cargando } from '../componentes';
import { Mensajes } from '../partes-expediente';

const CADENA = [
  { clave: 'proyecto_ejecutivo', texto: 'Proyecto Ejecutivo Autorizado' },
  { clave: 'permiso', texto: 'Permiso' },
  { clave: 'inicio_operaciones', texto: 'Inicio de Operaciones' },
  { clave: 'periodicas', texto: 'Obligaciones periódicas' },
];

export default function Portal() {
  const [yo, setYo] = useState(null);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    try { setYo(await api('/api/yo')); setLista(await api('/api/portal')); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (!lista) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  return (
    <>
      <Encabezado despacho={yo?.despacho} subtitulo="Portal de trámites ferroviarios" usuario={yo?.usuario?.nombre} logo={yo?.logo} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        {lista.map(t => <Tramite key={t.id} t={t} alCambiar={cargar} />)}
        {!lista.length && <p className="text-slate-500">No tiene trámites en curso.</p>}
        <footer className="pb-6 text-center text-sm text-slate-500">Su consultora: {lista[0]?.consultor ?? '—'} · {yo?.despacho}</footer>
      </main>
    </>
  );
}

function Tramite({ t, alCambiar }) {
  const etapaActual = t.tramite_clave === 'inicio_operaciones' ? 2 : t.tramite_clave === 'permiso' ? 1 : t.tramite_clave === 'proyecto_ejecutivo' ? 0 : 3;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trámite en curso</p>
          <h1 className="text-2xl font-semibold text-slate-900">{t.tramite}</h1>
          <p className="text-sm text-slate-600">{t.permiso ? `Permiso ${t.permiso} · ${t.servicio} · ` : ''}{t.terminal}{t.ubicacion ? `, ${t.ubicacion}` : ''}</p>
        </div>
        {t.plazo && (
          <div className={`rounded-xl px-5 py-3 text-center ${COLOR_URGENCIA[t.plazo.nivel]}`}>
            <p className="text-xs font-semibold uppercase">Fecha límite</p>
            <p className="text-3xl font-bold">{t.plazo.dias} <span className="text-base font-medium">días</span></p>
            <p className="text-sm">para el {t.plazo.fechaTexto}</p>
            {t.plazo.definitivo && <p className="mt-1 max-w-56 text-xs">Plazo con prórroga. La autoridad indicó que no habrá otra.</p>}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Tarjeta><p className="text-sm text-slate-500">Requiere su atención</p><p className="text-2xl font-semibold">{t.loQueNecesitamos.length} pendientes</p></Tarjeta>
        <Tarjeta><p className="text-sm text-slate-500">Requisitos aprobados</p><p className="mb-2 text-2xl font-semibold">{t.aprobados} de {t.total}</p><Barra valor={t.aprobados} total={t.total} /></Tarjeta>
        <Tarjeta><p className="text-sm text-slate-500">Con observación de la autoridad</p><p className="text-2xl font-semibold">{t.con_observacion}</p></Tarjeta>
      </div>

      <ol className="grid gap-2 sm:grid-cols-4">
        {CADENA.map((c, i) => (
          <li key={c.clave} className={`rounded-lg p-3 text-sm ring-1 ${i < etapaActual ? 'bg-emerald-50 ring-emerald-200' : i === etapaActual ? 'bg-marca-fondo text-marca-texto-fondo ring-transparent' : 'bg-white ring-slate-200'}`}>
            <span className="font-semibold">{i + 1}. {c.texto}</span>
            <span className="block text-xs opacity-80">{i < etapaActual ? (c.clave === 'permiso' && t.fecha_otorgamiento ? `Otorgado ${fechaCorta(t.fecha_otorgamiento)}` : 'Listo') : i === etapaActual ? 'En curso' : 'Después'}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Tarjeta titulo="Lo que necesitamos de usted">
            <ul className="divide-y divide-slate-100">
              {t.loQueNecesitamos.map(r => <Necesitamos key={r.id} r={r} expedienteId={t.id} alCambiar={alCambiar} />)}
              {!t.loQueNecesitamos.length && <li className="py-2 text-sm text-slate-500">Por ahora no necesitamos nada de usted. ¡Gracias!</li>}
            </ul>
          </Tarjeta>
          <Tarjeta titulo="Requisitos del trámite">
            <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-1">Requisito</th><th>Estado</th><th>Nota</th></tr></thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {t.requisitos.map(r => (
                  <tr key={r.id}><td className="py-2 pr-2">{r.nombre}</td><td className="pr-2"><Etiqueta clase={COLOR_ESTADO[r.estado] ?? 'bg-slate-100'}>{ESTADOS_REQUISITO[r.estado]}</Etiqueta></td><td className="text-slate-600">{r.nota}</td></tr>
                ))}
              </tbody>
            </table>
            </div>
          </Tarjeta>
        </div>
        <div className="space-y-5">
          <Mensajes e={t} alCambiar={alCambiar} esCliente />
          <Tarjeta titulo="Próximos vencimientos">
            <ul className="space-y-2 text-sm">
              {t.plazos.map((p, i) => <li key={i}><b>{p.fechaTexto}</b> — {p.descripcion.split(' · ')[0]}</li>)}
              {!t.plazos.length && <li className="text-slate-500">Sin vencimientos calculados.</li>}
            </ul>
          </Tarjeta>
        </div>
      </div>
    </section>
  );
}

function Necesitamos({ r, expedienteId, alCambiar }) {
  const entrada = useRef(null);
  const [estado, setEstado] = useState('');
  async function subir(ev) {
    const archivo = ev.target.files?.[0];
    if (!archivo) return;
    const f = new FormData();
    f.append('requisito_id', r.id);
    f.append('archivo', archivo);
    setEstado('Subiendo…');
    try { await api(`/api/expedientes/${expedienteId}/documentos`, { metodo: 'POST', formulario: f }); setEstado('Recibido. Su consultora lo revisará.'); alCambiar(); }
    catch (e) { setEstado(e.message); }
  }
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{r.nombre}</p>
        {r.nota && <p className="text-xs text-slate-600">{r.nota}</p>}
        {estado && <p className="text-xs text-slate-600" role="status">{estado}</p>}
      </div>
      <input ref={entrada} type="file" className="hidden" onChange={subir} aria-label={`Subir ${r.nombre}`} />
      <button onClick={() => entrada.current?.click()} className="boton-accion rounded-md px-3 py-1.5 text-xs font-medium">Subir documento</button>
    </li>
  );
}
