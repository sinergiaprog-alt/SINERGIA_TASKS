exports.up = async function(knex) {
  if (!(await knex.schema.hasColumn('users', 'tipo_cuenta'))) {
    await knex.schema.alterTable('users', t => t.string('tipo_cuenta').notNullable().defaultTo('CORREO'));
  }
  if (!(await knex.schema.hasColumn('users', 'invitado_id'))) {
    await knex.schema.alterTable('users', t => t.string('invitado_id').nullable().unique());
  }
};

exports.down = async function(knex) {
  if (await knex.schema.hasColumn('users', 'invitado_id')) {
    await knex.schema.alterTable('users', t => t.dropColumn('invitado_id'));
  }
  if (await knex.schema.hasColumn('users', 'tipo_cuenta')) {
    await knex.schema.alterTable('users', t => t.dropColumn('tipo_cuenta'));
  }
};
