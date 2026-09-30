import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const labelArea = (a) => a === 'PROGRAMACION' ? 'Programación' : a === 'SOPORTE' ? 'Soporte' : a === 'CONTABILIDAD' ? 'Contabilidad' : a;
const actionIcon = (a) => ({ CREAR: '+', EDITAR: '✎', AGREGAR: '↗', ELIMINAR: '×', BLOQUEAR: '!', DESBLOQUEAR: '✓', ACTUALIZAR_CLAVE_E2E: '⌘' }[a] || '•');

export default function Profile() {
  const { user } = useAuth();
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { api.get('/auth/profile').then(r => setData(r.data)).catch(e => setError(e.response?.data?.error || 'No se pudo cargar tu perfil.')); }, []);
  const max = useMemo(() => Math.max(1, ...(data?.stats?.actividadSemana || []).map(x => Number(x.total || 0))), [data]);
  if (error) return <div className="page-shell-v6"><div className="panel-v6 error-panel-v6">{error}</div></div>;
  if (!data) return <div className="page-shell-v6"><div className="panel-v6 loading-panel-v6">Cargando tu espacio…</div></div>;
  const areas = data.user.areas || [];
  return <div className="page-shell-v6 profile-v6-page">
    <header className="page-header-v6"><div><span className="eyebrow-v6">CUENTA · PERFIL</span><h1>Mi perfil</h1><p>Tu identidad, métricas y actividad real en Sinergia.</p></div><div className="header-status-v6"><span /> Cuenta activa</div></header>

    <section className="profile-hero-v6">
      <div className="profile-avatar-v6">{(data.user.nombre || 'U').slice(0, 1).toUpperCase()}</div>
      <div className="profile-hero-copy"><span className="profile-role-v6">{data.user.role === 'ADMIN' ? 'Administrador' : 'Colaborador'}</span><h2>{data.user.nombre}</h2><p>{data.user.email}</p><div className="profile-tags-v6">{areas.length ? areas.map((a) => <span key={a}>{labelArea(a)}</span>) : <span>Sin área asignada</span>}{data.user.departamento && <span>{data.user.departamento}</span>}</div></div>
      <div className="profile-hero-side"><span>Desde</span><strong>{data.user.createdAt ? new Date(data.user.createdAt).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</strong><small>Cuenta Sinergia</small></div>
    </section>

    <section className="profile-metrics-v6">{[
      ['Tareas completadas', data.stats.tareasCompletadas, 'Trabajo finalizado'],
      ['Proyectos', data.stats.proyectos, 'Participaciones'],
      ['Aportes', data.stats.aportes, 'Acciones registradas'],
      ['Fases completadas', data.stats.fasesCompletadas, 'Hitos terminados'],
    ].map(([label, value, sub]) => <article className="profile-metric-v6" key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>)}</section>

    <div className="profile-grid-v6">
      <section className="panel-v6 profile-chart-v6"><div className="panel-head-v6"><div><span className="panel-kicker-v6">RITMO DE TRABAJO</span><h3>Actividad de los últimos 7 días</h3></div><span className="panel-badge-v6">Datos reales</span></div><div className="bar-chart-v6">{(data.stats.actividadSemana || []).map(day => <div className="bar-col-v6" key={day.fecha}><strong>{day.total}</strong><div className="bar-track-v6"><i style={{ height: `${Math.max(7, Math.round(day.total / max * 100))}%` }} /></div><span>{day.etiqueta}</span></div>)}</div></section>

      <section className="panel-v6"><div className="panel-head-v6"><div><span className="panel-kicker-v6">DETALLES</span><h3>Información de acceso</h3></div></div><div className="profile-detail-list-v6"><Detail label="Rol" value={data.user.role === 'ADMIN' ? 'Administrador' : data.user.role} /><Detail label="Área" value={areas.map(labelArea).join(' · ') || 'Sin asignar'} /><Detail label="Departamento" value={data.user.departamento || 'Sin departamento'} /><Detail label="Estado" value={data.user.activo ? 'Activo' : 'Inactivo'} /></div></section>
    </div>

  </div>;
}
function Detail({ label, value }) { return <div className="profile-detail-v6"><span>{label}</span><strong>{value}</strong></div>; }
function formatAction(a) { return String(a || '').replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()); }
