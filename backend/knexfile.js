const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const isPg = process.env.DB_CLIENT === 'pg';
const fs = require('fs');
const sqliteFilename = process.env.SQLITE_FILE
  ? (path.isAbsolute(process.env.SQLITE_FILE)
      ? process.env.SQLITE_FILE
      : path.resolve(__dirname, process.env.SQLITE_FILE))
  : path.resolve(__dirname, 'dev.sqlite3');

if (!isPg && !fs.existsSync(sqliteFilename)) {
  throw new Error(`BASE DE DATOS AUSENTE: no existe SQLite en ${sqliteFilename}. Coloca tu backend/dev.sqlite3 original antes de iniciar o migrar.`);
}

module.exports = {
  client: isPg ? 'pg' : 'better-sqlite3',
  connection: isPg
    ? {
        host: process.env.PG_HOST,
        port: process.env.PG_PORT || 5432,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE,
      }
    : { filename: sqliteFilename },
  useNullAsDefault: true,
  pool: !isPg ? { afterCreate: (connection, done) => { connection.pragma('foreign_keys = ON'); done(null, connection); } } : undefined,
  migrations: { directory: path.resolve(__dirname, 'migrations') },
};
