'use client';
// Llamadas a la API desde el navegador (la sesión va en una cookie segura).

export async function api(ruta, { metodo = 'GET', datos, formulario } = {}) {
  const r = await fetch(ruta, {
    method: metodo,
    credentials: 'include',
    headers: datos ? { 'Content-Type': 'application/json' } : undefined,
    body: formulario ?? (datos ? JSON.stringify(datos) : undefined),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (r.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/entrar')) {
    location.href = '/entrar';
  }
  if (!r.ok) throw Object.assign(new Error(cuerpo.mensaje ?? 'No se pudo completar la operación.'), { codigo: cuerpo.error, estatus: r.status });
  return cuerpo;
}

export const ESTADOS_EXPEDIENTE = {
  comercial: 'Comercial', en_integracion: 'En integración', esperando_cliente: 'Esperando cliente',
  en_revision_autoridad: 'En revisión de la autoridad', con_observaciones: 'Con observaciones',
  concluido: 'Concluido', suspendido: 'Suspendido',
};

export const ESTADOS_REQUISITO = {
  pendiente: 'Pendiente', por_elaborar: 'Por elaborar', en_integracion: 'En integración', parcial: 'Parcial',
  recibido: 'Recibido', revision_cliente: 'Revisión cliente', en_revision: 'En revisión',
  observacion: 'Observación', por_confirmar: 'Por confirmar', aprobado: 'Aprobado',
};

export const RESPONSABLE = { despacho: 'Despacho', cliente: 'Cliente', ambos: 'Ambos', autoridad: 'Autoridad' };

// Colores de estado: semánticos (no de marca), con contraste AA sobre su fondo.
export const COLOR_ESTADO = {
  aprobado: 'bg-emerald-100 text-emerald-800', recibido: 'bg-sky-100 text-sky-800',
  observacion: 'bg-red-100 text-red-800', pendiente: 'bg-amber-100 text-amber-900',
  por_confirmar: 'bg-amber-100 text-amber-900', parcial: 'bg-amber-100 text-amber-900',
  en_revision: 'bg-indigo-100 text-indigo-800', revision_cliente: 'bg-indigo-100 text-indigo-800',
  en_integracion: 'bg-slate-200 text-slate-800', por_elaborar: 'bg-slate-200 text-slate-800',
};

export const COLOR_URGENCIA = {
  vencido: 'bg-red-700 text-white', critico: 'bg-red-100 text-red-800', atencion: 'bg-amber-100 text-amber-900',
  en_tiempo: 'bg-emerald-100 text-emerald-800', sin_fecha: 'bg-slate-200 text-slate-700',
};

export const ETIQUETA_URGENCIA = { vencido: 'Vencido', critico: 'Crítico', atencion: 'Atención', en_tiempo: 'En tiempo', sin_fecha: 'Sin fecha fija' };

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
/** '2026-02-23' → '23 feb 2026' */
export function fechaCorta(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

export function fechaHora(iso) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(iso));
}
