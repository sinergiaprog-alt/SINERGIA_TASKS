const express = require('express');
const db = require('../../config/db');
const { getAuth } = require('firebase-admin/auth');
const { getFirebaseAdminApp } = require('../../config/firebase-admin');
const { newId } = require('../../config/id');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { publicUser } = require('../auth/auth.service');
const { auditar } = require('../audit');

const router = express.Router();
router.use(requireAuth);
const ROLES_VALIDOS = ['ADMIN', 'COLABORADOR', 'SOPORTE', 'PROGRAMACION', 'CONTABILIDAD'];
const AREAS_VALIDAS = ['PROGRAMACION', 'SOPORTE', 'CONTABILIDAD'];
const TIPOS_CUENTA = ['CORREO', 'TELEFONO', 'INVITADO'];
function areasForRole(role, areas) {
  const clean = [...new Set((Array.isArray(areas) ? areas : []).map((a) => String(a || '').trim().toUpperCase()).filter(Boolean))];
  if (clean.some((area) => !AREAS_VALIDAS.includes(area))) return { error: `Área inválida. Usa: ${AREAS_VALIDAS.join(', ')}` };
  if (AREAS_VALIDAS.includes(role)) {
    return { areas: [role] };
  }
  return { areas: clean };
}

router.get('/', requireRole('ADMIN'), async (req, res, next) => {
  try { const users = await db('users').orderBy('created_at', 'desc'); res.json({ users: users.map(publicUser) }); }
  catch (err) { next(err); }
});

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { nombre, email, password, role, areas, departamento, telefono, tipoCuenta = 'CORREO' } = req.body;
    // Validar longitudes máximas para evitar abusos
    if (nombre && nombre.length > 100) return res.status(400).json({ error: 'El nombre no puede superar 100 caracteres.' });
    if (email && email.length > 200) return res.status(400).json({ error: 'El correo no puede superar 200 caracteres.' });
    if (departamento && departamento.length > 100) return res.status(400).json({ error: 'El departamento no puede superar 100 caracteres.' });
    if (password && password.length > 128) return res.status(400).json({ error: 'La contraseña no puede superar 128 caracteres.' });
    if (!nombre || !role) return res.status(400).json({ error: 'Nombre y rol son obligatorios.' });
    if (!TIPOS_CUENTA.includes(tipoCuenta)) return res.status(400).json({ error: 'Tipo de cuenta inválido.' });
    if (!ROLES_VALIDOS.includes(role)) return res.status(400).json({ error: `Rol inválido. Usa uno de: ${ROLES_VALIDOS.join(', ')}` });
    const normalizedAreas = areasForRole(role, areas);
    if (normalizedAreas.error) return res.status(400).json({ error: normalizedAreas.error });
    const areasLimpias = normalizedAreas.areas;

    if (tipoCuenta === 'INVITADO O COLABORADOR') {
      const crypto = require('crypto');
      let invitadoId;
      do { invitadoId = `INV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }
      while (await db('users').where({ invitado_id: invitadoId }).first());
      const user = {
        id: newId('usr'), nombre: nombre.trim(), email: `invitado_${invitadoId.toLowerCase()}@sinergia.local`,
        password_hash: 'FIREBASE_ANONYMOUS', firebase_uid: null, role, areas: JSON.stringify(areasLimpias),
        departamento: departamento?.trim() || null, telefono: null, tipo_cuenta: 'INVITADO', invitado_id: invitadoId, activo: true,
      };
      await db('users').insert(user);
      await auditar(req.user.id, 'CREAR', 'USER', user.id, { role, areas: areasLimpias, tipoCuenta: 'INVITADO', invitadoId });
      return res.status(201).json({ user: publicUser({ ...user, created_at: new Date() }) });
    }

    if (tipoCuenta === 'CORREO') {
      if (!email || !password || password.length < 8) return res.status(400).json({ error: 'Las cuentas por correo requieren email y una contraseña de al menos 8 caracteres.' });
    }
    if (tipoCuenta === 'TELEFONO') {
      if (!telefono?.trim()) return res.status(400).json({ error: 'Las cuentas por teléfono requieren un número.' });
    }

    const cleanPhone = telefono?.trim() || null;
    const cleanEmail = email?.trim().toLowerCase() || `telefono_${cleanPhone.replace(/\D/g,'')}@sinergia.local`;
    if (await db('users').where({ email: cleanEmail }).first()) return res.status(409).json({ error: 'Ya existe un usuario con ese email.' });
    if (cleanPhone && await db('users').where({ telefono: cleanPhone }).first()) return res.status(409).json({ error: 'Ya existe un usuario con ese teléfono.' });

    let fbUser;
    try {
      const payload = { displayName: nombre };
      if (tipoCuenta === 'CORREO') { payload.email = cleanEmail; payload.password = password; }
      if (tipoCuenta === 'TELEFONO') payload.phoneNumber = cleanPhone;
      fbUser = await getAuth(getFirebaseAdminApp()).createUser(payload);
      await getAuth(getFirebaseAdminApp()).setCustomUserClaims(fbUser.uid, { role, areas: areasLimpias, tipoCuenta });
      const user = { id: newId('usr'), nombre: nombre.trim(), email: cleanEmail, password_hash: 'FIREBASE_AUTH', firebase_uid: fbUser.uid, role, areas: JSON.stringify(areasLimpias), departamento: departamento?.trim() || null, telefono: cleanPhone, tipo_cuenta: tipoCuenta, invitado_id: null, activo: true };
      await db('users').insert(user);
      await auditar(req.user.id, 'CREAR', 'USER', user.id, { role, areas: areasLimpias, tipoCuenta });
      return res.status(201).json({ user: publicUser({ ...user, created_at: new Date() }) });
    } catch (err) {
      if (fbUser?.uid) { try { await getAuth(getFirebaseAdminApp()).deleteUser(fbUser.uid); } catch (_) {} }
      if (err.code === 'auth/email-already-exists') return res.status(409).json({ error: 'Ese correo ya existe en Firebase.' });
      if (err.code === 'auth/phone-number-already-exists') return res.status(409).json({ error: 'Ese teléfono ya existe en Firebase.' });
      throw err;
    }
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { nombre, role, areas, activo, departamento, telefono } = req.body;
    const current = await db('users').where({ id: req.params.id }).first();
    if (!current) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (role !== undefined) {
      if (!ROLES_VALIDOS.includes(role)) return res.status(400).json({ error: `Rol inválido. Usa uno de: ${ROLES_VALIDOS.join(', ')}` });
      updates.role = role;
    }
    if (areas !== undefined || role !== undefined) {
      const normalizedAreas = areasForRole(role !== undefined ? role : current.role, areas !== undefined ? areas : JSON.parse(current.areas || '[]'));
      if (normalizedAreas.error) return res.status(400).json({ error: normalizedAreas.error });
      updates.areas = JSON.stringify(normalizedAreas.areas);
    }
    if (departamento !== undefined) updates.departamento = departamento?.trim() || null;
    if (telefono !== undefined) {
      const cleanPhone = telefono?.trim() || null;
      if (cleanPhone && await db('users').where('telefono', cleanPhone).whereNot('id', req.params.id).first()) return res.status(409).json({ error: 'Ese teléfono ya pertenece a otro usuario.' });
      updates.telefono = cleanPhone;
    }
    if (activo !== undefined) {
      const nuevoActivo = !!activo;
      if (!nuevoActivo && current.role === 'ADMIN') { const admins = await db('users').where({role:'ADMIN',activo:true}).count({c:'id'}).first(); if(Number(admins.c)<=1) return res.status(409).json({error:'No puedes desactivar al último administrador activo.'}); }
      if (!nuevoActivo && current.id === req.user.id) return res.status(409).json({error:'No puedes desactivar tu propia cuenta.'});
      updates.activo = nuevoActivo;
    }
    await db('users').where({ id: req.params.id }).update(updates);
    const user = await db('users').where({ id: req.params.id }).first();
    if (user.firebase_uid && (role !== undefined || areas !== undefined)) {
      await getAuth(getFirebaseAdminApp()).setCustomUserClaims(user.firebase_uid, { role: user.role, areas: JSON.parse(user.areas || '[]') });
    }
    await auditar(req.user.id, 'EDITAR', 'USER', user.id, updates);
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

module.exports = router;
