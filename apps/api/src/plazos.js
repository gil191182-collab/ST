// Recalcula los plazos de cada permiso del despacho actual y los guarda.
// Si un plazo cambió, el anterior se archiva (nunca se borra) y queda el nuevo.
import { plazosDelPermiso } from '@logistics/dominio';

const DESCRIPCION = {
  inicio_operaciones: 'Límite de inicio de operaciones',
  contingencias_inicial: 'Programa de Contingencias (antes de iniciar)',
  contingencias_actualizacion: 'Actualizar Programa de Contingencias',
  polizas: 'Renovación de pólizas (RC y daños)',
  tarifas_actualizacion: 'Actualizar registro de tarifas',
  renovacion_permiso: 'Iniciar renovación del permiso',
};

const RESOLUCION_A_DATO = {
  programa_contingencias: 'aprobacionContingencias',
  renovacion_polizas: 'emisionPolizas',
  registro_tarifas: 'registroTarifas',
};

export async function recalcularPlazos(client) {
  const { rows: permisos } = await client.query(`SELECT * FROM permisos WHERE archivado_en IS NULL`);
  const cambios = [];
  for (const permiso of permisos) {
    const { rows: prorrogas } = await client.query(
      `SELECT * FROM prorrogas WHERE permiso_id = $1 AND archivado_en IS NULL`, [permiso.id]);
    const { rows: res } = await client.query(
      `SELECT DISTINCT ON (tramite_clave) tramite_clave, fecha FROM resoluciones
       WHERE permiso_id = $1 AND archivado_en IS NULL ORDER BY tramite_clave, fecha DESC`, [permiso.id]);
    const { rows: [{ inicio_real }] } = await client.query(
      `SELECT EXISTS (SELECT 1 FROM antecedentes_externos a WHERE a.terminal_id = $1 AND a.tramite_clave = 'inicio_operaciones' AND a.archivado_en IS NULL)
           OR EXISTS (SELECT 1 FROM expedientes e JOIN tramite_versiones v ON v.id = e.tramite_version_id JOIN tramites t ON t.id = v.tramite_id
                      WHERE e.terminal_id = $1 AND t.clave = 'inicio_operaciones' AND e.estado = 'concluido' AND e.archivado_en IS NULL) AS inicio_real`,
      [permiso.terminal_id]);

    const datos = { permiso, prorrogas, inicioReal: inicio_real };
    for (const r of res) if (RESOLUCION_A_DATO[r.tramite_clave]) datos[RESOLUCION_A_DATO[r.tramite_clave]] = r.fecha;

    const calculados = plazosDelPermiso(datos);
    const { rows: actuales } = await client.query(
      `SELECT id, tipo, fecha, regla FROM plazos WHERE permiso_id = $1 AND expediente_id IS NULL AND archivado_en IS NULL`, [permiso.id]);
    const porTipo = new Map(actuales.map(a => [a.tipo, a]));

    for (const p of calculados) {
      const actual = porTipo.get(p.tipo);
      porTipo.delete(p.tipo);
      if (actual && actual.fecha === p.fecha && actual.regla === p.regla) continue;
      if (actual) await client.query(`UPDATE plazos SET archivado_en = now() WHERE id = $1`, [actual.id]);
      await client.query(
        `INSERT INTO plazos (despacho_id, permiso_id, tipo, fecha, descripcion, regla, definitivo)
         VALUES (despacho_actual(), $1, $2, $3, $4, $5, $6)`,
        [permiso.id, p.tipo, p.fecha, `${DESCRIPCION[p.tipo] ?? p.tipo} · ${permiso.numero}`, p.regla, Boolean(p.definitivo)]);
      cambios.push({ permiso: permiso.numero, tipo: p.tipo, de: actual?.fecha ?? null, a: p.fecha });
    }
    // Plazos que ya no aplican (p. ej. ya inició operaciones): se archivan
    for (const sobrante of porTipo.values()) {
      await client.query(`UPDATE plazos SET archivado_en = now() WHERE id = $1`, [sobrante.id]);
      cambios.push({ permiso: permiso.numero, tipo: sobrante.tipo, de: sobrante.fecha, a: null });
    }
  }
  return cambios;
}
