const express = require('express');
const db = require('../../config/db');
const { newId } = require('../../config/id');
const { requireAuth } = require('../../middleware/auth');
const { auditar } = require('../audit');
const { canViewProject, canEditProject } = require('../projects/access');
const { notificarUsuarios, obtenerUsuariosProyecto } = require('../notifications');

const router = express.Router();
router.use(requireAuth);

async function canAccessProject(user, projectId) {
  const project = await db('projects').where({ id: projectId }).first();
  if (!project) return null;
  return (await canViewProject(db, user, project)) ? project : null;
}

router.get('/project/:projectId', async (req, res, next) => {
  try {
    if (!await canAccessProject(req.user, req.params.projectId)) return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
    const comments = await db('comments as c')
      .leftJoin('users as u', 'u.id', 'c.autor_id')
      .where('c.project_id', req.params.projectId)
      .select('c.*', 'u.nombre as autor_nombre')
      .orderBy('c.created_at', 'asc');
    res.json({ comments });
  } catch (err) { next(err); }
});

router.post('/project/:projectId', async (req, res, next) => {
  try {
    if (!await canAccessProject(req.user, req.params.projectId)) return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
    const contenido = req.body.contenido?.trim();
    const contenidoIv = req.body.contenidoIv ? String(req.body.contenidoIv) : null;
    if (!contenido) return res.status(400).json({ error: 'El comentario no puede estar vacío.' });
    if (contenidoIv && contenido.length < 20) return res.status(400).json({ error: 'Contenido cifrado inválido.' });
    const taskId = req.body.taskId || null;
    const parentId = req.body.parentId || null;
    if (taskId && !(await db('tasks').where({id: taskId, project_id: req.params.projectId}).first())) return res.status(400).json({error:'La tarea no pertenece al proyecto.'});
    if (parentId) { const parent = await db('comments').where({id: parentId, project_id: req.params.projectId}).first(); if(!parent) return res.status(400).json({error:'El comentario padre no pertenece al proyecto.'}); }
    const comment = { id: newId('cmt'), project_id: req.params.projectId, task_id: taskId, autor_id: req.user.id, contenido, contenido_iv: contenidoIv, parent_id: parentId, editado: false };
    await db('comments').insert(comment);
    await auditar(req.user.id,'CREAR','COMMENT',comment.id,{projectId:req.params.projectId});
    const project = await db('projects').where({ id: req.params.projectId }).first();
    const notifyIds = (await obtenerUsuariosProyecto(req.params.projectId)).filter(id => id !== req.user.id);
    await notificarUsuarios(notifyIds, { tipo: 'COMENTARIO', titulo: 'Nuevo comentario', mensaje: 'Hay un comentario nuevo en un proyecto que sigues.', projectId: req.params.projectId, taskId });
    res.status(201).json({ comment: { ...comment, created_at: new Date() } });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const comment = await db('comments').where({ id: req.params.id }).first();
    if (!comment) return res.status(404).json({ error: 'Comentario no encontrado.' });
    if (req.user.role !== 'ADMIN' && comment.autor_id !== req.user.id) return res.status(403).json({ error: 'No puedes eliminar este comentario.' });
    if (req.query.confirm !== 'true') return res.status(400).json({ error: 'Confirmación requerida: agrega ?confirm=true.' });
    await db('comments').where({ id: comment.id }).del();
    await auditar(req.user.id,'ELIMINAR','COMMENT',comment.id,{projectId:comment.project_id});
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
