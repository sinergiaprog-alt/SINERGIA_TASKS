exports.up = function (knex) {
  return knex.schema.createTable('projects', (t) => {
    t.string('id').primary();
    t.string('nombre').notNullable();
    t.text('descripcion');
    t.string('area').notNullable(); // PROGRAMACION | SOPORTE
    t.string('responsable_id').notNullable().references('users.id');
    t.string('prioridad').notNullable().defaultTo('MEDIA'); // BAJA|MEDIA|ALTA|URGENTE
    t.string('estado').notNullable().defaultTo('PENDIENTE'); // PENDIENTE|EN_PROGRESO|EN_REVISION|COMPLETADO|ARCHIVADO
    t.timestamp('fecha_inicio');
    t.timestamp('fecha_limite');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('projects');
};
