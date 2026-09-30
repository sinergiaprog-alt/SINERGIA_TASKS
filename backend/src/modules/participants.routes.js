const express = require('express');
const db = require('../config/db');
const { newId } = require('../config/id');
const { requireAuth } = require('../middleware/auth');
const { canEditProject } = require('./projects/access');
const { auditar } = require('./audit');
const { crearNotificacion } = require('./notifications');
const router = express.Router(); router.use(requireAuth);

async function phasesFor(project, values) {
  const ids = [...new Set((Array.isArray(values) ? values : values ? [values] : []).filter(Boolean).map(String))];
  const phases = ids.length ? await db('project_phases').where({ project_id: project.id, activo: true }).whereIn('id', ids) : [];
  if (phases.length !== ids.length) throw Object.assign(new Error('Una fase seleccionada no pertenece a este proyecto.'), { status: 400 });
  return phases;
}
async function replacePhases(participantId, phases) {
  await db.transaction(async (trx) => {
    await trx('project_participant_phases').where({ participant_id: participantId }).del();
    for (const phase of phases) await trx('project_participant_phases').insert({ id: newId('pph'), participant_id: participantId, phase_id: phase.id });
  });
}
async function participantPayload(row) {
  const phases = await db('project_participant_phases as ppp').join('project_phases as ph', 'ph.id', 'ppp.phase_id').where('ppp.participant_id', row.id).select('ph.id', 'ph.clave', 'ph.nombre');
  return { ...row, areas: JSON.parse(row.areas || '[]'), phases };
}
router.get('/project/:projectId', async (req, res, next) => { try {
  const project = await db('projects').where({ id: req.params.projectId }).first(); if (!project || !(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso.' });
  const rows = await db('project_participants as pp').join('users as u', 'u.id', 'pp.user_id').where('pp.project_id', project.id).select('pp.*', 'u.nombre', 'u.email', 'u.role', 'u.areas', 'u.activo');
  res.json({ participants: await Promise.all(rows.map(participantPayload)) });
} catch (e) { next(e); } });
router.post('/project/:projectId', async (req, res, next) => { try {
  const project = await db('projects').where({ id: req.params.projectId }).first(); if (!project || !(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para administrar participantes.' });
  const user = await db('users').where({ id: req.body.userId, activo: true }).first(); if (!user) return res.status(400).json({ error: 'Usuario no encontrado o inactivo.' });
  if (await db('project_participants').where({ project_id: project.id, user_id: user.id }).first()) return res.status(409).json({ error: 'El usuario ya es participante.' });
  const configured = !!(await db('project_phases').where({ project_id: project.id, activo: true }).first()); const phases = await phasesFor(project, req.body.faseIds || req.body.faseId);
  if (configured && !phases.length) return res.status(400).json({ error: 'Selecciona al menos una fase para este proyecto.' });
  const row = { id: newId('par'), project_id: project.id, user_id: user.id, puede_editar: !!req.body.puedeEditar, fase_id: phases[0]?.id || null };
  await db('project_participants').insert(row); await replacePhases(row.id, phases); await auditar(req.user.id, 'AGREGAR', 'PARTICIPANTE', row.id, { projectId: project.id, userId: user.id, faseIds: phases.map((p) => p.id) });
  await crearNotificacion(user.id, { tipo: 'PARTICIPANTE_AGREGADO', titulo: 'Agregado al proyecto', mensaje: `Te agregaron al proyecto “${project.nombre}”.`, projectId: project.id });
  if (phases.length) await crearNotificacion(user.id, { tipo: 'FASE_ASIGNADA', titulo: 'Fases asignadas', mensaje: `Te asignaron ${phases.map((p) => `“${p.nombre}”`).join(', ')} en el proyecto “${project.nombre}”.`, projectId: project.id });
  res.status(201).json({ participant: await participantPayload({ ...row, nombre: user.nombre, email: user.email, role: user.role, areas: user.areas, activo: user.activo }) });
} catch (e) { next(e.status ? Object.assign(e, { statusCode: e.status }) : e); } });
router.patch('/:id', async (req, res, next) => { try {
  const row = await db('project_participants').where({ id: req.params.id }).first(); if (!row) return res.status(404).json({ error: 'Participante no encontrado.' }); const project = await db('projects').where({ id: row.project_id }).first(); if (!(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso.' });
  const updates = {}; if (typeof req.body.puedeEditar === 'boolean') updates.puede_editar = req.body.puedeEditar;
  const phaseInput = req.body.faseIds !== undefined ? req.body.faseIds : req.body.faseId; if (phaseInput !== undefined) { const phases = await phasesFor(project, phaseInput); if (await db('project_phases').where({ project_id: project.id, activo: true }).first() && !phases.length) return res.status(400).json({ error: 'Selecciona al menos una fase para este proyecto.' }); updates.fase_id = phases[0]?.id || null; await replacePhases(row.id, phases); await crearNotificacion(row.user_id, { tipo: 'FASE_ASIGNADA', titulo: 'Fases actualizadas', mensaje: `Tus fases fueron actualizadas en el proyecto “${project.nombre}”.`, projectId: project.id }); }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No hay cambios para guardar.' }); await db('project_participants').where({ id: row.id }).update(updates); await auditar(req.user.id, 'EDITAR', 'PARTICIPANTE', row.id, updates); res.json({ participant: await participantPayload(await db('project_participants').where({ id: row.id }).first()) });
} catch (e) { next(e); } });
router.delete('/:id', async (req, res, next) => { try { const row = await db('project_participants').where({ id: req.params.id }).first(); if (!row) return res.status(404).json({ error: 'Participante no encontrado.' }); const project = await db('projects').where({ id: row.project_id }).first(); if (!(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso.' }); if (req.query.confirm !== 'true') return res.status(400).json({ error: 'Confirmación requerida.' }); await db('project_participants').where({ id: row.id }).del(); await auditar(req.user.id, 'ELIMINAR', 'PARTICIPANTE', row.id, { projectId: project.id }); res.status(204).send(); } catch (e) { next(e); } });
module.exports = router;
