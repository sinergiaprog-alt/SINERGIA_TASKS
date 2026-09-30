// Antes, al autorizar una fase a Contabilidad se guardaba con
// puede_trabajar = false (solo podían ver, nunca completar). Ya se corrigió
// el código para que autorice con puede_trabajar = true, pero eso solo
// afecta autorizaciones NUEVAS. Esta migración corrige las filas que ya
// existían en la base de datos, para que los proyectos que ya tenían fases
// de Contabilidad asignadas también se puedan completar.
exports.up = async function (knex) {
  await knex('project_area_phase_permissions')
    .where({ area: 'CONTABILIDAD', puede_trabajar: false })
    .update({ puede_trabajar: true });
};

exports.down = async function () {
  // No se revierte: no hay forma de saber cuáles filas eran originalmente
  // puede_trabajar=false por diseño vs. cuáles se corrigieron aquí.
};
