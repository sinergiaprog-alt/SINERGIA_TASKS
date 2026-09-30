const express = require('express');
const db = require('../config/db');
const { newId } = require('../config/id');
const { requireAuth } = require('../middleware/auth');
const { canViewProject, canEditProject } = require('./projects/access');
const { auditar } = require('./audit');

const router = express.Router();
router.use(requireAuth);

function clean(value, max = 200000) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (s.length > max) throw Object.assign(new Error('Dato criptográfico demasiado grande.'), { status: 400 });
  return s;
}

router.get('/me', async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    res.json({
      publicKeyB64: user?.e2e_public_key || null,
      privateKey: user?.e2e_private_key_cifrado ? {
        cifradoB64: user.e2e_private_key_cifrado,
        ivB64: user.e2e_private_key_iv,
        saltB64: user.e2e_private_key_salt,
      } : null,
    });
  } catch (e) { next(e); }
});

router.post('/me', async (req, res, next) => {
  try {
    const publicKeyB64 = clean(req.body.publicKeyB64, 10000);
    const privateKey = req.body.privateKey || {};
    if (!publicKeyB64 || !privateKey.cifradoB64 || !privateKey.ivB64 || !privateKey.saltB64) return res.status(400).json({ error: 'Faltan datos de las claves E2E.' });
    await db('users').where({ id: req.user.id }).update({
      e2e_public_key: publicKeyB64,
      e2e_private_key_cifrado: clean(privateKey.cifradoB64),
      e2e_private_key_iv: clean(privateKey.ivB64, 1000),
      e2e_private_key_salt: clean(privateKey.saltB64, 1000),
      updated_at: new Date(),
    });
    await auditar(req.user.id, 'CONFIGURAR_E2E', 'USER', req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

async function getProjectForUser(projectId, user, edit = false) {
  const project = await db('projects').where({ id: projectId }).first();
  if (!project) return null;
  const allowed = edit ? await canEditProject(db, user, project) : await canViewProject(db, user, project);
  return allowed ? project : false;
}

router.get('/project/:projectId', async (req, res, next) => {
  try {
    const project = await getProjectForUser(req.params.projectId, req.user, false);
    if (!project) return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
    const own = await db('project_crypto_keys').where({ project_id: project.id, user_id: req.user.id }).first();
    const participantRows = await db('project_participants as pp')
      .join('users as u', 'u.id', 'pp.user_id')
      .where({ 'pp.project_id': project.id, 'u.activo': true })
      .select('pp.user_id as id', 'u.nombre', 'u.email', 'u.e2e_public_key');
    const responsible = await db('users').where({ id: project.responsable_id, activo: true }).select('id','nombre','email','e2e_public_key').first();
    const allActive = await db('users').where({ activo: true }).select('id','nombre','email','e2e_public_key','areas');
    const projectAreas = (() => { try { return JSON.parse(project.areas || '[]'); } catch (_) { return project.area ? [project.area] : []; } })();
    const areaMembers = allActive.filter(u => { try { const a=JSON.parse(u.areas||'[]'); return a.some(x=>projectAreas.includes(x)); } catch (_) { return false; } });
    const members = [];
    const seen = new Set();
    for (const row of [responsible, ...participantRows, ...areaMembers]) {
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      const envelope = await db('project_crypto_keys').where({ project_id: project.id, user_id: row.id }).first();
      members.push({ userId: row.id, nombre: row.nombre, email: row.email, publicKeyB64: row.e2e_public_key || null, envelopeB64: envelope?.clave_envuelta || null });
    }
    const encryptedChecks = await Promise.all([
      db('comments').where({ project_id: project.id }).whereNotNull('contenido_iv').first(),
      db('files').where({ project_id: project.id, cifrado: true }).first(),
      db('projects').where({ id: project.id }).whereNotNull('descripcion_iv').first(),
      db('tasks').where({ project_id: project.id }).whereNotNull('descripcion_iv').first(),
      db('issues').where({ project_id: project.id }).whereNotNull('descripcion_iv').first(),
    ]);
    res.json({ ownEnvelopeB64: own?.clave_envuelta || null, currentUserId: req.user.id, hasEncryptedContent: encryptedChecks.some(Boolean), members });
  } catch (e) { next(e); }
});

router.post('/project/:projectId/envelope', async (req, res, next) => {
  try {
    const project = await getProjectForUser(req.params.projectId, req.user, false);
    if (!project) return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
    const userId = String(req.body.userId || '').trim();
    const canEdit = await canEditProject(db, req.user, project);
    if (userId !== req.user.id && !canEdit) return res.status(403).json({ error: 'No tienes permiso para distribuir claves del proyecto.' });
    const envelopeB64 = clean(req.body.envelopeB64, 20000);
    if (!userId || !envelopeB64) return res.status(400).json({ error: 'Faltan usuario o clave envuelta.' });
    const member = await db('users').where({ id: userId, activo: true }).first();
    if (!member) return res.status(400).json({ error: 'El usuario no existe o está inactivo.' });
    const isResponsible = project.responsable_id === userId;
    const participant = await db('project_participants').where({ project_id: project.id, user_id: userId }).first();
    if (!isResponsible && !participant) return res.status(400).json({ error: 'El usuario no pertenece al proyecto.' });
    if (!member.e2e_public_key) return res.status(409).json({ error: 'El usuario todavía no ha configurado su cifrado E2E.' });
    const existing = await db('project_crypto_keys').where({ project_id: project.id, user_id: userId }).first();
    const data = { clave_envuelta: envelopeB64, updated_at: new Date() };
    if (existing) await db('project_crypto_keys').where({ id: existing.id }).update(data);
    else await db('project_crypto_keys').insert({ id: newId('pkey'), project_id: project.id, user_id: userId, ...data });
    await auditar(req.user.id, 'ACTUALIZAR_CLAVE_E2E', 'PROJECT', project.id, { userId });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
