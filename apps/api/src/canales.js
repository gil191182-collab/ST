// Envío por WhatsApp (wa-mcp) y correo. SOLO se usan para acciones que una
// persona ya aprobó. Si un canal no está configurado, no se envía nada y la
// acción se queda "aprobada" con una nota: nunca se finge un envío.

export function crearCanales(env = process.env, fetchImpl = globalThis.fetch, transporteCorreo = null) {
  // WhatsApp por wa-mcp (plataforma propia, número compartido). Logistics es el sistema "lg":
  // su llave solo manda plantillas lg_* y solo se entera de las conversaciones que abrió.
  // WA_REAL=1 es el interruptor: sin él no se manda nada aunque haya llave.
  const wa = env.WA_MCP_URL && env.WA_LLAVE && env.WA_REAL === '1'
    ? { url: env.WA_MCP_URL.replace(/\/$/, ''), llave: env.WA_LLAVE, plantilla: env.WA_PLANTILLA || 'lg_recordatorio',
        // La categoría que Meta le asignó a la plantilla (cuenta para el tope diario de marketing de wa-mcp)
        categoria: (env.WA_PLANTILLA_CATEGORIA || 'marketing').toLowerCase() } : null;
  const smtp = env.SMTP_HOST && env.SMTP_USUARIO && env.SMTP_CLAVE ? {
    host: env.SMTP_HOST, port: Number(env.SMTP_PUERTO ?? 465), secure: env.SMTP_SEGURO !== 'false',
    auth: { user: env.SMTP_USUARIO, pass: env.SMTP_CLAVE },
  } : null;
  const remitente = env.CORREO_REMITENTE ?? env.SMTP_USUARIO;
  // Mailrelay (la misma cuenta que usan CertifAI y VerifyPerson). MAILRELAY_REAL=1 es el interruptor.
  const mailrelay = env.MAILRELAY_API_KEY && env.MAILRELAY_BASE_URL && env.MAILRELAY_FROM_EMAIL && env.MAILRELAY_REAL === '1' ? {
    url: env.MAILRELAY_BASE_URL.replace(/\/$/, ''), llave: env.MAILRELAY_API_KEY,
    de: { email: env.MAILRELAY_FROM_EMAIL, name: env.MAILRELAY_FROM_NAME || 'Strateggia Logistics' },
  } : null;
  const copia = (env.CORREO_COPIA ?? '').trim();
  const correo = env.CORREO_RELAY_URL && env.CORREO_RELAY_TOKEN ? { url: env.CORREO_RELAY_URL, token: env.CORREO_RELAY_TOKEN, de: env.CORREO_REMITENTE } : null;

  async function llamarWa(ruta, cuerpo) {
    const r = await fetchImpl(`${wa.url}${ruta}`, {
      method: 'POST',
      headers: { 'X-API-Key': wa.llave, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const datos = await r.json().catch(() => ({}));
    return { ok: r.ok, estatus: r.status, datos };
  }

  // Meta no acepta saltos de línea ni más de 4 espacios seguidos en una variable.
  const limpiarVariable = (v) => String(v ?? '').replace(/\s*\n+\s*/g, ' · ').replace(/\s{4,}/g, '   ').trim().slice(0, 900) || '—';

  return {
    configurados: { whatsapp: Boolean(wa), correo: Boolean(mailrelay || smtp || correo) },

    /**
     * Texto libre si la ventana de 24 h está abierta; si está cerrada, la plantilla
     * lg_recordatorio con `variables` [nombre, consultora, trámite, mensaje].
     */
    async whatsapp({ telefono, texto, variables }) {
      if (!wa) return { ok: false, error: 'WhatsApp (wa-mcp) aún no está configurado.' };
      if (!telefono) return { ok: false, error: 'El contacto no tiene teléfono capturado.' };
      const numero = String(telefono).replace(/\D/g, '');
      try {
        const t = await llamarWa('/mensajes', { telefono: numero, texto });
        if (t.ok) return { ok: true, via: 'texto' };
        const ventanaCerrada = t.estatus === 422 && /ventana/i.test(t.datos.error ?? '');
        if (!ventanaCerrada) return { ok: false, error: `wa-mcp: ${t.datos.error ?? `HTTP ${t.estatus}`}` };
        if (!variables?.length) return { ok: false, error: 'La conversación está cerrada (más de 24 h) y no hay datos para la plantilla.' };
        const p = await llamarWa('/plantillas/enviar', {
          telefono: numero, plantilla: wa.plantilla, categoria: wa.categoria, idioma: 'es_MX', variables: variables.map(limpiarVariable),
        });
        if (p.ok) return { ok: true, via: `plantilla ${wa.plantilla}` };
        return { ok: false, error: `wa-mcp (plantilla): ${p.datos.error ?? `HTTP ${p.estatus}`}` };
      } catch (e) {
        return { ok: false, error: `No se pudo hablar con wa-mcp: ${e.message}` };
      }
    },

    // El correo sale por SMTP (p. ej. Gmail con contraseña de aplicación) o por un
    // "relay" HTTP. Sin ninguno configurado no se envía nada.
    async correo({ para, asunto, texto }) {
      if (mailrelay) {
        if (!para) return { ok: false, error: 'El contacto no tiene correo capturado.' };
        const html = String(texto).split(/\n\s*\n/).map(p => `<p>${p.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/\n/g, '<br>')}</p>`).join('');
        const enviar = async (destino, tema) => {
          const r = await fetchImpl(`${mailrelay.url}/api/v1/send_emails`, {
            method: 'POST',
            headers: { 'X-AUTH-TOKEN': mailrelay.llave, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ from: mailrelay.de, to: [{ email: destino }], subject: tema, html_part: html, text_part_auto: true }),
          });
          if (!r.ok) throw new Error(`Mailrelay respondió ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
        };
        try {
          await enviar(para, asunto);
        } catch (e) { return { ok: false, error: e.message }; }
        // Copia opcional de todo correo que sale (si falla, el original ya salió)
        if (copia && copia.toLowerCase() !== String(para).toLowerCase()) await enviar(copia, `[Copia] ${asunto}`).catch(() => {});
        return { ok: true, via: 'mailrelay' };
      }
      if (smtp) {
        if (!para) return { ok: false, error: 'El contacto no tiene correo capturado.' };
        try {
          const transporte = transporteCorreo ?? (await import('nodemailer')).default.createTransport(smtp);
          await transporte.sendMail({ from: remitente, to: para, subject: asunto, text: texto });
          return { ok: true };
        } catch (e) { return { ok: false, error: `El servidor de correo respondió: ${e.message}` }; }
      }
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
