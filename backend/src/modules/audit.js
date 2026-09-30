const db = require('../config/db');
const { newId } = require('../config/id');

async function auditar(usuarioId, accion, entidadTipo, entidadId, detalle = null, trx = db) {
  if (!usuarioId) return;
  await trx('audit_log').insert({
    id: newId('aud'),
    usuario_id: usuarioId,
    accion,
    entidad_tipo: entidadTipo,
    entidad_id: entidadId,
    detalle: detalle == null ? null : (typeof detalle === 'string' ? detalle : JSON.stringify(detalle)),
  });
}

module.exports = { auditar };
