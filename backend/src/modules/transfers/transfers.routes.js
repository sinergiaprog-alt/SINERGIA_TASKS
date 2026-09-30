const express = require('express');
const db = require('../../config/db');
const { newId } = require('../../config/id');
const { requireAuth } = require('../../middleware/auth');
const { parseAreas, canEditProject } = require('../projects/access');
const { auditar } = require('../audit');
const { notificarUsuarios } = require('../notifications');

const router = express.Router();
router.use(requireAuth);
const AREAS_VALIDAS = ['PROGRAMACION', 'SOPORTE'];

async function accessProject(user, projectId) { const project=await db('projects').where({id:projectId}).first(); if(!project)return null; return (await canEditProject(db,user,project)) ? project : null; }
function cleanAreas(value, fallback) {
  const source = Array.isArray(value) ? value : (fallback ? [fallback] : []);
  return [...new Set(source.map((a) => String(a || '').trim().toUpperCase()).filter(Boolean))];
}

router.post('/:projectId', async (req, res, next) => {
  try {
    const project = await accessProject(req.user, req.params.projectId);
    if (!project) return res.status(403).json({ error: 'No tienes permiso para transferir este proyecto.' });

    const areas = cleanAreas(req.body.areas, req.body.area);
    if (!areas.length) return res.status(400).json({ error: 'Selecciona al menos un área destino.' });
    if (areas.some((a) => !AREAS_VALIDAS.includes(a))) return res.status(400).json({ error: 'El destino debe ser Programación o Soporte.' });
    if (req.user.role !== 'ADMIN' && areas.some((a) => !req.user.areas.includes(a))) {
      return res.status(403).json({ error: 'No puedes transferir a un área que no tienes asignada.' });
    }

    const anteriores = parseAreas(project);
    const comentario = req.body.comentario?.trim() || null;

    await db.transaction(async (trx) => {
      await trx('projects').where({ id: project.id }).update({
        area: areas[0], areas: JSON.stringify(areas), updated_at: new Date(),
      });
      await trx('transfers').insert({
        id: newId('trf'), project_id: project.id,
        area_anterior: JSON.stringify(anteriores), area_nueva: JSON.stringify(areas),
        usuario_id: req.user.id, comentario,
      });
    });

    const actualizado = await db('projects').where({ id: project.id }).first();
    await auditar(req.user.id,'TRANSFERIR','PROJECT',project.id,{anteriores,areas,comentario});
    const recipients = await db('users').where({ activo: true }).whereIn('role', ['ADMIN','PROGRAMACION','SOPORTE']).select('id','areas');
    const notifyIds = recipients.filter(u => { try { const ua=JSON.parse(u.areas||'[]'); return u.id !== req.user.id && ua.some(a=>areas.includes(a)); } catch(_) { return false; } }).map(u=>u.id);
    await notificarUsuarios(notifyIds, { tipo: 'PROYECTO_TRANSFERIDO', titulo: 'Proyecto transferido', mensaje: `El proyecto “${project.nombre}” fue transferido de área.`, projectId: project.id });
    res.json({
      project: { ...actualizado, areas },
      transfer: { areaAnterior: anteriores, areaNueva: areas, comentario },
    });
  } catch (err) { next(err); }
});

router.get('/:projectId', async (req, res, next) => {
  try {
    const project = await accessProject(req.user, req.params.projectId);
    if (!project) return res.status(403).json({ error: 'No tienes acceso a este historial.' });
    const rows = await db('transfers as t')
      .leftJoin('users as u', 'u.id', 't.usuario_id')
      .where('t.project_id', req.params.projectId)
      .select('t.*', 'u.nombre as usuario_nombre')
      .orderBy('t.created_at', 'desc');
    res.json({
      transfers: rows.map((r) => ({
        ...r,
        area_anterior: parseJsonArray(r.area_anterior),
        area_nueva: parseJsonArray(r.area_nueva),
      })),
    });
  } catch (err) { next(err); }
});

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [value].filter(Boolean);
  } catch (_) {
    return value ? [value] : [];
  }
}

module.exports = router;
