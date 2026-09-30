exports.up = async function (knex) {
  const hasAsunto = await knex.schema.hasColumn('projects', 'asunto');
  if (!hasAsunto) {
    await knex.schema.alterTable('projects', (t) => {
      t.string('asunto').notNullable().defaultTo('GENERAL');
      t.string('centro_cliente');
    });
  } else if (!(await knex.schema.hasColumn('projects', 'centro_cliente'))) {
    await knex.schema.alterTable('projects', (t) => t.string('centro_cliente'));
  }

  const hasFase = await knex.schema.hasColumn('tasks', 'fase');
  if (!hasFase) {
    await knex.schema.alterTable('tasks', (t) => {
      t.string('fase');
      t.integer('fase_orden');
    });
  } else if (!(await knex.schema.hasColumn('tasks', 'fase_orden'))) {
    await knex.schema.alterTable('tasks', (t) => t.integer('fase_orden'));
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasColumn('tasks', 'fase_orden')) {
    await knex.schema.alterTable('tasks', (t) => t.dropColumn('fase_orden'));
  }
  if (await knex.schema.hasColumn('tasks', 'fase')) {
    await knex.schema.alterTable('tasks', (t) => t.dropColumn('fase'));
  }
  if (await knex.schema.hasColumn('projects', 'centro_cliente')) {
    await knex.schema.alterTable('projects', (t) => t.dropColumn('centro_cliente'));
  }
  if (await knex.schema.hasColumn('projects', 'asunto')) {
    await knex.schema.alterTable('projects', (t) => t.dropColumn('asunto'));
  }
};
