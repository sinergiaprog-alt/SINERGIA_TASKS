const { getAuth } = require('firebase-admin/auth');
const db = require('../../config/db');
const { newId } = require('../../config/id');
const { getFirebaseAdminApp } = require('../../config/firebase-admin');

function publicUser(user) {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    role: user.role,
    areas: JSON.parse(user.areas || '[]'),
    departamento: user.departamento || null,
    telefono: user.telefono || null,
    tipoCuenta: user.tipo_cuenta || 'CORREO',
    invitadoId: user.invitado_id || null,
    activo: !!user.activo,
    createdAt: user.created_at,
  };
}

async function createFirebaseUser({ email, password, nombre }) {
  const auth = getAuth(getFirebaseAdminApp());
  return auth.createUser({ email, password, displayName: nombre });
}

async function bootstrapFirstAdmin({ nombre, email, password }) {
  const count = await db('users').count('id as c').first();
  if (Number(count.c) > 0) {
    throw Object.assign(new Error('Ya existe al menos un usuario. Pide a un administrador que te cree la cuenta.'), { status: 409 });
  }

  let fbUser;
  try {
    fbUser = await createFirebaseUser({ email, password, nombre });
    const user = {
      id: newId('usr'), nombre, email, password_hash: 'FIREBASE_AUTH',
      firebase_uid: fbUser.uid, role: 'ADMIN',
      areas: JSON.stringify(['PROGRAMACION', 'SOPORTE', 'CONTABILIDAD']), activo: true,
    };
    await db('users').insert(user);
    return { user: publicUser({ ...user, created_at: new Date() }) };
  } catch (err) {
    if (fbUser?.uid) {
      try { await getAuth(getFirebaseAdminApp()).deleteUser(fbUser.uid); } catch (_) {}
    }
    if (err.code === 'auth/email-already-exists') {
      throw Object.assign(new Error('Ese correo ya existe en Firebase.'), { status: 409 });
    }
    throw err;
  }
}



async function bootstrapExistingFirebaseAdmin({ firebaseUid, email, nombre }) {
  const count = await db('users').count('id as c').first();
  if (Number(count.c) > 0) {
    throw Object.assign(new Error('Ya existe al menos un usuario. Pide a un administrador que gestione la cuenta.'), { status: 409, code: 'BOOTSTRAP_UNAVAILABLE' });
  }
  if (!firebaseUid || !email) {
    throw Object.assign(new Error('Faltan los datos de la cuenta Firebase.'), { status: 400 });
  }
  const existing = await db('users').where({ firebase_uid: firebaseUid }).first();
  if (existing) return { user: publicUser(existing) };
  const user = {
    id: newId('usr'),
    nombre: (nombre || email.split('@')[0] || 'Administrador').trim(),
    email: email.trim().toLowerCase(),
    password_hash: 'FIREBASE_AUTH',
    firebase_uid: firebaseUid,
    role: 'ADMIN',
    areas: JSON.stringify(['PROGRAMACION', 'SOPORTE', 'CONTABILIDAD']),
    departamento: 'Administración',
    activo: true,
  };
  await db('users').insert(user);
  try {
    await getAuth(getFirebaseAdminApp()).setCustomUserClaims(firebaseUid, { role: 'ADMIN', areas: JSON.parse(user.areas) });
  } catch (err) {
    // La sesión de Firebase ya fue verificada. Si los custom claims fallan,
    // la cuenta local sigue siendo válida y puede sincronizarse después.
    console.warn('No se pudieron actualizar los custom claims del administrador:', err?.message || err);
  }
  return { user: publicUser({ ...user, created_at: new Date() }) };
}

async function firebaseSession(firebaseUid, email, phoneNumber = null, signInProvider = null) {
  let user = await db('users')
    .where({ firebase_uid: firebaseUid })
    .first();

  // Si no existe por UID, intentar encontrarlo por correo
  if (!user && email) {
    user = await db('users')
      .whereRaw('LOWER(email) = ?', [email.toLowerCase()])
      .first();

    if (user) {
      await db('users').where({ id: user.id }).update({ firebase_uid: firebaseUid, password_hash: 'FIREBASE_AUTH' });
      user = await db('users').where({ id: user.id }).first();
    }
  }

  if (!user && phoneNumber) {
    user = await db('users').where({ telefono: phoneNumber }).first();
    if (user) {
      await db('users').where({ id: user.id }).update({ firebase_uid: firebaseUid, password_hash: 'FIREBASE_AUTH' });
      user = await db('users').where({ id: user.id }).first();
    }
  }

  if (!user && signInProvider === 'anonymous') {
    // Los invitados deben vincularse a una cuenta de invitado creada previamente
    // por un administrador/gestor. No se crean usuarios anónimos genéricos.
    user = null;
  }

  // Primera instalación: si la base está vacía y una cuenta Firebase ya autenticada
  // entra desde el login normal, se vincula como administrador. Esto conserva el
  // flujo de instalación que ya funcionaba en v0.5, sin afectar la creación normal
  // de usuarios posteriores desde Administración.
  const allowAutoBootstrap = process.env.AUTO_BOOTSTRAP_FIRST_FIREBASE_ADMIN !== 'false';
  if (!user && allowAutoBootstrap && signInProvider !== 'anonymous' && (email || phoneNumber)) {
    const count = await db('users').count('id as c').first();
    if (Number(count?.c || 0) === 0) {
      const cleanEmail = email?.trim().toLowerCase() || `telefono_${String(phoneNumber).replace(/\D/g, '')}@sinergia.local`;
      const admin = {
        id: newId('usr'),
        nombre: (email?.split('@')[0] || 'Administrador').trim(),
        email: cleanEmail,
        password_hash: 'FIREBASE_AUTH',
        firebase_uid: firebaseUid,
        role: 'ADMIN',
        areas: JSON.stringify(['PROGRAMACION', 'SOPORTE', 'CONTABILIDAD']),
        departamento: 'Administración',
        telefono: phoneNumber || null,
        tipo_cuenta: email ? 'CORREO' : 'TELEFONO',
        invitado_id: null,
        activo: true,
      };
      await db('users').insert(admin);
      try {
        await getAuth(getFirebaseAdminApp()).setCustomUserClaims(firebaseUid, { role: 'ADMIN', areas: JSON.parse(admin.areas), tipoCuenta: admin.tipo_cuenta });
      } catch (err) {
        console.warn('No se pudieron actualizar los claims del primer administrador:', err?.message || err);
      }
      user = admin;
    }
  }

  if (!user || !user.activo) {
    throw Object.assign(
      new Error(
        'La cuenta existe en Firebase, pero no está registrada o está inactiva en Sinergia.'
      ),
      { status: 403, code: 'USER_NOT_REGISTERED' }
    );
  }

  if (
    email &&
    user.email.toLowerCase() !== email.toLowerCase()
  ) {
    throw Object.assign(
      new Error('El correo de la cuenta no coincide.'),
      { status: 403 }
    );
  }

  return publicUser(user);
}


async function guestSession({ firebaseUid, guestId }) {
  const cleanId = String(guestId || '').trim().toUpperCase();
  if (!cleanId) throw Object.assign(new Error('Introduce el ID de invitado.'), { status: 400, code: 'GUEST_ID_REQUIRED' });
  let user = await db('users').where({ invitado_id: cleanId }).first();
  if (!user || user.tipo_cuenta !== 'INVITADO') {
    throw Object.assign(new Error('El ID de invitado no existe o no es válido.'), { status: 404, code: 'GUEST_NOT_FOUND' });
  }
  if (!user.activo) throw Object.assign(new Error('Esta cuenta de invitado está inactiva.'), { status: 403, code: 'USER_INACTIVE' });
  if (user.firebase_uid !== firebaseUid) {
    // El ID de invitado es la credencial de acceso controlado. Al volver a iniciar
    // sesión en otro navegador/dispositivo se vincula a la nueva sesión anónima.
    await db('users').where({ id: user.id }).update({ firebase_uid: firebaseUid, password_hash: 'FIREBASE_ANONYMOUS' });
    user = await db('users').where({ id: user.id }).first();
  }
  try {
    await getAuth(getFirebaseAdminApp()).setCustomUserClaims(firebaseUid, { role: user.role, areas: JSON.parse(user.areas || '[]'), tipoCuenta: 'INVITADO', invitadoId: user.invitado_id });
  } catch (err) {
    console.warn('No se pudieron actualizar los claims del invitado:', err?.message || err);
  }
  return publicUser(user);
}


async function profile(userId) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw Object.assign(new Error('Usuario no encontrado.'), { status: 404 });

  const [completedTasks, responsibleProjects, participantProjects, assignedPhases, auditCount, recentActivity, weekly] = await Promise.all([
    db('tasks').where({ responsable_id: userId, estado: 'COMPLETADA' }).count({ total: 'id' }).first().then(r => Number(r.total || 0)),
    db('projects').where({ responsable_id: userId }).select('id'),
    db('project_participants').where({ user_id: userId }).select('project_id'),
    db('tasks').where({ responsable_id: userId }).whereNotNull('fase').select('project_id', 'fase', 'estado'),
    db('audit_log').where({ usuario_id: userId }).count({ total: 'id' }).first().then(r => Number(r.total || 0)),
    db('audit_log').where({ usuario_id: userId }).orderBy('created_at', 'desc').limit(8),
    db('audit_log').where({ usuario_id: userId }).where('created_at', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).select('created_at').orderBy('created_at', 'asc'),
  ]);

  const projectIds = [...new Set([
    ...responsibleProjects.map(r => r.id),
    ...participantProjects.map(r => r.project_id),
  ])];

  let fasesCompletadas = 0;
  const phaseGroups = new Map();
  for (const t of assignedPhases) {
    const key = `${t.project_id}::${t.fase}`;
    if (!phaseGroups.has(key)) phaseGroups.set(key, { projectId: t.project_id, fase: t.fase });
  }
  if (phaseGroups.size) {
    const allPhaseTasks = await db('tasks')
      .whereIn('project_id', [...new Set([...phaseGroups.values()].map(x => x.projectId))])
      .whereNotNull('fase')
      .select('project_id', 'fase', 'estado');
    for (const group of phaseGroups.values()) {
      const rows = allPhaseTasks.filter(t => t.project_id === group.projectId && t.fase === group.fase);
      if (rows.length > 0 && rows.every(t => t.estado === 'COMPLETADA')) fasesCompletadas += 1;
    }
  }

  const days = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - idx)); return d;
  });
  const localKey = d => {
    const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const actividadSemana = days.map((d) => {
    const key = localKey(d);
    return {
      fecha: key,
      etiqueta: d.toLocaleDateString('es-DO', { weekday: 'short' }).replace('.', ''),
      total: weekly.filter(item => localKey(new Date(item.created_at)) === key).length,
    };
  });

  return {
    user: publicUser(user),
    stats: {
      tareasCompletadas: completedTasks,
      proyectos: projectIds.length,
      aportes: auditCount,
      fasesCompletadas,
      actividadSemana,
      recientes: recentActivity,
    },
  };
}

async function me(userId) {
  const user = await db('users').where({ id: userId }).first();

  if (!user) {
    throw Object.assign(
      new Error('Usuario no encontrado.'),
      { status: 404 }
    );
  }

  return publicUser(user);
}

module.exports = {
  bootstrapFirstAdmin,
  firebaseSession,
  me,
  profile,
  publicUser,
  createFirebaseUser,
  bootstrapExistingFirebaseAdmin
};