'use client';
// Clientes, contactos, terminales y permisos. Desde aquí se abren expedientes.
import { useState } from 'react';
import Link from 'next/link';
import { api, fechaCorta } from '../../lib/api';
import { EncabezadoConsultor, Tarjeta, Aviso, Cargando, Campo, Formulario, estiloEntrada, usarDatos, Etiqueta } from '../componentes';

export default function Clientes() {
  const { yo, datos: clientes, error, cargar } = usarDatos('/api/clientes');
  const [abierto, setAbierto] = useState(null);
  if (!clientes) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  return (
    <>
      <EncabezadoConsultor yo={yo} />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <h1 className="text-2xl font-semibold">Clientes y permisos</h1>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {clientes.map(c => (
              <Tarjeta key={c.id}>
                <button onClick={() => setAbierto(abierto === c.id ? null : c.id)} className="flex w-full items-center justify-between text-left" aria-expanded={abierto === c.id}>
                  <span>
                    <span className="block font-semibold text-slate-900">{c.nombre_corto}</span>
                    <span className="block text-xs text-slate-500">{c.razon_social}{c.rfc ? ` · ${c.rfc}` : ''} · {c.terminales.length} terminal(es)</span>
                  </span>
                  <span className="text-slate-400">{abierto === c.id ? '▲' : '▼'}</span>
                </button>
                {abierto === c.id && <DetalleCliente c={c} alCambiar={cargar} />}
              </Tarjeta>
            ))}
          </div>
          <Tarjeta titulo="Nuevo cliente">
            <Formulario textoBoton="Agregar cliente" alEnviar={async (d) => { await api('/api/clientes', { metodo: 'POST', datos: d }); await cargar(); return 'Cliente agregado.'; }}>
              <Campo etiqueta="Razón social"><input name="razon_social" required className={estiloEntrada} /></Campo>
              <Campo etiqueta="Nombre corto"><input name="nombre_corto" required className={estiloEntrada} /></Campo>
              <Campo etiqueta="RFC (opcional)"><input name="rfc" className={estiloEntrada} pattern="[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}" /></Campo>
            </Formulario>
          </Tarjeta>
        </div>
      </main>
    </>
  );
}

function DetalleCliente({ c, alCambiar }) {
  return (
    <div className="mt-4 space-y-5 border-t border-slate-100 pt-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">Contactos</h3>
        <ul className="mb-2 space-y-1 text-sm">
          {c.contactos.map(ct => <li key={ct.id}><b>{ct.nombre}</b>{ct.cargo ? ` · ${ct.cargo}` : ''}{ct.telefono ? ` · ${ct.telefono}` : <span className="text-amber-800"> · sin teléfono</span>}{ct.correo ? ` · ${ct.correo}` : ''}</li>)}
        </ul>
        <details className="text-sm">
          <summary className="cursor-pointer text-marca-acento-texto">Agregar contacto</summary>
          <Formulario className="mt-2 grid gap-2 sm:grid-cols-2" textoBoton="Agregar" alEnviar={async (d) => { await api(`/api/clientes/${c.id}/contactos`, { metodo: 'POST', datos: d }); await alCambiar(); }}>
            <Campo etiqueta="Nombre"><input name="nombre" required className={estiloEntrada} /></Campo>
            <Campo etiqueta="Cargo"><input name="cargo" className={estiloEntrada} /></Campo>
            <Campo etiqueta="Teléfono (WhatsApp)"><input name="telefono" className={estiloEntrada} /></Campo>
            <Campo etiqueta="Correo"><input name="correo" type="email" className={estiloEntrada} /></Campo>
          </Formulario>
        </details>
      </section>

      {c.terminales.map(t => <Terminal key={t.id} t={t} alCambiar={alCambiar} />)}

      <details className="text-sm">
        <summary className="cursor-pointer text-marca-acento-texto">Agregar terminal</summary>
        <Formulario className="mt-2 grid gap-2 sm:grid-cols-3" textoBoton="Agregar terminal" alEnviar={async (d) => { await api(`/api/clientes/${c.id}/terminales`, { metodo: 'POST', datos: d }); await alCambiar(); }}>
          <Campo etiqueta="Nombre"><input name="nombre" required className={estiloEntrada} placeholder="Terminal Cosío" /></Campo>
          <Campo etiqueta="Municipio"><input name="municipio" className={estiloEntrada} /></Campo>
          <Campo etiqueta="Estado"><input name="estado" className={estiloEntrada} /></Campo>
        </Formulario>
      </details>
    </div>
  );
}

const TRAMITES_ABRIR = [
  ['proyecto_ejecutivo', 'Proyecto Ejecutivo'], ['permiso', 'Permiso'], ['inicio_operaciones', 'Inicio de Operaciones'],
  ['registro_tarifas', 'Registro de Tarifas'], ['programa_contingencias', 'Programa de Contingencias'],
  ['renovacion_polizas', 'Renovación de pólizas'], ['aviso_cambios_terminal', 'Aviso de cambios en la terminal'], ['renovacion_permiso', 'Renovación del permiso'],
];

function Terminal({ t, alCambiar }) {
  const [aviso, setAviso] = useState('');
  async function subirAntecedente(ev) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setAviso('');
    try {
      const archivo = new FormData(); archivo.append('archivo', f.get('archivo'));
      const doc = await api(`/api/terminales/${t.id}/documentos`, { metodo: 'POST', formulario: archivo });
      await api('/api/antecedentes', { metodo: 'POST', datos: { terminal_id: t.id, tramite_clave: f.get('tramite_clave'), documento_id: doc.id, descripcion: f.get('descripcion') } });
      ev.target.reset(); await alCambiar();
    } catch (e) { setAviso(e.message); }
  }
  return (
    <section className="rounded-lg bg-slate-50 p-3">
      <h3 className="font-semibold">{t.nombre} <span className="text-xs font-normal text-slate-500">{[t.municipio, t.estado].filter(Boolean).join(', ')}</span></h3>

      {t.permisos.map(p => <Permiso key={p.id} p={p} alCambiar={alCambiar} />)}

      {t.antecedentes.length > 0 && (
        <p className="mt-2 text-xs text-slate-600">Ya existe fuera del sistema: {t.antecedentes.map(a => `${a.tramite_clave.replaceAll('_', ' ')} (${a.documento})`).join('; ')}</p>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <details className="text-sm">
          <summary className="cursor-pointer text-marca-acento-texto">Registrar permiso</summary>
          <Formulario className="mt-2" textoBoton="Registrar permiso" alEnviar={async (d) => {
            const r = await api(`/api/terminales/${t.id}/permisos`, { metodo: 'POST', datos: d }); await alCambiar();
            return r.avisos.length ? `Guardado. Revise: ${r.avisos.join(' ')}` : 'Permiso registrado.';
          }}>
            <Campo etiqueta="Número"><input name="numero" required className={estiloEntrada} placeholder="ATTRAPI-04-010-B/0056" /></Campo>
            <Campo etiqueta="Tipo"><select name="tipo" className={estiloEntrada}><option>04-010-B</option><option>04-010-A</option></select></Campo>
            <Campo etiqueta="Servicio"><input name="servicio" required className={estiloEntrada} placeholder="Transbordo y Transvase de Líquidos" /></Campo>
            <Campo etiqueta="Domicilio textual" ayuda="Cópielo idéntico al permiso, en el mismo orden, con kilómetro de vía y línea."><textarea name="domicilio_textual" required rows={3} className={estiloEntrada} /></Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Otorgado el"><input name="fecha_otorgamiento" type="date" className={estiloEntrada} /></Campo>
              <Campo etiqueta="Vigente hasta"><input name="vigencia_hasta" type="date" className={estiloEntrada} /></Campo>
            </div>
          </Formulario>
        </details>
        <details className="text-sm">
          <summary className="cursor-pointer text-marca-acento-texto">Marcar «ya existe fuera del sistema»</summary>
          <form onSubmit={subirAntecedente} className="mt-2 space-y-2">
            <Campo etiqueta="Trámite"><select name="tramite_clave" className={estiloEntrada}>{TRAMITES_ABRIR.slice(0, 3).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo etiqueta="Descripción"><input name="descripcion" required minLength={5} className={estiloEntrada} placeholder="Permiso ... del 23 feb 2026" /></Campo>
            <Campo etiqueta="Documento que lo acredita (obligatorio)"><input name="archivo" type="file" required className="text-sm" /></Campo>
            <Aviso>{aviso}</Aviso>
            <button className="boton-accion rounded-lg px-4 py-2 text-sm font-medium">Guardar</button>
          </form>
        </details>
        <details className="text-sm md:col-span-2">
          <summary className="cursor-pointer text-marca-acento-texto">Abrir expediente</summary>
          <Formulario className="mt-2 grid gap-2 sm:grid-cols-2" textoBoton="Abrir expediente" alEnviar={async (d) => {
            const r = await api('/api/expedientes', { metodo: 'POST', datos: { ...d, terminal_id: t.id, permiso_id: d.permiso_id || null } });
            location.href = `/expedientes/${r.id}`;
          }}>
            <Campo etiqueta="Trámite"><select name="tramite_clave" className={estiloEntrada}>{TRAMITES_ABRIR.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo etiqueta="Permiso"><select name="permiso_id" className={estiloEntrada}><option value="">— sin permiso —</option>{t.permisos.map(p => <option key={p.id} value={p.id}>{p.numero}</option>)}</select></Campo>
            <Campo etiqueta="Alcance contratado"><input name="alcance" className={estiloEntrada} placeholder="completo" /></Campo>
            <Campo etiqueta="Estado inicial"><select name="estado" className={estiloEntrada}><option value="en_integracion">En integración</option><option value="comercial">Propuesta comercial</option></select></Campo>
          </Formulario>
        </details>
      </div>
    </section>
  );
}

function Permiso({ p, alCambiar }) {
  return (
    <div className="mt-2 rounded-lg bg-white p-3 text-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <b>{p.numero}</b><Etiqueta clase="bg-slate-100 text-slate-700">{p.tipo}</Etiqueta>
        <span className="text-slate-600">{p.servicio}</span>
        {p.fecha_otorgamiento && <span className="text-xs text-slate-500">otorgado {fechaCorta(p.fecha_otorgamiento)}</span>}
      </div>
      <p className="mt-1 whitespace-pre-line text-xs text-slate-700">{p.domicilio_textual}</p>
      {p.avisos.map((a, i) => <p key={i} className="text-xs text-amber-800">⚠ {a}</p>)}
      {(p.prorrogas.length > 0 || p.resoluciones.length > 0) && (
        <ul className="mt-1 text-xs text-slate-600">
          {p.prorrogas.map(x => <li key={x.id}>Prórroga al {fechaCorta(x.nueva_fecha)}{x.oficio ? ` (${x.oficio})` : ''}{x.admite_otra_prorroga ? '' : ' · sin otra prórroga'}</li>)}
          {p.resoluciones.map(x => <li key={x.id}>{x.tramite_clave.replaceAll('_', ' ')}: {x.oficio} del {fechaCorta(x.fecha)}</li>)}
        </ul>
      )}
      <div className="mt-2 grid gap-3 md:grid-cols-3">
        <details>
          <summary className="cursor-pointer text-xs text-marca-acento-texto">Corregir domicilio</summary>
          <Formulario className="mt-2" alEnviar={async (d) => { const r = await api(`/api/permisos/${p.id}`, { metodo: 'PATCH', datos: d }); await alCambiar(); return r.avisos.length ? r.avisos.join(' ') : 'Guardado.'; }}>
            <textarea name="domicilio_textual" required rows={3} defaultValue={p.domicilio_textual} className={estiloEntrada} aria-label="Domicilio textual" />
          </Formulario>
        </details>
        <details>
          <summary className="cursor-pointer text-xs text-marca-acento-texto">Registrar prórroga</summary>
          <Formulario className="mt-2" alEnviar={async (d) => { await api(`/api/permisos/${p.id}/prorrogas`, { metodo: 'POST', datos: d }); await alCambiar(); return 'Prórroga registrada; plazos recalculados.'; }}>
            <Campo etiqueta="Nueva fecha límite"><input name="nueva_fecha" type="date" required className={estiloEntrada} /></Campo>
            <Campo etiqueta="Oficio"><input name="oficio" className={estiloEntrada} /></Campo>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="admite_otra_prorroga" /> La autoridad admite otra prórroga</label>
          </Formulario>
        </details>
        <details>
          <summary className="cursor-pointer text-xs text-marca-acento-texto">Registrar resolución</summary>
          <Formulario className="mt-2" alEnviar={async (d) => { await api(`/api/permisos/${p.id}/resoluciones`, { metodo: 'POST', datos: d }); await alCambiar(); return 'Resolución registrada; plazos recalculados.'; }}>
            <Campo etiqueta="Trámite"><select name="tramite_clave" className={estiloEntrada}>
              <option value="programa_contingencias">Programa de Contingencias</option><option value="renovacion_polizas">Pólizas (emisión)</option>
              <option value="registro_tarifas">Registro de Tarifas</option><option value="inicio_operaciones">Inicio de Operaciones</option>
            </select></Campo>
            <Campo etiqueta="Oficio o acuerdo"><input name="oficio" required className={estiloEntrada} placeholder="Acuerdo ATTRAPI/UVSR/DSF/069/2026" /></Campo>
            <Campo etiqueta="Fecha"><input name="fecha" type="date" required className={estiloEntrada} /></Campo>
          </Formulario>
        </details>
      </div>
      <p className="mt-2 text-xs"><Link href="/" className="text-marca-acento-texto underline">Ver expedientes en seguimiento</Link></p>
    </div>
  );
}
