// Generación de escritos en Word (.docx) y PDF con la marca del despacho.
// - El domicilio se toma TEXTUAL del permiso (nunca se reescribe).
// - No se genera nada que cite a la antigua Agencia Reguladora ni con campos [CAPTURAR].
import {
  Document, Packer, Paragraph, TextRun, Header, Footer, ImageRun, AlignmentType, BorderStyle,
} from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fechaLarga, hoyMexico, revisarDocumento, construirTema } from '@logistics/dominio';

export const TIPOS_ESCRITO = {
  // Machote de Strateggia ("Escrito sugerido AVISO INICIO DE OPER"), usado con KERI en 2026.
  // Se quitó la mención a la antigua Agencia Reguladora (regla de textos exactos).
  solicitud_inicio_operaciones: {
    nombre: 'Solicitud de Constancia de Inicio de Operaciones (machote Strateggia)',
    destinatario: 'autoridad', membrete: false, firma: 'cliente',
    asunto: 'Solicitud de verificación y Constancia de Inicio de Operaciones',
    nota: 'Se imprime en hoja membretada del cliente. Si la póliza de RC ya cubre desastres naturales e incendio, quite el anexo 3 en el cuerpo.',
    campos: [
      { clave: 'escritura_poder', etiqueta: 'Escritura con la que acredita su personalidad el representante', placeholder: 'Escritura Pública No. 26,484 de fecha 21 de abril de 2016, pasada ante la fe del Notario Público No. 3 de Aguascalientes' },
      { clave: 'autorizados', etiqueta: 'Personas autorizadas para oír y recibir notificaciones', placeholder: 'los CC. Lic. Lisette Mayela Romero Pérez y Lic. ...' },
      { clave: 'domicilio_notificaciones', etiqueta: 'Domicilio para oír y recibir notificaciones', placeholder: 'Avenida ..., colonia ..., C.P. ...' },
      { clave: 'superficie', etiqueta: 'Superficie de la terminal (como viene en el permiso)', placeholder: '175,311.00 m²' },
      { clave: 'condicion_inicio', etiqueta: 'Condición del permiso que pide avisar el inicio', placeholder: 'Condición DÉCIMA' },
      { clave: 'condicion_anexos', etiqueta: 'Condición del permiso que pide los documentos', placeholder: 'Condición DÉCIMA' },
    ],
    cuerpo: [
      '{{representante}}, en mi carácter de representante legal de {{razon_social}}, personalidad que acredito con la {{escritura_poder}}, autorizando a {{autorizados}}, con domicilio en {{domicilio_notificaciones}}, para oír y recibir notificaciones, ante usted expongo lo siguiente:',
      'La Secretaría de Infraestructura, Comunicaciones y Transportes otorgó a mi representada el Permiso {{permiso}}, de fecha {{fecha_permiso}}, para prestar el servicio auxiliar de {{servicio}}, sobre una superficie de {{superficie}}, ubicada en {{domicilio}}. En cumplimiento de la {{condicion_inicio}} del permiso, informo nuestra intención de iniciar operaciones y solicito que se realice la verificación de las instalaciones, a fin de que se constaten sus condiciones operativas y se otorgue la Constancia de Inicio de Operaciones del servicio auxiliar.',
      'Asimismo, en cumplimiento de la {{condicion_anexos}} del permiso, anexo al presente los siguientes documentos:',
      '1. Copia certificada del Estudio de Pérdida Máxima Probable y/o Estudio de Análisis de Riesgo de la terminal.',
      '2. Impresión fiel de la Póliza de Seguro de Responsabilidad Civil, en la que se amparan los daños que puedan ocasionarse a terceros en sus personas, en sus bienes y a las Vías Generales de Comunicación cuando dichos daños sean originados por la prestación del servicio auxiliar de {{servicio}}, así como los daños que se originen por desastres naturales a la prestación de los servicios, vías férreas e instalaciones de la terminal, con su comprobante de pago. Se solicita su aprobación de acuerdo con el artículo 194 del Reglamento del Servicio Ferroviario.',
      '3. Impresión fiel de la Póliza de seguro contra riesgos, particularmente desastres naturales e incendio.',
      '4. Copia de la resolución del Registro de Tarifas.',
      '5. Copia de la resolución del Programa de Contingencias.',
      '6. Documento original de las Bases de Coordinación, que establecen las reglas que regirán las relaciones entre los diferentes modos de transporte, así como las disposiciones de seguridad, vigilancia y control de acceso.',
      '7. Copia del documento que garantiza la relación comercial con el concesionario, para la recepción del servicio ferroviario.',
      '8. Comprobante del pago de derechos relativo a la verificación por inicio de operaciones.',
      'Manifiesto, bajo protesta de decir verdad, que la información proporcionada para la obtención de dicha constancia es verídica.',
      'Por lo anteriormente expuesto, solicito a usted:',
      'Primero. Tenerme por presentado en los términos de este escrito, en mi carácter de representante legal de {{razon_social}}.',
      'Segundo. Otorgar a mi representada la Constancia de Inicio de Operaciones para la prestación del servicio auxiliar de {{servicio}}.',
    ],
  },
  aviso_inicio_operaciones: {
    nombre: 'Aviso de inicio de operaciones (texto corto)',
    destinatario: 'autoridad', membrete: false, firma: 'cliente',
    asunto: 'Aviso de inicio de operaciones',
    // BORRADOR: Mayela debe validar este texto contra la normativa antes de usarlo con clientes.
    cuerpo: [
      '{{representante}}, en mi carácter de representante legal de {{razon_social}}, titular del permiso {{permiso}} para prestar el servicio auxiliar de {{servicio}}, con domicilio de la terminal en {{domicilio}}, por medio del presente escrito informo a esa Agencia la fecha de inicio de operaciones de la terminal: {{fecha_inicio}}.',
      'Anexo al presente la documentación que acredita el cumplimiento de los requisitos correspondientes.',
      'Sin otro particular, quedo atento a cualquier requerimiento.',
    ],
  },
  escrito_libre: {
    nombre: 'Escrito libre a la ATTRAPI',
    destinatario: 'autoridad', membrete: false, firma: 'cliente', asunto: '', cuerpo: [],
  },
  carta_despacho: {
    nombre: 'Carta del despacho (membretada)',
    destinatario: 'libre', membrete: true, firma: 'consultor', asunto: '', cuerpo: [],
  },
};

export class ErrorEscrito extends Error {}

/** Arma el contenido (texto) del escrito y lo valida con las reglas del catálogo. */
export function armarEscrito({ tipo, datos, cuerpo, asunto, lugar, fecha = hoyMexico(), destinatario, firmante, cargoFirmante, extras = {} }) {
  const t = TIPOS_ESCRITO[tipo];
  if (!t) throw new ErrorEscrito('Tipo de escrito desconocido.');
  const parrafos = (cuerpo?.length ? cuerpo : t.cuerpo);
  if (!parrafos.length) throw new ErrorEscrito('Escriba el cuerpo del escrito.');
  const valores = {
    razon_social: datos.razon_social, permiso: datos.permiso_numero, servicio: datos.servicio?.toLowerCase(),
    domicilio: datos.domicilio_textual, representante: firmante ?? datos.representante, fecha_inicio: datos.fecha_inicio,
    fecha_permiso: datos.fecha_otorgamiento ? fechaLarga(datos.fecha_otorgamiento) : undefined,
  };
  // Datos que pide cada tipo de escrito (escritura del poder, autorizados...): solo los declarados.
  for (const c of t.campos ?? []) {
    const v = typeof extras[c.clave] === 'string' ? extras[c.clave].trim() : '';
    if (v) valores[c.clave] = v;
  }
  const faltan = new Set();
  const rellenar = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!valores[k]) { faltan.add(k); return `[CAPTURAR ${k}]`; }
    return valores[k];
  });
  const contenido = {
    lugarFecha: `${lugar || datos.lugar || '[CAPTURAR lugar]'}, a ${fechaLarga(fecha)}`,
    destinatario: t.destinatario === 'autoridad'
      ? ['AGENCIA DE TRENES Y TRANSPORTE PÚBLICO INTEGRADO', 'P R E S E N T E']
      : (destinatario ? destinatario.split('\n') : []),
    asunto: rellenar(asunto || t.asunto || ''),
    referencia: datos.permiso_numero ? `Permiso: ${datos.permiso_numero}` : '',
    parrafos: parrafos.map(rellenar),
    firmante: firmante ?? datos.representante ?? '[CAPTURAR firmante]',
    cargo: cargoFirmante ?? (t.firma === 'cliente' ? `Representante legal de ${datos.razon_social}` : datos.despacho),
    membrete: t.membrete,
  };
  const textoCompleto = [contenido.lugarFecha, ...contenido.destinatario, contenido.asunto, contenido.referencia, ...contenido.parrafos, contenido.firmante, contenido.cargo].join('\n');
  const revision = revisarDocumento({ texto: textoCompleto, domicilioPermiso: t.cuerpo.some(p => p.includes('{{domicilio}}')) ? datos.domicilio_textual : undefined });
  const bloqueos = revision.filter(r => ['FALLA', 'FALTA'].includes(r.resultado));
  if (bloqueos.length) {
    throw new ErrorEscrito(`No se puede generar el escrito: ${bloqueos.map(b => b.mensaje).join(' ')}${faltan.size ? ` Faltan: ${[...faltan].join(', ')}.` : ''}`);
  }
  return { contenido, textoCompleto, revision };
}

const hexARgb01 = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };

/** Word (.docx) */
export async function escritoDocx({ contenido, marca, logo }) {
  const tema = construirTema(marca);
  const fuente = tema.tipografia ?? 'Poppins';
  const p = (texto, op = {}) => new Paragraph({ spacing: { after: 160, line: 300 }, ...op, children: [new TextRun({ text: texto, font: fuente, size: 22, ...(op.run ?? {}) })] });
  const encabezado = contenido.membrete ? new Header({ children: [
    logo
      ? new Paragraph({ children: [new ImageRun({ type: logo.tipo, data: logo.datos, transformation: { width: 160, height: 160 * logo.proporcion } })] })
      : new Paragraph({ children: [new TextRun({ text: marca.nombre, bold: true, font: fuente, size: 28, color: tema.fondo.slice(1) })] }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: tema.acento.slice(1), space: 4 } }, children: [] }),
  ] }) : undefined;
  const pie = contenido.membrete ? new Footer({ children: [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${marca.nombre}${marca.lema ? ` · ${marca.lema}` : ''}`, font: fuente, size: 16, color: tema.acentoTexto.slice(1) })] }),
  ] }) : undefined;
  const doc = new Document({
    creator: marca.nombre, title: contenido.asunto || 'Escrito',
    sections: [{
      headers: encabezado ? { default: encabezado } : undefined,
      footers: pie ? { default: pie } : undefined,
      children: [
        p(contenido.lugarFecha, { alignment: AlignmentType.RIGHT }),
        ...contenido.destinatario.map((l, i) => p(l, { spacing: { after: i === contenido.destinatario.length - 1 ? 240 : 0 }, run: { bold: true } })),
        ...(contenido.asunto ? [p(`Asunto: ${contenido.asunto}`, { alignment: AlignmentType.RIGHT, run: { bold: true } })] : []),
        ...(contenido.referencia ? [p(contenido.referencia, { alignment: AlignmentType.RIGHT })] : []),
        ...contenido.parrafos.map(t => p(t, { alignment: AlignmentType.JUSTIFIED })),
        p('A T E N T A M E N T E', { alignment: AlignmentType.CENTER, spacing: { before: 480, after: 960 }, run: { bold: true } }),
        p('_______________________________', { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
        p(contenido.firmante, { alignment: AlignmentType.CENTER, spacing: { after: 0 }, run: { bold: true } }),
        p(contenido.cargo, { alignment: AlignmentType.CENTER }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

/** PDF (carta, márgenes de 2.5 cm) */
export async function escritoPdf({ contenido, marca, logo }) {
  const tema = construirTema(marca);
  const pdf = await PDFDocument.create();
  pdf.setTitle(contenido.asunto || 'Escrito');
  pdf.setCreator(marca.nombre);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [ancho, alto] = [612, 792];
  const margen = 71;
  const tam = 11, interlineado = 16;
  let pagina, y;
  const imagenLogo = contenido.membrete && logo
    ? await (logo.tipo === 'png' ? pdf.embedPng(logo.datos) : pdf.embedJpg(logo.datos)) : null;

  const nuevaPagina = () => {
    pagina = pdf.addPage([ancho, alto]);
    y = alto - margen;
    if (contenido.membrete) {
      if (imagenLogo) {
        const w = 110, h = w * logo.proporcion;
        pagina.drawImage(imagenLogo, { x: margen, y: alto - 40 - h, width: w, height: h });
        y = alto - 40 - h - 14;
      } else {
        pagina.drawText(marca.nombre, { x: margen, y: alto - 50, size: 14, font: negrita, color: rgb(...hexARgb01(tema.fondo)) });
        y = alto - 64;
      }
      pagina.drawLine({ start: { x: margen, y }, end: { x: ancho - margen, y }, thickness: 1.5, color: rgb(...hexARgb01(tema.acento)) });
      const pie = `${marca.nombre}${marca.lema ? ` · ${marca.lema}` : ''}`;
      pagina.drawText(pie, { x: (ancho - normal.widthOfTextAtSize(pie, 8)) / 2, y: 30, size: 8, font: normal, color: rgb(...hexARgb01(tema.acentoTexto)) });
      y -= 28;
    }
  };
  const lineas = (texto, fuente, size, max) => {
    const salida = [];
    // Helvetica solo tiene caracteres de Europa occidental: lo demás se sustituye
    const seguro = String(texto).replace(/[^\x00-\xFF\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u20AC]/g, '?');
    for (const parrafo of seguro.split('\n')) {
      let linea = '';
      for (const palabra of parrafo.split(' ')) {
        const prueba = linea ? `${linea} ${palabra}` : palabra;
        if (fuente.widthOfTextAtSize(prueba, size) > max && linea) { salida.push(linea); linea = palabra; } else linea = prueba;
      }
      salida.push(linea);
    }
    return salida;
  };
  const escribir = (texto, { fuente = normal, alinear = 'izq', despues = 8 } = {}) => {
    const max = ancho - 2 * margen;
    for (const l of lineas(texto, fuente, tam, max)) {
      if (y < margen + 40) nuevaPagina();
      const w = fuente.widthOfTextAtSize(l, tam);
      const x = alinear === 'der' ? ancho - margen - w : alinear === 'centro' ? (ancho - w) / 2 : margen;
      pagina.drawText(l, { x, y, size: tam, font: fuente, color: rgb(0.12, 0.16, 0.22) });
      y -= interlineado;
    }
    y -= despues;
  };

  nuevaPagina();
  escribir(contenido.lugarFecha, { alinear: 'der', despues: 18 });
  contenido.destinatario.forEach((l, i) => escribir(l, { fuente: negrita, despues: i === contenido.destinatario.length - 1 ? 14 : 0 }));
  if (contenido.asunto) escribir(`Asunto: ${contenido.asunto}`, { fuente: negrita, alinear: 'der', despues: 0 });
  if (contenido.referencia) escribir(contenido.referencia, { alinear: 'der', despues: 14 });
  contenido.parrafos.forEach(t => escribir(t, { despues: 10 }));
  y -= 24;
  escribir('A T E N T A M E N T E', { fuente: negrita, alinear: 'centro', despues: 56 });
  escribir('_______________________________', { alinear: 'centro', despues: 0 });
  escribir(contenido.firmante, { fuente: negrita, alinear: 'centro', despues: 0 });
  escribir(contenido.cargo, { alinear: 'centro' });
  return Buffer.from(await pdf.save());
}
