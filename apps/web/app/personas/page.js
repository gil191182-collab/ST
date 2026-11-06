'use client';
// Personas del despacho y clientes con acceso al portal: invitar, restablecer, archivar.
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { EncabezadoConsultor, Tarjeta, Aviso, Cargando, Campo, Formulario, estiloEntrada, usarDatos, Etiqueta } from '../componentes';

const ROL = { director: 'Director', consultor: 'Consultor', cliente: 'Cliente' };

export default function Personas() {
  const { yo, datos: personas, error, cargar } = usarDatos('/api/usuarios');
  const [clientes, setClientes] = useState(null);
  const [enlace, setEnlace] = useState('');
  const [aviso, setAviso] = useState('');
  useEffect(() => { api('/api/clientes').then(setClientes).catch(() => setClientes([])); }, []);
  if (!personas) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  const esDirector = yo?.usuario?.rol === 'director';
  const mostrar = (r) => setEnlace(`${location.origin}${r.enlace}`);

  async function accion(ruta) {
    setAviso('');
    try { const r = await api(ruta, { metodo: 'POST', datos: {} }); if (r.enlace) mostrar(r); await cargar(); } catch (e) { setAviso(e.message); }
  }

  return (
    <>
      <EncabezadoConsultor yo={yo} />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <h1 className="text-2xl font-semibold">Personas</h1>
        {enlace && (
          <div className="rounded-xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200">
            <p className="font-medium">Enlace de acceso (de un solo uso). Envíelo a la persona por WhatsApp o correo:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input readOnly value={enlace} className={`${estiloEntrada} flex-1 bg-white`} aria-label="Enlace" onFocus={e => e.target.select()} />
              <button onClick={() => navigator.clipboard?.writeText(enlace)} className="boton-accion rounded-lg px-3 py-2 text-xs font-medium">Copiar</button>
            </div>
          </div>
        )}
        <Aviso>{aviso}</Aviso>
        <div className="grid gap-5 lg:grid-cols-3">
          <Tarjeta className="lg:col-span-2">
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {personas.map(p => (
                    <tr key={p.id} className={p.archivado_en ? 'opacity-50' : ''}>
                      <td className="py-2"><b>{p.nombre}</b><div className="text-xs text-slate-500">{p.correo}</div></td>
                      <td>{ROL[p.rol]}{p.cliente ? ` · ${p.cliente}` : ''}</td>
                      <td>{p.archivado_en ? <Etiqueta clase="bg-slate-200 text-slate-700">Archivado</Etiqueta> : p.activo ? <Etiqueta clase="bg-emerald-100 text-emerald-800">Activo</Etiqueta> : <Etiqueta clase="bg-amber-100 text-amber-900">Invitado</Etiqueta>}</td>
                      <td className="space-x-2 text-right">
                        {!p.archivado_en && (esDirector || p.rol === 'cliente') && <button onClick={() => accion(`/api/usuarios/${p.id}/restablecer`)} className="text-xs text-marca-acento-texto underline">Nuevo enlace</button>}
                        {!p.archivado_en && esDirector && p.id !== yo.usuario.id && <button onClick={() => confirm(`¿Archivar a ${p.nombre}? Ya no podrá entrar.`) && accion(`/api/usuarios/${p.id}/archivar`)} className="text-xs text-slate-600 underline">Archivar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
          <Tarjeta titulo="Invitar">
            <Formulario textoBoton="Crear enlace de invitación" alEnviar={async (d) => { const r = await api('/api/usuarios', { metodo: 'POST', datos: d }); mostrar(r); await cargar(); return 'Invitación creada.'; }}>
              <Campo etiqueta="Nombre"><input name="nombre" required className={estiloEntrada} /></Campo>
              <Campo etiqueta="Correo"><input name="correo" type="email" required className={estiloEntrada} /></Campo>
              <Campo etiqueta="Teléfono"><input name="telefono" className={estiloEntrada} /></Campo>
              <Campo etiqueta="Rol"><select name="rol" className={estiloEntrada} defaultValue="cliente">
                <option value="cliente">Cliente (portal)</option>
                {esDirector && <option value="consultor">Consultor</option>}
                {esDirector && <option value="director">Director</option>}
              </select></Campo>
              <Campo etiqueta="Cliente (si es rol cliente)"><select name="cliente_id" className={estiloEntrada}>
                <option value="">—</option>{(clientes ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre_corto}</option>)}
              </select></Campo>
            </Formulario>
          </Tarjeta>
        </div>
      </main>
    </>
  );
}
