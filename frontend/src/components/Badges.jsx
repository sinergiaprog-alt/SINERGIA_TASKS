const TIPO_PROBLEMA_LABELS = {
  OTROS: 'Problema reportado',
};

export function ProblemaTag({ tipoProblemaOtro, problemaDescripcion }) {
  const label = problemaDescripcion || tipoProblemaOtro || 'Problema reportado';
  return (
    <span className="problem-chip text-[11px] font-medium px-2 py-0.5 rounded-sm max-w-full truncate" title={label}>
      ⚠ Problema: {label}
    </span>
  );
}

export { TIPO_PROBLEMA_LABELS };

function areaLabel(area) {
  const known = { PROGRAMACION: 'PROGRAMACIÓN', SOPORTE: 'SOPORTE' };
  return known[area] || area;
}

export function AreaTag({ area }) {
  const isProg = area === 'PROGRAMACION';
  return (
    <span className="font-mono text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-sm whitespace-nowrap"
      style={{ color: isProg ? 'var(--color-prog)' : 'var(--color-sup)', background: isProg ? 'var(--color-prog-soft)' : 'var(--color-sup-soft)' }}>
      {areaLabel(area)}
    </span>
  );
}

export function AreasTags({ areas = [], fallback }) {
  const list = Array.isArray(areas) && areas.length ? areas : (fallback ? [fallback] : []);
  return <div className="flex flex-wrap gap-1.5">{list.map((area) => <AreaTag key={area} area={area} />)}</div>;
}

const ESTADO_META = {
  PENDIENTE: { label: 'Pendiente', color: 'var(--color-pend)' },
  PROGRESO: { label: 'En progreso', color: 'var(--color-progreso)' },
  COMPLETADA: { label: 'Completada', color: 'var(--color-completo)' },
};

export function EstadoDot({ estado }) {
  const meta = ESTADO_META[estado] || ESTADO_META.PENDIENTE;
  return <span className="inline-flex items-center gap-1.5 text-xs text-ink/70"><span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />{meta.label}</span>;
}

const PRIORIDAD_META = { BAJA: 'var(--color-pend)', MEDIA: 'var(--color-progreso)', ALTA: 'var(--color-revision)', URGENTE: 'var(--color-urgente)' };
export function PrioridadTag({ prioridad }) {
  return <span className="font-mono text-[10px] font-semibold uppercase px-1.5 py-0.5 border rounded-sm whitespace-nowrap" style={{ color: PRIORIDAD_META[prioridad], borderColor: PRIORIDAD_META[prioridad] }}>{prioridad}</span>;
}

export function ProgressMeter({ porcentaje, total }) {
  if (total === 0) return <span className="text-xs text-ink/40 font-mono">Sin tareas</span>;
  return <div className="flex items-center gap-3 w-full"><div className="flex-1 h-1.5 rounded-full bg-[var(--color-line)] overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${porcentaje}%`, background: porcentaje === 100 ? 'var(--color-completo)' : 'var(--color-prog)' }} /></div><span className="font-mono text-xs font-semibold tabular-nums w-10 text-right">{porcentaje}%</span></div>;
}
