// Este script NO se usa en producción. Solo simula firebase-admin para poder
// ejercitar el código real de las rutas (projects/tasks/users) sin tener
// todavía la credencial de servicio de Firebase.
const path = require('path');
const Module = require('module');

const BACKEND_ROOT = path.resolve(__dirname, '..');

// --- Fake de ../../config/firebase-admin.js (evita el fs.existsSync del secrets/) ---
const firebaseAdminConfigPath = require.resolve(path.join(BACKEND_ROOT, 'src/config/firebase-admin.js'));
require.cache[firebaseAdminConfigPath] = {
  id: firebaseAdminConfigPath,
  filename: firebaseAdminConfigPath,
  loaded: true,
  exports: { getFirebaseAdminApp: () => ({}), verifyFirebaseIdToken: (token) => fakeAuth.verifyIdToken(token) },
};

// --- Fake de firebase-admin/auth ---
// Un "token" en estas pruebas es simplemente JSON.stringify({ uid, email }).
const usuariosFirebaseSimulados = new Map(); // email -> { uid, password }

const fakeAuth = {
  async verifyIdToken(token) {
    try {
      const { uid, email } = JSON.parse(token);
      return { uid, email };
    } catch {
      const err = new Error('Token de prueba inválido.');
      throw err;
    }
  },
  async createUser({ email, password, displayName }) {
    if (usuariosFirebaseSimulados.has(email)) {
      const err = new Error('correo ya existe');
      err.code = 'auth/email-already-exists';
      throw err;
    }
    const uid = 'fbuid_' + Math.random().toString(36).slice(2, 10);
    usuariosFirebaseSimulados.set(email, { uid, password, displayName });
    return { uid, email };
  },
  async deleteUser(uid) {
    for (const [email, v] of usuariosFirebaseSimulados) {
      if (v.uid === uid) usuariosFirebaseSimulados.delete(email);
    }
  },
  async setCustomUserClaims() {
    return undefined;
  },
};

const firebaseAdminAuthPath = require.resolve('firebase-admin/auth');
require.cache[firebaseAdminAuthPath] = {
  id: firebaseAdminAuthPath,
  filename: firebaseAdminAuthPath,
  loaded: true,
  exports: { getAuth: () => fakeAuth },
};

// Utilidad para que el script de pruebas genere un "token" de un usuario ya creado.
function tokenPara(email) {
  const u = usuariosFirebaseSimulados.get(email);
  if (!u) throw new Error(`No existe usuario simulado de Firebase para ${email}`);
  return JSON.stringify({ uid: u.uid, email });
}

module.exports = { tokenPara, usuariosFirebaseSimulados };
