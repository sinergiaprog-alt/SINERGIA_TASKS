const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { canViewProject } = require('./projects/access');
const router = express.Router();
router.use(requireAuth);
router.get('/project/:projectId', async (req,res,next)=>{try{const p=await db('projects').where({id:req.params.projectId}).first();if(!p||!(await canViewProject(db,req.user,p)))return res.status(403).json({error:'No tienes acceso al historial.'});const rows=await db('audit_log as a').leftJoin('users as u','u.id','a.usuario_id').where('a.entidad_tipo','PROJECT').andWhere('a.entidad_id',p.id).select('a.*','u.nombre as usuario_nombre').orderBy('a.created_at','desc').limit(200);res.json({audit:rows});}catch(e){next(e);}});
module.exports=router;
