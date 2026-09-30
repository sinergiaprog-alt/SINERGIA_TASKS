const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../../config/db');
const { newId } = require('../../config/id');
const { requireAuth } = require('../../middleware/auth');
const { calcularProgreso } = require('./progress');
const { parseAreas, canViewProject, canEditProject, canViewTask, hasPhaseAccess, isAccountingOnly, isNuevoCentro, getVisiblePhases, getAccountingGate } = require('./access');
const { auditar } = require('../audit');
const { notificarUsuarios } = require('../notifications');

const router = express.Router();
router.use(requireAuth);

const AREAS_VALIDAS = ['PROGRAMACION', 'SOPORTE'];
const ESTADOS_VALIDOS = ['PENDIENTE', 'EN_PROGRESO', 'EN_REVISION', 'COMPLETADO', 'ARCHIVADO'];
const PRIORIDADES_VALIDAS = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];
const ASUNTOS_VALIDOS = ['GENERAL', 'NUEVO CENTRO', 'SOPORTE', 'MIGRACION', 'INTERFAZ', 'CAMBIO DE SERVIDOR', 'FORMULARIOS', 'REPORTES', 'AGG EQUIPOS', 'OTROS'];

const PLANTILLA_NUEVO_CENTRO = [
  ['CONTRATO', 'Contrato', ['Preparar contrato', 'Aprobar contrato', 'Definir precio/renta/pago/duración', 'Obtener firmas', 'Colocar sellos', 'Legalizar contrato']],
  ['SERVIDOR', 'Servidor', ['Comprar/preparar servidor', 'Instalar Windows', 'Instalar programas requeridos', 'Configurar servidor para Sinergia']],
  ['SOFTWARE', 'Software', ['Recopilar información del centro', 'Registrar médicos', 'Registrar seguros', 'Configurar precios y facturación', 'Configurar logo y resultados', 'Configurar usuarios', 'Configurar parámetros del sistema']],
  ['EQUIPOS', 'Equipos', ['Verificar impresoras de códigos de barras', 'Verificar impresoras POS', 'Verificar impresoras normales', 'Verificar scanner', 'Verificar computadoras', 'Verificar UPS', 'Verificar rollos', 'Verificar cables y accesorios']],
  ['RED', 'Red', ['Verificar disponibilidad de red', 'Identificar puntos de red', 'Configurar servidor', 'Configurar computadoras', 'Configurar IP', 'Realizar pruebas de red']],
  ['INTEGRACION', 'Integración', ['Coordinar con desarrolladores', 'Obtener identificadores de médicos', 'Obtener identificadores de seguros', 'Obtener identificadores de análisis', 'Desarrollar integración', 'Integrar pacientes ambulatorios', 'Integrar pacientes ingresados', 'Integrar pacientes de emergencia', 'Realizar pruebas de integración']],
  ['TRANSPORTE', 'Transporte', ['Verificar disponibilidad de vehículo', 'Planificar visitas', 'Coordinar alimentación', 'Coordinar combustible', 'Coordinar peajes', 'Coordinar hospedaje']],
  ['IMPLEMENTACION', 'Implementación', ['Crear usuarios', 'Configurar terminales', 'Configurar facturación', 'Configurar toma de muestras', 'Configurar códigos de barras', 'Configurar reportes', 'Configurar interfaces', 'Configurar entrega de resultados', 'Validar cambios', 'Capacitar personal', 'Capacitar en reportes', 'Capacitar en configuraciones', 'Configurar análisis', 'Realizar validación final']],
];

function normalizeAsunto(value) {
  const raw = String(value || 'GENERAL').trim().toUpperCase();
  return raw === 'IMPLEMENTACION' || raw === 'IMPLEMENTACIÓN' ? 'NUEVO CENTRO' : (ASUNTOS_VALIDOS.includes(raw) ? raw : 'OTROS');
}

function normalizeAreas(areas, fallbackArea) {
  const source = Array.isArray(areas) ? areas : (fallbackArea ? [fallbackArea] : []);
  return [...new Set(source.map((a) => String(a || '').trim().toUpperCase()).filter(Boolean))];
}

function normalizePhaseInput(phases) {
  if (!Array.isArray(phases)) return [];
  return phases.map((phase, index) => ({
    id: phase?.id,
    clave: String(phase?.clave || phase?.key || '').trim().toUpperCase().replace(/\s+/g, '_'),
    nombre: String(phase?.nombre || phase?.label || phase?.name || '').trim(),
    orden: Number.isFinite(Number(phase?.orden)) ? Number(phase.orden) : index + 1,
  })).filter((phase) => phase.clave && phase.nombre);
}

function defaultPhasesForAsunto(asunto) {
  if (asunto !== 'NUEVO CENTRO') return [];
  return PLANTILLA_NUEVO_CENTRO.map(([clave, nombre], idx) => ({ clave, nombre, orden: idx + 1 }));
}

function normalizePhasePermissions(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [area, fases] of Object.entries(input)) {
    const a = String(area).trim().toUpperCase();
    if (!['PROGRAMACION', 'SOPORTE', 'CONTABILIDAD'].includes(a) || !Array.isArray(fases)) continue;
    out[a] = [...new Set(fases.map((f) => String(f).trim().toUpperCase()).filter(Boolean))];
  }
  return out;
}

function validarCamposProblema({ esProblema, problemaDescripcion }) {
  if (!esProblema) return { ok: true, valores: { es_problema: false, tipo_problema: null, tipo_problema_otro: null, problema_descripcion: null } };
  if (!problemaDescripcion?.trim()) return { ok: false, error: 'Describe el problema reportado.' };
  return { ok: true, valores: { es_problema: true, tipo_problema: 'OTROS', tipo_problema_otro: problemaDescripcion.trim(), problema_descripcion: problemaDescripcion.trim() } };
}

function validateDates(fechaInicio, fechaLimite) {
  if (fechaInicio && Number.isNaN(new Date(fechaInicio).getTime())) return 'La fecha de inicio no es válida.';
  if (fechaLimite && Number.isNaN(new Date(fechaLimite).getTime())) return 'La fecha límite no es válida.';
  if (fechaInicio && fechaLimite && new Date(fechaLimite) < new Date(fechaInicio)) return 'La fecha límite no puede ser anterior a la fecha de inicio.';
  return null;
}

function publicProject(project) {
  return {
    ...project,
    asunto: normalizeAsunto(project?.asunto),
    areas: parseAreas(project),
  };
}

async function getAccessibleProjectIds(user) {
  if (user.role === 'ADMIN') return null;
  const [participants, phaseRows] = await Promise.all([
    db('project_participants').where({ user_id: user.id }).select('project_id'),
    db('project_area_phase_permissions').whereIn('area', user.areas || []).where({ puede_ver: true }).select('project_id'),
  ]);
  return new Set([...participants.map((r) => r.project_id), ...phaseRows.map((r) => r.project_id)]);
}

router.get('/meta/asuntos', (req, res) => res.json({ asuntos: ASUNTOS_VALIDOS }));
router.get('/meta/tipos-problema', (req, res) => res.json({ tipos: ['OTROS'] }));

router.get('/:id/phases', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.id }).first();
    if (!project || !(await canViewProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
    const phases = await getVisiblePhases(db, req.user, project);
    res.json({ phases });
  } catch (e) { next(e); }
});

router.get('/:id/phase-permissions', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.id }).first();
    if (!project || !(await canViewProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
    const rows = await db('project_area_phase_permissions').where({ project_id: project.id }).orderBy('area').orderBy('fase');
    res.json({ permissions: rows });
  } catch (e) { next(e); }
});

async function requireTaskVisibility(user, task) {
  const project = await db('projects').where({ id: task.project_id }).first();
  return !!project && (await canViewTask(db, user, project, task));
}

router.get('/', async (req, res, next) => {
  try {
    const { area, estado, prioridad, responsableId } = req.query;
    let query = db('projects').orderBy('created_at', 'desc');
    if (area) query = query.where((qb) => qb.where('area', area).orWhere('areas', 'like', `%"${area}"%`));
    if (estado) query = query.where('estado', estado);
    if (prioridad) query = query.where('prioridad', prioridad);
    if (responsableId) query = query.where('responsable_id', responsableId);
    let proyectos = await query;
    if (req.user.role !== 'ADMIN') {
      const accessible = await getAccessibleProjectIds(req.user);
      const phaseProjectRows = ids => ids.length ? db('project_phases').whereIn('project_id', ids).where({ activo: true }).distinct('project_id') : Promise.resolve([]);
      const phaseProjects = new Set((await phaseProjectRows(proyectos.map((project) => project.id))).map((row) => row.project_id));
      proyectos = proyectos.filter((project) => {
        const areas = parseAreas(project);
        const technicalArea = areas.some((a) => (req.user.areas || []).includes(a));
        const responsible = project.responsable_id === req.user.id;
        // Si el proyecto tiene fases configuradas, esa configuración es la fuente
        // de acceso. No permitir el antiguo fallback que dejaba pasar todo el
        // proyecto solo por pertenecer al área técnica.
        if (phaseProjects.has(project.id)) return accessible?.has(project.id);
        return technicalArea || responsible || accessible?.has(project.id);
      });
    }
    const ids = proyectos.map((p) => p.id);
    const allTasks = ids.length ? await db('tasks').whereIn('project_id', ids).select('id', 'project_id', 'estado', 'fase') : [];
    const tasks = [];
    for (const task of allTasks) {
      if (req.user.role === 'ADMIN' || await requireTaskVisibility(req.user, task)) tasks.push(task);
    }
    const counts = new Map();
    const faseCounts = new Map(); // project_id -> { CLAVE: { total, completadas } }
    for (const row of tasks) {
      const c = counts.get(row.project_id) || { total: 0, completadas: 0 };
      c.total += 1;
      if (row.estado === 'COMPLETADA') c.completadas += 1;
      counts.set(row.project_id, c);
      if (row.fase) {
        if (!faseCounts.has(row.project_id)) faseCounts.set(row.project_id, {});
        const byProject = faseCounts.get(row.project_id);
        const fc = byProject[row.fase] || { total: 0, completadas: 0 };
        fc.total += 1;
        if (row.estado === 'COMPLETADA') fc.completadas += 1;
        byProject[row.fase] = fc;
      }
    }

   
    const necesitaFases = ids.length && (req.user.role === 'ADMIN' || (req.user.areas || []).includes('CONTABILIDAD'));
    let phasesByProject = new Map();
    let contabilidadPhasesByProject = new Map();
    if (necesitaFases) {
      const [phaseRows, permRows] = await Promise.all([
        db('project_phases').whereIn('project_id', ids).where({ activo: true }).orderBy('orden', 'asc').select('project_id', 'clave', 'nombre'),
        db('project_area_phase_permissions').whereIn('project_id', ids).where({ area: 'CONTABILIDAD', puede_ver: true }).select('project_id', 'fase'),
      ]);
      for (const row of phaseRows) {
        if (!phasesByProject.has(row.project_id)) phasesByProject.set(row.project_id, []);
        phasesByProject.get(row.project_id).push({ clave: row.clave, nombre: row.nombre });
      }
      for (const row of permRows) {
        if (!contabilidadPhasesByProject.has(row.project_id)) contabilidadPhasesByProject.set(row.project_id, []);
        contabilidadPhasesByProject.get(row.project_id).push(row.fase);
      }
    }

    res.json({ projects: proyectos.map((project) => {
      const count = counts.get(project.id) || { total: 0, completadas: 0 };
      const extra = necesitaFases ? {
        phases: phasesByProject.get(project.id) || [],
        contabilidad_phases: contabilidadPhasesByProject.get(project.id) || [],
        phases_progress: faseCounts.get(project.id) || {},
      } : {};
      return { ...publicProject(project), progreso: { total: count.total, completadas: count.completadas, porcentaje: count.total ? Math.round(count.completadas / count.total * 100) : 0 }, ...extra };
    }) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.id }).first();
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    if (!(await canViewProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
    const progreso = await calcularProgreso(project.id);
    const phases = await getVisiblePhases(db, req.user, project);
    const accountingGate = await getAccountingGate(db, req.user, project);
    res.json({ project: { ...publicProject(project), progreso, phases, accounting_gate: accountingGate } });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { nombre, descripcion, descripcionCifrada, descripcionIv, area, areas, responsableId, prioridad, fechaInicio, fechaLimite,
      esProblema, problemaDescripcion, problemaDescripcionCifrada, problemaDescripcionIv, asunto, asuntoOtro, centroCliente,
      phases: phaseInput, phasePermissions: phasePermissionsInput } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    const areasNormalizadas = normalizeAreas(areas, area);
    if (!areasNormalizadas.length) return res.status(400).json({ error: 'Selecciona al menos un área.' });
    if (areasNormalizadas.some((a) => !AREAS_VALIDAS.includes(a))) return res.status(400).json({ error: 'Los proyectos solo pueden asignarse a Programación o Soporte. Contabilidad se autoriza por fase.' });
    if (req.user.role !== 'ADMIN' && areasNormalizadas.some((a) => !(req.user.areas || []).includes(a))) return res.status(403).json({ error: 'No tienes acceso a una de las áreas seleccionadas.' });

    const asuntoNormalizado = normalizeAsunto(asunto);
    if (asuntoNormalizado === 'OTROS' && !asuntoOtro?.trim()) return res.status(400).json({ error: 'Indica cuál es el asunto específico.' });
    if (prioridad && !PRIORIDADES_VALIDAS.includes(prioridad)) return res.status(400).json({ error: 'Prioridad inválida.' });
    const problema = validarCamposProblema({ esProblema, problemaDescripcion: problemaDescripcion || (problemaDescripcionCifrada ? 'CIFRADO' : null) });
    if (!problema.ok) return res.status(400).json({ error: problema.error });

    const fechaInicioReal = fechaInicio || new Date();
    const fechaError = validateDates(fechaInicioReal, fechaLimite);
    if (fechaError) return res.status(400).json({ error: fechaError });
    const responsable = await db('users').where({ id: responsableId || req.user.id, activo: true }).first();
    if (!responsable) return res.status(400).json({ error: 'El responsable no existe o está inactivo.' });

    const normalizedPhaseInput = Array.isArray(phaseInput) ? normalizePhaseInput(phaseInput) : null;
    const phases = normalizedPhaseInput !== null ? normalizedPhaseInput : defaultPhasesForAsunto(asuntoNormalizado);
    const phasePermissions = normalizePhasePermissions(phasePermissionsInput || {});
    if (req.user.role !== 'ADMIN' && Object.keys(phasePermissions).length) return res.status(403).json({ error: 'Solo un administrador puede configurar accesos por fase.' });
    const phaseKeys = new Set(phases.map((phase) => phase.clave));
    for (const [areaPerm, phaseList] of Object.entries(phasePermissions)) {
      for (const fase of phaseList) if (!phaseKeys.has(fase)) return res.status(400).json({ error: `La fase ${fase} no existe en este proyecto.` });
    }

    const project = {
      id: newId('prj'), nombre: nombre.trim(), descripcion: descripcionCifrada || descripcion || null,
      descripcion_iv: descripcionCifrada ? descripcionIv : null, area: areasNormalizadas[0], areas: JSON.stringify(areasNormalizadas),
      responsable_id: responsableId || req.user.id, prioridad: prioridad || 'MEDIA', estado: 'PENDIENTE', fecha_inicio: fechaInicioReal,
      fecha_limite: fechaLimite || null, asunto: asuntoNormalizado, asunto_otro: asuntoNormalizado === 'OTROS' ? asuntoOtro.trim() : null,
      centro_cliente: centroCliente || null, ...problema.valores,
      ...(problemaDescripcionCifrada ? { problema_descripcion: null, tipo_problema_otro: null } : {}),
      problema_descripcion_cifrado: problemaDescripcionCifrada || null,
      problema_descripcion_iv: problemaDescripcionCifrada ? problemaDescripcionIv : null,
    };

    const createdPhaseRows = [];
    const createdTaskRows = [];
    await db.transaction(async (trx) => {
      await trx('projects').insert(project);
      for (const phase of phases) {
        const phaseRow = { id: phase.id || newId('phs'), project_id: project.id, clave: phase.clave, nombre: phase.nombre, orden: phase.orden, activo: true };
        await trx('project_phases').insert(phaseRow);
        createdPhaseRows.push(phaseRow);
      }
      if (asuntoNormalizado === 'NUEVO CENTRO') {
        let order = 0;
        const createdKeys = new Set(createdPhaseRows.map(row => row.clave));
        for (const [phaseKey, , titles] of PLANTILLA_NUEVO_CENTRO) {
          if (!createdKeys.has(phaseKey)) continue;
          const phaseOrder = createdPhaseRows.find((x) => x.clave === phaseKey)?.orden || null;
          for (const title of titles) {
            const task = { id: newId('tsk'), project_id: project.id, titulo: title, estado: 'PENDIENTE', prioridad: 'MEDIA', tiempo_trabajado_segundos: 0, depende_de: null, orden: order++, fase: phaseKey, fase_orden: phaseOrder };
            await trx('tasks').insert(task);
            createdTaskRows.push(task);
          }
        }
      }
      for (const [areaPerm, phaseList] of Object.entries(phasePermissions)) {
        for (const fase of phaseList) {
          await trx('project_area_phase_permissions').insert({ id: newId('pap'), project_id: project.id, area: areaPerm, fase, puede_ver: true, puede_trabajar: true });
        }
      }
    });

    await auditar(req.user.id, 'CREAR', 'PROJECT', project.id, { nombre: project.nombre, areas: areasNormalizadas, asunto: asuntoNormalizado });
    if (responsable.id !== req.user.id) await notificarUsuarios([responsable.id], { tipo: 'PROYECTO_ASIGNADO', titulo: 'Proyecto asignado', mensaje: `Se te asignó el proyecto “${project.nombre}”.`, projectId: project.id });
    if (phasePermissions.CONTABILIDAD?.length) {
      const accountingUsers = (await db('users').where({ activo: true }).select('id', 'areas')).filter(u => { try { return JSON.parse(u.areas || '[]').map(x => String(x).toUpperCase()).includes('CONTABILIDAD'); } catch (_) { return false; } });
      await notificarUsuarios(accountingUsers.map(u => u.id), { tipo: 'FASE_ASIGNADA', titulo: 'Nuevo Centro autorizado', mensaje: `Se habilitaron fases de Contabilidad en “${project.nombre}”.`, projectId: project.id });
    }
    res.status(201).json({ project: { ...publicProject(project), progreso: { total: createdTaskRows.length, completadas: 0, porcentaje: 0 }, phases: createdPhaseRows } });
  } catch (e) { next(e); }
});

router.post('/:id/phases', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.id }).first();
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    if (!(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para agregar fases.' });
    const key = String(req.body.clave || req.body.key || req.body.nombre || '').trim().toUpperCase().replace(/\s+/g, '_');
    const name = String(req.body.nombre || req.body.label || '').trim();
    if (!key || !name) return res.status(400).json({ error: 'La fase necesita nombre.' });
    const exists = await db('project_phases').where({ project_id: project.id, clave: key }).first();
    if (exists) return res.status(409).json({ error: 'Ya existe una fase con ese nombre.' });
    const max = await db('project_phases').where({ project_id: project.id }).max({ m: 'orden' }).first();
    const phase = { id: newId('phs'), project_id: project.id, clave: key, nombre: name, orden: Number(max?.m || 0) + 1, activo: true };
    await db('project_phases').insert(phase);
    await auditar(req.user.id, 'CREAR', 'PHASE', phase.id, { projectId: project.id, nombre: name });
    res.status(201).json({ phase });
  } catch (e) { next(e); }
});

router.patch('/:id/phases/:phaseId', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.id }).first();
    const phase = await db('project_phases').where({ id: req.params.phaseId, project_id: req.params.id }).first();
    if (!project || !phase) return res.status(404).json({ error: 'Fase no encontrada.' });
    if (!(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para editar fases.' });
    const updates = { updated_at: new Date() };
    if (req.body.nombre !== undefined) updates.nombre = String(req.body.nombre).trim() || phase.nombre;
    if (req.body.orden !== undefined) updates.orden = Number(req.body.orden);
    await db('project_phases').where({ id: phase.id }).update(updates);
    res.json({ phase: await db('project_phases').where({ id: phase.id }).first() });
  } catch (e) { next(e); }
});

router.delete('/:id/phases/:phaseId', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.id }).first();
    const phase = await db('project_phases').where({ id: req.params.phaseId, project_id: req.params.id }).first();
    if (!project || !phase) return res.status(404).json({ error: 'Fase no encontrada.' });
    if (!(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para eliminar fases.' });
    const tasks = await db('tasks').where({ project_id: project.id, fase: phase.clave }).count({ c: 'id' }).first();
    if (Number(tasks.c) > 0) return res.status(409).json({ error: 'No puedes eliminar una fase que todavía tiene tareas.' });
    await db('project_phases').where({ id: phase.id }).del();
    await db('project_area_phase_permissions').where({ project_id: project.id, fase: phase.clave }).del();
    res.status(204).send();
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.id }).first();
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    if (!(await canEditProject(db, req.user, project))) return res.status(403).json({ error: 'No tienes permiso para editar este proyecto.' });
    const { nombre, descripcion, descripcionCifrada, descripcionIv, area, areas, responsableId, prioridad, estado, fechaInicio, fechaLimite, esProblema, problemaDescripcion, problemaDescripcionCifrada, problemaDescripcionIv, asunto, asuntoOtro, centroCliente, phasePermissions } = req.body;
    const updates = { updated_at: new Date() };

    if (nombre !== undefined) { if (!String(nombre).trim()) return res.status(400).json({ error: 'El nombre no puede estar vacío.' }); updates.nombre = String(nombre).trim(); }
    if (descripcionCifrada !== undefined) { updates.descripcion = descripcionCifrada; updates.descripcion_iv = descripcionCifrada ? descripcionIv : null; }
    else if (descripcion !== undefined) { updates.descripcion = descripcion; updates.descripcion_iv = null; }

    if (areas !== undefined || area !== undefined) {
      const normalized = normalizeAreas(areas, area);
      if (!normalized.length) return res.status(400).json({ error: 'Selecciona al menos un área.' });
      if (normalized.some((a) => !AREAS_VALIDAS.includes(a))) return res.status(400).json({ error: 'Los proyectos usan Programación o Soporte como áreas principales. Contabilidad se asigna por fase.' });
      if (req.user.role !== 'ADMIN' && normalized.some((a) => !(req.user.areas || []).includes(a))) return res.status(403).json({ error: 'No tienes acceso a una de las áreas seleccionadas.' });
      updates.areas = JSON.stringify(normalized); updates.area = normalized[0];
    }
    if (responsableId !== undefined) {
      const responsable = await db('users').where({ id: responsableId, activo: true }).first();
      if (!responsable) return res.status(400).json({ error: 'El responsable no existe o está inactivo.' });
      updates.responsable_id = responsableId;
    }
    if (prioridad !== undefined) { if (!PRIORIDADES_VALIDAS.includes(prioridad)) return res.status(400).json({ error: 'Prioridad inválida.' }); updates.prioridad = prioridad; }
    if (estado !== undefined) {
      if (!ESTADOS_VALIDOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido.' });
      updates.estado = estado;
      if (estado === 'COMPLETADO') updates.fecha_culminacion = new Date().toISOString();
      if (project.estado === 'COMPLETADO' && estado !== 'COMPLETADO') updates.fecha_culminacion = null;
    }
    if (fechaInicio !== undefined || fechaLimite !== undefined) {
      const fi = fechaInicio !== undefined ? fechaInicio : project.fecha_inicio;
      const fl = fechaLimite !== undefined ? fechaLimite : project.fecha_limite;
      const dateError = validateDates(fi, fl);
      if (dateError) return res.status(400).json({ error: dateError });
      if (fechaInicio !== undefined) updates.fecha_inicio = fechaInicio;
      if (fechaLimite !== undefined) updates.fecha_limite = fechaLimite;
    }
    if (asunto !== undefined) {
      updates.asunto = normalizeAsunto(asunto);
      if (updates.asunto !== 'NUEVO CENTRO') {
        await db('project_area_phase_permissions').where({ project_id: project.id, area: 'CONTABILIDAD' }).del();
      }
    }
    if (asuntoOtro !== undefined) updates.asunto_otro = updates.asunto === 'OTROS' ? String(asuntoOtro).trim() || null : null;
    if (centroCliente !== undefined) updates.centro_cliente = centroCliente || null;

    if (esProblema !== undefined || problemaDescripcion !== undefined || problemaDescripcionCifrada !== undefined) {
      const problema = validarCamposProblema({ esProblema: esProblema !== undefined ? esProblema : !!project.es_problema, problemaDescripcion: problemaDescripcion !== undefined ? problemaDescripcion : (problemaDescripcionCifrada ? 'CIFRADO' : (project.problema_descripcion || project.tipo_problema_otro)) });
      if (!problema.ok) return res.status(400).json({ error: problema.error });
      Object.assign(updates, problema.valores);
      if (problemaDescripcionCifrada !== undefined) { updates.problema_descripcion = null; updates.tipo_problema_otro = null; updates.problema_descripcion_cifrado = problemaDescripcionCifrada || null; updates.problema_descripcion_iv = problemaDescripcionCifrada ? problemaDescripcionIv : null; }
    }

    if (phasePermissions !== undefined) {
      if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Solo un administrador puede cambiar accesos por fase.' });
      const phases = await db('project_phases').where({ project_id: project.id, activo: true });
      const valid = new Set(phases.map((p) => p.clave));
      const normalized = normalizePhasePermissions(phasePermissions);
      const effectiveAsunto = updates.asunto !== undefined ? updates.asunto : normalizeAsunto(project.asunto);
      for (const [areaPerm, phaseList] of Object.entries(normalized)) for (const fase of phaseList) if (!valid.has(fase)) return res.status(400).json({ error: `La fase ${fase} no existe en el proyecto.` });
      await db('project_area_phase_permissions').where({ project_id: project.id }).del();
      for (const [areaPerm, phaseList] of Object.entries(normalized)) for (const fase of phaseList) await db('project_area_phase_permissions').insert({ id: newId('pap'), project_id: project.id, area: areaPerm, fase, puede_ver: true, puede_trabajar: true });
    }

    await db('projects').where({ id: project.id }).update(updates);
    const updated = await db('projects').where({ id: project.id }).first();
    const progreso = await calcularProgreso(updated.id);
    await auditar(req.user.id, 'EDITAR', 'PROJECT', updated.id, updates);
    res.json({ project: { ...publicProject(updated), progreso, phases: await db('project_phases').where({ project_id: updated.id, activo: true }).orderBy('orden') } });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const project = await db('projects').where({ id: req.params.id }).first();
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Solo un administrador puede eliminar un proyecto.' });
    if (req.query.confirm !== 'true') return res.status(400).json({ error: 'Confirmación requerida: agrega ?confirm=true.' });
    const attachedFiles = await db('files').where({ project_id: project.id }).select('ruta');
    await db.transaction(async (trx) => {
      await trx('comments').where({ project_id: project.id }).del();
      await trx('files').where({ project_id: project.id }).del();
      await trx('issues').where({ project_id: project.id }).del();
      await trx('transfers').where({ project_id: project.id }).del();
      await trx('project_participants').where({ project_id: project.id }).del();
      await trx('project_area_phase_permissions').where({ project_id: project.id }).del();
      await trx('project_phases').where({ project_id: project.id }).del();
      await trx('tasks').where({ project_id: project.id }).del();
      await trx('projects').where({ id: project.id }).del();
    });
    for (const file of attachedFiles) {
      const uploadRoot = path.resolve(__dirname, '../../../uploads');
      const ruta = path.resolve(uploadRoot, file.ruta);
      if (ruta.startsWith(uploadRoot) && fs.existsSync(ruta)) fs.unlinkSync(ruta);
    }
    await auditar(req.user.id, 'ELIMINAR', 'PROJECT', project.id, { nombre: project.nombre });
    res.status(204).send();
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.constants = { PLANTILLA_NUEVO_CENTRO, ASUNTOS_VALIDOS };
