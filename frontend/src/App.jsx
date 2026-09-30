import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './pages/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Users from './pages/Users';
import Accounting from './pages/Accounting';
import Profile from './pages/Profile';
import Companion from './components/Companion';

function Private({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
function AdminOnly({ children }) { const { user } = useAuth(); return user?.role === 'ADMIN' ? children : <Navigate to="/" replace />; }
function AccountingOnly({ children }) { const { user } = useAuth(); return user?.role === 'ADMIN' || user?.areas?.includes('CONTABILIDAD') ? children : <Navigate to="/" replace />; }
function CompanionGate() { const { pathname } = useLocation(); return pathname === '/login' ? null : <Companion />; }
function HomeEntry() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const areas = user?.areas || [];
  if (user?.role !== 'ADMIN' && areas.length === 1 && areas[0] === 'CONTABILIDAD') {
    return <Navigate to="/contabilidad" replace />;
  }
  // Usuarios de un solo área técnica: Inicio ya filtrado por su área (sin bucle si ya viene en la URL).
  if (user?.role !== 'ADMIN' && areas.length === 1 && ['PROGRAMACION', 'SOPORTE'].includes(areas[0]) && !params.get('area')) {
    return <Navigate to={`/?area=${areas[0]}`} replace />;
  }
  return <Dashboard mode="home" />;
}

export default function App() {
  return <BrowserRouter><AuthProvider><CompanionGate /><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Private><AppLayout /></Private>}>
      <Route index element={<HomeEntry />} />
      <Route path="contabilidad" element={<AccountingOnly><Accounting /></AccountingOnly>} />
      <Route path="perfil" element={<Profile />} />
      <Route path="proyectos" element={<Dashboard mode="list" />} />
      <Route path="proyectos/:id" element={<ProjectDetail />} />
      <Route path="usuarios" element={<AdminOnly><Users /></AdminOnly>} />
    </Route>
  </Routes></AuthProvider></BrowserRouter>;
}
