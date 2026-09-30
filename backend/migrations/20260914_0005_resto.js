exports.up = async function (knex) {
  await knex.schema.createTable('comments', (t) => {
    t.string('id').primary();
    t.string('project_id').references('projects.id').onDelete('CASCADE');
    t.string('task_id').references('tasks.id').onDelete('CASCADE');
    t.string('autor_id').notNullable().references('users.id');
    t.text('contenido').notNullable();
    t.string('parent_id');
    t.boolean('editado').notNullable().defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('files', (t) => {
    t.string('id').primary();
    t.string('project_id').references('projects.id').onDelete('CASCADE');
    t.string('task_id').references('tasks.id').onDelete('CASCADE');
    t.string('nombre').notNullable();
    t.string('ruta').notNullable();
    t.string('tipo').notNullable();
    t.integer('tamano').notNullable();
    t.string('subido_por_id').notNullable().references('users.id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('issues', (t) => {
    t.string('id').primary();
    t.string('project_id').notNullable().references('projects.id').onDelete('CASCADE');
    t.string('task_id').references('tasks.id');
    t.string('titulo').notNullable();
    t.text('descripcion');
    t.string('estado').notNullable().defaultTo('ABIERTO'); // ABIERTO|EN_PROGRESO|RESUELTO|REABIERTO
    t.string('prioridad').notNullable().defaultTo('MEDIA');
    t.text('solucion');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('transfers', (t) => {
    t.string('id').primary();
    t.string('project_id').notNullable().references('projects.id').onDelete('CASCADE');
    t.string('area_anterior').notNullable();
    t.string('area_nueva').notNullable();
    t.string('usuario_id').notNullable().references('users.id');
    t.text('comentario');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('audit_log', (t) => {
    t.string('id').primary();
    t.string('usuario_id').notNullable().references('users.id');
    t.string('accion').notNullable();
    t.string('entidad_tipo').notNullable();
    t.string('entidad_id').notNullable();
    t.text('detalle');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTable('audit_log');
  await knex.schema.dropTable('transfers');
  await knex.schema.dropTable('issues');
  await knex.schema.dropTable('files');
  await knex.schema.dropTable('comments');
};
