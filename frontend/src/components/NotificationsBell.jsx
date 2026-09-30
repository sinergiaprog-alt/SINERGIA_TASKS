import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

function playPing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 300);
  } catch (_) {}
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState(null);
  const initialized = useRef(false);
  const seenIds = useRef(new Set());

  async function load(silent = false) {
    try {
      const r = await api.get('/notifications?limit=25');
      const next = r.data.notifications || [];
      const fresh = next.filter((n) => !n.leida && !seenIds.current.has(n.id));
      next.forEach((n) => seenIds.current.add(n.id));
      setItems(next);
      setUnread(Number(r.data.unread || 0));
      if (initialized.current && fresh.length && !silent) {
        const n = fresh[0];
        setToast({ title: n.titulo, message: n.mensaje });
        playPing();
        if ('Notification' in window && Notification.permission === 'granted') {
          try { new Notification(n.titulo, { body: n.mensaje || 'Tienes una nueva notificación en Sinergia.' }); } catch (_) {}
        }
        window.setTimeout(() => setToast(null), 5200);
      }
      initialized.current = true;
    } catch (_) {}
  }

  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => load(false), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function read(id) {
    try { await api.patch(`/notifications/${id}/read`); setItems((xs) => xs.map((x) => x.id === id ? { ...x, leida: true } : x)); setUnread((n) => Math.max(0, n - 1)); } catch (_) {}
  }
  async function readAll() {
    if (!unread) return;
    try { await api.patch('/notifications/read-all'); setItems((xs) => xs.map((x) => ({ ...x, leida: true }))); setUnread(0); } catch (_) {}
  }
  async function enableDesktop() {
    if (!('Notification' in window)) return;
    try { await Notification.requestPermission(); } catch (_) {}
  }

  return <div className="notification-v6-wrap">
    <button className={`notification-v6-btn ${unread ? 'has-unread' : ''}`} onClick={() => setOpen((v) => !v)} aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}><span className="bell-glyph-v6" aria-hidden="true" />{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</button>
    {toast && <button className="notification-v6-toast" onClick={() => { setOpen(true); setToast(null); }}><span className="notification-v6-toast-dot" /><span><strong>{toast.title}</strong><small>{toast.message}</small></span></button>}
    {open && <div className="notification-v6-panel">
      <div className="notification-v6-head"><div><strong>Notificaciones</strong><span>{unread ? `${unread} pendientes` : 'Todo al día'}</span></div><div className="notification-v6-head-actions"><button onClick={enableDesktop} title="Permitir avisos del escritorio">Avisos</button><button onClick={readAll} disabled={!unread}>Marcar todo</button></div></div>
      <div className="notification-v6-list">{items.map((n) => <button key={n.id} className={`notification-v6-item ${n.leida ? 'read' : ''}`} onClick={() => read(n.id)}><span className="notification-v6-icon">{iconFor(n.tipo)}</span><span className="notification-v6-copy"><strong>{n.titulo}</strong><small>{n.mensaje || 'Sin detalle adicional.'}</small><em>{new Date(n.created_at).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</em></span>{!n.leida && <i />}</button>)}{!items.length && <div className="notification-v6-empty"><span>✓</span><strong>No tienes notificaciones</strong><small>Cuando ocurra algo importante, aparecerá aquí.</small></div>}</div>
      <Link to="/perfil" className="notification-v6-footer" onClick={() => setOpen(false)}>Ver actividad de mi cuenta →</Link>
    </div>}
  </div>;
}
function iconFor(tipo) { const m = { TAREA_ASIGNADA: '✓', TAREA_COMPLETADA: '✓', TAREA_BLOQUEADA: '!', PROYECTO_ASIGNADO: '▦', FASE_ASIGNADA: '◈', COMENTARIO: '◌', PROYECTO_COMPLETADO: '★', PROBLEMA_CREADO: '!', PROYECTO_TRANSFERIDO: '↗' }; return m[tipo] || '•'; }
