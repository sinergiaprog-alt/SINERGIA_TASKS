const { loadServiceAccount } = require('../src/config/firebase-admin');
const { getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

(async () => {
  try {
    const s = loadServiceAccount();
    console.log(JSON.stringify({
      ok: true,
      project_id: s.project_id,
      client_email: s.client_email,
      expected_project: process.env.FIREBASE_PROJECT_ID || 'sinergia-interactiva',
      service_account_matches_expected: s.project_id === (process.env.FIREBASE_PROJECT_ID || 'sinergia-interactiva'),
    }, null, 2));
    const app = getApps().length ? getApps()[0] : require('../src/config/firebase-admin').getFirebaseAdminApp();
    await getAuth(app).listUsers(1);
    console.log('Firebase Admin SDK: verificación de credenciales OK.');
  } catch (err) {
    console.error('Firebase Admin SDK ERROR:', err?.code || 'ERROR', err?.message || err);
    process.exitCode = 1;
  }
})();
