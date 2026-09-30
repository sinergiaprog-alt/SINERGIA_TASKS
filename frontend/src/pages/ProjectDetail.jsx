import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { Menu, Modal, Pill, Progress, Section } from '../components/ui';
import { areasText, estadoProyecto, formatDateOnly as fmtFecha, formatDateTime, formatHM, isVencido } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { cargarClaveProyecto, cifrarContenido, descifrarContenido, descifrarBytesProyecto, fromBase64, e2eDisponible, ensureE2E, importarClavePublica, envolverClaveDeContenido } from '../crypto/e2e';


const BASE_AREAS = ['PROGRAMACION', 'SOPORTE'];
const ASUNTOS = [['GENERAL','General'],['NUEVO CENTRO','Nuevo Centro'],['MIGRACION','Migración'],['INTERFAZ','Interfaz'],['CAMBIO DE SERVIDOR','Cambio de servidor'],['FORMULARIOS','Formularios'],['REPORTES','Reportes'],['OTROS','Otros']];

export default function ProjectDetail() {
  const { id } = useParams(); const navigate = useNavigate(); const { user } = useAuth(); const accountingOnly = user?.role !== 'ADMIN' && user?.areas?.includes('CONTABILIDAD') && !user?.areas?.some(a => a === 'PROGRAMACION' || a === 'SOPORTE');
  const [project,setProject]=useState(null); const [phases,setPhases]=useState([]); const [tasks,setTasks]=useState([]); const [archivos,setArchivos]=useState([]); const [comments,setComments]=useState([]); const [transfers,setTransfers]=useState([]); const [issues,setIssues]=useState([]); const [participants,setParticipants]=useState([]); const [allUsers,setAllUsers]=useState([]); const [participantUser,setParticipantUser]=useState(''); const [participantEdit,setParticipantEdit]=useState(false); const [newIssue,setNewIssue]=useState({titulo:'',descripcion:'',prioridad:'MEDIA'});
  const [nuevoTitulo,setNuevoTitulo]=useState(''); const [nuevaFase,setNuevaFase]=useState(''); const [newPhaseName,setNewPhaseName]=useState(''); const [celebrar,setCelebrar]=useState(false); const [error,setError]=useState(''); const [editando,setEditando]=useState(false); const [subiendo,setSubiendo]=useState(false);
  const [participantPhase,setParticipantPhase]=useState(''); const [preview,setPreview]=useState(null); const [e2eLocked,setE2eLocked]=useState(!e2eDisponible()); const [e2ePassword,setE2ePassword]=useState(''); const [e2eUnlocking,setE2eUnlocking]=useState(false); const [e2eUnlockError,setE2eUnlockError]=useState(''); const [previewLoading,setPreviewLoading]=useState(false); const [comment,setComment]=useState(''); const [transferOpen,setTransferOpen]=useState(false); const [transferAreas,setTransferAreas]=useState([]); const [transferComment,setTransferComment]=useState('');
  const [showNewTask,setShowNewTask]=useState(false); const [faseFiltro,setFaseFiltro]=useState(''); const [showAddPart,setShowAddPart]=useState(false); const [showNewIssue,setShowNewIssue]=useState(false);
  // Estos valores dependen del proyecto cargado; deben calcularse después de inicializar su estado.
  const nuevoCentro = project?.asunto === 'NUEVO CENTRO';
  const workflowBlocked = !accountingOnly && !!project?.accounting_gate?.bloqueado;

  async function descifrarLista(items, field, ivField, text = true) {
    return Promise.all((items || []).map(async (item) => {
      if (!item[field] || !item[ivField]) return item;
      try { return { ...item, [field]: await descifrarContenido(await cargarClaveProyecto(id, api), { cifradoB64: item[field], ivB64: item[ivField] }, text), [`${field}Cifrado`]: true }; }
      catch { return { ...item, [field]: 'Contenido cifrado no disponible para este usuario.' }; }
    }));
  }

  async function cargar() {
    try {
      setError('');
      const [pRes,tRes,fRes,cRes,trRes,iRes,partRes,userRes] = await Promise.all([
        api.get(`/projects/${id}`), api.get(`/tasks/project/${id}`),
        accountingOnly ? Promise.resolve({data:{files:[]}}) : api.get(`/files/project/${id}`),
        accountingOnly ? Promise.resolve({data:{comments:[]}}) : api.get(`/comments/project/${id}`),
        accountingOnly ? Promise.resolve({data:{transfers:[]}}) : api.get(`/transfers/${id}`),
        accountingOnly ? Promise.resolve({data:{issues:[]}}) : api.get(`/issues/project/${id}`),
        api.get(`/participants/project/${id}`).catch(()=>({data:{participants:[]}})),
        user?.role === 'ADMIN' ? api.get('/users').catch(()=>({data:{users:[]}})) : Promise.resolve({data:{users:[]}}),
      ]);
      const p = pRes.data.project;
      if (accountingOnly) {
        const metadataTasks = (tRes.data.tasks || []).map(t => t.descripcion_iv ? { ...t, descripcion: null } : t);
        p.descripcion = p.descripcion_iv ? null : p.descripcion;
        p.problema_descripcion = p.problema_descripcion_cifrado ? null : p.problema_descripcion;
        setProject(p);
        setPhases(Array.isArray(p.phases) ? p.phases : []);
        setTasks(metadataTasks);
        setArchivos([]);
        setComments([]);
        setTransfers([]);
        setIssues([]);
        setParticipants(partRes.data.participants || []);
        setAllUsers([]);
        setTransferAreas([]);
        return;
      }

      await cargarClaveProyecto(id, api);
      if (p.descripcion_iv) { try { p.descripcion = await descifrarContenido(await cargarClaveProyecto(id, api), {cifradoB64:p.descripcion,ivB64:p.descripcion_iv},true); } catch { p.descripcion='Descripción cifrada no disponible para este usuario.'; } }
      if (p.problema_descripcion_cifrado && p.problema_descripcion_iv) { try { p.problema_descripcion = await descifrarContenido(await cargarClaveProyecto(id, api), {cifradoB64:p.problema_descripcion_cifrado,ivB64:p.problema_descripcion_iv},true); } catch { p.problema_descripcion='Descripción cifrada no disponible para este usuario.'; } }
      const key = await cargarClaveProyecto(id, api);
      const [tasksDec, commentsDec, issuesDec] = await Promise.all([
        Promise.all(tRes.data.tasks.map(async t => t.descripcion_iv ? {...t,descripcion:await descifrarContenido(key,{cifradoB64:t.descripcion,ivB64:t.descripcion_iv},true).catch(()=> 'Descripción cifrada no disponible para este usuario.')} : t)),
        Promise.all(cRes.data.comments.map(async c => c.contenido_iv ? {...c,contenido:await descifrarContenido(key,{cifradoB64:c.contenido,ivB64:c.contenido_iv},true).catch(()=> 'Comentario cifrado no disponible para este usuario.')} : c)),
        Promise.all(iRes.data.issues.map(async x => { const y={...x}; if(y.descripcion_iv)y.descripcion=await descifrarContenido(key,{cifradoB64:y.descripcion,ivB64:y.descripcion_iv},true).catch(()=> 'Descripción cifrada no disponible para este usuario.'); if(y.solucion_iv)y.solucion=await descifrarContenido(key,{cifradoB64:y.solucion,ivB64:y.solucion_iv},true).catch(()=> 'Solución cifrada no disponible para este usuario.'); return y; }))
      ]);
      setProject(p); setPhases(Array.isArray(p.phases) ? p.phases : []); setTasks(tasksDec); setArchivos(fRes.data.files); setComments(commentsDec); setTransfers(trRes.data.transfers); setIssues(issuesDec); setParticipants(partRes.data.participants || []);
      setAllUsers(Array.isArray(userRes.data?.users) ? userRes.data.users : []);
      setTransferAreas(p.areas || (p.area ? [p.area] : []));
    } catch(err){setError(err.response?.data?.error||err.message||'No se pudo cargar el proyecto.');}
  }
  async function desbloquearE2E(e){
    e.preventDefault();
    setE2eUnlockError(''); setE2eUnlocking(true);
    try {
      await ensureE2E(e2ePassword, api);
      setE2ePassword('');
      setE2eLocked(false);
      await cargar();
    } catch (err) {
      setE2eUnlockError(err?.response?.data?.error || err?.message || 'No se pudo desbloquear el cifrado E2E.');
    } finally { setE2eUnlocking(false); }
  }

  useEffect(()=>{
    if (accountingOnly) { setE2eLocked(false); cargar(); return; }
    if (e2eDisponible()) { setE2eLocked(false); cargar(); }
    else { setE2eLocked(true); setError(''); }
  },[id,user?.role,accountingOnly]);
  // El reloj del cronómetro vive en su propio componente (TaskTimer) para
  // que solo esa tarea se vuelva a renderizar cada segundo, en vez de
  // refrescar toda la página de proyecto (tareas, archivos, comentarios…)
  // cada segundo — eso hacía sentir el sistema muy lento en proyectos con
  // muchas tareas o archivos.

  async function cambiarEstadoTarea(task,nuevoEstado){
    if(!nuevoEstado||nuevoEstado===task.estado)return;
    try{
      const res=await api.patch(`/tasks/${task.id}`,{estado:nuevoEstado});
      const progreso=res.data.progreso;
      setTasks(ts=>ts.map(t=>t.id===task.id?res.data.task:t));
      const completadasAhora = Number(progreso?.total||0)>0 && Number(progreso?.porcentaje||0)>=100;
      setProject(p=>({...p,progreso,estado:completadasAhora?'COMPLETADO':(p.estado==='COMPLETADO'?(Number(progreso?.completadas||0)>0?'EN_PROGRESO':'PENDIENTE'):p.estado)}));

      if(res.data.celebracion){
        setCelebrar(true);
        window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'complete',message:'🎉 ¡Proyecto terminado!'}}));
      }else{
        window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:nuevoEstado==='COMPLETADA'?'complete':'work',message:nuevoEstado==='COMPLETADA'?'¡Tarea completada!':'¡Etapa actualizada!'}}));
      }
      setError('');
    }catch(err){setError(err.response?.data?.error||'No se pudo actualizar la tarea.');}
  }
async function reiniciarTarea(task){if(task.estado==='PENDIENTE')return;if(!window.confirm(`¿Reiniciar la tarea "${task.titulo}" y devolverla a Pendiente?`))return;await cambiarEstadoTarea(task,'PENDIENTE');}
  async function bloquearTarea(task){
    if(!!task.bloqueada)return;
    try{const res=await api.post(`/tasks/${task.id}/bloquear`);setTasks(ts=>ts.map(t=>t.id===task.id?res.data.task:t));window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'work',message:'Tarea bloqueada.'}}));setError('');}catch(err){setError(err.response?.data?.error||'No se pudo bloquear la tarea.');}
  }
  async function desbloquearTarea(task){
    try{const res=await api.post(`/tasks/${task.id}/desbloquear`);setTasks(ts=>ts.map(t=>t.id===task.id?res.data.task:t));window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'work',message:'Tarea desbloqueada. Ya puedes continuar.'}}));setError('');}catch(err){setError(err.response?.data?.error||'No se pudo desbloquear la tarea.');}
  }
  async function eliminarTarea(task){if(!window.confirm(`¿Eliminar la tarea "${task.titulo}"?`))return;try{const res=await api.delete(`/tasks/${task.id}?confirm=true`);setTasks(ts=>ts.filter(t=>t.id!==task.id));setProject(p=>({...p,progreso:res.data.progreso}));window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'delete',message:'Tarea eliminada. Seguimos adelante.'}}));}catch(err){setError(err.response?.data?.error||'No se pudo eliminar la tarea.');}}
  async function crearTarea(e){e.preventDefault();if(!nuevoTitulo.trim())return;try{const fase=phases.find(p=>p.clave===nuevaFase);const res=await api.post(`/tasks/project/${id}`,{titulo:nuevoTitulo.trim(),fase:nuevaFase||null,faseOrden:fase?.orden||null});setTasks(ts=>[...ts,res.data.task]);setProject(p=>({...p,progreso:res.data.progreso}));window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'create',message:'¡Nueva tarea creada!'}}));setNuevoTitulo('');setNuevaFase('');setError('');}catch(err){setError(err.response?.data?.error||'No se pudo crear la tarea.');}}
  async function cronometro(task,accion){try{const res=await api.post(`/tasks/${task.id}/cronometro/${accion}`);if(accion==='iniciar')setTasks(ts=>ts.map(t=>t.id===task.id?{...t,cronometro_inicio:res.data.cronometroInicio}:t));else setTasks(ts=>ts.map(t=>t.id===task.id?{...t,cronometro_inicio:null,tiempo_trabajado_segundos:res.data.tiempoTrabajadoSegundos}:t));}catch(err){setError(err.response?.data?.error||'No se pudo actualizar el cronómetro.');}}
  async function guardarEdicion(cambios){try{const payload={...cambios};const key=await cargarClaveProyecto(id,api);if(payload.descripcion!==undefined){if(payload.descripcion.trim()){const c=await cifrarContenido(key,payload.descripcion.trim());payload.descripcionCifrada=c.cifradoB64;payload.descripcionIv=c.ivB64;}else{payload.descripcionCifrada='';payload.descripcionIv=null;}delete payload.descripcion;}if(payload.problemaDescripcion!==undefined){if(payload.problemaDescripcion?.trim()){const c=await cifrarContenido(key,payload.problemaDescripcion.trim());payload.problemaDescripcionCifrada=c.cifradoB64;payload.problemaDescripcionIv=c.ivB64;}else{payload.problemaDescripcionCifrada='';payload.problemaDescripcionIv=null;}delete payload.problemaDescripcion;}const res=await api.patch(`/projects/${id}`,payload);const fresh={...res.data.project};if(payload.descripcionCifrada)fresh.descripcion=cambios.descripcion;if(payload.problemaDescripcionCifrada)fresh.problema_descripcion=cambios.problemaDescripcion;setProject(fresh);setEditando(false);setError('');window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'edit',message:'Cambios guardados correctamente y cifrados.'}}));}catch(err){setError(err.response?.data?.error||err.message||'No se pudo guardar el proyecto.');}}
  async function eliminarProyecto(){if(!window.confirm('¿Eliminar este proyecto y todos sus elementos relacionados? Esta acción no se puede deshacer.'))return;try{await api.delete(`/projects/${id}?confirm=true`);window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'delete',message:'Proyecto eliminado.'}}));navigate('/');}catch(err){setError(err.response?.data?.error||'No se pudo eliminar el proyecto.');}}

  async function subirArchivo(e){const archivo=e.target.files?.[0];e.target.value='';if(!archivo)return;setSubiendo(true);setError('');try{const key=await cargarClaveProyecto(id,api);const bytes=new Uint8Array(await archivo.arrayBuffer());const encrypted=await cifrarContenido(key,bytes);const cipherBytes=fromBase64(encrypted.cifradoB64);const fd=new FormData();fd.append('archivo',new Blob([cipherBytes],{type:'application/octet-stream'}),archivo.name);fd.append('tipoOriginal',archivo.type||'application/octet-stream');fd.append('cifrado','true');fd.append('cifradoIv',encrypted.ivB64);const res=await api.post(`/files/project/${id}`,fd);setArchivos(fs=>[res.data.file,...fs]);window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'create',message:'¡Archivo cifrado y agregado!'}}));}catch(err){setError(err.response?.data?.error||err.message||'No se pudo cifrar/subir el archivo.');}finally{setSubiendo(false);}}
  async function eliminarArchivo(fileId){if(!window.confirm('¿Eliminar este archivo? No se puede deshacer.'))return;try{await api.delete(`/files/${fileId}?confirm=true`);setArchivos(fs=>fs.filter(f=>f.id!==fileId));window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'delete',message:'Archivo eliminado.'}}));}catch(err){setError(err.response?.data?.error||'No se pudo eliminar el archivo.');}}
  async function descargarArchivo(file){try{const res=await api.get(`/files/${file.id}/descargar`,{responseType:'blob'});let blob=res.data;if(file.cifrado&&file.cifrado_iv){const bytes=await descifrarBytesProyecto(id,{cifradoB64:await blobToBase64(blob),ivB64:file.cifrado_iv},api);blob=new Blob([bytes],{type:file.tipo||'application/octet-stream'});}const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file.nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(err){setError(err.response?.data?.error||err.message||'No se pudo descargar el archivo.');}}
  async function abrirPreview(file){setPreviewLoading(true);setError('');try{const res=await api.get(`/files/${file.id}/preview`,{responseType:'blob'});let blob=res.data;if(file.cifrado&&file.cifrado_iv){const bytes=await descifrarBytesProyecto(id,{cifradoB64:await blobToBase64(blob),ivB64:file.cifrado_iv},api);blob=new Blob([bytes],{type:file.tipo||'application/octet-stream'});}const url=URL.createObjectURL(blob);setPreview({file,url,kind:getPreviewKind(file.tipo,file.nombre)});}catch(err){setError(err.response?.data?.error||err.message||'No se pudo abrir la vista previa.');}finally{setPreviewLoading(false);}}
  function cerrarPreview(){if(preview?.url)URL.revokeObjectURL(preview.url);setPreview(null);}

  async function agregarComentario(e){e.preventDefault();if(!comment.trim())return;try{const encrypted=await cifrarContenido(await cargarClaveProyecto(id,api),comment.trim());const res=await api.post(`/comments/project/${id}`,{contenido:encrypted.cifradoB64,contenidoIv:encrypted.ivB64});setComments(cs=>[...cs,{...res.data.comment,contenido:comment.trim(),contenido_iv:encrypted.ivB64}]);setComment('');window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'create',message:'Comentario cifrado y agregado.'}}));}catch(err){setError(err.response?.data?.error||err.message||'No se pudo guardar el comentario.');}}
  async function eliminarComentario(c){if(!window.confirm('¿Eliminar este comentario?'))return;try{await api.delete(`/comments/${c.id}?confirm=true`);setComments(cs=>cs.filter(x=>x.id!==c.id));window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'delete',message:'Comentario eliminado.'}}));}catch(err){setError(err.response?.data?.error||'No se pudo eliminar el comentario.');}}

  async function agregarParticipante(e){e.preventDefault();if(!participantUser)return;try{const r=await api.post(`/participants/project/${id}`,{userId:participantUser,puedeEditar:participantEdit,faseId:participantPhase||null});setParticipants(x=>[...x,r.data.participant]);const cryptoInfo=(await api.get(`/crypto/project/${id}`)).data;const member=(cryptoInfo.members||[]).find(m=>m.userId===participantUser);if(member?.publicKeyB64){const key=await cargarClaveProyecto(id,api);const env=await envolverClaveDeContenido(key,await importarClavePublica(member.publicKeyB64));await api.post(`/crypto/project/${id}/envelope`,{userId:participantUser,envelopeB64:env});}setParticipantUser('');setParticipantEdit(false);setParticipantPhase('');}catch(err){setError(err.response?.data?.error||err.message||'No se pudo agregar el participante.');}}
  async function cambiarPermisoParticipante(puede,idp){try{const r=await api.patch(`/participants/${idp}`,{puedeEditar:puede});setParticipants(xs=>xs.map(x=>x.id===idp?{...x,...r.data.participant}:x));}catch(err){setError(err.response?.data?.error||'No se pudo actualizar el participante.');}}
  async function cambiarFaseParticipante(faseId,idp){try{const r=await api.patch(`/participants/${idp}`,{faseId:faseId||null});const fase=phases.find(p=>p.id===faseId);setParticipants(xs=>xs.map(x=>x.id===idp?{...x,...r.data.participant,fase_nombre:fase?.nombre||null,fase_clave:fase?.clave||null}:x));setError('');}catch(err){setError(err.response?.data?.error||'No se pudo actualizar la fase del participante.');}}
  async function quitarParticipante(idp){if(!window.confirm('¿Quitar este participante?'))return;try{await api.delete(`/participants/${idp}?confirm=true`);setParticipants(xs=>xs.filter(x=>x.id!==idp));}catch(err){setError(err.response?.data?.error||'No se pudo quitar el participante.');}}
  async function crearProblema(e){e.preventDefault();if(!newIssue.titulo.trim())return;try{const payload={...newIssue};if(payload.descripcion?.trim()){const c=await cifrarContenido(await cargarClaveProyecto(id,api),payload.descripcion.trim());payload.descripcionCifrada=c.cifradoB64;payload.descripcionIv=c.ivB64;delete payload.descripcion;}const r=await api.post(`/issues/project/${id}`,payload);setIssues(x=>[{...r.data.issue,descripcion:newIssue.descripcion},...x]);setNewIssue({titulo:'',descripcion:'',prioridad:'MEDIA'});setError('');}catch(err){setError(err.response?.data?.error||err.message||'No se pudo crear el problema.');}}
  async function resolverProblema(issue){try{const estado=issue.estado==='RESUELTO'?'REABIERTO':'RESUELTO';const payload={estado};if(estado==='RESUELTO'){const c=await cifrarContenido(await cargarClaveProyecto(id,api),'Resuelto desde Sinergia.');payload.solucionCifrada=c.cifradoB64;payload.solucionIv=c.ivB64;}else if(issue.solucion){const c=await cifrarContenido(await cargarClaveProyecto(id,api),issue.solucion);payload.solucionCifrada=c.cifradoB64;payload.solucionIv=c.ivB64;}const r=await api.patch(`/issues/${issue.id}`,payload);setIssues(xs=>xs.map(x=>x.id===issue.id?{...r.data.issue,solucion:estado==='RESUELTO'?'Resuelto desde Sinergia.':issue.solucion}:x));}catch(err){setError(err.response?.data?.error||err.message||'No se pudo actualizar el problema.');}}

  async function agregarFase(e){e.preventDefault();if(!newPhaseName.trim())return;try{const r=await api.post(`/projects/${id}/phases`,{nombre:newPhaseName.trim()});setPhases(xs=>[...xs,r.data.phase].sort((a,b)=>a.orden-b.orden));setNewPhaseName('');setError('');}catch(err){setError(err.response?.data?.error||'No se pudo crear la fase.');}}

  async function transferir(e){
    e.preventDefault();
    const actuales = project?.areas || (project?.area ? [project.area] : []);
    const destinos = [...new Set(transferAreas)];
    if(!destinos.length){ setError('Selecciona al menos un área destino.'); return; }
    if(destinos.length === actuales.length && destinos.every(a => actuales.includes(a))){ setError('Selecciona un área diferente para realizar la transferencia.'); return; }
    try{
      setError('');
      const res=await api.post(`/transfers/${id}`,{areas:destinos,comentario:transferComment});
      setProject(p=>({...p,...res.data.project,areas:res.data.project.areas||destinos,area:(res.data.project.areas||destinos)[0]}));
      setTransferAreas(res.data.project.areas||destinos);
      setTransferComment('');
      setTransferOpen(false);
      await cargar();
      window.dispatchEvent(new CustomEvent('sinergia:companion',{detail:{action:'complete',message:`Transferencia realizada a ${destinos.map(a=>a==='PROGRAMACION'?'Programación':'Soporte').join(' + ')}.`}}));
    }catch(err){setError(err.response?.data?.error||'No se pudo transferir el proyecto.');}
  }

  const grupos=useMemo(()=>phases.map(phase=>{const faseTasks=tasks.filter(t=>t.fase===phase.clave);const completas=faseTasks.filter(t=>t.estado==='COMPLETADA').length;return{key:phase.clave,label:phase.nombre,tasks:faseTasks,porcentaje:faseTasks.length?Math.round(completas/faseTasks.length*100):0};}),[tasks,phases]);
  const tareasSinFase=useMemo(()=>tasks.filter(t=>!t.fase),[tasks]);
  const actividad=useMemo(()=>{
    const items=[];
    for(const c of comments)items.push({at:c.created_at,text:`${c.autor_nombre||'Alguien'} comentó`});
    for(const t of transfers)items.push({at:t.created_at,text:`${t.usuario_nombre||'Alguien'} transfirió el proyecto a ${(Array.isArray(t.area_nueva)?t.area_nueva:[t.area_nueva]).filter(Boolean).map(a=>a==='PROGRAMACION'?'Programación':a==='SOPORTE'?'Soporte':a).join(' + ')}${t.comentario?` — “${t.comentario}”`:''}`});
    for(const f of archivos)items.push({at:f.created_at||f.createdAt,text:`Se adjuntó ${f.nombre}`});
    for(const i of issues)items.push({at:i.created_at,text:`Problema ${i.estado==='RESUELTO'?'resuelto':'reportado'}: ${i.titulo}`});
    return items.filter(i=>i.at&&!Number.isNaN(new Date(i.at).getTime())).sort((a,b)=>new Date(b.at)-new Date(a.at));
  },[comments,transfers,archivos,issues]);
  if (e2eLocked) return <div className="page-shell flex items-center justify-center min-h-[70vh]">
    <div className="section-card w-full max-w-md">
      <div className="text-center mb-5"><div className="text-4xl mb-3">🔒</div><h1 className="section-title text-lg">Desbloquear cifrado E2E</h1><p className="section-description mt-2">Esta sesión de Sinergia sigue abierta, pero la clave privada se mantiene solo en memoria. Introduce tu contraseña para volver a desbloquear este proyecto.</p></div>
      <form onSubmit={desbloquearE2E} className="space-y-3"><input className="input w-full" type="password" autoFocus autoComplete="current-password" placeholder="Contraseña de Sinergia" value={e2ePassword} onChange={e=>setE2ePassword(e.target.value)} disabled={e2eUnlocking} /><button className="btn btn-primary w-full" disabled={e2eUnlocking || !e2ePassword}>{e2eUnlocking?'Desbloqueando…':'Desbloquear proyecto'}</button></form>
      {e2eUnlockError&&<div className="alert-error mt-4">{e2eUnlockError}</div>}
      <p className="text-xs text-ink/40 mt-4">Por seguridad, la contraseña no se guarda en el navegador.</p>
    </div>
  </div>;
  if(error&&!project)return <div className="page-shell"><div className="alert-error">{error}</div></div>;
  if(!project)return <div className="page-shell"><div className="empty-state">Cargando…</div></div>;

  const isAdmin=user?.role==='ADMIN';
  const canEdit=!accountingOnly&&!workflowBlocked;
  const est=estadoProyecto(project.estado);
  const archivado=project.estado==='ARCHIVADO';
  const totalTareas=Number(project.progreso?.total||0);
  const pct=totalTareas?Number(project.progreso?.porcentaje||0):0;
  const completadasVisibles=tasks.filter(t=>t.estado==='COMPLETADA').length;
  const completadas=Number(project.progreso?.completadas??completadasVisibles);
  const tiempoTotal=tasks.reduce((n,t)=>n+Number(t.tiempo_trabajado_segundos||0),0);
  const faseNombre=clave=>phases.find(p=>p.clave===clave)?.nombre;
  const tareasVisibles=tasks.filter(t=>faseFiltro===''?true:faseFiltro==='__none'?!t.fase:t.fase===faseFiltro);
  const vencido=isVencido(project);
  const archivar=()=>{if(archivado){guardarEdicion({estado:'EN_PROGRESO'});return;}if(window.confirm('¿Archivar este proyecto? Podrás restaurarlo desde el menú ⋮.'))guardarEdicion({estado:'ARCHIVADO'});};
  const taskProps=t=>({task:t,faseNombre:faseNombre(t.fase),onEstado:estado=>cambiarEstadoTarea(t,estado),onReset:()=>reiniciarTarea(t),onDelete:()=>eliminarTarea(t),onCronometro:a=>cronometro(t,a),onBloquear:()=>bloquearTarea(t),onDesbloquear:()=>desbloquearTarea(t),readOnly:workflowBlocked,allowLock:nuevoCentro});

  return <div className="sx-page">
    <div>
      <Link to="/proyectos" className="sx-back">← Proyectos</Link>
      <header className="sx-head" style={{marginTop:4}}>
        <div style={{minWidth:0,flex:'1 1 280px'}}>
          <h1 className="sx-ptitle">{project.nombre}</h1>
          <p>{areasText(project)||'Sin área'} · {est.label}</p>
          <div className="sx-row" style={{marginTop:8}}>
            {project.asunto==='NUEVO CENTRO'&&<Pill tone="accent">Nuevo Centro</Pill>}
            {['ALTA','URGENTE'].includes(project.prioridad)&&<Pill tone="red">{project.prioridad==='URGENTE'?'Urgente':'Alta prioridad'}</Pill>}
            {project.es_problema&&<Pill tone="amber" title={project.problema_descripcion||''}>Problema reportado</Pill>}
            {vencido&&<Pill tone="red">Vencido</Pill>}
            {e2eDisponible()&&<Pill title="Contenido protegido con cifrado E2E">🔒 Cifrado</Pill>}
          </div>
        </div>
        <div className="sx-row">
          {canEdit&&<button type="button" className="sx-btn" onClick={()=>setEditando(true)}>Editar</button>}
          <Menu items={[
            {label:'Transferir',hidden:!canEdit,onClick:()=>setTransferOpen(true)},
            {label:archivado?'Restaurar':'Archivar',hidden:!canEdit,onClick:archivar},
            {label:'Eliminar proyecto',danger:true,hidden:!isAdmin,onClick:eliminarProyecto},
          ]}/>
        </div>
      </header>
    </div>

    {celebrar&&<div className="sx-alert ok">🎉 ¡Felicidades! Has completado el proyecto “{project.nombre}”.</div>}
    {error&&<div className="sx-alert err" role="alert">{error}</div>}
    {workflowBlocked&&<div className="sx-alert warn"><strong>Proyecto bloqueado por el flujo de Nuevo Centro.</strong> Soporte y Programación no pueden modificarlo hasta que Contabilidad complete: {project.accounting_gate.pendientes.map(p=>p.nombre).join(', ')}.</div>}

    <section className="sx-card" style={{padding:16}} aria-label="Resumen">
      <div className="sx-h2">Resumen</div>
      <div style={{display:'flex',alignItems:'center',gap:16,margin:'10px 0 16px'}}>
        <span className="sx-bigpct">{pct}%</span>
        <div style={{flex:1}}><Progress value={pct} empty={totalTareas===0} label={false}/></div>
      </div>
      <div className="sx-facts">
        <div className="sx-fact"><span>Tareas</span><strong>{completadas} / {totalTareas}</strong></div>
        <div className="sx-fact"><span>Participantes</span><strong>{participants.length}</strong></div>
        <div className="sx-fact"><span>Fecha límite</span><strong>{fmtFecha(project.fecha_limite)}</strong></div>
        <div className="sx-fact"><span>Tiempo trabajado</span><strong>{formatHM(tiempoTotal)}</strong></div>
      </div>
      <details className="sx-desc">
        <summary>Detalles del proyecto</summary>
        <dl>
          <div><dt>Asunto</dt><dd>{project.asunto==='OTROS'?(project.asunto_otro||'Otros'):(project.asunto||'General')}</dd></div>
          <div><dt>Inicio</dt><dd>{fmtFecha(project.fecha_inicio)}</dd></div>
          {project.fecha_culminacion&&<div><dt>Culminación</dt><dd>{fmtFecha(project.fecha_culminacion)}</dd></div>}
          {project.centro_cliente&&<div><dt>Centro / cliente</dt><dd>{project.centro_cliente}</dd></div>}
          {project.descripcion&&<div><dt>Descripción</dt><dd className="pre">{project.descripcion}</dd></div>}
          {project.es_problema&&project.problema_descripcion&&<div><dt>Problema</dt><dd className="pre">{project.problema_descripcion}</dd></div>}
        </dl>
      </details>
    </section>

    <Section icon="✓" title="Tareas" count={`${completadasVisibles}/${tasks.length}`} defaultOpen id="tareas">
      <div className="sx-sec-tools">
        {canEdit&&<button type="button" className="sx-btn primary sm" onClick={()=>setShowNewTask(v=>!v)}>{showNewTask?'Cancelar':'＋ Nueva tarea'}</button>}
        {workflowBlocked&&<span className="sx-small sx-muted">Solo consulta mientras Contabilidad termina sus fases.</span>}
        {accountingOnly&&<span className="sx-small sx-muted">Vista limitada a las fases autorizadas.</span>}
      </div>
      {canEdit&&showNewTask&&<form onSubmit={crearTarea} className="sx-inline-form">
        <input className="input" placeholder="Título de la tarea…" value={nuevoTitulo} onChange={e=>setNuevoTitulo(e.target.value)} required autoFocus/>
        {phases.length>0&&<select className="input" style={{flex:'0 1 200px'}} value={nuevaFase} onChange={e=>setNuevaFase(e.target.value)} aria-label="Fase"><option value="">Sin fase</option>{phases.map(p=><option key={p.id} value={p.clave}>{p.nombre}</option>)}</select>}
        <button type="submit" className="sx-btn primary">Agregar</button>
      </form>}
      {phases.length>0&&tasks.length>0&&<div className="sx-chips" role="group" aria-label="Filtrar por fase">
        <button type="button" className={faseFiltro===''?'on':''} onClick={()=>setFaseFiltro('')}>Todas {tasks.length}</button>
        {grupos.map(g=><button type="button" key={g.key} className={faseFiltro===g.key?'on':''} onClick={()=>setFaseFiltro(g.key)}>{g.label} {g.tasks.length}</button>)}
        {tareasSinFase.length>0&&<button type="button" className={faseFiltro==='__none'?'on':''} onClick={()=>setFaseFiltro('__none')}>Sin fase {tareasSinFase.length}</button>}
      </div>}
      {tasks.length===0?<div className="sx-empty">Este proyecto todavía no tiene tareas.</div>
        :tareasVisibles.length===0?<div className="sx-empty">No hay tareas en esta fase.</div>
        :<div className="sx-list">{tareasVisibles.map(t=><TaskItem key={t.id} {...taskProps(t)}/>)}</div>}
    </Section>

    {!accountingOnly&&<Section icon="👥" title="Participantes" count={participants.length} id="participantes">
      {isAdmin&&<div className="sx-sec-tools"><button type="button" className="sx-btn sm" onClick={()=>setShowAddPart(v=>!v)}>{showAddPart?'Cancelar':'＋ Agregar participante'}</button></div>}
      {isAdmin&&showAddPart&&<form onSubmit={agregarParticipante} className="sx-inline-form">
        <select className="input" value={participantUser} onChange={e=>setParticipantUser(e.target.value)} aria-label="Usuario"><option value="">Seleccionar usuario…</option>{allUsers.filter(u=>u.activo&&!participants.some(p=>p.user_id===u.id)).map(u=><option key={u.id} value={u.id}>{u.nombre} · {u.email}</option>)}</select>
        {phases.length>0&&<select className="input" value={participantPhase} onChange={e=>setParticipantPhase(e.target.value)} aria-label="Fase"><option value="">Todas las fases</option>{phases.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}
        <label className="check-row"><input type="checkbox" checked={participantEdit} onChange={e=>setParticipantEdit(e.target.checked)}/><span>Puede editar</span></label>
        <button className="sx-btn primary" disabled={!participantUser}>Agregar</button>
      </form>}
      {isAdmin&&showAddPart&&allUsers.length===0&&<div className="sx-alert warn">No se encontraron usuarios disponibles. Verifica que las cuentas estén activas.</div>}
      {participants.length===0?<div className="sx-empty">No hay participantes adicionales.</div>
        :<div className="sx-grid">{participants.map(p=><article key={p.id} className="sx-person">
          <div><strong>{p.nombre}</strong><span className="sx-small sx-muted">{p.email}</span></div>
          <div className="sx-row"><Pill tone={p.puede_editar?'accent':''}>{p.puede_editar?'Puede editar':'Solo lectura'}</Pill><span className="sx-small sx-muted">{p.fase_nombre?`Fase: ${p.fase_nombre}`:'Todas las fases'}</span></div>
          {isAdmin&&<>
            {phases.length>0&&<select className="input" value={p.fase_id||''} onChange={e=>cambiarFaseParticipante(e.target.value,p.id)} aria-label={`Fase de ${p.nombre}`}><option value="">Todas las fases</option>{phases.map(f=><option key={f.id} value={f.id}>{f.nombre}</option>)}</select>}
            <div className="sx-row"><label className="check-row"><input type="checkbox" checked={!!p.puede_editar} onChange={e=>cambiarPermisoParticipante(e.target.checked,p.id)}/><span>Editar</span></label><span className="sx-spacer"/><button type="button" className="sx-btn danger sm" onClick={()=>quitarParticipante(p.id)}>Quitar</button></div>
          </>}
        </article>)}</div>}
    </Section>}

    <Section icon="🧩" title="Fases" count={phases.length} id="fases">
      {isAdmin&&<form onSubmit={agregarFase} className="sx-inline-form" style={{paddingTop:12}}>
        <input className="input" placeholder="Nombre de la nueva fase" value={newPhaseName} onChange={e=>setNewPhaseName(e.target.value)} required/>
        <button className="sx-btn sm">＋ Agregar fase</button>
      </form>}
      {phases.length===0?<div className="sx-empty">Este proyecto no usa fases. Son opcionales.</div>
        :<div>{grupos.map(g=>{const hechas=g.tasks.filter(t=>t.estado==='COMPLETADA').length;const listo=g.tasks.length>0&&hechas===g.tasks.length;const activa=g.tasks.some(t=>t.estado!=='PENDIENTE');const estado=listo?'Completada':activa?'En progreso':'Pendiente';return <div className="sx-phase" key={g.key}>
          <span className={`sx-task-ico ${listo?'done':activa?'progress':''}`} aria-hidden="true">{listo?'✓':activa?'◐':'○'}</span>
          <div><div className="name">{g.label}</div><div className="sx-small sx-muted">{estado} · {hechas}/{g.tasks.length} tareas</div></div>
          <Progress value={g.porcentaje} empty={g.tasks.length===0}/>
        </div>;})}</div>}
    </Section>

    {!accountingOnly&&<Section icon="📎" title="Archivos" count={archivos.length} id="archivos">
      <div className="sx-sec-tools"><label className={`sx-btn sm ${subiendo||workflowBlocked?'is-disabled':''}`} style={{cursor:'pointer',opacity:subiendo||workflowBlocked?.5:1}}>{subiendo?'Subiendo…':'＋ Subir archivo'}<input type="file" style={{display:'none'}} onChange={subirArchivo} disabled={subiendo||workflowBlocked}/></label></div>
      {archivos.length===0?<div className="sx-empty">No hay archivos adjuntos todavía.</div>
        :<div>{archivos.map(f=><div key={f.id} className="sx-file">
          <div className="sx-file-ico" aria-hidden="true">{fileIcon(f.tipo)}</div>
          <div className="sx-file-main"><b title={f.nombre}>{f.nombre}</b><span className="sx-small sx-muted">{formatoTamano(f.tamano)} · {f.tipo||'archivo'}</span></div>
          <div className="sx-row"><button type="button" className="sx-btn sm" onClick={()=>abrirPreview(f)} disabled={previewLoading}>Vista previa</button><button type="button" className="sx-btn sm" onClick={()=>descargarArchivo(f)}>Descargar</button><Menu label="Acciones del archivo" items={[{label:'Eliminar',danger:true,disabled:workflowBlocked,onClick:()=>eliminarArchivo(f.id)}]}/></div>
        </div>)}</div>}
    </Section>}

    {!accountingOnly&&<Section icon="⚠" title="Problemas" count={issues.length} id="problemas">
      {!workflowBlocked&&<div className="sx-sec-tools"><button type="button" className="sx-btn sm" onClick={()=>setShowNewIssue(v=>!v)}>{showNewIssue?'Cancelar':'＋ Reportar problema'}</button></div>}
      {!workflowBlocked&&showNewIssue&&<form onSubmit={crearProblema} className="sx-inline-form">
        <input className="input" placeholder="Título del problema…" value={newIssue.titulo} onChange={e=>setNewIssue({...newIssue,titulo:e.target.value})}/>
        <select className="input" style={{flex:'0 1 140px'}} value={newIssue.prioridad} onChange={e=>setNewIssue({...newIssue,prioridad:e.target.value})} aria-label="Prioridad"><option>BAJA</option><option>MEDIA</option><option>ALTA</option><option>URGENTE</option></select>
        <textarea className="input" style={{flex:'1 1 100%'}} placeholder="Descripción opcional…" value={newIssue.descripcion} onChange={e=>setNewIssue({...newIssue,descripcion:e.target.value})}/>
        <button className="sx-btn primary">Agregar problema</button>
      </form>}
      {issues.length===0?<div className="sx-empty">No hay problemas registrados.</div>
        :<div className="sx-list">{issues.map(i=><div key={i.id} className="sx-person" style={{flexDirection:'row',alignItems:'flex-start',gap:12}}>
          <div style={{flex:1,minWidth:0}}><strong>{i.titulo}</strong><div className="sx-row" style={{marginTop:4}}><Pill tone={i.estado==='RESUELTO'?'green':'amber'}>{i.estado==='RESUELTO'?'Resuelto':i.estado==='REABIERTO'?'Reabierto':'Abierto'}</Pill><Pill>{i.prioridad}</Pill></div>{i.descripcion&&<p className="sx-small" style={{marginTop:6,whiteSpace:'pre-wrap'}}>{i.descripcion}</p>}</div>
          <button type="button" className="sx-btn sm" disabled={workflowBlocked} onClick={()=>resolverProblema(i)}>{i.estado==='RESUELTO'?'Reabrir':'Resolver'}</button>
        </div>)}</div>}
    </Section>}

    {!accountingOnly&&<Section icon="💬" title="Comentarios" count={comments.length} id="comentarios">
      {comments.length>0&&<div>{comments.map(c=><article key={c.id} className="sx-comment">
        <div className="sx-row"><strong>{c.autor_nombre||'Usuario'}</strong><span className="sx-small sx-muted">{formatDateTime(c.created_at)}</span><span className="sx-spacer"/>{(isAdmin||c.autor_id===user?.id)&&<button type="button" className="sx-btn sm danger" disabled={workflowBlocked} onClick={()=>eliminarComentario(c)}>Eliminar</button>}</div>
        <p>{c.contenido}</p>
      </article>)}</div>}
      {comments.length===0&&<div className="sx-empty">Todavía no hay comentarios.</div>}
      <form onSubmit={agregarComentario} style={{display:'flex',flexDirection:'column',gap:8}}>
        <textarea className="input" value={comment} onChange={e=>setComment(e.target.value)} placeholder="Escribir comentario…" disabled={workflowBlocked} aria-label="Nuevo comentario"/>
        <button className="sx-btn primary" style={{alignSelf:'flex-start'}} type="submit" disabled={workflowBlocked||!comment.trim()}>Comentar</button>
      </form>
    </Section>}

    {!accountingOnly&&<Section icon="🕘" title="Actividad" count={actividad.length} id="actividad">
      {actividad.length===0?<div className="sx-empty">Todavía no hay actividad registrada.</div>
        :<ul className="sx-feed">{actividad.slice(0,30).map((a,i)=><li key={i}><time dateTime={a.at}>{formatDateTime(a.at)}</time><span>{a.text}</span></li>)}</ul>}
      {actividad.length>30&&<p className="sx-small sx-muted">Mostrando los 30 movimientos más recientes.</p>}
    </Section>}

    {editando&&<Modal title="Editar proyecto" onClose={()=>setEditando(false)}><EditarProyectoForm project={project} user={user} onGuardar={guardarEdicion}/></Modal>}
    {transferOpen&&<Modal title="Transferir proyecto" onClose={()=>setTransferOpen(false)}><TransferForm user={user} value={transferAreas} onChange={setTransferAreas} comment={transferComment} setComment={setTransferComment} onSubmit={transferir}/></Modal>}
    {preview&&<PreviewModal preview={preview} onClose={cerrarPreview} onDownload={()=>descargarArchivo(preview.file)}/>}
  </div>;
}

function toInputDate(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10);}
function formatDateOnly(v){if(!v)return '—';const raw=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){const [y,m,d]=raw.split('-').map(Number);return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;}const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(navigator.language||'es-DO',{day:'2-digit',month:'2-digit',year:'numeric'});}

function EditarProyectoForm({project,user,onGuardar}){const [nombre,setNombre]=useState(project.nombre);const [fechaInicio,setFechaInicio]=useState(toInputDate(project.fecha_inicio));const [fechaLimite,setFechaLimite]=useState(toInputDate(project.fecha_limite));const [descripcion,setDescripcion]=useState(project.descripcion||'');const [prioridad,setPrioridad]=useState(project.prioridad);const [estado,setEstado]=useState(project.estado);const [areas,setAreas]=useState(project.areas||[project.area]);const [asunto,setAsunto]=useState(project.asunto||'GENERAL');const [asuntoOtro,setAsuntoOtro]=useState(project.asunto_otro||'');const [problema,setProblema]=useState(!!project.es_problema);const [problemaDescripcion,setProblemaDescripcion]=useState(project.problema_descripcion||project.tipo_problema_otro||'');const allowed=user?.role==='ADMIN'?[...new Set([...(project.areas||[]),...BASE_AREAS])]:[...new Set([...(user?.areas||[]),...(project.areas||[])])];
 function toggle(a){setAreas(xs=>xs.includes(a)?xs.filter(x=>x!==a):[...xs,a]);}
 function submit(e){e.preventDefault();onGuardar({nombre,descripcion,areas,area:areas[0],prioridad,estado,fechaInicio:fechaInicio||null,fechaLimite:fechaLimite||null,asunto,asuntoOtro:asunto==='OTROS'?asuntoOtro:undefined,esProblema:problema,problemaDescripcion:problema?problemaDescripcion:undefined,centroCliente:undefined});}
 return <form onSubmit={submit} className="form-card mt-4"><div className="form-grid"><label className="field"><span className="field-label">Nombre</span><input className="input" value={nombre} onChange={e=>setNombre(e.target.value)} required/></label><label className="field"><span className="field-label">Asunto</span><select className="input" value={asunto} onChange={e=>setAsunto(e.target.value)}>{ASUNTOS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>{asunto==='OTROS'&&<label className="field"><span className="field-label">Asunto específico</span><input className="input" value={asuntoOtro} onChange={e=>setAsuntoOtro(e.target.value)} required/></label>}<label className="field"><span className="field-label">Fecha de inicio</span><input type="date" className="input" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}/></label><label className="field"><span className="field-label">Fecha límite</span><input type="date" className="input" value={fechaLimite} onChange={e=>setFechaLimite(e.target.value)}/></label><label className="field"><span className="field-label">Prioridad</span><select className="input" value={prioridad} onChange={e=>setPrioridad(e.target.value)}><option>BAJA</option><option>MEDIA</option><option>ALTA</option><option>URGENTE</option></select></label><label className="field"><span className="field-label">Estado</span><select className="input" value={estado} onChange={e=>setEstado(e.target.value)}><option>PENDIENTE</option><option>EN_PROGRESO</option><option>EN_REVISION</option><option>COMPLETADO</option><option>ARCHIVADO</option></select></label></div><div className="field-block"><span className="field-label">Áreas</span><div className="area-picker">{allowed.map(a=><label key={a} className={`area-option ${areas.includes(a)?'selected':''}`}><input type="checkbox" checked={areas.includes(a)} onChange={()=>toggle(a)}/>{a==='PROGRAMACION'?'Programación':a==='SOPORTE'?'Soporte':a}</label>)}</div><p className="field-help">Puedes mantener varias áreas asignadas al proyecto.</p></div><label className="field"><span className="field-label">Descripción</span><textarea className="input min-h-24" value={descripcion} onChange={e=>setDescripcion(e.target.value)}/></label><label className="check-row"><input type="checkbox" checked={problema} onChange={e=>{setProblema(e.target.checked);if(!e.target.checked)setProblemaDescripcion('')}}/><span><strong>Es un error/problema reportado</strong><small>Solo se mostrará el campo para describirlo.</small></span></label>{problema&&<label className="field"><span className="field-label">Descripción del problema</span><textarea className="input min-h-24" value={problemaDescripcion} onChange={e=>setProblemaDescripcion(e.target.value)} required/></label>}<button className="btn btn-primary" disabled={!areas.length}>Guardar cambios</button></form>}

function TransferForm({user,value,onChange,comment,setComment,onSubmit}){
  const base=user?.role==='ADMIN'?[...new Set([...BASE_AREAS,...value])]:[...new Set([...(user?.areas||[]),...value])];
  const toggle=a=>onChange(value.includes(a)?value.filter(x=>x!==a):[...value,a]);
  const current=value.length?value:[];
  return <form onSubmit={onSubmit} className="transfer-form mb-5">
    <div className="field-label">Áreas destino</div>
    <div className="area-picker">{base.map(a=><label key={a} className={`area-option ${value.includes(a)?'selected':''}`}>
      <input type="checkbox" checked={value.includes(a)} onChange={()=>toggle(a)}/>
      {a==='PROGRAMACION'?'Programación':'Soporte'}
    </label>)}</div>
    <p className="field-help">Selecciona el área o las áreas que asumirán el proyecto. El sistema actualizará las áreas y conservará el historial.</p>
    <textarea className="input min-h-20 mt-3" value={comment} onChange={e=>setComment(e.target.value)} placeholder="Motivo o comentario de la transferencia (opcional)…"/>
    <button className="btn btn-primary mt-3" type="submit" disabled={!current.length}>Confirmar transferencia</button>
  </form>
}

function TaskItem({task,faseNombre,onEstado,onReset,onDelete,onCronometro,onBloquear,onDesbloquear,readOnly=false,allowLock=false}) {
  const [open,setOpen]=useState(false);
  const completada=task.estado==='COMPLETADA';
  const bloqueada=allowLock && !!task.bloqueada;
  const corriendo=!!task.cronometro_inicio;
  const estadoLabels={PENDIENTE:'Pendiente',EN_PROGRESO:'En progreso',EN_REVISION:'En revisión',COMPLETADA:'Completada'};
  const icon={PENDIENTE:['','○'],EN_PROGRESO:['progress','◐'],EN_REVISION:['review','◑'],COMPLETADA:['done','✓']}[task.estado]||['','○'];
  const tone={EN_PROGRESO:'blue',EN_REVISION:'amber',COMPLETADA:'green'}[task.estado]||'';
  return <div className={`sx-task ${bloqueada?'blocked':''}`}>
    <button type="button" className="sx-task-head" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <span className={`sx-task-ico ${icon[0]}`} aria-hidden="true">{icon[1]}</span>
      <span className="sx-task-main">
        <span className={`sx-task-title ${completada?'done':''}`} style={{display:'block'}}>{task.titulo}</span>
        <span className="sx-task-meta">
          <Pill tone={tone}>{estadoLabels[task.estado]||task.estado}</Pill>
          {faseNombre&&<span>Fase: {faseNombre}</span>}
          {bloqueada&&<Pill tone="red">🔒 Bloqueada</Pill>}
          {corriendo&&<Pill tone="green">● En curso</Pill>}
          {task.depende_de&&<span>Depende de: {task.depende_de}</span>}
        </span>
      </span>
      <span className="sx-chev" aria-hidden="true" style={{transform:open?'rotate(90deg)':undefined}}>▶</span>
    </button>
    {open&&<div className="sx-task-body">
      {readOnly?<span className="sx-small sx-muted">Solo consulta en esta fase.</span>:<>
        <select disabled={bloqueada} className="input" value={task.estado||'PENDIENTE'} onChange={e=>onEstado(e.target.value)} aria-label={`Estado de ${task.titulo}`}>{Object.entries(estadoLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <span className={`sx-timer ${corriendo?'on':''}`}><TaskTimer corriendo={corriendo} base={Number(task.tiempo_trabajado_segundos||0)} inicio={task.cronometro_inicio}/></span>
        <button type="button" disabled={bloqueada} onClick={()=>onCronometro(corriendo?'detener':'iniciar')} className={`sx-btn ${corriendo?'danger':''}`}>{corriendo?'■ Detener':'▶ Iniciar'}</button>
        <Menu label="Más acciones de la tarea" items={[
          {label:'Reiniciar a Pendiente',disabled:bloqueada||task.estado==='PENDIENTE',onClick:onReset},
          {label:bloqueada?'Desbloquear':'Bloquear',hidden:!allowLock,onClick:bloqueada?onDesbloquear:onBloquear},
          {label:'Eliminar tarea',danger:true,disabled:bloqueada,onClick:onDelete},
        ]}/>
      </>}
    </div>}
  </div>;
}
function PreviewModal({preview,onClose,onDownload}){
  useEffect(()=>{const esc=e=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',esc);return()=>document.removeEventListener('keydown',esc);},[onClose]);
  const fit={maxHeight:'70vh',maxWidth:'100%',display:'block',margin:'0 auto'};
  const frame={width:'100%',height:'70vh',border:0,background:'#fff',borderRadius:8};
  return <div className="sx-modal-back" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="sx-modal" style={{width:'min(960px,100%)'}} role="dialog" aria-modal="true" aria-label={`Vista previa de ${preview.file.nombre}`}>
      <div className="sx-modal-head"><h2 style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}}>{preview.file.nombre}</h2><div className="sx-row" style={{flexWrap:'nowrap'}}><button type="button" className="sx-btn sm" onClick={onDownload}>Descargar</button><button type="button" className="sx-btn sm" onClick={onClose}>Cerrar</button></div></div>
      {preview.kind==='image'&&<img src={preview.url} alt={preview.file.nombre} style={{...fit,objectFit:'contain'}}/>}
      {preview.kind==='pdf'&&<iframe title="Vista previa PDF" src={preview.url} style={frame}/>}
      {preview.kind==='video'&&<video src={preview.url} controls style={fit}/>}
      {preview.kind==='audio'&&<audio src={preview.url} controls style={{width:'100%'}}/>}
      {preview.kind==='text'&&<iframe title="Vista previa de texto" src={preview.url} style={frame}/>}
      {preview.kind==='unsupported'&&<div className="sx-empty">Este tipo de archivo no tiene vista previa directa en el navegador.<br/><button type="button" className="sx-btn primary" style={{marginTop:12}} onClick={onDownload}>Descargar archivo</button></div>}
    </div>
  </div>;
}

async function blobToBase64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=reject;reader.readAsDataURL(blob);});}

function getPreviewKind(type,name){const t=(type||'').toLowerCase();const n=(name||'').toLowerCase();if(t.startsWith('image/'))return'image';if(t==='application/pdf'||n.endsWith('.pdf'))return'pdf';if(t.startsWith('video/'))return'video';if(t.startsWith('audio/'))return'audio';if(t.startsWith('text/')||/\.(txt|csv|json|xml|md|log)$/i.test(n))return'text';return'unsupported';}
function fileIcon(type){if((type||'').startsWith('image/'))return'IMG';if(type==='application/pdf')return'PDF';if((type||'').startsWith('video/'))return'VID';if((type||'').startsWith('audio/'))return'AUD';return'FILE';}
function formatoTamano(bytes){const n=Number(bytes)||0;if(n<1024)return`${n} B`;if(n<1024*1024)return`${(n/1024).toFixed(1)} KB`;return`${(n/(1024*1024)).toFixed(1)} MB`;}
function formatDuration(sec){sec=Math.max(0,Number(sec)||0);const h=Math.floor(sec/3600);const m=Math.floor((sec%3600)/60);const s=Math.floor(sec%60);return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
// Reloj aislado: solo esta tarea se re-renderiza cada segundo (y solo
// mientras su cronómetro está corriendo), no el resto de la página.
function TaskTimer({ corriendo, base, inicio }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!corriendo) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [corriendo, inicio]);
  const total = base + (corriendo && inicio ? Math.max(0, Math.floor((now - new Date(inicio).getTime()) / 1000)) : 0);
  return formatDuration(total);
}
function formatDate(value){if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const offset=d.getTimezoneOffset();const local=new Date(d.getTime()-offset*0);return local.toLocaleString(navigator.language||'es-DO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});}
