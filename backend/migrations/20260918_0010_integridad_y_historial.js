exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn('projects', 'fecha_culminacion'))) {
    await knex.schema.alterTable('projects', (t) => t.timestamp('fecha_culminacion').nullable());
  }

  if (!(await knex.schema.hasColumn('users', 'updated_at'))) {
    await knex.schema.alterTable('users', (t) => t.timestamp('updated_at').defaultTo(knex.fn.now()));
  }

  const hasTimeEntries = await knex.schema.hasTable('task_time_entries');
  if (!hasTimeEntries) {
    await knex.schema.createTable('task_time_entries', (t) => {
      t.string('id').primary();
      t.string('task_id').notNullable().references('tasks.id').onDelete('CASCADE');
      t.string('usuario_id').notNullable().references('users.id');
      t.timestamp('inicio').notNullable();
      t.timestamp('fin');
      t.integer('duracion_segundos').notNullable().defaultTo(0);
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  const indexes = [
    ['projects', 'projects_responsable_idx', ['responsable_id']],
    ['projects', 'projects_estado_idx', ['estado']],
    ['projects', 'projects_fecha_limite_idx', ['fecha_limite']],
    ['project_participants', 'participants_user_idx', ['user_id']],
    ['tasks', 'tasks_project_idx', ['project_id']],
    ['tasks', 'tasks_responsable_idx', ['responsable_id']],
    ['tasks', 'tasks_estado_idx', ['estado']],
    ['tasks', 'tasks_fecha_limite_idx', ['fecha_limite']],
    ['comments', 'comments_project_idx', ['project_id']],
    ['comments', 'comments_task_idx', ['task_id']],
    ['files', 'files_project_idx', ['project_id']],
    ['files', 'files_task_idx', ['task_id']],
    ['issues', 'issues_project_idx', ['project_id']],
    ['transfers', 'transfers_project_idx', ['project_id']],
    ['audit_log', 'audit_entity_idx', ['entidad_tipo', 'entidad_id']],
    ['task_time_entries', 'time_entries_task_idx', ['task_id']],
    ['task_time_entries', 'time_entries_user_idx', ['usuario_id']],
  ];

  for (const [table, name, cols] of indexes) {
    try { await knex.schema.alterTable(table, (t) => t.index(cols, name)); } catch (_) { /* ya existe */ }
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable('task_time_entries')) await knex.schema.dropTable('task_time_entries');
  if (await knex.schema.hasColumn('projects', 'fecha_culminacion')) await knex.schema.alterTable('projects', (t) => t.dropColumn('fecha_culminacion'));
  if (await knex.schema.hasColumn('users', 'updated_at')) await knex.schema.alterTable('users', (t) => t.dropColumn('updated_at'));
};
