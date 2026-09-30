// Cifrado E2E de Sinergia Tasks.
// Las claves privadas se mantienen solo en memoria del navegador durante la sesión.
const RSA_PARAMS = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const AES_PARAMS = { name: 'AES-GCM', length: 256 };
let session = { publicKeyB64: null, privateKey: null };
const projectKeys = new Map();

// Conversión ArrayBuffer <-> base64 por bloques de 32 KB. Antes se hacía
// byte por byte con `bin += String.fromCharCode(...)`, y para un archivo de
// varios MB (una foto normal) eso son millones de concatenaciones de texto
// en el hilo principal del navegador: la pestaña se congelaba varios
// segundos al subir o abrir la vista previa de una imagen, lo que se sentía
// como "el sistema muy lento" (y a veces como que la vista previa "no
// funciona", porque el usuario cerraba antes de que terminara).
const BASE64_CHUNK = 0x8000; // 32 KB: tamaño seguro para fromCharCode.apply
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}
function fromBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generarParDeClavesUsuario() {
  const keyPair = await crypto.subtle.generateKey(RSA_PARAMS, true, ['encrypt','decrypt']);
  return { publicKeyB64: toBase64(await crypto.subtle.exportKey('spki', keyPair.publicKey)), privateKeyRaw: await crypto.subtle.exportKey('pkcs8', keyPair.privateKey) };
}
async function derivarClaveDesdeContrasena(password, saltB64) {
  const salt = saltB64 ? fromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},baseKey,AES_PARAMS,false,['encrypt','decrypt']);
  return {key,saltB64:toBase64(salt)};
}
async function cifrarClavePrivada(privateKeyRaw,password) {
  const {key,saltB64}=await derivarClaveDesdeContrasena(password); const iv=crypto.getRandomValues(new Uint8Array(12));
  return {cifradoB64:toBase64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,privateKeyRaw)),ivB64:toBase64(iv),saltB64};
}
async function descifrarClavePrivada(blob,password) {
  const {key}=await derivarClaveDesdeContrasena(password,blob.saltB64);
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(blob.ivB64)},key,fromBase64(blob.cifradoB64));
  return crypto.subtle.importKey('pkcs8',raw,RSA_PARAMS,true,['decrypt']);
}
async function importarClavePublica(publicKeyB64) { return crypto.subtle.importKey('spki',fromBase64(publicKeyB64),RSA_PARAMS,true,['encrypt']); }
async function generarClaveDeContenido() { return crypto.subtle.generateKey(AES_PARAMS,true,['encrypt','decrypt']); }
async function envolverClaveDeContenido(claveContenido,publicKey) { return toBase64(await crypto.subtle.encrypt(RSA_PARAMS.name,publicKey,await crypto.subtle.exportKey('raw',claveContenido))); }
async function desenvolverClaveDeContenido(envueltaB64,privateKey) { return crypto.subtle.importKey('raw',await crypto.subtle.decrypt(RSA_PARAMS.name,privateKey,fromBase64(envueltaB64)),AES_PARAMS,true,['encrypt','decrypt']); }
async function cifrarContenido(claveContenido,textoOBytes) { const iv=crypto.getRandomValues(new Uint8Array(12)); const datos=typeof textoOBytes==='string'?new TextEncoder().encode(textoOBytes):new Uint8Array(textoOBytes); return {cifradoB64:toBase64(await crypto.subtle.encrypt({name:'AES-GCM',iv},claveContenido,datos)),ivB64:toBase64(iv)}; }
async function descifrarContenido(claveContenido,blob,comoTexto=true) { const datos=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(blob.ivB64)},claveContenido,fromBase64(blob.cifradoB64)); return comoTexto?new TextDecoder().decode(datos):new Uint8Array(datos); }

export function resetE2ESession(){ session={publicKeyB64:null,privateKey:null}; projectKeys.clear(); }
export function e2eDisponible(){ return !!session.privateKey && !!session.publicKeyB64; }
export function getE2EPublicKey(){ return session.publicKeyB64; }
export function getProjectKey(projectId){ return projectKeys.get(projectId)||null; }
export function setProjectKey(projectId,key){ projectKeys.set(projectId,key); }

export async function ensureE2E(password,api) {
  if (!password) throw new Error('La contraseña es necesaria para desbloquear el cifrado E2E.');
  const current=await api.get('/crypto/me');
  if (current.data.publicKeyB64 && current.data.privateKey) {
    session.publicKeyB64=current.data.publicKeyB64;
    try { session.privateKey=await descifrarClavePrivada(current.data.privateKey,password); return {created:false}; }
    catch { throw new Error('No se pudo desbloquear la clave E2E. Si cambiaste la contraseña, hay que recuperar la clave privada.'); }
  }
  const pair=await generarParDeClavesUsuario();
  const encrypted=await cifrarClavePrivada(pair.privateKeyRaw,password);
  await api.post('/crypto/me',{publicKeyB64:pair.publicKeyB64,privateKey:encrypted});
  session.publicKeyB64=pair.publicKeyB64;
  session.privateKey=await crypto.subtle.importKey('pkcs8',pair.privateKeyRaw,RSA_PARAMS,true,['decrypt']);
  return {created:true};
}

export async function cargarClaveProyecto(projectId,api) {
  if (!e2eDisponible()) throw new Error('El cifrado E2E no está desbloqueado.');
  if (projectKeys.has(projectId)) return projectKeys.get(projectId);
  const {data}=await api.get(`/crypto/project/${projectId}`);
  let key=null;
  if (data.ownEnvelopeB64) key=await desenvolverClaveDeContenido(data.ownEnvelopeB64,session.privateKey);
  else {
    if (data.hasEncryptedContent) throw new Error('Este proyecto ya tiene contenido cifrado y tu usuario todavía no tiene su clave.');
    key=await generarClaveDeContenido();
    await api.post(`/crypto/project/${projectId}/envelope`,{userId:data.currentUserId,envelopeB64:await envolverClaveDeContenido(key,await importarClavePublica(session.publicKeyB64))});
  }
  projectKeys.set(projectId,key);
  // Entrega la misma clave de contenido a miembros que aún no tengan envelope.
  for (const member of (data.members||[])) {
    if (!member.publicKeyB64 || member.envelopeB64 || member.userId===data.currentUserId) continue;
    try { const pub=await importarClavePublica(member.publicKeyB64); const env=await envolverClaveDeContenido(key,pub); await api.post(`/crypto/project/${projectId}/envelope`,{userId:member.userId,envelopeB64:env}); } catch (_) { /* el usuario puede terminar de configurar E2E después */ }
  }
  return key;
}

export async function cifrarTextoProyecto(projectId,text,api){ const key=await cargarClaveProyecto(projectId,api); return cifrarContenido(key,text); }
export async function descifrarTextoProyecto(projectId,blob,api){ const key=await cargarClaveProyecto(projectId,api); return descifrarContenido(key,blob,true); }
export async function cifrarBytesProyecto(projectId,bytes,api){ const key=await cargarClaveProyecto(projectId,api); return cifrarContenido(key,bytes); }
export async function descifrarBytesProyecto(projectId,blob,api){ const key=await cargarClaveProyecto(projectId,api); return descifrarContenido(key,blob,false); }

export { generarParDeClavesUsuario,cifrarClavePrivada,descifrarClavePrivada,importarClavePublica,generarClaveDeContenido,envolverClaveDeContenido,desenvolverClaveDeContenido,cifrarContenido,descifrarContenido,toBase64,fromBase64 };
