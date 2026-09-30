const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../../config/db');
const { newId } = require('../../config/id');
const { requireAuth } = require('../../middleware/auth');
const { actualizarEstadoSiCorresponde } = require('../projects/progress');
const { canViewProject, canEditProject, canViewTask, canEditTask, hasPhaseAccess, isNuevoCentro } = require('../projects/access');
const { auditar } = require('../audit');
const { notificarUsuarios, obtenerUsuariosProyecto } = require('../notifications');

const router = express.Router();
router.use(requireAuth);
const ESTADOS_VALIDOS = ['PENDIENTE', 'EN_PROGRESO', 'EN_REVISION', 'COMPLETADA'];
const PRIORIDADES_VALIDAS = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];

async function getTask(id) { return db('tasks').where({ id }).first(); }
async function validarResponsable(responsableId) { return responsableId ? db('users').where({ id: responsableId, activo: true }).first() : null; }
async function dependenciasCompletadas(dependeDe, projectId) {
  if (!dependeDe) return { ok: true, ids: [] };
  const ids = [...new Set(String(dependeDe).split(',').map(x => x.trim()).filter(Boolean))];
  const deps = await db('tasks').whereIn('id', ids).where({ project_id: projectId });
  if (deps.length !== ids.length) return { ok: false, faltantes: ids.filter(id => !deps.some(d => d.id === id)), ids };
  return { ok: deps.every(d => d.estado === 'COMPLETADA'), faltantes: deps.filter(d => d.estado !== 'COMPLETADA').map(d => d.id), ids };
}
function validarDependenciasActualizadas(taskId, dependeDe) {
  const ids = [...new Set(String(dependeDe || '').split(',').map(x => x.trim()).filter(Boolean))];
  return ids.includes(taskId) ? 'Una tarea no puede depender de sí misma.' : null;
}
function validarTransicion(actual, nuevo) {
  if (actual === nuevo) return null;
  const permitidas = {
    PENDIENTE: ['EN_PROGRESO', 'EN_REVISION', 'COMPLETADA'],
    EN_PROGRESO: ['PENDIENTE', 'EN_REVISION', 'COMPLETADA'],
    EN_REVISION: ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA'],
    COMPLETADA: ['PENDIENTE', 'EN_PROGRESO', 'EN_REVISION'],
  };
  return (permitidas[actual] || []).includes(nuevo) ? null : `No se permite cambiar de ${actual} a ${nuevo}.`;
}

router.get('/project/:projectId', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.projectId }).first();
    if (!project || !(await canViewProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
    const allTasks = await db('tasks').where({ project_id: project.id }).orderBy('orden', 'asc');
    const tasks = [];
    for (const task of allTasks) if (await canViewTask(db, req.user, project, task)) tasks.push(task);
    res.json({ tasks });
  } catch (e) { next(e); }
});

router.post('/project/:projectId', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.projectId }).first();
    if (!project || !(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para crear tareas.' });
    const { titulo, descripcion, descripcionCifrada, descripcionIv, responsableId, prioridad = 'MEDIA', fechaLimite, dependeDe, orden = 0, fase, faseOrden } = req.body;
    if (!String(titulo || '').trim()) return res.status(400).json({ error: 'El título de la tarea es obligatorio.' });
    if (!PRIORIDADES_VALIDAS.includes(prioridad)) return res.status(400).json({ error: 'Prioridad inválida.' });
    if (fechaLimite && Number.isNaN(new Date(fechaLimite).getTime())) return res.status(400).json({ error: 'Fecha límite inválida.' });
    if (responsableId && !(await validarResponsable(responsableId))) return res.status(400).json({ error: 'El responsable no existe o está inactivo.' });
    if (fase) {
      const phase = await db('project_phases').where({ project_id: project.id, clave: String(fase).toUpperCase(), activo: true }).first();
      if (!phase) return res.status(400).json({ error: 'La fase seleccionada no existe en este proyecto.' });
      // Si el proyecto usa fases, un usuario no puede crear tareas en una fase
      // que no tiene autorizada para trabajar.
      if (!(await hasPhaseAccess(db, req.user, project, phase.clave, 'TRABAJAR'))) {
        return res.status(403).json({ error: 'No tienes permiso para trabajar en la fase seleccionada.' });
      }
    }
    const depError = validarDependenciasActualizadas('new', dependeDe); if (depError) return res.status(400).json({ error: depError });
    const dep = await dependenciasCompletadas(dependeDe, project.id); if (!dep.ok) return res.status(400).json({ error: 'Una o más dependencias no pertenecen a este proyecto.', dependenciasPendientes: dep.faltantes });
    const task = {
      id: newId('tsk'), project_id: project.id, titulo: String(titulo).trim(), descripcion: descripcionCifrada || descripcion || null,
      descripcion_iv: descripcionCifrada ? descripcionIv : null, responsable_id: responsableId || null, estado: 'PENDIENTE', prioridad,
      fecha_limite: fechaLimite || null, tiempo_trabajado_segundos: 0, depende_de: dep.ids?.join(',') || null,
      orden: Number.isFinite(Number(orden)) ? Number(orden) : 0, fase: fase ? String(fase).toUpperCase() : null,
      fase_orden: faseOrden == null ? null : Number(faseOrden),
    };
    await db('tasks').insert(task);
    await auditar(req.user.id, 'CREAR', 'TASK', task.id, { projectId: project.id });
    if (responsableId && responsableId !== req.user.id) await notificarUsuarios([responsableId], { tipo: 'TAREA_ASIGNADA', titulo: 'Tarea asignada', mensaje: `Se te asignó “${task.titulo}”.`, projectId: project.id, taskId: task.id });
    const { progreso } = await actualizarEstadoSiCorresponde(project.id);
    res.status(201).json({ task, progreso });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const task = await getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    const project = await db('projects').where({ id: task.project_id }).first();
    if (!project || !(await canEditTask(db, req.user, project, task))) return res.status(403).json({ error: 'No tienes permiso para editar esta tarea.' });
    if (isNuevoCentro(project) && task.bloqueada) return res.status(409).json({ error: 'La tarea está bloqueada. Desbloquéala antes de editarla.' });

    const { titulo, descripcion, descripcionCifrada, descripcionIv, responsableId, estado, prioridad, fechaLimite, dependeDe, orden, fase, faseOrden } = req.body;
    const updates = { updated_at: new Date() };
    if (titulo !== undefined) { if (!String(titulo).trim()) return res.status(400).json({ error: 'El título no puede estar vacío.' }); updates.titulo = String(titulo).trim(); }
    if (descripcionCifrada !== undefined) { updates.descripcion = descripcionCifrada; updates.descripcion_iv = descripcionCifrada ? descripcionIv : null; } else if (descripcion !== undefined) { updates.descripcion = descripcion; updates.descripcion_iv = null; }
    if (responsableId !== undefined) { if (responsableId && !(await validarResponsable(responsableId))) return res.status(400).json({ error: 'El responsable no existe o está inactivo.' }); updates.responsable_id = responsableId || null; }
    if (prioridad !== undefined) { if (!PRIORIDADES_VALIDAS.includes(prioridad)) return res.status(400).json({ error: 'Prioridad inválida.' }); updates.prioridad = prioridad; }
    if (fechaLimite !== undefined) { if (fechaLimite && Number.isNaN(new Date(fechaLimite).getTime())) return res.status(400).json({ error: 'Fecha límite inválida.' }); updates.fecha_limite = fechaLimite || null; }
    if (dependeDe !== undefined) {
      const de = validarDependenciasActualizadas(task.id, dependeDe); if (de) return res.status(400).json({ error: de });
      const ids = [...new Set(String(dependeDe || '').split(',').map(x => x.trim()).filter(Boolean))];
      const deps = await db('tasks').whereIn('id', ids);
      if (deps.length !== ids.length || deps.some(d => d.project_id !== project.id)) return res.status(400).json({ error: 'Todas las dependencias deben pertenecer al mismo proyecto.' });
      updates.depende_de = ids.join(',') || null;
    }
    if (fase !== undefined) {
      if (fase) {
        const phase = await db('project_phases').where({ project_id: project.id, clave: String(fase).toUpperCase(), activo: true }).first();
        if (!phase) return res.status(400).json({ error: 'La fase seleccionada no existe en este proyecto.' });
        updates.fase = String(fase).toUpperCase();
      } else updates.fase = null;
    }
    if (faseOrden !== undefined) updates.fase_orden = faseOrden == null ? null : Number(faseOrden);
    if (orden !== undefined) { if (!Number.isFinite(Number(orden))) return res.status(400).json({ error: 'Orden inválido.' }); updates.orden = Number(orden); }

    if (estado !== undefined) {
      if (!ESTADOS_VALIDOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido.' });
      const transition = validarTransicion(task.estado, estado); if (transition) return res.status(409).json({ error: transition });
      const dep = await dependenciasCompletadas(dependeDe !== undefined ? dependeDe : task.depende_de, project.id);
      if (estado === 'COMPLETADA' && !dep.ok) return res.status(409).json({ error: 'La tarea está bloqueada: primero completa sus dependencias.', dependenciasPendientes: dep.faltantes });
      updates.estado = estado;
    }

    await db('tasks').where({ id: task.id }).update(updates);
    const updated = await getTask(task.id);
    const { progreso, celebracion } = await actualizarEstadoSiCorresponde(project.id);
    await auditar(req.user.id, 'EDITAR', 'TASK', task.id, updates);
    const notifyIds = (await obtenerUsuariosProyecto(project.id)).filter((v) => v !== req.user.id);
    if (estado && estado !== task.estado) {
      await notificarUsuarios(notifyIds, { tipo: estado === 'COMPLETADA' ? 'TAREA_COMPLETADA' : 'TAREA_MODIFICADA', titulo: estado === 'COMPLETADA' ? 'Tarea completada' : 'Tarea actualizada', mensaje: `“${updated.titulo}” ahora está en ${estado.replaceAll('_', ' ').toLowerCase()}.`, projectId: project.id, taskId: task.id });
    }
    if (celebracion) await notificarUsuarios([project.responsable_id].filter(Boolean), { tipo: 'PROYECTO_COMPLETADO', titulo: 'Proyecto completado', mensaje: `El proyecto “${project.nombre}” quedó completado.`, projectId: project.id });
    res.json({ task: updated, progreso, celebracion });
  } catch (e) { next(e); }
});

router.post('/:id/bloquear', async (req, res, next) => {
  try {
    const task = await getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    const project = await db('projects').where({ id: task.project_id }).first();
    if (!project || !(await canEditTask(db, req.user, project, task))) return res.status(403).json({ error: 'No tienes permiso para bloquear esta tarea.' });
    if (!isNuevoCentro(project)) return res.status(400).json({ error: 'El bloqueo manual de tareas solo existe en proyectos Nuevo Centro.' });
    if (task.bloqueada) return res.status(409).json({ error: 'La tarea ya está bloqueada.' });
    const now = new Date();
    await db('tasks').where({ id: task.id }).update({ bloqueada: true, bloqueo_motivo: null, bloqueada_por: req.user.id, bloqueada_at: now, updated_at: now });
    const updated = await getTask(task.id);
    await auditar(req.user.id, 'BLOQUEAR', 'TASK', task.id);
    const notifyIds = (await obtenerUsuariosProyecto(project.id)).filter((v) => v !== req.user.id);
    await notificarUsuarios(notifyIds, { tipo: 'TAREA_BLOQUEADA', titulo: 'Tarea bloqueada', mensaje: `Se bloqueó la tarea “${task.titulo}”.`, projectId: project.id, taskId: task.id });
    res.json({ task: updated });
  } catch (e) { next(e); }
});

router.post('/:id/desbloquear', async (req, res, next) => {
  try {
    const task = await getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    const project = await db('projects').where({ id: task.project_id }).first();
    if (!project || !(await canEditTask(db, req.user, project, task))) return res.status(403).json({ error: 'No tienes permiso para desbloquear esta tarea.' });
    if (!task.bloqueada) return res.status(409).json({ error: 'La tarea no está bloqueada.' });
    await db('tasks').where({ id: task.id }).update({ bloqueada: false, bloqueo_motivo: null, bloqueada_por: null, bloqueada_at: null, updated_at: new Date() });
    const updated = await getTask(task.id);
    await auditar(req.user.id, 'DESBLOQUEAR', 'TASK', task.id);
    const notifyIds = (await obtenerUsuariosProyecto(project.id)).filter((v) => v !== req.user.id);
    await notificarUsuarios(notifyIds, { tipo: 'TAREA_DESBLOQUEADA', titulo: 'Tarea desbloqueada', mensaje: `La tarea “${task.titulo}” fue desbloqueada.`, projectId: project.id, taskId: task.id });
    res.json({ task: updated });
  } catch (e) { next(e); }
});

router.post('/:id/transferir', async (req, res, next) => {
  try {
    const task = await getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    const project = await db('projects').where({ id: task.project_id }).first();
    if (!project || !(await canEditTask(db, req.user, project, task))) return res.status(403).json({ error: 'No tienes permiso para transferir esta tarea.' });
    const recipient = await validarResponsable(req.body.userId);
    if (!recipient) return res.status(400).json({ error: 'El nuevo responsable no existe o está inactivo.' });
    if (recipient.id === task.responsable_id) return res.status(400).json({ error: 'La tarea ya tiene ese responsable.' });
    if (!(await canViewTask(db, recipient, project, task))) return res.status(400).json({ error: 'El nuevo responsable no tiene acceso a la fase de esta tarea. Agrégalo al proyecto y asígnale la fase primero.' });
    const phase = task.fase ? await getProjectPhase(db, project.id, task.fase) : null;
    const comentario = String(req.body.comentario || '').trim() || null;
    await db.transaction(async (trx) => {
      await trx('tasks').where({ id: task.id }).update({ responsable_id: recipient.id, updated_at: new Date() });
      await trx('task_transfers').insert({ id: newId('ttr'), task_id: task.id, project_id: project.id, phase_id: phase?.id || null, from_user_id: task.responsable_id || null, to_user_id: recipient.id, transferred_by: req.user.id, comentario });
    });
    await auditar(req.user.id, 'TRANSFERIR', 'TASK', task.id, { projectId: project.id, desde: task.responsable_id || null, hacia: recipient.id, fase: task.fase || null, comentario });
    await notificarUsuarios([recipient.id], { tipo: 'TAREA_TRANSFERIDA', titulo: 'Tarea transferida', mensaje: `${req.user.nombre || 'Un usuario'} te transfirió la tarea “${task.titulo}”.`, projectId: project.id, taskId: task.id });
    res.json({ task: await getTask(task.id) });
  } catch (e) { next(e); }
});

router.get('/:id/transferencias', async (req, res, next) => {
  try {
    const task = await getTask(req.params.id); if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    const project = await db('projects').where({ id: task.project_id }).first(); if (!(await canViewTask(db, req.user, project, task))) return res.status(403).json({ error: 'No tienes permiso.' });
    const rows = await db('task_transfers as tt').leftJoin('users as f', 'f.id', 'tt.from_user_id').leftJoin('users as t', 't.id', 'tt.to_user_id').leftJoin('users as b', 'b.id', 'tt.transferred_by').where('tt.task_id', task.id).select('tt.*', 'f.nombre as desde_nombre', 't.nombre as hacia_nombre', 'b.nombre as transferido_por_nombre').orderBy('tt.created_at', 'desc');
    res.json({ transfers: rows });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const task = await getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    const project = await db('projects').where({ id: task.project_id }).first();
    if (!project || !(await canEditTask(db, req.user, project, task))) return res.status(403).json({ error: 'No tienes permiso.' });
    if (isNuevoCentro(project) && task.bloqueada) return res.status(409).json({ error: 'La tarea está bloqueada. Desbloquéala antes de eliminarla.' });
    if (req.query.confirm !== 'true') return res.status(400).json({ error: 'Confirmación requerida.' });
    const taskFiles = await db('files').where({ task_id: task.id }).select('ruta');
    await db.transaction(async (trx) => { await trx('comments').where({ task_id: task.id }).del(); await trx('files').where({ task_id: task.id }).del(); await trx('task_time_entries').where({ task_id: task.id }).del(); await trx('tasks').where({ id: task.id }).del(); });
    const uploadRoot = path.resolve(__dirname, '../../../uploads');
    for (const file of taskFiles) { const ruta = path.resolve(uploadRoot, file.ruta); if (ruta.startsWith(uploadRoot) && fs.existsSync(ruta)) fs.unlinkSync(ruta); }
    const { progreso } = await actualizarEstadoSiCorresponde(project.id);
    await auditar(req.user.id, 'ELIMINAR', 'TASK', task.id, { projectId: project.id });
    res.json({ progreso });
  } catch (e) { next(e); }
});

router.post('/:id/cronometro/iniciar', async (req, res, next) => {
  try {
    const task = await getTask(req.params.id); if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    const project = await db('projects').where({ id: task.project_id }).first(); if (!project || !(await canEditTask(db, req.user, project, task))) return res.status(403).json({ error: 'No tienes permiso.' });
    if (isNuevoCentro(project) && task.bloqueada) return res.status(409).json({ error: 'La tarea está bloqueada. Desbloquéala antes de usar el cronómetro.' });
    if (task.cronometro_inicio) return res.status(400).json({ error: 'El cronómetro ya está corriendo.' });
    // Se guarda en ISO 8601 con "Z" (UTC) explícito. Un objeto Date crudo se
    // guarda en SQLite sin zona horaria, y el navegador lo relee como hora
    // local: el cronómetro mostraba un tiempo transcurrido incorrecto desde
    // el primer segundo (desplazado por el huso horario del servidor).
    const inicio = new Date().toISOString();
    await db('tasks').where({ id: task.id }).update({ cronometro_inicio: inicio });
    await db('task_time_entries').insert({ id: newId('time'), task_id: task.id, usuario_id: req.user.id, inicio, duracion_segundos: 0 });
    await auditar(req.user.id, 'INICIAR_CRONOMETRO', 'TASK', task.id);
    res.json({ ok: true, cronometroInicio: inicio });
  } catch (e) { next(e); }
});

router.post('/:id/cronometro/detener', async (req, res, next) => {
  try {
    const task = await getTask(req.params.id); if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    const project = await db('projects').where({ id: task.project_id }).first(); if (!project || !(await canEditTask(db, req.user, project, task))) return res.status(403).json({ error: 'No tienes permiso.' });
    if (isNuevoCentro(project) && task.bloqueada) return res.status(409).json({ error: 'La tarea está bloqueada. Desbloquéala antes de usar el cronómetro.' });
    if (!task.cronometro_inicio) return res.status(400).json({ error: 'El cronómetro no está corriendo.' });
    const inicio = new Date(task.cronometro_inicio).getTime(); const fin = new Date().toISOString(); const segundos = Math.max(0, Math.round((new Date(fin).getTime() - inicio) / 1000)); const total = Number(task.tiempo_trabajado_segundos || 0) + segundos;
    await db.transaction(async (trx) => { await trx('tasks').where({ id: task.id }).update({ tiempo_trabajado_segundos: total, cronometro_inicio: null, updated_at: fin }); const entry = await trx('task_time_entries').where({ task_id: task.id, usuario_id: req.user.id }).whereNull('fin').orderBy('inicio', 'desc').first(); if (entry) await trx('task_time_entries').where({ id: entry.id }).update({ fin, duracion_segundos: segundos }); });
    await auditar(req.user.id, 'DETENER_CRONOMETRO', 'TASK', task.id, { segundos });
    res.json({ ok: true, tiempoTrabajadoSegundos: total });
  } catch (e) { next(e); }
});

router.get('/:id/tiempo', async (req, res, next) => {
  try {
    const task = await getTask(req.params.id); if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    const project = await db('projects').where({ id: task.project_id }).first(); if (!project || !(await canViewTask(db, req.user, project, task))) return res.status(403).json({ error: 'No tienes acceso.' });
    res.json({ entries: await db('task_time_entries').where({ task_id: task.id }).orderBy('inicio', 'desc') });
  } catch (e) { next(e); }
});

module.exports = router;
