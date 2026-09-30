exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'firebase_uid');
  if (!hasColumn) {
    await knex.schema.alterTable('users', (t) => {
      t.string('firebase_uid').unique().nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'firebase_uid');
  if (hasColumn) await knex.schema.alterTable('users', (t) => t.dropColumn('firebase_uid'));
};
