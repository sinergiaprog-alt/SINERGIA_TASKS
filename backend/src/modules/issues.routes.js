const express = require('express');
const db = require('../config/db');
const { newId } = require('../config/id');
const { requireAuth } = require('../middleware/auth');
const { canViewProject, canEditProject } = require('./projects/access');
const { auditar } = require('./audit');
const { notificarUsuarios } = require('./notifications');

const router = express.Router();
router.use(requireAuth);
const ESTADOS = ['ABIERTO', 'EN_PROGRESO', 'RESUELTO', 'REABIERTO'];
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];

router.get('/project/:projectId', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.projectId }).first();
    if (!project || !(await canViewProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
    const issues = await db('issues').where({ project_id: project.id }).orderBy('created_at', 'desc');
    res.json({ issues });
  } catch (e) { next(e); }
});

router.post('/project/:projectId', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.projectId }).first();
    if (!project || !(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para crear problemas en este proyecto.' });
    const { titulo, descripcion, descripcionCifrada, descripcionIv, taskId, prioridad = 'MEDIA' } = req.body;
    if (!String(titulo || '').trim()) return res.status(400).json({ error: 'El título del problema es obligatorio.' });
    if (!PRIORIDADES.includes(prioridad)) return res.status(400).json({ error: 'Prioridad inválida.' });
    if (taskId) {
      const task = await db('tasks').where({ id: taskId, project_id: project.id }).first();
      if (!task) return res.status(400).json({ error: 'La tarea indicada no pertenece al proyecto.' });
    }
    const issue = { id: newId('iss'), project_id: project.id, task_id: taskId || null, titulo: String(titulo).trim(), descripcion: descripcionCifrada || descripcion || null, descripcion_iv: descripcionCifrada ? descripcionIv : null, estado: 'ABIERTO', prioridad, solucion: null };
    await db('issues').insert(issue);
    await auditar(req.user.id, 'CREAR', 'ISSUE', issue.id, { projectId: project.id });
    await notificarUsuarios([project.responsable_id].filter(id => id && id !== req.user.id), { tipo: 'PROBLEMA_CREADO', titulo: 'Problema reportado', mensaje: `Se registró el problema “${issue.titulo}”.`, projectId: project.id });
    res.status(201).json({ issue });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const issue = await db('issues').where({ id: req.params.id }).first();
    if (!issue) return res.status(404).json({ error: 'Problema no encontrado.' });
    const project = await db('projects').where({ id: issue.project_id }).first();
    if (!(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para editar este problema.' });
    const updates = { updated_at: new Date() };
    if (req.body.titulo !== undefined) { if (!String(req.body.titulo).trim()) return res.status(400).json({ error: 'El título no puede estar vacío.' }); updates.titulo = String(req.body.titulo).trim(); }
    if (req.body.descripcionCifrada !== undefined) { updates.descripcion = req.body.descripcionCifrada || null; updates.descripcion_iv = req.body.descripcionCifrada ? req.body.descripcionIv : null; }
    else if (req.body.descripcion !== undefined) { updates.descripcion = req.body.descripcion; updates.descripcion_iv = null; }
    if (req.body.solucionCifrada !== undefined) { updates.solucion = req.body.solucionCifrada || null; updates.solucion_iv = req.body.solucionCifrada ? req.body.solucionIv : null; }
    else if (req.body.solucion !== undefined) { updates.solucion = req.body.solucion; updates.solucion_iv = null; }
    if (req.body.prioridad !== undefined) { if (!PRIORIDADES.includes(req.body.prioridad)) return res.status(400).json({ error: 'Prioridad inválida.' }); updates.prioridad = req.body.prioridad; }
    if (req.body.estado !== undefined) { if (!ESTADOS.includes(req.body.estado)) return res.status(400).json({ error: 'Estado inválido.' }); updates.estado = req.body.estado; }
    await db('issues').where({ id: issue.id }).update(updates);
    const updated = await db('issues').where({ id: issue.id }).first();
    await auditar(req.user.id, 'EDITAR', 'ISSUE', issue.id, updates);
    res.json({ issue: updated });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const issue = await db('issues').where({ id: req.params.id }).first();
    if (!issue) return res.status(404).json({ error: 'Problema no encontrado.' });
    const project = await db('projects').where({ id: issue.project_id }).first();
    if (!(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para eliminar este problema.' });
    if (req.query.confirm !== 'true') return res.status(400).json({ error: 'Confirmación requerida.' });
    await db('issues').where({ id: issue.id }).del();
    await auditar(req.user.id, 'ELIMINAR', 'ISSUE', issue.id, { projectId: project.id });
    res.status(204).send();
  } catch (e) { next(e); }
});

module.exports = router;
