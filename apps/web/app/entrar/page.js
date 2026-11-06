'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { Aviso } from '../componentes';

export default function Entrar() {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(''); setEnviando(true);
    try {
      const { usuario } = await api('/api/sesion', { metodo: 'POST', datos: { correo, clave } });
      location.href = usuario.rol === 'cliente' ? '/portal' : '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-marca-fondo px-4">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div>
          <h1 className="text-xl font-semibold">Portal de trámites ferroviarios</h1>
          <p className="text-sm text-slate-500">Entre con su correo y contraseña.</p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Correo</span>
          <input type="email" required autoComplete="username" value={correo} onChange={e => setCorreo(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Contraseña</span>
          <input type="password" required autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <Aviso>{error}</Aviso>
        <button disabled={enviando} className="boton-accion w-full rounded-lg px-4 py-2 font-medium disabled:opacity-60">
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
