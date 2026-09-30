const db = require('../../config/db');

async function calcularProgreso(projectId) {
  const row = await db('tasks').where({ project_id: projectId }).count({ total: '*' }).first();
  const done = await db('tasks').where({ project_id: projectId, estado: 'COMPLETADA' }).count({ total: '*' }).first();
  const total = Number(row?.total || 0);
  const completadas = Number(done?.total || 0);
  return { total, completadas, porcentaje: total === 0 ? 0 : Math.round((completadas / total) * 100) };
}

async function actualizarEstadoSiCorresponde(projectId) {
  const progreso = await calcularProgreso(projectId);
  const project = await db('projects').where({ id: projectId }).first();
  if (!project) return { progreso, celebracion: false };

  if (progreso.total > 0 && progreso.completadas === progreso.total) {
    const yaCompletado = project.estado === 'COMPLETADO';
    if (!yaCompletado) {
      await db('projects').where({ id: projectId }).update({
        estado: 'COMPLETADO',
        // ISO 8601 explícito (con "Z" de UTC). Guardar un objeto Date crudo
        // hace que better-sqlite3 lo escriba como texto sin zona horaria, y
        // el navegador lo vuelve a leer como si fuera hora local — eso
        // desplazaba la fecha/hora de culminación que se mostraba.
        fecha_culminacion: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return { progreso, celebracion: !yaCompletado };
  }

  if (project.estado === 'COMPLETADO' && progreso.total >= 0) {
    await db('projects').where({ id: projectId }).update({
      estado: progreso.completadas > 0 ? 'EN_PROGRESO' : 'PENDIENTE',
      fecha_culminacion: null,
      updated_at: new Date().toISOString(),
    });
  }

  return { progreso, celebracion: false };
}

module.exports = { calcularProgreso, actualizarEstadoSiCorresponde };
