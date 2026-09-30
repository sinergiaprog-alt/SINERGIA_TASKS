import { useCallback, useEffect, useRef, useState } from 'react';
import './Companion.css';

const MOODS = {
  idle: '¡YA SABES! REVISANDO ✦',
  login: '¡Hi! 👋',
  create: '¡Vamos vamos! ✨',
  edit: 'ARREGLANDO COSITAS',
  delete: 'Entendido.',
  complete: '¡ESO!! CHOCA CHOCA! 🎉',
  error: 'Vamos a revisarlo.',
  work: '¡VAMOOOO! 🚀',
};

const EDGE = 18;
const FLOOR = 16;
const SIZE = { w: 112, h: 158 };

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function bounds(x, y) {
  const maxX = Math.max(EDGE, window.innerWidth - SIZE.w - EDGE);
  const maxY = Math.max(64, window.innerHeight - SIZE.h - FLOOR);
  return {
    x: clamp(x, EDGE, maxX),
    y: clamp(y, 64, maxY),
  };
}

function startPosition() {
  return bounds(window.innerWidth - SIZE.w - 26, window.innerHeight - SIZE.h - FLOOR);
}

export default function Companion() {
  const rootRef = useRef(null);
  const bubbleRef = useRef(null);
  const posRef = useRef(startPosition());
  const rafRef = useRef(0);
  const walkRef = useRef(null);
  const timerRef = useRef();
  const reactionTimerRef = useRef();
  const [visible, setVisible] = useState(true);
  const [mood, setMood] = useState('idle');
  const [message, setMessage] = useState(MOODS.idle);
  const [walking, setWalking] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const [reaction, setReaction] = useState(0);
  const [reacting, setReacting] = useState(false);
  const dragRef = useRef(null);
  const draggedRef = useRef(false);

  const paintPosition = useCallback((p) => {
    posRef.current = p;
    if (rootRef.current) {
      rootRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    }
  }, []);

  const stopWalk = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    walkRef.current = null;
    setWalking(false);
    rootRef.current?.style.setProperty('--walk-speed', '0ms');
  }, []);

  const walkTo = useCallback((target, afterWalk) => {
    const rect = target?.rect || target;
    if (!rect || !Number.isFinite(rect.left)) return;

    const current = posRef.current;
    const gap = 10;
    const candidates = [
      { x: rect.right + gap, y: rect.top + rect.height / 2 - SIZE.h / 2 },
      { x: rect.left - SIZE.w - gap, y: rect.top + rect.height / 2 - SIZE.h / 2 },
      { x: rect.left + rect.width / 2 - SIZE.w / 2, y: rect.bottom + gap },
    ];
    const chosen = candidates.find((p) => {
      const q = bounds(p.x, p.y);
      return q.x >= EDGE && q.x + SIZE.w <= window.innerWidth - EDGE && q.y >= 64 && q.y + SIZE.h <= window.innerHeight - FLOOR;
    }) || bounds(
      rect.left < window.innerWidth / 2 ? window.innerWidth - SIZE.w - EDGE : EDGE,
      window.innerHeight - SIZE.h - FLOOR,
    );

    const distance = Math.hypot(chosen.x - current.x, chosen.y - current.y);
    if (distance < 18) {
      afterWalk?.();
      return;
    }

    stopWalk();
    setFacingLeft(chosen.x < current.x);
    setWalking(true);
    setMood((m) => m === 'idle' ? 'work' : m);

    // La mascota debe sentirse ágil: caminar rápido sin consumir CPU.
    const duration = clamp(distance * 1.35, 380, 1150);
    const start = performance.now();
    walkRef.current = { from: current, to: chosen, duration };
    rootRef.current?.style.setProperty('--walk-speed', `${duration}ms`);

    const frame = (now) => {
      const walk = walkRef.current;
      if (!walk) return;
      const t = clamp((now - start) / walk.duration, 0, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      paintPosition({
        x: walk.from.x + (walk.to.x - walk.from.x) * eased,
        y: walk.from.y + (walk.to.y - walk.from.y) * eased,
      });
      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        rafRef.current = 0;
        walkRef.current = null;
        setWalking(false);
        afterWalk?.();
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [paintPosition, stopWalk]);

  const react = useCallback((text = '¡Hey,como vas?! 👋', happy = false) => {
    stopWalk();
    setReaction((v) => v + 1);
    setReacting(true);
    setMood(happy ? 'complete' : 'work');
    setMessage(text);
    clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = setTimeout(() => {
      setReacting(false);
      setMood('idle');
      setMessage(MOODS.idle);
    }, 1700);
  }, [stopWalk]);

  useEffect(() => {
    const onAction = (event) => {
      const detail = event.detail || {};
      const next = MOODS[detail.action] ? detail.action : 'work';
      clearTimeout(timerRef.current);
      setMood(next);
      setMessage(detail.message || MOODS[next]);
      if (detail.target) {
        walkTo(detail.target, () => {
          if (next === 'complete') setReacting(true);
        });
      }
      timerRef.current = setTimeout(() => {
        setReacting(false);
        setMood('idle');
        setMessage(MOODS.idle);
      }, next === 'complete' ? 3000 : 2400);
    };

    window.addEventListener('sinergia:companion', onAction);
    return () => {
      window.removeEventListener('sinergia:companion', onAction);
      clearTimeout(timerRef.current);
      clearTimeout(reactionTimerRef.current);
      stopWalk();
    };
  }, [stopWalk, walkTo]);

  useEffect(() => {
    const onClick = (event) => {
      const el = event.target.closest?.('[data-companion-action]');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent('sinergia:companion', {
        detail: {
          action: el.dataset.companionAction || 'work',
          target: { rect },
          message: el.dataset.companionMessage,
        },
      }));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // La posición la controla el usuario. No hacemos patrullas automáticas para evitar que
  // la mascota aparezca en medio de un formulario o tape contenido.


  useEffect(() => {
    paintPosition(posRef.current);
    const onResize = () => paintPosition(bounds(posRef.current.x, posRef.current.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paintPosition]);

  useEffect(() => {
    const onPointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      draggedRef.current = true;
      const next = bounds(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
      paintPosition(next);
    };

    const onPointerUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      document.body.classList.remove('companion-dragging');
      const saved = posRef.current;
      try { localStorage.setItem('sinergia-companion-position', JSON.stringify(saved)); } catch {}
      window.dispatchEvent(new CustomEvent('sinergia:companion-moved'));
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [paintPosition]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sinergia-companion-position') || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) paintPosition(bounds(saved.x, saved.y));
    } catch {}
  }, [paintPosition]);

  const onMascotPointerDown = (event) => {
    if (event.button !== 0) return;
    stopWalk();
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    draggedRef.current = false;
    setMessage('Arrástrame donde quieras ✦');
    dragRef.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    document.body.classList.add('companion-dragging');
  };

  const onMascotClick = (event) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    if (walking) return;
    const happy = reaction % 3 === 2;
    react(happy ? '¡Eso! ✨' : '¡Heyyyy! 👋', happy);
  };

  if (!visible) {
    return <button className="companion-mini" onClick={() => setVisible(true)} aria-label="Mostrar mascota de Sinergia">S</button>;
  }

  return (
    <div
      ref={rootRef}
      className={`companion companion-${mood} ${walking ? 'is-walking' : ''} ${reacting ? 'is-reacting' : ''} ${facingLeft ? 'is-left' : 'is-right'}`}
      style={{ '--reaction': reaction }}
      aria-live="polite"
    >
      <div ref={bubbleRef} className="companion-bubble" key={`${mood}-${message}-${reaction}`} role="status">
        <span>{message}</span>
      </div>

      <button className="companion-character" onPointerDown={onMascotPointerDown} onClick={onMascotClick} aria-label="Interactuar con la mascota de Sinergia">
        <span className="companion-ground" aria-hidden="true" />
        <svg className="companion-art" viewBox="0 0 220 300" role="img" aria-label="Asistente zorro de Sinergia">
          <defs>
            <linearGradient id="cFur" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffb96b" /><stop offset=".55" stopColor="#f47745" /><stop offset="1" stopColor="#d85a3d" />
            </linearGradient>
            <linearGradient id="cCoat" x1="0" y1="0" x2="0.9" y2="1">
              <stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#dcecef" />
            </linearGradient>
            <linearGradient id="cScreen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8df0e6" /><stop offset="1" stopColor="#22b9b3" />
            </linearGradient>
            <filter id="cShadow" x="-30%" y="-30%" width="160%" height="180%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" floodOpacity=".16" />
            </filter>
          </defs>

          <ellipse className="fox-shadow" cx="110" cy="282" rx="43" ry="6" />

          <g className="fox-rig">
            <g className="fox-tail">
              <path d="M154 218 C196 210 204 168 178 154 C203 130 181 108 160 135 C137 165 133 199 154 218Z" fill="url(#cFur)" stroke="#bd5339" strokeWidth="3" />
              <path d="M178 155 C192 151 198 159 198 169 C187 165 180 174 175 183 C171 174 172 163 178 155Z" fill="#fff5eb" />
            </g>

            <g className="fox-legs">
              <g className="fox-leg fox-leg-left">
                <path d="M81 221 L72 263" stroke="#233e49" strokeWidth="17" strokeLinecap="round" />
                <path d="M63 263 Q72 257 82 262 L84 270 Q72 275 61 269Z" fill="#f9fcfc" stroke="#183943" strokeWidth="2.5" />
              </g>
              <g className="fox-leg fox-leg-right">
                <path d="M132 221 L141 263" stroke="#233e49" strokeWidth="17" strokeLinecap="round" />
                <path d="M133 263 Q142 257 152 263 L153 269 Q142 274 132 269Z" fill="#f9fcfc" stroke="#183943" strokeWidth="2.5" />
              </g>
            </g>

            <g className="fox-body">
              <path d="M63 139 Q109 121 156 139 L151 225 Q110 239 68 225Z" fill="url(#cCoat)" stroke="#bfdde0" strokeWidth="3" />
              <path d="M92 136 L110 164 L128 136 L126 232 L94 232Z" fill="#173b47" />
              <path d="M110 161 L110 226" stroke="#86b9bf" strokeWidth="2" opacity=".65" />
              <circle cx="135" cy="176" r="10" fill="#13aaa7" />
              <path d="M130 176 L134 180 L141 171" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </g>

            <g className="fox-arm fox-arm-left">
              <path d="M69 149 Q51 169 54 197" stroke="#e5f0f1" strokeWidth="14" strokeLinecap="round" />
              <circle cx="54" cy="199" r="8" fill="#f47745" />
            </g>
            <g className="fox-arm fox-arm-right">
              <path d="M151 149 Q169 167 166 194" stroke="#e5f0f1" strokeWidth="14" strokeLinecap="round" />
              <circle cx="166" cy="196" r="8" fill="#f47745" />
            </g>

            <g className="fox-tablet">
              <rect x="81" y="177" width="58" height="39" rx="7" fill="#173b47" />
              <rect x="85" y="181" width="50" height="31" rx="4" fill="url(#cScreen)" />
              <path d="M90 201 L99 192 L107 199 L118 188 L130 201" fill="none" stroke="#087f8d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="126" cy="186" r="2" fill="#fff" opacity=".8" />
            </g>

            <g className="fox-head">
              <path d="M59 89 L68 40 L96 59 Q110 54 124 59 L152 40 L161 89 Q177 108 161 133 Q145 153 110 153 Q75 153 59 133 Q43 108 59 89Z" fill="url(#cFur)" stroke="#b95038" strokeWidth="3" />
              <path d="M76 108 Q110 87 144 108 Q139 140 110 143 Q81 140 76 108Z" fill="#fff5eb" />
              <path d="M68 47 L76 82 L94 60Z" fill="#ffd7c0" />
              <path d="M152 47 L144 82 L126 60Z" fill="#ffd7c0" />

              <g className="fox-glasses">
                <rect x="64" y="86" width="38" height="26" rx="11" fill="rgba(255,255,255,.12)" stroke="#173b47" strokeWidth="3" />
                <rect x="118" y="86" width="38" height="26" rx="11" fill="rgba(255,255,255,.12)" stroke="#173b47" strokeWidth="3" />
                <path d="M102 94 Q110 89 118 94" fill="none" stroke="#173b47" strokeWidth="3" />
                <path d="M68 90 L85 87" stroke="#fff" strokeWidth="2.5" opacity=".75" strokeLinecap="round" />
                <path d="M122 90 L139 87" stroke="#fff" strokeWidth="2.5" opacity=".75" strokeLinecap="round" />
              </g>

              <g className="fox-eyes">
                <ellipse cx="83" cy="98" rx="5" ry="6" fill="#17333d" />
                <ellipse cx="137" cy="98" rx="5" ry="6" fill="#17333d" />
                <circle cx="85" cy="96" r="1.6" fill="#fff" />
                <circle cx="139" cy="96" r="1.6" fill="#fff" />
              </g>
              <path d="M103 112 Q110 106 117 112 Q114 119 110 119 Q106 119 103 112Z" fill="#263f46" />
              <path d="M101 128 Q110 134 119 128" fill="none" stroke="#9e4b3c" strokeWidth="2.5" strokeLinecap="round" />
            </g>

            <g className="fox-sparkles" aria-hidden="true">
              <path d="M38 118 v12 M32 124 h12" />
              <circle cx="178" cy="104" r="3" />
              <path d="M184 123 v8 M180 127 h8" />
            </g>
          </g>
        </svg>
        <span className="companion-click-ring" key={reaction} aria-hidden="true" />
      </button>
      <button className="companion-close" onClick={() => setVisible(false)} aria-label="Ocultar mascota">×</button>
    </div>
  );
}
