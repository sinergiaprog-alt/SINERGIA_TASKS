const { getAuth } = require('firebase-admin/auth');
const { getFirebaseAdminApp, verifyFirebaseIdToken } = require('../config/firebase-admin');
const db = require('../config/db');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta el token de autenticación.' });

  try {
    const decoded = await verifyFirebaseIdToken(token);
    const user = await db('users').where({ firebase_uid: decoded.uid }).first();
    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Usuario no registrado o inactivo en Sinergia.', code: 'USER_NOT_REGISTERED' });
    }
    req.user = { id: user.id, firebaseUid: decoded.uid, role: user.role, areas: JSON.parse(user.areas || '[]').map(a => String(a).trim().toUpperCase()), email: user.email };
    next();
  } catch (err) {
    console.error('Firebase auth:', err?.code || 'ERROR', err?.message || err);
    const status = err?.status || 401;
    return res.status(status).json({ error: err?.message || 'Token de Firebase inválido o expirado.', code: err?.code || 'FIREBASE_AUTH_FAILED' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
    }
    next();
  };
}

function requireArea(getAreaFromReq) {
  return (req, res, next) => {
    if (req.user.role === 'ADMIN') return next();
    const area = typeof getAreaFromReq === 'function' ? getAreaFromReq(req) : getAreaFromReq;
    if (!area || !req.user.areas.includes(area)) {
      return res.status(403).json({ error: 'No tienes acceso a esta área.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requireArea };
