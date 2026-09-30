exports.up = async function(knex) {
  if (await knex.schema.hasTable('users') && !(await knex.schema.hasColumn('users', 'telefono'))) {
    await knex.schema.alterTable('users', (t) => {
      t.string('telefono').nullable().unique();
    });
  }
};

exports.down = async function(knex) {
  if (await knex.schema.hasColumn('users', 'telefono')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('telefono'));
  }
};
