import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirRequisito, idCarpetaDrive } from '../src/sugerir.js';

const REQ = [
  { id: 'pml', nombre: 'Estudio de Pérdida Máxima Probable' },
  { id: 'rc', nombre: 'Póliza de Responsabilidad Civil' },
  { id: 'danos', nombre: 'Póliza de desastres naturales e incendio' },
  { id: 'bases', nombre: 'Bases de Coordinación' },
  { id: 'conc', nombre: 'Relación comercial con el concesionario' },
  { id: 'pago', nombre: 'Pago de derechos de verificación' },
  { id: 'escrito', nombre: 'Escrito de solicitud de la Constancia de Inicio de Operaciones' },
  { id: 'dc3', nombre: 'Constancias DC-3 de brigadas vigentes' },
];

test('sugiere por nombre de archivo y carpeta', () => {
  assert.equal(sugerirRequisito({ nombreArchivo: 'PML_SERVICIO_FERROVIAL_MONTERREY_ESCANEADO.pdf', requisitos: REQ }).id, 'pml');
  assert.equal(sugerirRequisito({ nombreArchivo: 'comprobante.pdf', ruta: 'VISITA Y PAGO', requisitos: REQ }).id, 'pago');
  assert.equal(sugerirRequisito({ nombreArchivo: 'ESCRITO INICIO DE OPERACIONES KERI.docx', requisitos: REQ }).id, 'escrito');
  assert.equal(sugerirRequisito({ nombreArchivo: 'Bases de Coordinacion KERI v2.docx', requisitos: REQ }).id, 'bases');
  assert.equal(sugerirRequisito({ nombreArchivo: 'DC3 GRP - nom018 – Marisela.pdf', requisitos: REQ }).id, 'dc3');
  assert.equal(sugerirRequisito({ nombreArchivo: 'Contrato Ferromex.pdf', requisitos: REQ }).id, 'conc');
});

test('si no hay coincidencia clara no sugiere nada', () => {
  assert.equal(sugerirRequisito({ nombreArchivo: 'IMG_2031.jpg', requisitos: REQ }), null);
  assert.equal(sugerirRequisito({ nombreArchivo: 'notas varias.docx', texto: 'reunión del martes', requisitos: REQ }), null);
});

test('id de carpeta desde el enlace', () => {
  assert.equal(idCarpetaDrive('https://drive.google.com/drive/folders/1f1GOSk_xoR8tVxXu9bkxmpgfCHOQc0Gh?usp=sharing'), '1f1GOSk_xoR8tVxXu9bkxmpgfCHOQc0Gh');
  assert.equal(idCarpetaDrive('https://drive.google.com/open?id=1f1GOSk_xoR8tVxXu9bkxmpgfCHOQc0Gh'), '1f1GOSk_xoR8tVxXu9bkxmpgfCHOQc0Gh');
  assert.equal(idCarpetaDrive('hola'), null);
});
