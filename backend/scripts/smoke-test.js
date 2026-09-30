require('./fake-firebase'); // debe cargarse ANTES que cualquier módulo del backend
const { tokenPara } = require('./fake-firebase');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const http = require('http');
const path = require('path');

if (process.env.SMOKE_TEST_ALLOW_DESTRUCTIVE !== 'true') {
  console.error('SMOKE-TEST BLOQUEADO: este script borra su SQLite de prueba. Usa SMOKE_TEST_ALLOW_DESTRUCTIVE=true solo en una prueba aislada.');
  process.exit(1);
}
const fs = require('fs');
process.env.SQLITE_FILE = path.resolve(__dirname, 'smoke-test.sqlite3');
for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.SQLITE_FILE + suffix); } catch (_) {} }
fs.closeSync(fs.openSync(process.env.SQLITE_FILE, 'w'));

function req(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    };
    const request = http.request(`http://localhost:4010${url}`, options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = raw; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    request.on('error', reject);
    if (data) request.write(data);
    request.end();
  });
}

function assert(cond, msg, extra) {
  if (!cond) {
    console.error('❌ FALLÓ:', msg, extra !== undefined ? JSON.stringify(extra) : '');
    process.exitCode = 1;
  } else {
    console.log('✅', msg);
  }
}

async function main() {
  const knex = require('knex')(require('../knexfile'));
  await knex.migrate.latest();
  await knex.destroy();
  const app = require('../src/app');
  const server = app.listen(4010);
  await new Promise((r) => server.once('listening', r));

  console.log('\n=== AUTH ===');
  const bootstrap = await req('POST', '/api/auth/bootstrap-admin', { nombre: 'Ana Admin', email: 'ana@sinergia.com', password: 'password123' });
  assert(bootstrap.status === 201, 'bootstrap-admin crea el primer admin', bootstrap.body);

  const anaToken = tokenPara('ana@sinergia.com');
  const session = await req('POST', '/api/auth/firebase-session', { idToken: anaToken });
  assert(session.status === 200 && session.body.user.role === 'ADMIN', 'firebase-session reconoce a Ana como ADMIN', session.body);

  console.log('\n=== USUARIOS ===');
  const nuevoUsuario = await req('POST', '/api/users', { nombre: 'Pedro Prog', email: 'pedro@sinergia.com', password: 'password123', role: 'PROGRAMACION', areas: ['PROGRAMACION'] }, anaToken);
  assert(nuevoUsuario.status === 201, 'admin crea usuario Pedro (PROGRAMACION)', nuevoUsuario.body);
  const pedroId = nuevoUsuario.body?.user?.id;

  const editarRol = await req('PATCH', `/api/users/${pedroId}`, { role: 'SOPORTE', areas: ['SOPORTE'] }, anaToken);
  assert(editarRol.status === 200 && editarRol.body.user.role === 'SOPORTE', 'PATCH /users/:id cambia el rol de Pedro a SOPORTE', editarRol.body);

  const pedroToken = tokenPara('pedro@sinergia.com');
  const pedroSession = await req('POST', '/api/auth/firebase-session', { idToken: pedroToken });
  assert(pedroSession.status === 200 && pedroSession.body.user.role === 'SOPORTE', 'el cambio de rol se refleja al iniciar sesión de nuevo', pedroSession.body);

  console.log('\n=== BLOQUEO DE CUENTA ===');
  const bloqueoCuenta = await req('PATCH', `/api/users/${pedroId}`, { activo: false }, anaToken);
  assert(bloqueoCuenta.status === 200 && bloqueoCuenta.body.user.activo === false, 'admin puede bloquear una cuenta sin eliminarla', bloqueoCuenta.body);
  const sesionBloqueada = await req('POST', '/api/auth/firebase-session', { idToken: pedroToken });
  assert(sesionBloqueada.status === 401, 'una cuenta bloqueada no puede iniciar sesión', sesionBloqueada.body);
  const desbloqueoCuenta = await req('PATCH', `/api/users/${pedroId}`, { activo: true }, anaToken);
  assert(desbloqueoCuenta.status === 200 && !!desbloqueoCuenta.body.user.activo, 'admin puede desbloquear la cuenta', desbloqueoCuenta.body);

  console.log('\n=== PROYECTOS ===');
  const crear = await req('POST', '/api/projects', { nombre: 'Corrección de facturación', area: 'PROGRAMACION', prioridad: 'ALTA', asunto: 'GENERAL' }, anaToken);
  assert(crear.status === 201, 'crear proyecto normal (asunto GENERAL)', crear.body);
  const projectId = crear.body?.project?.id;

  const leer = await req('GET', `/api/projects/${projectId}`, null, anaToken);
  assert(leer.status === 200 && leer.body.project.nombre === 'Corrección de facturación', 'el proyecto creado se puede volver a leer (SÍ se guardó)', leer.body);

  const editar = await req('PATCH', `/api/projects/${projectId}`, { nombre: 'Corrección de facturación v2', prioridad: 'URGENTE' }, anaToken);
  assert(editar.status === 200 && editar.body.project.nombre === 'Corrección de facturación v2' && editar.body.project.prioridad === 'URGENTE', 'PATCH /projects/:id edita nombre y prioridad', editar.body);

  console.log('\n=== FASES Y PERMISOS ===');
  const proyectoFases = await req('POST', '/api/projects', {
    nombre: 'Proyecto con fases restringidas', area: 'SOPORTE', prioridad: 'MEDIA', asunto: 'GENERAL',
    phases: [{ clave: 'A', nombre: 'Fase A' }, { clave: 'B', nombre: 'Fase B' }],
    phasePermissions: { SOPORTE: ['A'] },
  }, anaToken);
  assert(proyectoFases.status === 201, 'crear proyecto con fases y permisos por área', proyectoFases.body);
  const fasesId = proyectoFases.body?.project?.id;
  const tareaA = await req('POST', `/api/tasks/project/${fasesId}`, { titulo: 'Tarea visible', fase: 'A' }, anaToken);
  const tareaB = await req('POST', `/api/tasks/project/${fasesId}`, { titulo: 'Tarea restringida', fase: 'B' }, anaToken);
  assert(tareaA.status === 201 && tareaB.status === 201, 'admin puede crear tareas en ambas fases', {a:tareaA.body,b:tareaB.body});
  const pedroProjects = await req('GET', '/api/projects?area=SOPORTE', null, pedroToken);
  assert(pedroProjects.status === 200 && pedroProjects.body.projects.some(p => p.id === fasesId), 'Soporte puede ver un proyecto asignado por configuración de fase', pedroProjects.body);
  const pedroTasks = await req('GET', `/api/tasks/project/${fasesId}`, null, pedroToken);
  assert(pedroTasks.status === 200 && pedroTasks.body.tasks.length === 1 && pedroTasks.body.tasks[0].fase === 'A', 'Soporte solo recibe las tareas de las fases autorizadas', pedroTasks.body);

  console.log('\n=== TAREAS ===');
  const tarea = await req('POST', `/api/tasks/project/${projectId}`, { titulo: 'Revisar bug de factura' }, anaToken);
  assert(tarea.status === 201, 'crear tarea en proyecto normal', tarea.body);

  console.log('\n=== COMPLETAR TAREA (el bug real estaba aquí) ===');
  const completar = await req('PATCH', `/api/tasks/${tarea.body.task.id}`, { estado: 'COMPLETADA' }, anaToken);
  assert(completar.status === 200 && completar.body.task.estado === 'COMPLETADA', 'PATCH /tasks/:id marca la tarea como completada sin reventar', completar.body);
  const descompletar = await req('PATCH', `/api/tasks/${tarea.body.task.id}`, { estado: 'PENDIENTE' }, anaToken);
  assert(descompletar.status === 200, 'PATCH /tasks/:id la desmarca de nuevo', descompletar.body);

  console.log('\n=== ARCHIVOS ===');
  const formData = new FormData();
  formData.append('archivo', new Blob(['contenido de prueba'], { type: 'text/plain' }), 'prueba.txt');
  const subida = await fetch(`http://localhost:4010/api/files/project/${projectId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${anaToken}` },
    body: formData,
  });
  const subidaJson = await subida.json();
  assert(subida.status === 201, 'subir un archivo al proyecto', subidaJson);

  const listado = await req('GET', `/api/files/project/${projectId}`, null, anaToken);
  assert(listado.status === 200 && listado.body.files.length === 1, 'el archivo aparece en el listado del proyecto', listado.body);

  const descarga = await fetch(`http://localhost:4010/api/files/${subidaJson.file.id}/descargar`, { headers: { Authorization: `Bearer ${anaToken}` } });
  const contenido = await descarga.text();
  assert(descarga.status === 200 && contenido === 'contenido de prueba', 'el archivo se descarga con el contenido correcto', contenido);

  console.log('\n=== PROYECTO DE IMPLEMENTACIÓN (plantilla automática) ===');
  const impl = await req('POST', '/api/projects', { nombre: 'Implementación Centro Médico X', area: 'SOPORTE', asunto: 'IMPLEMENTACION', centroCliente: 'Centro Médico X' }, anaToken);
  assert(impl.status === 201, 'crear proyecto de IMPLEMENTACION', impl.body);
  const implId = impl.body?.project?.id;
  const implTasks = await req('GET', `/api/tasks/project/${implId}`, null, anaToken);
  assert(implTasks.status === 200 && implTasks.body.tasks.length > 30, `la plantilla generó ${implTasks.body?.tasks?.length} tareas automáticamente`, null);

  console.log('\n=== BLOQUEO ===');
  const t1 = implTasks.body.tasks[0];
  const bloqueada = await req('POST', `/api/tasks/${t1.id}/bloquear`, { motivo: 'Esperando autorización del cliente' }, anaToken);
  assert(bloqueada.status === 200 && !!bloqueada.body.task.bloqueada, 'bloquear tarea guarda motivo y estado', bloqueada.body);
  const editarBloqueada = await req('PATCH', `/api/tasks/${t1.id}`, { estado: 'EN_PROGRESO' }, anaToken);
  assert(editarBloqueada.status === 409, 'una tarea bloqueada no se puede editar', editarBloqueada.body);
  const desbloqueada = await req('POST', `/api/tasks/${t1.id}/desbloquear`, null, anaToken);
  assert(desbloqueada.status === 200 && !desbloqueada.body.task.bloqueada, 'desbloquear tarea permite continuar', desbloqueada.body);

  console.log('\n=== CRONÓMETRO ===');
  const iniciar = await req('POST', `/api/tasks/${t1.id}/cronometro/iniciar`, null, anaToken);
  assert(iniciar.status === 200, 'iniciar cronómetro', iniciar.body);
  await new Promise((r) => setTimeout(r, 1200));
  const detener = await req('POST', `/api/tasks/${t1.id}/cronometro/detener`, null, anaToken);
  assert(detener.status === 200 && detener.body.tiempoTrabajadoSegundos >= 1, 'detener cronómetro acumula segundos', detener.body);

  server.close();
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.SQLITE_FILE + suffix); } catch (_) {} }
}

main().catch((err) => {
  console.error('ERROR FATAL EN LAS PRUEBAS:', err);
  process.exit(1);
});
