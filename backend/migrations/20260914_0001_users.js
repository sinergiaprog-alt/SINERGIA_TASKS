exports.up = function (knex) {
  return knex.schema.createTable('users', (t) => {
    t.string('id').primary();
    t.string('nombre').notNullable();
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('role').notNullable().defaultTo('COLABORADOR'); // ADMIN | COLABORADOR | SOPORTE | PROGRAMACION
    t.text('areas').notNullable().defaultTo('[]'); // JSON: ["PROGRAMACION","SOPORTE"]
    t.boolean('activo').notNullable().defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('users');
};
