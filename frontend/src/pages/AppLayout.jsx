import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import NotificationsBell from '../components/NotificationsBell';
import { areaLabel } from '../lib/format';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const areas = user?.areas || [];
  const isAdmin = user?.role === 'ADMIN';
  const hasTech = areas.some(a => ['PROGRAMACION', 'SOPORTE'].includes(a));
  const accountingOnly = !isAdmin && areas.includes('CONTABILIDAD') && !hasTech;

  useEffect(() => { setOpen(false); }, [pathname]);

  // Navegación por rol. "Tareas" queda fuera hasta contar con un listado global de tareas en la API.
  const items = [
    !accountingOnly && { to: '/', label: 'Inicio', on: pathname === '/' },
    !accountingOnly && { to: '/proyectos', label: 'Proyectos', on: pathname.startsWith('/proyectos') },
    (isAdmin || accountingOnly) && { to: '/contabilidad', label: 'Contabilidad', on: pathname === '/contabilidad' },
    isAdmin && { to: '/usuarios', label: 'Usuarios', on: pathname === '/usuarios' },
  ].filter(Boolean);

  const roleText = isAdmin ? 'Administrador' : areas.length === 1 ? areaLabel(areas[0]) : areas.length ? 'Acceso múltiple' : 'Sin área asignada';
  const initial = (user?.nombre || 'U').slice(0, 1).toUpperCase();
  const salir = async () => { await logout(); navigate('/login'); };

  return <div className="sx-app">
    <header className="sx-top">
      <button className="sx-burger" onClick={() => setOpen(true)} aria-label="Abrir menú">☰</button>
      <Link to="/" className="sx-brand"><span className="sx-brand-mark">S</span><span>SINERGIA TASKS</span></Link>
      <nav className="sx-nav" aria-label="Principal">
        {items.map(i => <Link key={i.to} to={i.to} className={i.on ? 'on' : ''} aria-current={i.on ? 'page' : undefined}>{i.label}</Link>)}
      </nav>
      <div className="sx-top-end">
        <NotificationsBell />
        <ThemeToggle />
        <button className="sx-avatar" onClick={() => navigate('/perfil')} title="Mi perfil" aria-label="Mi perfil">{initial}</button>
      </div>
    </header>

    {open && <button className="sx-scrim" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
    <aside className={`sx-drawer ${open ? 'open' : ''}`} inert={!open}>
      <div className="sx-brand"><span className="sx-brand-mark">S</span><span>SINERGIA TASKS</span></div>
      <div className="sx-drawer-user"><strong>{user?.nombre || 'Usuario'}</strong><span>{roleText}</span></div>
      <nav>
        {items.map(i => <Link key={i.to} to={i.to} className={i.on ? 'on' : ''}>{i.label}</Link>)}
        <Link to="/perfil" className={pathname === '/perfil' ? 'on' : ''}>Mi perfil</Link>
      </nav>
      <div className="sx-drawer-foot"><button className="sx-btn" style={{ width: '100%' }} onClick={salir}>Cerrar sesión</button></div>
    </aside>

    <main className="sx-main"><Outlet /></main>
  </div>;
}
