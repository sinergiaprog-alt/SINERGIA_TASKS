exports.up = function (knex) {
  return knex.schema.createTable('tasks', (t) => {
    t.string('id').primary();
    t.string('project_id').notNullable().references('projects.id').onDelete('CASCADE');
    t.string('titulo').notNullable();
    t.text('descripcion');
    t.string('responsable_id').references('users.id');
    t.string('estado').notNullable().defaultTo('PENDIENTE'); // PENDIENTE|EN_PROGRESO|EN_REVISION|COMPLETADA
    t.string('prioridad').notNullable().defaultTo('MEDIA');
    t.timestamp('fecha_limite');
    t.integer('tiempo_trabajado_segundos').notNullable().defaultTo(0);
    t.timestamp('cronometro_inicio'); // si no es null, el cronómetro está corriendo
    t.string('depende_de'); // texto libre, p.ej. "7,1" (para importar WBS tipo Excel)
    t.integer('orden').notNullable().defaultTo(0);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('tasks');
};
