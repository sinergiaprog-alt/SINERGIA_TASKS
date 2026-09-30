const express = require('express');
const db = require('../config/db');
const { newId } = require('../config/id');
const { requireAuth } = require('../middleware/auth');

async function crearNotificacion(userId, { tipo, titulo, mensaje, projectId = null, taskId = null }) {
  if (!userId) return null;
  const row = {
    id: newId('ntf'),
    user_id: userId,
    tipo: tipo || 'GENERAL',
    titulo: titulo || 'Nueva notificación',
    mensaje: mensaje || null,
    project_id: projectId,
    task_id: taskId,
    leida: false,
  };
  await db('notifications').insert(row);
  return row;
}


async function obtenerUsuariosProyecto(projectId) {
  if (!projectId) return [];
  const project = await db('projects').where({ id: projectId }).first();
  if (!project) return [];
  const participants = await db('project_participants').where({ project_id: projectId }).select('user_id');
  return [...new Set([project.responsable_id, ...participants.map((x) => x.user_id)].filter(Boolean))];
}

async function notificarUsuarios(userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  for (const userId of ids) await crearNotificacion(userId, payload);
}

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
    const rows = await db('notifications').where({ user_id: req.user.id }).orderBy('created_at', 'desc').limit(limit);
    const unread = await db('notifications').where({ user_id: req.user.id, leida: false }).count({ c: 'id' }).first();
    res.json({ notifications: rows, unread: Number(unread.c || 0) });
  } catch (e) { next(e); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const row = await db('notifications').where({ id: req.params.id, user_id: req.user.id }).first();
    if (!row) return res.status(404).json({ error: 'Notificación no encontrada.' });
    await db('notifications').where({ id: row.id }).update({ leida: true, leida_at: new Date() });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await db('notifications').where({ user_id: req.user.id, leida: false }).update({ leida: true, leida_at: new Date() });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = { router, crearNotificacion, notificarUsuarios, obtenerUsuariosProyecto };
