// Envío por WhatsApp (WATI) y correo. SOLO se usan para acciones que una
// persona ya aprobó. Si un canal no está configurado, no se envía nada y la
// acción se queda "aprobada" con una nota: nunca se finge un envío.

export function crearCanales(env = process.env, fetchImpl = globalThis.fetch) {
  const wati = env.WATI_URL && env.WATI_TOKEN ? { url: env.WATI_URL.replace(/\/$/, ''), token: env.WATI_TOKEN } : null;
  const correo = env.CORREO_RELAY_URL && env.CORREO_RELAY_TOKEN ? { url: env.CORREO_RELAY_URL, token: env.CORREO_RELAY_TOKEN, de: env.CORREO_REMITENTE } : null;

  return {
    configurados: { whatsapp: Boolean(wati), correo: Boolean(correo) },

    async whatsapp({ telefono, texto }) {
      if (!wati) return { ok: false, error: 'WhatsApp (WATI) aún no está configurado.' };
      if (!telefono) return { ok: false, error: 'El contacto no tiene teléfono capturado.' };
      const numero = telefono.replace(/\D/g, '');
      // Mensaje de sesión de WATI (dentro de la ventana de 24 h). Fuera de la ventana
      // WATI exige plantilla aprobada: pendiente de definir con la cuenta real.
      const r = await fetchImpl(`${wati.url}/api/v1/sendSessionMessage/${numero}?messageText=${encodeURIComponent(texto)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${wati.token}` },
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok || cuerpo.result === false) return { ok: false, error: `WATI respondió ${r.status}: ${cuerpo.message ?? cuerpo.info ?? 'sin detalle'}` };
      return { ok: true };
    },

    // El correo sale por un "relay" configurable (p. ej. el servicio de correo de la
    // cuenta de Mayela). Se define al conectar la cuenta del despacho.
    async correo({ para, asunto, texto }) {
      if (!correo) return { ok: false, error: 'La cuenta de correo del despacho aún no está conectada.' };
      if (!para) return { ok: false, error: 'El contacto no tiene correo capturado.' };
      const r = await fetchImpl(correo.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${correo.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ de: correo.de, para, asunto, texto }),
      });
      if (!r.ok) return { ok: false, error: `El servicio de correo respondió ${r.status}.` };
      return { ok: true };
    },
  };
}
