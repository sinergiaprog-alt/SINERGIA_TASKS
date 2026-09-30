// Utilidades de formato compartidas por las pantallas rediseñadas.
export const AREA_LABEL = { PROGRAMACION: 'Programación', SOPORTE: 'Soporte', CONTABILIDAD: 'Contabilidad' };
export const areaLabel = (a) => AREA_LABEL[a] || a;
export const areasText = (project) => {
  const list = Array.isArray(project?.areas) && project.areas.length ? project.areas : (project?.area ? [project.area] : []);
  return list.map(areaLabel).join(' + ');
};

export const ESTADO_PROYECTO = {
  PENDIENTE: { label: 'Pendiente', tone: '' },
  EN_PROGRESO: { label: 'En progreso', tone: 'blue' },
  EN_REVISION: { label: 'En revisión', tone: 'amber' },
  COMPLETADO: { label: 'Completado', tone: 'green' },
  ARCHIVADO: { label: 'Archivado', tone: '' },
};
export const estadoProyecto = (e) => ESTADO_PROYECTO[e] || { label: e || 'Pendiente', tone: '' };

// Locale seguro: si el navegador reporta uno inválido, se usa es-DO en vez de romper la pantalla.
const LOCALE = (() => { try { const l = navigator.language || 'es-DO'; new Intl.DateTimeFormat(l); return l; } catch { return 'es-DO'; } })();

export function formatDateOnly(v) {
  if (!v) return '—';
  const raw = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) { const [y, m, d] = raw.split('-').map(Number); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function formatShort(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short' });
}
export function formatDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
export function formatHM(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
export function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
export const isVencido = (p) => !!p?.fecha_limite && !['COMPLETADO', 'ARCHIVADO'].includes(p.estado) && new Date(`${String(p.fecha_limite).slice(0, 10)}T23:59:59`) < new Date();
export const proyectoCompleto = (p) => p.estado === 'COMPLETADO' || (Number(p.progreso?.total || 0) > 0 && Number(p.progreso?.porcentaje || 0) >= 100);
