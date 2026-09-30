require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const fs = require('fs');
const db = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 4000;

function sqliteFilename() {
  return db.client.config.connection.filename;
}

function backupSqliteBeforeMigration(filename) {
  if (!fs.existsSync(filename)) {
    throw new Error(`BASE DE DATOS AUSENTE: no existe ${filename}. Conserva tu backend/dev.sqlite3 original y colócalo en esta versión antes de iniciar.`);
  }
  const backupDir = path.resolve(path.dirname(filename), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `dev.sqlite3.${stamp}.backup`);
  fs.copyFileSync(filename, backupPath);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = filename + suffix;
    if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, backupPath + suffix);
  }
  console.log(`Respaldo SQLite creado antes de migrar: ${backupPath}`);
}

async function start() {
  // En desarrollo, arrancar la API también deja la base al día. No borra
  // datos: solo ejecuta migraciones pendientes sobre el SQLite configurado.
  if (process.env.NODE_ENV !== 'production' && process.env.AUTO_MIGRATE !== 'false') {
    if (process.env.DB_CLIENT !== 'pg') backupSqliteBeforeMigration(sqliteFilename());
    const [batch, migrations] = await db.migrate.latest();
    if (migrations.length) console.log(`Migraciones aplicadas: ${migrations.join(', ')}`);
  }

  if (process.env.DB_CLIENT === 'pg') {
    await db.raw('select 1');
    console.log('Base de datos: PostgreSQL');
  } else {
    const filename = db.client.config.connection.filename;
    await db.raw('select 1');
    console.log(`Base de datos SQLite: ${path.resolve(filename)}`);
  }

  app.listen(PORT, () => {
    console.log(`Sinergia Tasks API escuchando en http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('No se pudo iniciar Sinergia Tasks:', err);
  process.exit(1);
});
