exports.up = async function (knex) {
  // This is deliberately additive. Existing participant rows remain the source
  // of project membership and their legacy fase_id is copied below.
  if (!(await knex.schema.hasTable('project_participant_phases'))) {
    await knex.schema.createTable('project_participant_phases', (t) => {
      t.string('id').primary();
      t.string('participant_id').notNullable().references('project_participants.id').onDelete('CASCADE');
      t.string('phase_id').notNullable().references('project_phases.id').onDelete('CASCADE');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.unique(['participant_id', 'phase_id']);
      t.index(['phase_id']);
    });
  }

  const legacy = await knex('project_participants').whereNotNull('fase_id').select('id', 'fase_id');
  for (const row of legacy) {
    await knex('project_participant_phases').insert({
      id: `pph_${row.id}_${row.fase_id}`.slice(0, 120), participant_id: row.id, phase_id: row.fase_id,
    }).onConflict(['participant_id', 'phase_id']).ignore();
  }

  if (!(await knex.schema.hasTable('task_transfers'))) {
    await knex.schema.createTable('task_transfers', (t) => {
      t.string('id').primary();
      t.string('task_id').notNullable().references('tasks.id').onDelete('CASCADE');
      t.string('project_id').notNullable().references('projects.id').onDelete('CASCADE');
      t.string('phase_id').nullable().references('project_phases.id').onDelete('SET NULL');
      t.string('from_user_id').nullable().references('users.id').onDelete('SET NULL');
      t.string('to_user_id').notNullable().references('users.id');
      t.string('transferred_by').notNullable().references('users.id');
      t.text('comentario');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.index(['task_id', 'created_at']);
      t.index(['project_id', 'created_at']);
    });
  }
};

exports.down = async function () {
  // Intentionally no-op: this migration protects production history on rollback.
};
