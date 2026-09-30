exports.up = async function(knex) {
  await knex.schema.alterTable('users', t => {
    // El área CONTABILIDAD se guarda en el JSON existente `areas`.
    t.string('departamento').nullable();
  });

  await knex.schema.createTable('project_area_phase_permissions', t => {
    t.string('id').primary();
    t.string('project_id').notNullable().references('projects.id').onDelete('CASCADE');
    t.string('area').notNullable();
    t.string('fase').notNullable();
    t.boolean('puede_ver').notNullable().defaultTo(true);
    t.boolean('puede_trabajar').notNullable().defaultTo(false);
    t.unique(['project_id','area','fase']);
  });

  await knex.schema.createTable('accounting_clients', t => {
    t.string('id').primary();
    t.string('nombre').notNullable();
    t.string('documento');
    t.string('email');
    t.string('telefono');
    t.text('direccion');
    t.string('estado').notNullable().defaultTo('ACTIVO');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('accounting_client_projects', t => {
    t.string('id').primary();
    t.string('client_id').notNullable().references('accounting_clients.id').onDelete('CASCADE');
    t.string('project_id').notNullable().references('projects.id').onDelete('CASCADE');
    t.decimal('monto_contratado', 14, 2).notNullable().defaultTo(0);
    t.unique(['client_id','project_id']);
  });

  await knex.schema.createTable('accounting_payments', t => {
    t.string('id').primary();
    t.string('client_id').notNullable().references('accounting_clients.id');
    t.string('project_id').references('projects.id').onDelete('SET NULL');
    t.decimal('monto', 14, 2).notNullable();
    t.date('fecha').notNullable();
    t.string('metodo').notNullable().defaultTo('TRANSFERENCIA');
    t.string('referencia');
    t.text('concepto');
    t.string('registrado_por').notNullable().references('users.id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('accounting_extras', t => {
    t.string('id').primary();
    t.string('client_id').notNullable().references('accounting_clients.id');
    t.string('project_id').references('projects.id').onDelete('SET NULL');
    t.string('concepto').notNullable();
    t.decimal('monto', 14, 2).notNullable();
    t.date('fecha').notNullable();
    t.string('registrado_por').notNullable().references('users.id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('accounting_extras');
  await knex.schema.dropTableIfExists('accounting_payments');
  await knex.schema.dropTableIfExists('accounting_client_projects');
  await knex.schema.dropTableIfExists('accounting_clients');
  await knex.schema.dropTableIfExists('project_area_phase_permissions');
  if (await knex.schema.hasColumn('users','departamento')) await knex.schema.alterTable('users', t => t.dropColumn('departamento'));
};
