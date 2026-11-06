'use client';
// Enlace de invitación o de restablecer contraseña.
import { use, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { Aviso } from '../../componentes';

export default function Acceso({ params }) {
  const { ficha } = use(params);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');

  useEffect(() => { api(`/api/acceso/${ficha}`).then(setInfo).catch(e => setError(e.message)); }, [ficha]);

  async function enviar(e) {
    e.preventDefault();
    if (clave !== repetir) { setError('Las contraseñas no coinciden.'); return; }
    setError('');
    try {
      const { usuario } = await api(`/api/acceso/${ficha}`, { metodo: 'POST', datos: { clave } });
      location.href = usuario.rol === 'cliente' ? '/portal' : '/';
    } catch (err) { setError(err.message); }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-marca-fondo px-4">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold">{info?.motivo === 'restablecer' ? 'Nueva contraseña' : 'Bienvenido'}</h1>
        {info && <p className="text-sm text-slate-600">{info.nombre} ({info.correo}), defina su contraseña de al menos 10 caracteres.</p>}
        {info && (
          <>
            <label className="block text-sm"><span className="mb-1 block font-medium">Contraseña</span>
              <input type="password" minLength={10} required autoComplete="new-password" value={clave} onChange={e => setClave(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Repítala</span>
              <input type="password" minLength={10} required autoComplete="new-password" value={repetir} onChange={e => setRepetir(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          </>
        )}
        <Aviso>{error}</Aviso>
        {info && <button className="boton-accion w-full rounded-lg px-4 py-2 font-medium">Guardar y entrar</button>}
      </form>
    </main>
  );
}
