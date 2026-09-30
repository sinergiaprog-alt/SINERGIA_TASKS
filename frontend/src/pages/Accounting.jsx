import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { AreasTags, EstadoDot, PrioridadTag, ProgressMeter, ProblemaTag } from '../components/Badges';
import { useAuth } from '../context/AuthContext';

export default function Accounting() {
  const { user } = useAuth();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('active');
  const [query, setQuery] = useState('');

  async function load() {
    try {
      setError('');
      // Traer todos los proyectos visibles para este usuario (el backend ya filtra por permisos)
      const r = await api.get('/projects');
      setProjects(r.data.projects || []);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudieron cargar los proyectos.');
    }
  }

  useEffect(() => { load(); }, []);

  // Para contabilidad, el "progreso" es solo de sus fases asignadas.
  // El backend ya devuelve phasePermissions en el proyecto. Calculamos si sus fases están completas.
  function accountingProgress(project) {
    // Si el proyecto tiene fases y permisos de contabilidad definidos
    const phases = project.phases || [];
    const myPhases = project.contabilidad_phases || []; // fases visibles para contabilidad

    if (!myPhases.length || !phases.length) {
      // Sin fases asignadas: usar progreso general del proyecto
      return { porcentaje: Number(project.progreso?.porcentaje || 0), total: Number(project.progreso?.total || 0) };
    }

    // Calcular progreso solo de las tareas en las fases de contabilidad
    // Esto requiere que el backend mande las tareas; como no las manda en el listado,
    // usamos el progreso de las fases directamente si viene en project.phases_progress
    const phasesProgress = project.phases_progress || {};
    const relevant = myPhases.filter(fp => phases.some(p => p.clave === fp));
    if (!relevant.length) {
      return { porcentaje: Number(project.progreso?.porcentaje || 0), total: Number(project.progreso?.total || 0) };
    }

    let total = 0; let completadas = 0;
    for (const clave of relevant) {
      const pp = phasesProgress[clave];
      if (pp) { total += pp.total || 0; completadas += pp.completadas || 0; }
    }
    if (!total) return { porcentaje: 0, total: 0 };
    return { porcentaje: Math.round((completadas / total) * 100), total };
  }

  const complete = (p) => {
    const prog = accountingProgress(p);
    return prog.total > 0 && prog.porcentaje >= 100;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = (projects || []).filter(p =>
      view === 'archived' ? p.estado === 'ARCHIVADO' :
      view === 'completed' ? p.estado !== 'ARCHIVADO' && complete(p) :
      p.estado !== 'ARCHIVADO' && !complete(p)
    );
    return q ? base.filter(p => `${p.nombre} ${p.asunto || ''}`.toLowerCase().includes(q)) : base;
  }, [projects, view, query]);

  const stats = useMemo(() => {
    const all = projects || [];
    return {
      active: all.filter(p => p.estado !== 'ARCHIVADO' && !complete(p)).length,
      completed: all.filter(p => p.estado !== 'ARCHIVADO' && complete(p)).length,
      archived: all.filter(p => p.estado === 'ARCHIVADO').length,
    };
  }, [projects]);

  return (
    <div className="page-shell-v6 dashboard-v6-page">
      <header className="dashboard-head-v6">
        <div>
          <span className="eyebrow-v6">SINERGIA · CONTABILIDAD</span>
          <h1>Panel de Contabilidad</h1>
          <p>Proyectos y fases asignadas a tu área.</p>
        </div>
        <div className="dashboard-head-actions-v6">
          <button className="btn-v6 secondary" onClick={load}>↻ Actualizar</button>
        </div>
      </header>

      <section className="dashboard-overview-v6">
        <OverviewBtn label="Pendientes" value={stats.active} active={view === 'active'} onClick={() => setView('active')} />
        <OverviewBtn label="Completados" value={stats.completed} active={view === 'completed'} onClick={() => setView('completed')} />
        <OverviewBtn label="Archivados" value={stats.archived} active={view === 'archived'} onClick={() => setView('archived')} />
        <div className="dashboard-search-v6">
          <span>⌕</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar proyecto…" />
        </div>
      </section>

      {error && <div className="panel-v6 error-panel-v6">{error}</div>}
      {projects === null && !error && <div className="panel-v6 loading-panel-v6">Cargando proyectos…</div>}
      {projects !== null && filtered.length === 0 && (
        <div className="panel-v6 empty-projects-v6">
          <span>✓</span>
          <h3>No hay proyectos en esta vista</h3>
          <p>Cuando el administrador te asigne fases, aparecerán aquí.</p>
        </div>
      )}
      {projects !== null && filtered.length > 0 && (
        <section className="project-list-v6">
          {filtered.map(p => <AccountingProjectCard key={p.id} project={p} getProgress={accountingProgress} />)}
        </section>
      )}
    </div>
  );
}

function OverviewBtn({ label, value, active, onClick }) {
  return (
    <button className={`overview-item-v6 ${active ? 'active' : ''}`} onClick={onClick}>
      <span>{label}</span><strong>{value}</strong>
    </button>
  );
}

function AccountingProjectCard({ project, getProgress }) {
  const asunto = project.asunto === 'OTROS' ? project.asunto_otro : project.asunto;
  const prog = getProgress(project);
  const myPhases = project.contabilidad_phases || [];

  return (
    <Link to={`/proyectos/${project.id}`} className="project-card-v6">
      <div className="project-card-v6-main">
        <div className="project-card-v6-tags">
          <AreasTags areas={project.areas} fallback={project.area} />
          <PrioridadTag prioridad={project.prioridad} />
          {project.asunto === 'NUEVO CENTRO' && <span className="tag-v6 accent">Nuevo Centro</span>}
          {project.es_problema && <ProblemaTag problemaDescripcion={project.problema_descripcion} tipoProblemaOtro={project.tipo_problema_otro} />}
        </div>
        <div className="project-card-v6-title-row">
          <h2>{project.nombre}</h2>
          <EstadoDot estado={project.estado} />
        </div>
        <p className="project-card-v6-sub">Asunto: {asunto || 'General'}</p>
        {myPhases.length > 0 && (
          <p className="project-card-v6-sub" style={{ marginTop: '4px', fontSize: '0.75rem', opacity: 0.6 }}>
            Fases asignadas: {myPhases.join(', ')}
          </p>
        )}
        <div className="project-card-v6-meta">
          <span>Inicio {formatDateOnly(project.fecha_inicio)}</span>
          <span>Límite {formatDateOnly(project.fecha_limite)}</span>
          {project.fecha_culminacion && <span>Terminado {formatDateOnly(project.fecha_culminacion)}</span>}
        </div>
      </div>
      <div className="project-card-v6-progress">
        <ProgressMeter porcentaje={prog.porcentaje} total={prog.total} />
        {prog.total > 0 && (
          <p style={{ fontSize: '0.7rem', textAlign: 'center', marginTop: '4px', opacity: 0.5 }}>
            {prog.porcentaje}% de tus fases
          </p>
        )}
      </div>
      <span className="project-card-v6-arrow">→</span>
    </Link>
  );
}

function formatDateOnly(v) {
  if (!v) return '—';
  const raw = String(v);
  // Fecha pura sin hora: no ajustar timezone
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  // Usar hora local del dispositivo
  return d.toLocaleDateString(navigator.language || 'es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
