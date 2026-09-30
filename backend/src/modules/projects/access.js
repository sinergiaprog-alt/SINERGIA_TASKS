function isAdminLike(user) { return user?.role === 'ADMIN'; }
function parseAreas(project) { try { const a = JSON.parse(project?.areas || '[]'); return Array.isArray(a) && a.length ? a.map((x) => String(x).trim().toUpperCase()) : (project?.area ? [String(project.area).toUpperCase()] : []); } catch (_) { return project?.area ? [String(project.area).toUpperCase()] : []; } }
function normalizeUserAreas(user) { return Array.isArray(user?.areas) ? user.areas.map((a) => String(a).trim().toUpperCase()) : []; }
function isAccountingOnly(user) { const a = normalizeUserAreas(user); return !isAdminLike(user) && a.includes('CONTABILIDAD') && !a.some((x) => x === 'PROGRAMACION' || x === 'SOPORTE'); }
function isNuevoCentro(project) { const a = String(project?.asunto || '').trim().toUpperCase(); return a === 'NUEVO CENTRO' || a === 'IMPLEMENTACION' || a === 'IMPLEMENTACIÓN'; }
async function getParticipation(db, projectId, userId) { return db('project_participants').where({ project_id: projectId, user_id: userId }).first(); }
async function getProjectPhase(db, projectId, phase) { return phase ? db('project_phases').where({ project_id: projectId, clave: String(phase).trim().toUpperCase(), activo: true }).first() : null; }
async function projectHasPhases(db, projectId) { return !!(await db('project_phases').where({ project_id: projectId, activo: true }).first()); }
async function getAssignedPhaseIds(db, participation) { if (!participation) return []; const rows = await db('project_participant_phases').where({ participant_id: participation.id }).select('phase_id'); return [...new Set([...rows.map((r) => String(r.phase_id)), ...(participation.fase_id ? [String(participation.fase_id)] : [])])]; }
async function hasAreaPhasePermission(db, user, project, phase, mode = 'VER') {
  if (isAdminLike(user) || !phase) return isAdminLike(user);
  const areas = normalizeUserAreas(user);
  if (!areas.length) return false;
  const row = await db('project_area_phase_permissions')
    .where({ project_id: project.id, fase: String(phase).trim().toUpperCase() })
    .whereIn('area', areas)
    .where({ puede_ver: true })
    .first();
  return !!row && (mode !== 'TRABAJAR' || !!row.puede_trabajar);
}

async function getAccountingGate(db, user, project) {
  const a = normalizeUserAreas(user);
  if (!isNuevoCentro(project) || isAdminLike(user) || a.includes('CONTABILIDAD') || !a.some((x) => x === 'PROGRAMACION' || x === 'SOPORTE')) return { bloqueado: false, pendientes: [] };
  const permissions = await db('project_area_phase_permissions').where({ project_id: project.id, area: 'CONTABILIDAD', puede_ver: true }).select('fase');
  const keys = [...new Set(permissions.map((r) => String(r.fase).trim().toUpperCase()).filter(Boolean))]; if (!keys.length) return { bloqueado: false, pendientes: [] };
  const [phases, tasks] = await Promise.all([db('project_phases').where({ project_id: project.id, activo: true }).whereIn('clave', keys).select('clave', 'nombre'), db('tasks').where({ project_id: project.id }).whereIn('fase', keys).select('fase', 'estado')]);
  const pendientes = phases.filter((p) => { const ps = tasks.filter((t) => String(t.fase).toUpperCase() === String(p.clave).toUpperCase()); return !(ps.length && ps.every((t) => t.estado === 'COMPLETADA')); }).map((p) => ({ fase: p.clave, nombre: p.nombre })); return { bloqueado: pendientes.length > 0, pendientes };
}
async function isAccountingGateBlocked(db, user, project) { return (await getAccountingGate(db, user, project)).bloqueado; }
async function hasPhaseAccess(db, user, project, phase, mode = 'VER') {
  if (!phase || isAdminLike(user)) return true;
  const configured = await projectHasPhases(db, project.id);
  if (!configured) {
    const participation = await getParticipation(db, project.id, user.id);
    const a = normalizeUserAreas(user);
    return !isAccountingOnly(user) && parseAreas(project).some((x) => a.includes(x)) && (mode !== 'TRABAJAR' || !!participation?.puede_editar || project.responsable_id === user.id);
  }

  const participation = await getParticipation(db, project.id, user.id);
  if (participation) {
    const ids = await getAssignedPhaseIds(db, participation);
    // En proyectos con fases, la asignación directa del participante es autoritativa.
    // Si no tiene fases asignadas, no debe caer al permiso general del área.
    const phases = ids.length
      ? await db('project_phases').where({ project_id: project.id, activo: true }).whereIn('id', ids)
      : [];
    const allowed = phases.some((p) => String(p.clave).trim().toUpperCase() === String(phase).trim().toUpperCase());
    return allowed && (mode !== 'TRABAJAR' || !!participation.puede_editar);
  }

  return hasAreaPhasePermission(db, user, project, phase, mode);
}
async function canViewProject(db, user, project) {
  if (!project) return false;
  if (isAdminLike(user)) return true;
  if (isAccountingOnly(user) && !isNuevoCentro(project)) return false;
  if (project.responsable_id === user.id && !isAccountingOnly(user)) return true;
  if (await getParticipation(db, project.id, user.id)) return true;
  if (await projectHasPhases(db, project.id)) {
    const areas = normalizeUserAreas(user);
    if (!areas.length) return false;
    return !!(await db('project_area_phase_permissions').where({ project_id: project.id, puede_ver: true }).whereIn('area', areas).first());
  }
  const a = normalizeUserAreas(user);
  return !isAccountingOnly(user) && parseAreas(project).some((x) => a.includes(x));
}
async function canEditProject(db, user, project) { if (!project) return false; if (isAdminLike(user)) return true; if (isAccountingOnly(user) || await isAccountingGateBlocked(db, user, project)) return false; if (project.responsable_id === user.id) return true; return !!(await getParticipation(db, project.id, user.id))?.puede_editar; }
async function canViewTask(db, user, project, task) { if (!project || !task) return false; if (isAdminLike(user)) return true; if (isAccountingOnly(user) && !isNuevoCentro(project)) return false; if (await projectHasPhases(db, project.id)) return !!task.fase && await hasPhaseAccess(db, user, project, task.fase, 'VER'); return task.fase ? await hasPhaseAccess(db, user, project, task.fase, 'VER') : canViewProject(db, user, project); }
async function canEditTask(db, user, project, task) { if (!project || !task) return false; if (isAdminLike(user)) return true; if (await isAccountingGateBlocked(db, user, project)) return false; if (await projectHasPhases(db, project.id)) return !!task.fase && await hasPhaseAccess(db, user, project, task.fase, 'TRABAJAR'); return task.fase ? await hasPhaseAccess(db, user, project, task.fase, 'TRABAJAR') : canEditProject(db, user, project); }
async function getVisiblePhases(db, user, project) {
  const phases = await db('project_phases').where({ project_id: project.id, activo: true }).orderBy('orden', 'asc');
  if (isAdminLike(user)) return phases;
  const participation = await getParticipation(db, project.id, user.id);
  if (participation) {
    const ids = await getAssignedPhaseIds(db, participation);
    // Participante = solo sus fases asignadas; nunca ampliar por área.
    return phases.filter((phase) => ids.includes(String(phase.id)));
  }
  const areas = normalizeUserAreas(user);
  if (!areas.length) return [];
  const permissions = await db('project_area_phase_permissions').where({ project_id: project.id, puede_ver: true }).whereIn('area', areas).select('fase');
  const allowed = new Set(permissions.map((row) => String(row.fase).trim().toUpperCase()));
  return phases.filter((phase) => allowed.has(String(phase.clave).trim().toUpperCase()));
}
module.exports = { parseAreas, getParticipation, getAssignedPhaseIds, getProjectPhase, canViewProject, canEditProject, canViewTask, canEditTask, hasPhaseAccess, hasAreaPhasePermission, isAccountingOnly, isNuevoCentro, getVisiblePhases, getAccountingGate, isAccountingGateBlocked };
