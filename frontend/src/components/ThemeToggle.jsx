import { useEffect, useState } from 'react';

function readStoredTheme() {
  try {
    const stored = localStorage.getItem('sinergia_theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}
  return 'light';
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => readStoredTheme() === 'dark');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    try { localStorage.setItem('sinergia_theme', dark ? 'dark' : 'light'); } catch {}
  }, [dark]);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setDark((v) => !v)}
      aria-pressed={dark}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
    >
      <span aria-hidden="true">{dark ? '☀' : '☾'}</span>
    </button>
  );
}
