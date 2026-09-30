import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { cargarClaveProyecto, cifrarContenido } from '../crypto/e2e';
import { Modal, Pill, Progress } from '../components/ui';
import { areaLabel, areasText, estadoProyecto, formatShort, isVencido, proyectoCompleto, saludo } from '../lib/format';

const BASE_AREAS = ['PROGRAMACION', 'SOPORTE'];
const NUEVO_CENTRO_PHASES = [['CONTRATO','Contrato'],['SERVIDOR','Servidor'],['SOFTWARE','Software'],['EQUIPOS','Equipos'],['RED','Red'],['INTEGRACION','Integración'],['TRANSPORTE','Transporte'],['IMPLEMENTACION','Implementación']];
const ASUNTOS = [['GENERAL','General'],['NUEVO CENTRO','Nuevo Centro'],['MIGRACION','Migración'],['INTERFAZ','Interfaz'],['CAMBIO DE SERVIDOR','Cambio de servidor'],['FORMULARIOS','Formularios'],['REPORTES','Reportes'],['AGG EQUIPOS','Agregación de equipos'],['OTROS','Otros']];

const VISTAS = [['active', 'Activos'], ['completed', 'Completados'], ['archived', 'Archivados']];
const HOME_LIMIT = 6;

/** mode="home" → Inicio (resumen + proyectos activos). mode="list" → Proyectos (lista completa con filtros). */
export default function Dashboard({ mode = 'home' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const area = searchParams.get('area');
  const { user } = useAuth();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('active');
  const isHome = mode === 'home';
  const techAreas = user?.role === 'ADMIN' ? BASE_AREAS : (user?.areas || []).filter(a => BASE_AREAS.includes(a));
  const canCreate = techAreas.length > 0;

  async function load() {
    try { setError(''); const r = await api.get('/projects', { params: area ? { area } : {} }); setProjects(r.data.projects || []); }
    catch (e) { setError(e.response?.data?.error || 'No se pudieron cargar los proyectos.'); }
  }
  useEffect(() => { load(); }, [area]);

  const groups = useMemo(() => {
    const all = projects || [];
    return {
      active: all.filter(p => p.estado !== 'ARCHIVADO' && !proyectoCompleto(p)),
      completed: all.filter(p => p.estado !== 'ARCHIVADO' && proyectoCompleto(p)),
      archived: all.filter(p => p.estado === 'ARCHIVADO'),
    };
  }, [projects]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = groups[isHome ? 'active' : view];
    return q ? base.filter(p => `${p.nombre} ${p.asunto || ''}`.toLowerCase().includes(q)) : base;
  }, [groups, view, query, isHome]);
  const totals = useMemo(() => groups.active.reduce((t, p) => ({ done: t.done + Number(p.progreso?.completadas || 0), all: t.all + Number(p.progreso?.total || 0) }), { done: 0, all: 0 }), [groups]);
  const enProgreso = groups.active.filter(p => p.estado === 'EN_PROGRESO').length;
  const setArea = (a) => { const next = new URLSearchParams(searchParams); if (a) next.set('area', a); else next.delete('area'); setSearchParams(next); };
  const nombre = (user?.nombre || '').split(' ')[0];
  const visibles = isHome ? shown.slice(0, HOME_LIMIT) : shown;
  const listLink = area ? `/proyectos?area=${area}` : '/proyectos';

  return <div className="sx-page">
    <header className="sx-head">
      <div>
        {isHome ? <><h1>{saludo()}{nombre ? `, ${nombre}` : ''}</h1><p>Resumen de trabajo{area ? ` · ${areaLabel(area)}` : ''}</p></>
          : <><h1>Proyectos</h1><p>{area ? areaLabel(area) : 'Todos los que puedes ver'}</p></>}
      </div>
      {canCreate && <button className="sx-btn primary" onClick={() => setShowForm(true)}>＋ Nuevo proyecto</button>}
    </header>

    {isHome && <section className="sx-stats" aria-label="Resumen">
      <div className="sx-card sx-stat"><span>Proyectos activos</span><strong>{groups.active.length}</strong></div>
      <div className="sx-card sx-stat"><span>Tareas</span><strong>{totals.done}<small>/ {totals.all} completadas</small></strong></div>
      <div className="sx-card sx-stat"><span>En progreso</span><strong>{enProgreso}</strong></div>
    </section>}

    {!isHome && <div className="sx-toolbar">
      <input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar proyecto…" aria-label="Buscar proyecto" />
      <div className="sx-seg" role="tablist" aria-label="Vista">
        {VISTAS.map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l} {groups[k].length}</button>)}
      </div>
      {techAreas.length > 1 && <div className="sx-seg" aria-label="Área">
        <button className={!area ? 'on' : ''} onClick={() => setArea(null)}>Todas</button>
        {techAreas.map(a => <button key={a} className={area === a ? 'on' : ''} onClick={() => setArea(a)}>{areaLabel(a)}</button>)}
      </div>}
    </div>}

    {isHome && <div className="sx-row"><h2 className="sx-h2">Proyectos activos</h2></div>}
    {error && <div className="sx-alert err">{error}</div>}
    {projects === null && !error && <div className="sx-empty">Cargando proyectos…</div>}
    {projects !== null && visibles.length === 0 && <div className="sx-empty">{query ? 'Ningún proyecto coincide con la búsqueda.' : 'No hay proyectos en esta vista.'}</div>}
    {visibles.length > 0 && <div className="sx-list">{visibles.map(p => <ProjectCard key={p.id} project={p} />)}</div>}
    {isHome && shown.length > HOME_LIMIT && <Link to={listLink} className="sx-btn" style={{ alignSelf: 'center' }}>Ver los {shown.length} proyectos →</Link>}
    {isHome && projects !== null && shown.length <= HOME_LIMIT && (groups.completed.length + groups.archived.length > 0) && <Link to={listLink} className="sx-muted sx-small" style={{ alignSelf: 'center' }}>Ver completados y archivados</Link>}

    {showForm && <Modal title="Nuevo proyecto" onClose={() => setShowForm(false)}>
      <NuevoProyectoForm user={user} areaSugerida={area} onCreado={() => { setShowForm(false); load(); }} />
    </Modal>}
  </div>;
}

function ProjectCard({ project: p }) {
  const est = estadoProyecto(p.estado);
  const total = Number(p.progreso?.total || 0);
  const asunto = p.asunto === 'OTROS' ? p.asunto_otro : p.asunto;
  const asuntoLabel = p.asunto === 'OTROS' ? p.asunto_otro : (ASUNTOS.find(([v]) => v === p.asunto)?.[1] || asunto);
  const subtitle = [areasText(p), asuntoLabel && p.asunto !== 'GENERAL' ? asuntoLabel : null].filter(Boolean).join(' · ');
  return <Link to={`/proyectos/${p.id}`} className="sx-card sx-pcard">
    <div>
      <div className="sx-pcard-title">
        <h3>{p.nombre}</h3>
        <Pill tone={est.tone}>{est.label}</Pill>
        {['ALTA', 'URGENTE'].includes(p.prioridad) && <Pill tone="red">{p.prioridad === 'URGENTE' ? 'Urgente' : 'Alta'}</Pill>}
        {p.es_problema && <Pill tone="amber">Problema</Pill>}
        {isVencido(p) && <Pill tone="red">Vencido</Pill>}
      </div>
      <p className="sx-pcard-sub">{subtitle || 'General'}{p.fecha_limite ? ` · Límite ${formatShort(p.fecha_limite)}` : ''}</p>
    </div>
    <div>
      <Progress value={p.progreso?.porcentaje} empty={total === 0} />
      {total > 0 && <p className="sx-small sx-muted" style={{ marginTop: 2 }}>{p.progreso?.completadas || 0}/{total} tareas</p>}
    </div>
    <span className="sx-pcard-go">Ver proyecto →</span>
  </Link>;
}

/* ---- Formulario de creación (lógica original conservada) ---- */
function PhaseBuilder({phases,setPhases}){const add=()=>setPhases([...phases,{clave:`FASE_${phases.length+1}`,nombre:`Fase ${phases.length+1}`,orden:phases.length+1}]);const remove=i=>setPhases(phases.filter((_,idx)=>idx!==i).map((p,idx)=>({...p,orden:idx+1})));const update=(i,key,val)=>setPhases(phases.map((p,idx)=>idx===i?{...p,[key]:val}:p));return <div className="field-block field-wide phase-builder"><div className="phase-builder-head"><div><span className="field-label">Fases del proyecto</span><p className="field-help">Opcionales. Puedes trabajar directamente con tareas o agruparlas por fases.</p></div><button type="button" className="btn btn-secondary btn-small" onClick={add}>+ Agregar fase</button></div>{phases.length===0?<div className="phase-empty">No se han agregado fases.</div>:<div className="phase-list">{phases.map((p,i)=><div className="phase-editor-row" key={`${p.clave}-${i}`}><span className="phase-order">{i+1}</span><input className="input" value={p.nombre} onChange={e=>update(i,'nombre',e.target.value)} placeholder="Nombre de fase"/><input className="input phase-key" value={p.clave} onChange={e=>update(i,'clave',e.target.value.toUpperCase().replace(/\s+/g,'_'))} placeholder="CLAVE"/><button type="button" className="btn btn-danger btn-small" onClick={()=>remove(i)}>Quitar</button></div>)}</div>}</div>}
function PhaseAreaAccess({phases,value,onChange}){const areas=['PROGRAMACION','SOPORTE','CONTABILIDAD'];const labels={PROGRAMACION:'Programación',SOPORTE:'Soporte',CONTABILIDAD:'Contabilidad'};const toggle=(fase,area)=>{const current=value?.[area]||[];const next=current.includes(fase)?current.filter(v=>v!==fase):[...current,fase];onChange({...value,[area]:next});};return <div className="field-block field-wide permission-panel"><div><span className="field-label">Asignación de fases por área</span><p className="field-help">Define qué fases puede consultar y trabajar cada área. Esto aplica a Programación, Soporte y Contabilidad.</p></div>{phases.length===0?<div className="phase-empty">Agrega primero las fases del proyecto.</div>:<div className="phase-access-grid">{phases.map(p=><div key={p.clave} className="phase-access-row"><strong>{p.nombre}</strong><div className="area-picker">{areas.map(area=><label key={area} className={`area-option ${(value?.[area]||[]).includes(p.clave)?'selected':''}`}><input type="checkbox" checked={(value?.[area]||[]).includes(p.clave)} onChange={()=>toggle(p.clave,area)}/>{labels[area]}</label>)}</div></div>)}</div>}</div>}
function MultiAreaSelector({value,onChange,allowedAreas}){const toggle=a=>onChange(value.includes(a)?value.filter(x=>x!==a):[...value,a]);return <div className="field-block"><span className="field-label">Área técnica</span><div className="area-picker">{allowedAreas.map(a=><label key={a} className={`area-option ${value.includes(a)?'selected':''}`}><input type="checkbox" checked={value.includes(a)} onChange={()=>toggle(a)}/>{a==='PROGRAMACION'?'Programación':'Soporte'}</label>)}</div><p className="field-help">Las áreas principales del proyecto siguen siendo Programación y Soporte. Contabilidad se asigna mediante fases.</p></div>}
function NuevoProyectoForm({user,areaSugerida,onCreado}){const allowed=user?.role==='ADMIN'?BASE_AREAS:(user?.areas||[]).filter(a=>BASE_AREAS.includes(a));const initial=areaSugerida&&allowed.includes(areaSugerida)?[areaSugerida]:(allowed[0]?[allowed[0]]:[]);const [nombre,setNombre]=useState('');const [descripcion,setDescripcion]=useState('');const [areas,setAreas]=useState(initial);const [prioridad,setPrioridad]=useState('MEDIA');const [asunto,setAsunto]=useState('GENERAL');const [asuntoOtro,setAsuntoOtro]=useState('');const [fechaLimite,setFechaLimite]=useState('');const [problema,setProblema]=useState(false);const [problemaDescripcion,setProblemaDescripcion]=useState('');const [phases,setPhases]=useState([]);const [phasePermissions,setPhasePermissions]=useState({PROGRAMACION:[],SOPORTE:[],CONTABILIDAD:[]});const [error,setError]=useState('');useEffect(()=>{if(asunto==='NUEVO CENTRO'&&phases.length===0)setPhases(NUEVO_CENTRO_PHASES.map(([clave,nombre],i)=>({clave,nombre,orden:i+1})));},[asunto]);async function submit(e){e.preventDefault();setError('');if(!areas.length){setError('Selecciona al menos un área técnica.');return;}try{const created=await api.post('/projects',{nombre,areas,area:areas[0],prioridad,asunto,asuntoOtro:asunto==='OTROS'?asuntoOtro:undefined,fechaLimite:fechaLimite||undefined,esProblema:problema,problemaDescripcion:problema?problemaDescripcion:undefined,phases,phasePermissions:user?.role==='ADMIN'?phasePermissions:{}});const projectId=created.data.project.id;if(descripcion.trim()||(problema&&problemaDescripcion.trim())){const key=await cargarClaveProyecto(projectId,api);const updates={};if(descripcion.trim()){const c=await cifrarContenido(key,descripcion.trim());updates.descripcionCifrada=c.cifradoB64;updates.descripcionIv=c.ivB64;}if(problema&&problemaDescripcion.trim()){const c=await cifrarContenido(key,problemaDescripcion.trim());updates.esProblema=true;updates.problemaDescripcionCifrada=c.cifradoB64;updates.problemaDescripcionIv=c.ivB64;}await api.patch(`/projects/${projectId}`,updates);}onCreado();}catch(err){setError(err.response?.data?.error||'No se pudo crear el proyecto.');}}return <form onSubmit={submit} className="form-card project-create-form mb-8"><div className="form-section-title"><span>Nuevo proyecto</span><small>Define desde aquí áreas, fases y accesos especiales.</small></div><div className="form-grid"><label className="field field-wide"><span className="field-label">Nombre</span><input className="input" value={nombre} onChange={e=>setNombre(e.target.value)} required placeholder="Ej. Migración de servidor"/></label><label className="field"><span className="field-label">Asunto</span><select className="input" value={asunto} onChange={e=>setAsunto(e.target.value)}>{ASUNTOS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>{asunto==='OTROS'&&<label className="field"><span className="field-label">Asunto específico</span><input className="input" value={asuntoOtro} onChange={e=>setAsuntoOtro(e.target.value)} required/></label>}<label className="field"><span className="field-label">Fecha límite</span><input type="date" className="input" value={fechaLimite} onChange={e=>setFechaLimite(e.target.value)}/></label><label className="field"><span className="field-label">Prioridad</span><select className="input" value={prioridad} onChange={e=>setPrioridad(e.target.value)}><option>BAJA</option><option>MEDIA</option><option>ALTA</option><option>URGENTE</option></select></label></div><MultiAreaSelector value={areas} onChange={setAreas} allowedAreas={allowed}/><PhaseBuilder phases={phases} setPhases={setPhases}/>{user?.role==='ADMIN'&&<PhaseAreaAccess phases={phases} value={phasePermissions} onChange={setPhasePermissions}/>}<label className="field"><span className="field-label">Descripción</span><textarea className="input min-h-24" value={descripcion} onChange={e=>setDescripcion(e.target.value)} placeholder="Describe brevemente el objetivo del proyecto…"/></label><label className="check-row"><input type="checkbox" checked={problema} onChange={e=>{setProblema(e.target.checked);if(!e.target.checked)setProblemaDescripcion('')}}/><span><strong>Es un error/problema reportado</strong><small>Activa este campo solo cuando corresponda.</small></span></label>{problema&&<label className="field"><span className="field-label">Descripción del problema</span><textarea className="input min-h-24" value={problemaDescripcion} onChange={e=>setProblemaDescripcion(e.target.value)} required/></label>}{error&&<div className="alert-error">{error}</div>}<div className="form-actions"><button type="submit" className="btn btn-primary" disabled={!areas.length}>Crear proyecto</button></div></form>}
