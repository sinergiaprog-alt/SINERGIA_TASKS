const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../../config/db');
const { newId } = require('../../config/id');
const { requireAuth } = require('../../middleware/auth');
const { parseAreas, canViewProject, canEditProject, canViewTask } = require('../projects/access');
const { auditar } = require('../audit');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_TAMANO_BYTES = 25 * 1024 * 1024; // 25 MB por archivo (configurable)

// Tipos bloqueados por seguridad: nunca se aceptan ejecutables ni scripts.
const EXTENSIONES_BLOQUEADAS = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.com', '.scr', '.js', '.jar', '.app'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${newId('file')}${ext}`);
  },
});

// Sanitizar nombre del archivo: eliminar caracteres peligrosos
function sanitizarNombre(nombre) {
  return (nombre || 'archivo')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 200);
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_TAMANO_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (EXTENSIONES_BLOQUEADAS.includes(ext)) {
      return cb(new Error(`Por seguridad, no se permiten archivos ${ext}.`));
    }
    // Sanitizar el nombre original para evitar path traversal en el nombre mostrado
    file.originalname = sanitizarNombre(file.originalname);
    cb(null, true);
  },
});

async function verificarAccesoProyecto(user, projectId, taskId = null) {
  const project = await db('projects').where({ id: projectId }).first();
  if (!project || !(await canViewProject(db, user, project))) return null;
  if (taskId) {
    const task = await db('tasks').where({ id: taskId, project_id: project.id }).first();
    if (!task || !(await canViewTask(db, user, project, task))) return null;
  }
  return project;
}
function publicFile(f) {
  return {
    id: f.id,
    nombre: f.nombre,
    tipo: f.tipo,
    tamano: f.tamano,
    cifrado: !!f.cifrado,
    cifrado_iv: f.cifrado_iv || null,
    projectId: f.project_id,
    taskId: f.task_id,
    subidoPorId: f.subido_por_id,
    createdAt: f.created_at,
  };
}

// Listar archivos de un proyecto (incluye los de sus tareas)
router.get('/project/:projectId', async (req, res, next) => {
  try {
    const project = await verificarAccesoProyecto(req.user, req.params.projectId);
    if (!project) return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
    const files = await db('files').where({ project_id: req.params.projectId }).orderBy('created_at', 'desc');
    res.json({ files: files.map(publicFile) });
  } catch (err) {
    next(err);
  }
});

router.post('/project/:projectId', (req, res, next) => {
  upload.single('archivo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo subir el archivo.' });
    try {
      const project = await db('projects').where({id:req.params.projectId}).first();
      if (!project || !(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para subir archivos.' });
      if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });

      if (req.body.taskId && !(await db('tasks').where({id:req.body.taskId, project_id:project.id}).first())) { if(req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); return res.status(400).json({error:'La tarea indicada no pertenece al proyecto.'}); }

      const file = {
        id: newId('file'),
        project_id: req.params.projectId,
        task_id: req.body.taskId || null,
        nombre: req.file.originalname,
        ruta: req.file.filename, // solo el nombre en disco; la ruta absoluta se resuelve al descargar
        tipo: req.body.tipoOriginal || req.file.mimetype,
        tamano: req.file.size,
        cifrado: String(req.body.cifrado || 'false') === 'true',
        cifrado_iv: req.body.cifradoIv || null,
        subido_por_id: req.user.id,
      };
      await db('files').insert(file);
      await auditar(req.user.id,'CREAR','FILE',file.id,{projectId:file.project_id});
      res.status(201).json({ file: publicFile({ ...file, created_at: new Date() }) });
    } catch (e) {
      next(e);
    }
  });
});

router.get('/:id/preview', async (req, res, next) => {
  try {
    const file = await db('files').where({ id: req.params.id }).first();
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado.' });
    const project = await verificarAccesoProyecto(req.user, file.project_id, file.task_id);
    if (!project) return res.status(403).json({ error: 'No tienes acceso a este archivo.' });
    const rutaAbsoluta = path.resolve(UPLOAD_DIR, file.ruta);
    if (!rutaAbsoluta.startsWith(UPLOAD_DIR + path.sep)) return res.status(400).json({error:'Ruta de archivo inválida.'});
    if (!fs.existsSync(rutaAbsoluta)) return res.status(404).json({ error: 'El archivo ya no existe en el servidor.' });
    res.setHeader('Content-Type', file.cifrado ? 'application/octet-stream' : (file.tipo || 'application/octet-stream'));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.nombre)}`);
    res.sendFile(rutaAbsoluta);
  } catch (err) { next(err); }
});

router.get('/:id/descargar', async (req, res, next) => {
  try {
    const file = await db('files').where({ id: req.params.id }).first();
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado.' });
    const project = await verificarAccesoProyecto(req.user, file.project_id, file.task_id);
    if (!project) return res.status(403).json({ error: 'No tienes acceso a este archivo.' });

    const rutaAbsoluta = path.resolve(UPLOAD_DIR, file.ruta);
    if (!rutaAbsoluta.startsWith(UPLOAD_DIR + path.sep)) return res.status(400).json({error:'Ruta de archivo inválida.'});
    if (!fs.existsSync(rutaAbsoluta)) return res.status(404).json({ error: 'El archivo ya no existe en el servidor.' });
    res.download(rutaAbsoluta, file.nombre);
  } catch (err) {
    next(err);
  }
});

// Eliminación manual (nunca automática)
router.delete('/:id', async (req, res, next) => {
  try {
    const file = await db('files').where({ id: req.params.id }).first();
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado.' });
    const project = await db('projects').where({id:file.project_id}).first();
    if (!project || !(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para eliminar este archivo.' });
    if (req.query.confirm !== 'true') {
      return res.status(400).json({ error: 'Confirmación requerida: agrega ?confirm=true a la petición.' });
    }
    const rutaAbsoluta = path.resolve(UPLOAD_DIR, file.ruta);
    if (!rutaAbsoluta.startsWith(UPLOAD_DIR + path.sep)) return res.status(400).json({error:'Ruta de archivo inválida.'});
    await db('files').where({ id: req.params.id }).del();
    if (fs.existsSync(rutaAbsoluta)) fs.unlinkSync(rutaAbsoluta);
    await auditar(req.user.id,'ELIMINAR','FILE',file.id,{projectId:file.project_id});
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
