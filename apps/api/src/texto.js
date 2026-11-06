// Extrae el texto de un documento para la revisión automática.
// PDF (con texto, no escaneado), Word .docx y texto plano. Si no se puede
// extraer, devuelve null y la revisión pide que una persona lo revise.
const LIMITE = 400_000; // caracteres guardados por documento

export async function extraerTexto(buffer, { nombre = '', tipo = '' } = {}) {
  const ext = nombre.toLowerCase().split('.').pop();
  try {
    if (tipo === 'application/pdf' || ext === 'pdf') {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return limpiar(text);
    }
    if (ext === 'docx' || tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      return limpiar(value);
    }
    if (tipo.startsWith('text/') || ['txt', 'csv', 'md'].includes(ext)) {
      return limpiar(buffer.toString('utf8'));
    }
  } catch {
    return null;
  }
  return null;
}

function limpiar(t) {
  const s = String(t ?? '').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim();
  return s ? s.slice(0, LIMITE) : null;
}
