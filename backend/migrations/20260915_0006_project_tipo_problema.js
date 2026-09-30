exports.up = function (knex) {
  return knex.schema.alterTable('projects', (t) => {
    t.boolean('es_problema').notNullable().defaultTo(false);
    t.string('tipo_problema'); // ver lista de valores válidos en projects.routes.js
    t.text('tipo_problema_otro'); // solo se usa cuando tipo_problema = 'OTROS'
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('projects', (t) => {
    t.dropColumn('es_problema');
    t.dropColumn('tipo_problema');
    t.dropColumn('tipo_problema_otro');
  });
};
