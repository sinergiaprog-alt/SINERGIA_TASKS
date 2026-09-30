exports.up = function (knex) {
  return knex.schema.createTable('project_participants', (t) => {
    t.string('id').primary();
    t.string('project_id').notNullable().references('projects.id').onDelete('CASCADE');
    t.string('user_id').notNullable().references('users.id');
    t.boolean('puede_editar').notNullable().defaultTo(false);
    t.unique(['project_id', 'user_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('project_participants');
};
