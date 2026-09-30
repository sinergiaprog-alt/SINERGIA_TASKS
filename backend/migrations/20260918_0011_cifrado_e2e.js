exports.up = async function (knex) {
  const cols = [
    ['users', 'e2e_public_key', 'text'],
    ['users', 'e2e_private_key_cifrado', 'text'],
    ['users', 'e2e_private_key_iv', 'string'],
    ['users', 'e2e_private_key_salt', 'string'],
    ['projects', 'descripcion_cifrado', 'text'],
    ['projects', 'descripcion_iv', 'string'],
    ['projects', 'problema_descripcion_cifrado', 'text'],
    ['projects', 'problema_descripcion_iv', 'string'],
    ['tasks', 'descripcion_cifrado', 'text'],
    ['tasks', 'descripcion_iv', 'string'],
    ['comments', 'contenido_cifrado', 'text'],
    ['comments', 'contenido_iv', 'string'],
    ['issues', 'descripcion_cifrado', 'text'],
    ['issues', 'descripcion_iv', 'string'],
    ['issues', 'solucion_cifrado', 'text'],
    ['issues', 'solucion_iv', 'string'],
    ['files', 'cifrado', 'boolean'],
    ['files', 'cifrado_iv', 'string'],
  ];
  for (const [table, col, type] of cols) {
    if (!(await knex.schema.hasColumn(table, col))) {
      await knex.schema.alterTable(table, t => {
        if (type === 'text') t.text(col).nullable();
        else if (type === 'boolean') t.boolean(col).notNullable().defaultTo(false);
        else t.string(col).nullable();
      });
    }
  }
  if (!(await knex.schema.hasTable('project_crypto_keys'))) {
    await knex.schema.createTable('project_crypto_keys', t => {
      t.string('id').primary();
      t.string('project_id').notNullable().references('projects.id').onDelete('CASCADE');
      t.string('user_id').notNullable().references('users.id').onDelete('CASCADE');
      t.text('clave_envuelta').notNullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
      t.unique(['project_id', 'user_id']);
      t.index(['project_id']);
      t.index(['user_id']);
    });
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable('project_crypto_keys')) await knex.schema.dropTable('project_crypto_keys');
  const cols = [
    ['users', ['e2e_public_key','e2e_private_key_cifrado','e2e_private_key_iv','e2e_private_key_salt']],
    ['projects', ['descripcion_cifrado','descripcion_iv','problema_descripcion_cifrado','problema_descripcion_iv']],
    ['tasks', ['descripcion_cifrado','descripcion_iv']],
    ['comments', ['contenido_cifrado','contenido_iv']],
    ['issues', ['descripcion_cifrado','descripcion_iv','solucion_cifrado','solucion_iv']],
    ['files', ['cifrado','cifrado_iv']],
  ];
  for (const [table, names] of cols) {
    for (const name of names) if (await knex.schema.hasColumn(table, name)) await knex.schema.alterTable(table, t => t.dropColumn(name));
  }
};
