const { getApps, initializeApp, cert } = require('firebase-admin/app');
const path = require('path');
const fs = require('fs');

const DEFAULT_PROJECT_ID = 'sinergia-interactiva';
const DEFAULT_WEB_API_KEY = 'AIzaSyAvt8EqyDPEitkOeXqMk7pCtDPtfbcXlqI';

function loadServiceAccount() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT ||
    path.resolve(__dirname, '../../secrets/firebase-service-account.json');
  if (!fs.existsSync(serviceAccountPath)) {
    throw Object.assign(new Error(
      'No se encontró la credencial privada de Firebase Admin. Coloca firebase-service-account.json en backend/secrets/.'
    ), { code: 'FIREBASE_SERVICE_ACCOUNT_MISSING', status: 500 });
  }
  const serviceAccount = require(serviceAccountPath);
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw Object.assign(new Error('La credencial de Firebase Admin está incompleta.'), {
      code: 'FIREBASE_SERVICE_ACCOUNT_INVALID', status: 500,
    });
  }
  const expected = process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  if (serviceAccount.project_id !== expected) {
    console.warn(`Firebase Admin: service account pertenece a "${serviceAccount.project_id}", pero Sinergia espera "${expected}".`);
  }
  return serviceAccount;
}

function getFirebaseAdminApp() {
  if (getApps().length) return getApps()[0];
  const serviceAccount = loadServiceAccount();
  return initializeApp({
    credential: cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id || DEFAULT_PROJECT_ID,
  });
}

/**
 * Verifica un ID token de Firebase. Primero intenta Firebase Admin SDK.
 * Si la credencial Admin está desalineada pero el token es válido, usa
 * Identity Toolkit para verificarlo contra el proyecto web de Sinergia.
 */
async function verifyFirebaseIdToken(idToken) {
  let adminError = null;
  try {
    const { getAuth } = require('firebase-admin/auth');
    const decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(idToken);
    return decoded;
  } catch (err) {
    adminError = err;
  }

  const apiKey = process.env.FIREBASE_WEB_API_KEY || DEFAULT_WEB_API_KEY;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.users?.[0]?.localId) {
      const detail = data?.error?.message || adminError?.code || 'TOKEN_INVALIDO';
      throw Object.assign(new Error(`No se pudo verificar el token de Firebase (${detail}).`), {
        code: 'FIREBASE_TOKEN_VERIFY_FAILED',
        status: 401,
        cause: adminError,
      });
    }
    const account = data.users[0];
    const providerId = account.providerUserInfo?.[0]?.providerId || null;
    return {
      uid: account.localId,
      email: account.email || null,
      phone_number: account.phoneNumber || null,
      name: account.displayName || null,
      firebase: { sign_in_provider: providerId === 'phone' ? 'phone' : providerId === 'password' ? 'password' : (!account.email && !account.phoneNumber ? 'anonymous' : providerId) },
    };
  } catch (err) {
    if (err?.code === 'FIREBASE_TOKEN_VERIFY_FAILED') throw err;
    const fallbackDetail = err?.message || 'No se pudo contactar Identity Toolkit.';
    throw Object.assign(new Error(`Firebase no pudo validar la sesión. ${fallbackDetail}`), {
      code: 'FIREBASE_TOKEN_VERIFY_FAILED', status: 401, cause: adminError,
    });
  }
}

module.exports = { getFirebaseAdminApp, verifyFirebaseIdToken, loadServiceAccount };
