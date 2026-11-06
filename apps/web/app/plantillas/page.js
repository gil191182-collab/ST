'use client';
// Plantillas anónimas creadas a partir de documentos que la autoridad ya aprobó.
import { api, fechaHora } from '../../lib/api';
import { EncabezadoConsultor, Tarjeta, Aviso, Cargando, usarDatos } from '../componentes';

export default function Plantillas() {
  const { yo, datos, error } = usarDatos('/api/plantillas');
  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />;
  return (
    <>
      <EncabezadoConsultor yo={yo} />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <h1 className="text-2xl font-semibold">Plantillas de referencias autorizadas</h1>
        <p className="text-sm text-slate-600">Para crear una: abra el expediente, pestaña Documentos, marque el documento como «aprobado por la autoridad» y use «Crear plantilla». Una persona revisa que no quede ningún dato del cliente.</p>
        {datos.map(p => (
          <Tarjeta key={p.id} titulo={`${p.tramite} · ${p.nombre}`}>
            <p className="mb-2 text-xs text-slate-500">Revisada por {p.revisada_por} · {fechaHora(p.creado_en)}</p>
            <details><summary className="cursor-pointer text-sm text-marca-acento-texto">Ver texto</summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">{p.contenido_anonimo}</pre>
            </details>
            <button onClick={() => navigator.clipboard?.writeText(p.contenido_anonimo)} className="mt-2 text-xs text-marca-acento-texto underline">Copiar texto</button>
          </Tarjeta>
        ))}
        {!datos.length && <p className="text-sm text-slate-500">Aún no hay plantillas.</p>}
      </main>
    </>
  );
}
