'use client';
// Pestañas de gestión del expediente: escritos y ajustes.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Tarjeta, Aviso, Campo, Formulario, estiloEntrada } from './componentes';

export function Escritos({ e, alCambiar }) {
  const [tipos, setTipos] = useState([]);
  const [tipo, setTipo] = useState('aviso_inicio_operaciones');
  const [resultado, setResultado] = useState(null);
  useEffect(() => { api('/api/escritos/tipos').then(setTipos).catch(() => {}); }, []);
  const t = tipos.find(x => x.clave === tipo);
  return (
    <Tarjeta titulo="Generar escrito (Word y PDF)">
      <p className="mb-3 text-xs text-slate-600">
        El domicilio se toma textual del permiso. El sistema no genera escritos que citen a la antigua Agencia Reguladora o tengan campos sin llenar.
        Firmar e ingresar ante la ATTRAPI lo hace siempre una persona.
      </p>
      <Campo etiqueta="Tipo de escrito" className="mb-3">
        <select value={tipo} onChange={ev => setTipo(ev.target.value)} className={estiloEntrada}>
          {tipos.map(x => <option key={x.clave} value={x.clave}>{x.nombre}{x.membrete ? ' · con membrete del despacho' : ''}</option>)}
        </select>
      </Campo>
      {t && (
        <Formulario key={tipo} textoBoton="Generar Word y PDF" alEnviar={async (d) => {
          const cuerpo = d.cuerpo ? d.cuerpo.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean) : undefined;
          const { cuerpo: _, ...resto } = d;
          const r = await api(`/api/expedientes/${e.id}/escritos`, { metodo: 'POST', datos: { tipo, ...resto, ...(cuerpo ? { cuerpo } : {}) } });
          setResultado(r);
          alCambiar();
          return `Listo: ${r.documentos.map(x => x.nombre).join(' y ')}. Están en Documentos.`;
        }}>
          {t.destinatario !== 'autoridad' && <Campo etiqueta="Destinatario"><textarea name="destinatario" rows={2} className={estiloEntrada} /></Campo>}
          <Campo etiqueta="Asunto"><input name="asunto" defaultValue={t.asunto} className={estiloEntrada} /></Campo>
          {tipo === 'aviso_inicio_operaciones' && <Campo etiqueta="Fecha de inicio de operaciones (como irá en el texto)"><input name="fecha_inicio" required className={estiloEntrada} placeholder="1 de diciembre de 2026" /></Campo>}
          <Campo etiqueta="Cuerpo" ayuda={t.cuerpo.length ? 'Vacío = usar el texto base (borrador por validar con Mayela). Separe párrafos con una línea en blanco. Puede usar {{domicilio}}, {{permiso}}, {{razon_social}}.' : 'Separe párrafos con una línea en blanco. Puede usar {{domicilio}}, {{permiso}}, {{razon_social}}.'}>
            <textarea name="cuerpo" rows={8} required={!t.cuerpo.length} placeholder={t.cuerpo.join('\n\n')} className={estiloEntrada} />
          </Campo>
          <div className="grid gap-2 sm:grid-cols-3">
            <Campo etiqueta="Lugar"><input name="lugar" className={estiloEntrada} placeholder={e.ubicacion} /></Campo>
            <Campo etiqueta="Firma"><input name="firmante" className={estiloEntrada} placeholder={t.firma === 'cliente' ? (e.contacto ?? 'Representante legal') : 'Usted'} /></Campo>
            <Campo etiqueta="Cargo de quien firma"><input name="cargo_firmante" className={estiloEntrada} /></Campo>
          </div>
        </Formulario>
      )}
      {resultado?.revision && (
        <ul className="mt-3 space-y-0.5 rounded-lg bg-slate-50 p-2 text-xs">
          {resultado.revision.map((x, i) => <li key={i}><b>{x.resultado}</b> {x.mensaje}</li>)}
        </ul>
      )}
    </Tarjeta>
  );
}

const ESTADOS = [
  ['en_integracion', 'En integración'], ['esperando_cliente', 'Esperando cliente'], ['en_revision_autoridad', 'En revisión de la autoridad'],
  ['con_observaciones', 'Con observaciones'], ['suspendido', 'Suspendido'], ['comercial', 'Comercial'], ['concluido', 'Concluido'],
];

export function Ajustes({ e, alCambiar }) {
  const [contactos, setContactos] = useState([]);
  const [aviso, setAviso] = useState('');
  useEffect(() => {
    api('/api/clientes').then(cs => setContactos(cs.find(c => c.terminales.some(t => t.id === e.terminal_id))?.contactos ?? [])).catch(() => {});
  }, [e.terminal_id]);
  async function archivar() {
    if (!confirm('¿Archivar este expediente? No se borra: queda en la base y en la bitácora.')) return;
    try { await api(`/api/expedientes/${e.id}/archivar`, { metodo: 'POST' }); location.href = '/'; } catch (err) { setAviso(err.message); }
  }
  return (
    <div className="space-y-5">
      <Tarjeta titulo="Seguimiento">
        <Formulario alEnviar={async (d) => {
          const datos = { ...d, piloto_automatico: Boolean(d.piloto_automatico) };
          if (!datos.contacto_id) delete datos.contacto_id;
          await api(`/api/expedientes/${e.id}`, { metodo: 'PATCH', datos }); await alCambiar();
        }}>
          <Campo etiqueta="Estado"><select name="estado" defaultValue={e.estado} className={estiloEntrada}>{ESTADOS.filter(x => x[0] !== 'concluido').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo etiqueta="Siguiente paso"><input name="siguiente_paso" defaultValue={e.siguiente_paso ?? ''} className={estiloEntrada} /></Campo>
          <Campo etiqueta="Contacto del cliente"><select name="contacto_id" defaultValue={e.contacto_id ?? ''} className={estiloEntrada}>
            <option value="">—</option>{contactos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></Campo>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="piloto_automatico" defaultChecked={e.piloto_automatico} /> Piloto automático (prepara recordatorios para aprobación)</label>
        </Formulario>
      </Tarjeta>
      <Tarjeta titulo="Concluir expediente">
        <p className="mb-2 text-xs text-slate-600">Para concluir, registre el oficio o acuerdo que lo resolvió y elija el documento (súbalo antes en Documentos). Esto habilita el siguiente trámite de la cadena.</p>
        <Formulario textoBoton="Concluir" alEnviar={async (d) => { await api(`/api/expedientes/${e.id}`, { metodo: 'PATCH', datos: { ...d, estado: 'concluido' } }); await alCambiar(); return 'Expediente concluido.'; }}>
          <Campo etiqueta="Oficio o acuerdo"><input name="resultado" required className={estiloEntrada} defaultValue={e.resultado ?? ''} /></Campo>
          <Campo etiqueta="Documento del resultado"><select name="resultado_documento_id" required className={estiloEntrada}>
            <option value="">—</option>{e.documentos.filter(d => d.disponible).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select></Campo>
        </Formulario>
      </Tarjeta>
      <Tarjeta titulo="Cobro (solo registro)">
        <Formulario textoBoton="Agregar hito" alEnviar={async (d) => { await api(`/api/expedientes/${e.id}/cobros`, { metodo: 'POST', datos: d }); await alCambiar(); }}>
          <div className="grid gap-2 sm:grid-cols-3">
            <Campo etiqueta="Hito"><input name="descripcion" required className={estiloEntrada} placeholder="Anticipo 50%" /></Campo>
            <Campo etiqueta="%"><input name="porcentaje" type="number" min="0" max="100" className={estiloEntrada} /></Campo>
            <Campo etiqueta="Orden de compra"><input name="orden_compra" className={estiloEntrada} /></Campo>
          </div>
        </Formulario>
        <ul className="mt-3 space-y-2 text-sm">
          {e.cobros.map(c => <HitoCobro key={c.id} c={c} alCambiar={alCambiar} />)}
        </ul>
      </Tarjeta>
      <Aviso>{aviso}</Aviso>
      <button onClick={archivar} className="text-sm text-slate-600 underline">Archivar expediente</button>
    </div>
  );
}

function HitoCobro({ c, alCambiar }) {
  return (
    <li className="rounded-lg bg-slate-50 p-2">
      <b>{c.descripcion}</b>{c.porcentaje ? ` (${c.porcentaje}%)` : ''}
      <Formulario className="mt-2 grid gap-2 sm:grid-cols-4" textoBoton="Actualizar" alEnviar={async (d) => { await api(`/api/cobros/${c.id}`, { metodo: 'PATCH', datos: d }); await alCambiar(); }}>
        <input name="orden_compra" defaultValue={c.orden_compra ?? ''} placeholder="OC" className={estiloEntrada} aria-label="Orden de compra" />
        <input name="folio_factura" defaultValue={c.folio_factura ?? ''} placeholder="Folio" className={estiloEntrada} aria-label="Folio" />
        <select name="estatus" defaultValue={c.estatus} className={estiloEntrada} aria-label="Estatus">
          {['pendiente', 'oc_pendiente', 'facturado', 'pago_por_confirmar', 'pagado'].map(x => <option key={x} value={x}>{x.replaceAll('_', ' ')}</option>)}
        </select>
      </Formulario>
    </li>
  );
}
