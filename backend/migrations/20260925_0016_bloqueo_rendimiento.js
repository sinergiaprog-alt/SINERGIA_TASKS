exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn('tasks', 'bloqueada'))) await knex.schema.alterTable('tasks', t => t.boolean('bloqueada').notNullable().defaultTo(false));
  if (!(await knex.schema.hasColumn('tasks', 'bloqueo_motivo'))) await knex.schema.alterTable('tasks', t => t.text('bloqueo_motivo').nullable());
  if (!(await knex.schema.hasColumn('tasks', 'bloqueada_por'))) await knex.schema.alterTable('tasks', t => t.string('bloqueada_por').nullable().references('users.id').onDelete('SET NULL'));
  if (!(await knex.schema.hasColumn('tasks', 'bloqueada_at'))) await knex.schema.alterTable('tasks', t => t.timestamp('bloqueada_at').nullable());
  try { await knex.schema.alterTable('tasks', t => { t.index(['project_id'], 'idx_tasks_project_id'); t.index(['project_id','estado'], 'idx_tasks_project_estado'); }); } catch (_) {}
  try { await knex.schema.alterTable('project_participants', t => { t.index(['user_id','project_id'], 'idx_pp_user_project'); t.index(['project_id','fase_id'], 'idx_pp_project_phase'); }); } catch (_) {}
  try { await knex.schema.alterTable('project_area_phase_permissions', t => { t.index(['area','project_id'], 'idx_papp_area_project'); t.index(['project_id','fase'], 'idx_papp_project_phase'); }); } catch (_) {}
};

exports.down = async function (knex) {
  try { await knex.schema.alterTable('project_area_phase_permissions', t => { t.dropIndex(['area','project_id'], 'idx_papp_area_project'); t.dropIndex(['project_id','fase'], 'idx_papp_project_phase'); }); } catch (_) {}
  try { await knex.schema.alterTable('project_participants', t => { t.dropIndex(['user_id','project_id'], 'idx_pp_user_project'); t.dropIndex(['project_id','fase_id'], 'idx_pp_project_phase'); }); } catch (_) {}
  try { await knex.schema.alterTable('tasks', t => { t.dropIndex(['project_id'], 'idx_tasks_project_id'); t.dropIndex(['project_id','estado'], 'idx_tasks_project_estado'); }); } catch (_) {}
  if (await knex.schema.hasColumn('tasks','bloqueada_at')) await knex.schema.alterTable('tasks', t => t.dropColumn('bloqueada_at'));
  if (await knex.schema.hasColumn('tasks','bloqueada_por')) await knex.schema.alterTable('tasks', t => t.dropColumn('bloqueada_por'));
  if (await knex.schema.hasColumn('tasks','bloqueo_motivo')) await knex.schema.alterTable('tasks', t => t.dropColumn('bloqueo_motivo'));
  if (await knex.schema.hasColumn('tasks','bloqueada')) await knex.schema.alterTable('tasks', t => t.dropColumn('bloqueada'));
};
