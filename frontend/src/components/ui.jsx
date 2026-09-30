import { useEffect, useRef, useState } from 'react';

/** Barra de progreso única para toda la app. */
export function Progress({ value = 0, empty = false, label = true }) {
  if (empty) return <span className="sx-muted sx-small">Sin tareas</span>;
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className={`sx-bar ${v === 100 ? 'done' : ''}`} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
    <div className="sx-bar-track"><div className="sx-bar-fill" style={{ width: `${v}%` }} /></div>
    {label && <b>{v}%</b>}
  </div>;
}

export function Pill({ tone = '', children, title }) {
  return <span className={`sx-pill ${tone}`} title={title}>{children}</span>;
}

/** Sección plegable. Cerrada por defecto: el cuerpo no se monta hasta abrirla. */
export function Section({ icon, title, count, defaultOpen = false, children, id }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `sx-sec-${id || title}`;
  return <section className={`sx-sec ${open ? 'open' : ''}`}>
    <button type="button" className="sx-sec-head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(v => !v)}>
      {icon && <span className="sx-sec-ico" aria-hidden="true">{icon}</span>}
      <span className="sx-sec-title">{title}</span>
      {count !== undefined && count !== null && <span className="sx-sec-count">{count}</span>}
      <span className="sx-chev" aria-hidden="true">▶</span>
    </button>
    {open && <div className="sx-sec-body" id={bodyId}>{children}</div>}
  </section>;
}

/** Menú de acciones secundarias (⋮). items: [{label,onClick,danger,hidden,disabled}] */
export function Menu({ items, label = 'Más acciones' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const visible = items.filter(i => !i.hidden);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!visible.length) return null;
  return <div className="sx-menu" ref={ref}>
    <button type="button" className="sx-btn icon" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(v => !v)}>⋮</button>
    {open && <div className="sx-menu-list" role="menu">
      {visible.map(i => <button key={i.label} type="button" role="menuitem" disabled={i.disabled} className={i.danger ? 'danger' : ''} onClick={() => { setOpen(false); i.onClick(); }}>{i.label}</button>)}
    </div>}
  </div>;
}

/** Modal en escritorio, hoja inferior en móvil. */
export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return <div className="sx-modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="sx-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sx-modal-head"><h2>{title}</h2><button type="button" className="sx-btn sm" onClick={onClose}>Cerrar</button></div>
      {children}
    </div>
  </div>;
}
