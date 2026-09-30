import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const ROLES = ['ADMIN', 'COLABORADOR', 'SOPORTE', 'PROGRAMACION', 'CONTABILIDAD'];
const USER_AREAS = ['PROGRAMACION', 'SOPORTE', 'CONTABILIDAD'];
const areaLabel = (a) => ({ PROGRAMACION: 'Programación', SOPORTE: 'Soporte', CONTABILIDAD: 'Contabilidad' }[a] || a);

function AccountTypeTabs({ value, onChange }) {
  const items = [
    { id: 'CORREO', icon: '✉', title: 'Correo', text: 'Email + contraseña' },
    { id: 'TELEFONO', icon: '⌕', title: 'Teléfono', text: 'SMS / número' },
    { id: 'INVITADO', icon: '◌', title: 'Invitado', text: 'ID para acceso controlado' },
  ];
  return <div className="account-type-grid">{items.map(item => <button type="button" key={item.id} className={`account-type-card ${value===item.id?'is-selected':''}`} onClick={()=>onChange(item.id)}><span className="account-type-icon">{item.icon}</span><span><b>{item.title}</b><small>{item.text}</small></span></button>)}</div>;
}
function AreaEditor({ value, onChange }) {
  const toggle = (a) => onChange(value.includes(a) ? value.filter(x => x !== a) : [...value, a]);
  return <div className="field-block"><div className="field-head"><span className="field-label">Áreas del usuario</span><small>Contabilidad sigue siendo un área de usuario; solo está separada de las áreas de proyecto.</small></div><div className="area-picker">{USER_AREAS.map(a => <label key={a} className={`area-option ${value.includes(a)?'selected':''}`}><input type="checkbox" checked={value.includes(a)} onChange={()=>toggle(a)}/><span>{areaLabel(a)}</span></label>)}</div></div>;
}

export default function Users() {
  const [users,setUsers]=useState([]);
  const [form,setForm]=useState({nombre:'',email:'',password:'',telefono:'',role:'COLABORADOR',areas:[],departamento:'',tipoCuenta:'CORREO'});
  const [error,setError]=useState(''); const [ok,setOk]=useState(''); const [editandoId,setEditandoId]=useState(null);
  async function load(){try{const r=await api.get('/users');setUsers(r.data.users||[]);}catch(e){setError(e.response?.data?.error||'No se pudieron cargar los usuarios.');}}
  useEffect(()=>{load();},[]);
  const reset=()=>setForm({nombre:'',email:'',password:'',telefono:'',role:'COLABORADOR',areas:[],departamento:'',tipoCuenta:'CORREO'});
  async function submit(e){e.preventDefault();setError('');setOk('');try{const r=await api.post('/users',form);const created=r.data.user;setOk(created?.tipoCuenta==='INVITADO' ? `Invitado creado. ID: ${created.invitadoId}` : 'Usuario creado correctamente.');reset();await load();}catch(e){setError(e.response?.data?.error||'No se pudo crear el usuario.');}}
  async function guardarEdicion(id,cambios){setError('');try{await api.patch(`/users/${id}`,cambios);setEditandoId(null);await load();}catch(e){setError(e.response?.data?.error||'No se pudo guardar el usuario.');}}
  const counts=useMemo(()=>({total:users.length, activos:users.filter(u=>u.activo).length, invitados:users.filter(u=>u.tipoCuenta==='INVITADO').length, contabilidad:users.filter(u=>(u.areas||[]).includes('CONTABILIDAD')).length}),[users]);
  return <div className="page-shell wide-page users-page">
    <div className="page-header"><div><p className="eyebrow">SINERGIA · ADMINISTRACIÓN</p><h1 className="page-title">Usuarios y accesos</h1><p className="page-subtitle">Crea cuentas de correo, teléfono o invitados con acceso por proyecto.</p></div></div>
    <div className="users-stats"><Stat label="Usuarios" value={counts.total}/><Stat label="Activos" value={counts.activos}/><Stat label="Invitados" value={counts.invitados}/><Stat label="Contabilidad" value={counts.contabilidad}/></div>
    <form onSubmit={submit} className="form-card user-create-card">
      <div className="form-section-title"><span>Nueva cuenta</span><small>La cuenta por correo funciona como antes: el administrador define email y contraseña.</small></div>
      <AccountTypeTabs value={form.tipoCuenta} onChange={tipoCuenta=>setForm({...form,tipoCuenta})}/>
      <div className="form-grid">
        <label className="field"><span className="field-label">Nombre</span><input className="input" value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} required/></label>
        {form.tipoCuenta==='CORREO' && <><label className="field"><span className="field-label">Correo</span><input type="email" className="input" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="nombre@empresa.com" required/></label><label className="field"><span className="field-label">Contraseña</span><input type="password" minLength={8} className="input" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Mínimo 8 caracteres" required/></label></>}
        {form.tipoCuenta==='TELEFONO' && <label className="field"><span className="field-label">Teléfono</span><input className="input" value={form.telefono} onChange={e=>setForm({...form,telefono:e.target.value})} placeholder="+18095551234" required/></label>}
        {form.tipoCuenta==='INVITADO' && <div className="guest-note"><b>El ID se genera automáticamente.</b><span>Después podrás asignar este invitado a proyectos y fases.</span></div>}
        <label className="field"><span className="field-label">Rol</span><select className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></label>
        <label className="field"><span className="field-label">Departamento / oficina</span><input className="input" value={form.departamento} onChange={e=>setForm({...form,departamento:e.target.value})} placeholder="Ej. Contabilidad"/></label>
      </div>
      <AreaEditor value={form.areas} onChange={areas=>setForm({...form,areas})}/>
      {error&&<div className="alert-error mt-4">{error}</div>}{ok&&<div className="alert-success mt-4">{ok}</div>}
      <div className="form-actions"><button className="btn btn-primary">{form.tipoCuenta==='INVITADO'?'Crear invitado':'Crear cuenta'}</button></div>
    </form>
    <div className="section-card users-list-card"><div className="section-card-head"><div><h2 className="section-title">Cuentas registradas</h2><p className="section-description">Los invitados conservan su ID para asignarlos a proyectos o fases.</p></div><button className="btn btn-secondary btn-small" onClick={load}>↻ Actualizar</button></div><div className="user-list-v2">{users.map(u=><UserRow key={u.id} user={u} editando={editandoId===u.id} onEditar={()=>setEditandoId(u.id)} onCancelar={()=>setEditandoId(null)} onGuardar={c=>guardarEdicion(u.id,c)}/>)}{users.length===0&&<div className="empty-state">Todavía no hay usuarios.</div>}</div></div>
  </div>;
}
function Stat({label,value}){return <div className="user-stat-card"><span>{label}</span><b>{value}</b></div>}
function UserRow({user,editando,onEditar,onCancelar,onGuardar}){
  const [role,setRole]=useState(user.role); const [areas,setAreas]=useState(user.areas||[]); const [activo,setActivo]=useState(user.activo); const [departamento,setDepartamento]=useState(user.departamento||''); const [telefono,setTelefono]=useState(user.telefono||'');
  if(!editando)return <div className="user-row-v2"><div className="user-avatar-v2">{(user.nombre||'U').slice(0,1).toUpperCase()}</div><div className="user-main-v2"><div className="user-name-line"><b>{user.nombre}</b><span className={`status-pill ${user.activo?'on':'off'}`}>{user.activo?'Activo':'Inactivo'}</span><span className="type-pill">{user.tipoCuenta==='INVITADO'?'Invitado':user.tipoCuenta==='TELEFONO'?'Teléfono':'Correo'}</span></div><div className="user-meta-v2">{user.tipoCuenta==='INVITADO' ? <>ID de invitado: <strong>{user.invitadoId}</strong></> : <>{user.email}{user.telefono?` · ${user.telefono}`:''}</>} {user.departamento?` · ${user.departamento}`:''}</div><div className="user-chips-v2">{(user.areas||[]).map(a=><span key={a} className="mini-chip">{areaLabel(a)}</span>)}<span className="mini-chip muted">{user.role}</span></div></div><button onClick={onEditar} className="btn btn-secondary">Editar</button></div>;
  return <div className="user-edit-v2"><div className="user-edit-title"><b>{user.nombre}</b><span>{user.tipoCuenta==='INVITADO' ? `ID ${user.invitadoId}` : user.email}</span></div><div className="form-grid"><label className="field"><span className="field-label">Departamento / oficina</span><input className="input" value={departamento} onChange={e=>setDepartamento(e.target.value)} /></label><label className="field"><span className="field-label">Teléfono</span><input className="input" value={telefono} onChange={e=>setTelefono(e.target.value)} /></label><label className="field"><span className="field-label">Rol</span><select className="input" value={role} onChange={e=>setRole(e.target.value)}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></label><label className="check-row mt-6"><input type="checkbox" checked={activo} onChange={e=>setActivo(e.target.checked)}/><span><strong>Cuenta activa</strong><small>Permite iniciar sesión.</small></span></label></div><AreaEditor value={areas} onChange={setAreas}/><div className="form-actions"><button onClick={()=>onGuardar({role,areas,activo,departamento,telefono})} className="btn btn-primary">Guardar</button><button onClick={onCancelar} className="btn btn-secondary">Cancelar</button></div></div>;
}
