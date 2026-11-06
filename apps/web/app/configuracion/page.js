'use client';
// Marca del despacho: logo → colores con verificación de contraste; datos de contacto.
import { useState } from 'react';
import { api } from '../../lib/api';
import { EncabezadoConsultor, Tarjeta, Aviso, Cargando, Campo, Formulario, estiloEntrada, usarDatos } from '../componentes';

export default function Configuracion() {
  const { yo, datos: d, error, cargar } = usarDatos('/api/despacho');
  const [aviso, setAviso] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  if (!d) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  const esDirector = yo?.usuario?.rol === 'director';
  const t = d.temaCalculado;

  async function subirLogo(ev) {
    const archivo = ev.target.files?.[0];
    if (!archivo) return;
    const f = new FormData(); f.append('archivo', archivo);
    setSubiendo(true); setAviso('');
    try { const r = await api('/api/despacho/logo', { metodo: 'POST', formulario: f }); setAviso(r.tema.verificacion.ajustes.join(' ') || 'Colores extraídos del logo; todos cumplen el contraste.'); await cargar(); location.reload(); }
    catch (e) { setAviso(e.message); } finally { setSubiendo(false); }
  }

  return (
    <>
      <EncabezadoConsultor yo={yo} />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <h1 className="text-2xl font-semibold">Configuración del despacho</h1>
        {!esDirector && <Aviso>Solo el director puede cambiar la configuración.</Aviso>}
        <div className="grid gap-5 md:grid-cols-2">
          <Tarjeta titulo="Marca">
            <div className="flex items-center gap-4">
              {d.tieneLogo
                ? <img src="/api/despacho/logo" alt={`Logo de ${d.nombre}`} className="h-20 w-20 rounded-lg bg-white object-contain ring-1 ring-slate-200" />
                : <div className="grid h-20 w-20 place-items-center rounded-lg bg-slate-100 text-xs text-slate-500">Sin logo</div>}
              {esDirector && (
                <label className="boton-accion cursor-pointer rounded-lg px-4 py-2 text-sm font-medium">
                  {subiendo ? 'Leyendo colores…' : 'Subir logo'}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={subirLogo} />
                </label>
              )}
            </div>
            <Aviso tipo="ok">{aviso}</Aviso>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <Muestra nombre="Fondo" color={t.fondo} texto={t.textoFondo} razon={t.verificacion.textoSobreFondo} />
              <Muestra nombre="Acento" color={t.acento} texto={t.fondo} />
              <Muestra nombre="Botón de acción" color={t.accion} texto={t.textoAccion} razon={t.verificacion.textoSobreAccion} />
            </div>
            <p className="mt-2 text-xs text-slate-500">Contraste mínimo 4.5:1 en todo texto. Si un color no lo cumple, el sistema lo ajusta solo.</p>
            {t.verificacion.ajustes.map((a, i) => <p key={i} className="text-xs text-amber-800">{a}</p>)}
          </Tarjeta>
          {esDirector && (
            <Tarjeta titulo="Datos del despacho">
              <Formulario alEnviar={async (x) => { await api('/api/despacho', { metodo: 'PATCH', datos: x }); await cargar(); location.reload(); }}>
                <Campo etiqueta="Nombre"><input name="nombre" defaultValue={d.nombre} className={estiloEntrada} /></Campo>
                <Campo etiqueta="Lema"><input name="lema" defaultValue={d.lema ?? ''} className={estiloEntrada} /></Campo>
                <Campo etiqueta="Correo que recibe notificaciones de la ATTRAPI"><input name="correo_notificaciones" type="email" defaultValue={d.correo_notificaciones ?? ''} className={estiloEntrada} /></Campo>
                <Campo etiqueta="Número de WhatsApp del despacho"><input name="whatsapp_numero" defaultValue={d.whatsapp_numero ?? ''} className={estiloEntrada} /></Campo>
                <Campo etiqueta="Tipografía (Google Fonts)"><input name="tipografia" defaultValue={d.tema.tipografia ?? 'Poppins'} className={estiloEntrada} /></Campo>
                <details className="text-sm">
                  <summary className="cursor-pointer text-marca-acento-texto">Ajustar colores a mano</summary>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Campo etiqueta="Fondo"><input name="fondo" type="color" defaultValue={d.tema.fondo} className="h-10 w-full" /></Campo>
                    <Campo etiqueta="Acento"><input name="acento" type="color" defaultValue={d.tema.acento} className="h-10 w-full" /></Campo>
                    <Campo etiqueta="Acción"><input name="accion" type="color" defaultValue={d.tema.accion ?? d.tema.acento} className="h-10 w-full" /></Campo>
                  </div>
                </details>
              </Formulario>
            </Tarjeta>
          )}
        </div>
      </main>
    </>
  );
}

function Muestra({ nombre, color, texto, razon }) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
      <div className="grid h-14 place-items-center text-sm font-medium" style={{ background: color, color: texto }}>Texto</div>
      <div className="p-1.5"><b>{nombre}</b><br />{color.toUpperCase()}{razon ? ` · ${razon}:1` : ''}</div>
    </div>
  );
}
