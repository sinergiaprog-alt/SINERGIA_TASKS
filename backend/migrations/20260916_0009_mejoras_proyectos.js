exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn('projects', 'areas'))) {
    await knex.schema.alterTable('projects', (t) => t.text('areas'));
  }
  if (!(await knex.schema.hasColumn('projects', 'asunto_otro'))) {
    await knex.schema.alterTable('projects', (t) => t.text('asunto_otro'));
  }
  if (!(await knex.schema.hasColumn('projects', 'problema_descripcion'))) {
    await knex.schema.alterTable('projects', (t) => t.text('problema_descripcion'));
  }

  const projects = await knex('projects').select('id', 'area', 'areas');
  for (const project of projects) {
    if (!project.areas) {
      await knex('projects').where({ id: project.id }).update({
        areas: JSON.stringify(project.area ? [project.area] : []),
      });
    }
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasColumn('projects', 'problema_descripcion')) {
    await knex.schema.alterTable('projects', (t) => t.dropColumn('problema_descripcion'));
  }
  if (await knex.schema.hasColumn('projects', 'asunto_otro')) {
    await knex.schema.alterTable('projects', (t) => t.dropColumn('asunto_otro'));
  }
  if (await knex.schema.hasColumn('projects', 'areas')) {
    await knex.schema.alterTable('projects', (t) => t.dropColumn('areas'));
  }
};
