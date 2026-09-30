 const express = require('express');
const { getAuth } = require('firebase-admin/auth');
const { requireAuth } = require('../../middleware/auth');
const { getFirebaseAdminApp, verifyFirebaseIdToken } = require('../../config/firebase-admin');
const service = require('./auth.service');

const router = express.Router();


router.get('/bootstrap-status', async (req, res, next) => {
  try {
    const row = await require('../../config/db')('users').count('id as c').first();
    res.json({ available: Number(row?.c || 0) === 0 });
  } catch (err) { next(err); }
});

router.post('/bootstrap-admin', async (req, res, next) => {
  try {
    // Verificar que no haya usuarios registrados (protección doble)
    const row = await require('../../config/db')('users').count('id as c').first();
    if (Number(row?.c || 0) > 0) {
      return res.status(403).json({ error: 'El sistema ya fue inicializado. Este endpoint está deshabilitado.' });
    }
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
    if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    const result = await service.bootstrapFirstAdmin({ nombre, email: email.trim().toLowerCase(), password });
    res.status(201).json(result);
  } catch (err) { next(err); }
});



router.post('/bootstrap-existing', async (req, res, next) => {
  try {
    const row = await require('../../config/db')('users').count('id as c').first();
    if (Number(row?.c || 0) > 0) {
      return res.status(403).json({ error: 'El sistema ya fue inicializado. Este endpoint está deshabilitado.' });
    }
    const { idToken, nombre } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Falta el token de Firebase.' });
    const decoded = await verifyFirebaseIdToken(idToken);
    if (!decoded.email) return res.status(400).json({ error: 'La cuenta autenticada no tiene un correo electrónico.' });
    const result = await service.bootstrapExistingFirebaseAdmin({
      firebaseUid: decoded.uid,
      email: decoded.email,
      nombre: nombre || decoded.name || decoded.email.split('@')[0],
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.post('/guest-session', async (req, res, next) => {
  try {
    const { idToken, guestId } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Falta el token de Firebase.' });
    const decoded = await verifyFirebaseIdToken(idToken);
    if (decoded.firebase?.sign_in_provider !== 'anonymous') return res.status(400).json({ error: 'Esta sesión no corresponde a un acceso de invitado.', code: 'NOT_GUEST_SESSION' });
    const user = await service.guestSession({ firebaseUid: decoded.uid, guestId });
    res.json({ user });
  } catch (err) { next(err); }
});

router.post('/firebase-session', async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Falta el token de Firebase.' });
    const decoded = await verifyFirebaseIdToken(idToken);
    const user = await service.firebaseSession(decoded.uid, decoded.email, decoded.phone_number || null, decoded.firebase?.sign_in_provider || null);
    res.json({ user });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try { res.json({ user: await service.me(req.user.id) }); }
  catch (err) { next(err); }
});

router.get('/profile', requireAuth, async (req, res, next) => {
  try { res.json(await service.profile(req.user.id)); }
  catch (err) { next(err); }
});

module.exports = router;
