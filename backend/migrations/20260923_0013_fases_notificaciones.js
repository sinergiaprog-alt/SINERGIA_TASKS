exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('project_phases'))) {
    await knex.schema.createTable('project_phases', (t) => {
      t.string('id').primary();
      t.string('project_id').notNullable().references('projects.id').onDelete('CASCADE');
      t.string('clave').notNullable();
      t.string('nombre').notNullable();
      t.integer('orden').notNullable().defaultTo(1);
      t.boolean('activo').notNullable().defaultTo(true);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
      t.unique(['project_id', 'clave']);
      t.index(['project_id', 'orden']);
    });
  }

  if (!(await knex.schema.hasColumn('project_participants', 'fase_id'))) {
    await knex.schema.alterTable('project_participants', (t) => {
      t.string('fase_id').nullable().references('project_phases.id').onDelete('SET NULL');
      t.index(['fase_id']);
    });
  }

  if (!(await knex.schema.hasTable('notifications'))) {
    await knex.schema.createTable('notifications', (t) => {
      t.string('id').primary();
      t.string('user_id').notNullable().references('users.id').onDelete('CASCADE');
      t.string('tipo').notNullable();
      t.string('titulo').notNullable();
      t.text('mensaje');
      t.string('project_id').nullable().references('projects.id').onDelete('CASCADE');
      t.string('task_id').nullable().references('tasks.id').onDelete('CASCADE');
      t.boolean('leida').notNullable().defaultTo(false);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('leida_at');
      t.index(['user_id', 'leida']);
      t.index(['created_at']);
    });
  }

  // Backfill a project phase for legacy Nuevo Centro / Implementación tasks.
  const projects = await knex('projects').select('id', 'asunto');
  for (const project of projects) {
    const asunto = String(project.asunto || '').toUpperCase();
    if (!['NUEVO CENTRO', 'IMPLEMENTACION'].includes(asunto)) continue;
    const has = await knex('project_phases').where({ project_id: project.id }).first();
    if (has) continue;
    const taskPhases = await knex('tasks')
      .where({ project_id: project.id })
      .whereNotNull('fase')
      .groupBy('fase', 'fase_orden')
      .select('fase', 'fase_orden')
      .orderBy('fase_orden', 'asc');
    for (let i = 0; i < taskPhases.length; i += 1) {
      const row = taskPhases[i];
      const phaseId = `phs_${project.id}_${String(row.fase).toLowerCase()}_${i + 1}`.slice(0, 120);
      await knex('project_phases').insert({
        id: phaseId,
        project_id: project.id,
        clave: String(row.fase).toUpperCase(),
        nombre: String(row.fase).toUpperCase() === 'IMPLEMENTACION' ? 'Implementación' : String(row.fase),
        orden: Number(row.fase_orden || i + 1),
        activo: true,
      }).onConflict(['project_id', 'clave']).ignore();
    }
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable('notifications')) await knex.schema.dropTable('notifications');
  if (await knex.schema.hasColumn('project_participants', 'fase_id')) {
    await knex.schema.alterTable('project_participants', (t) => t.dropColumn('fase_id'));
  }
  if (await knex.schema.hasTable('project_phases')) await knex.schema.dropTable('project_phases');
};
