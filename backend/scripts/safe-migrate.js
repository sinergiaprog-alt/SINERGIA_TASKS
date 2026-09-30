const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const backendDir = path.resolve(__dirname, '..');
const filename = process.env.SQLITE_FILE
  ? (path.isAbsolute(process.env.SQLITE_FILE) ? process.env.SQLITE_FILE : path.resolve(backendDir, process.env.SQLITE_FILE))
  : path.resolve(backendDir, 'dev.sqlite3');

if (process.env.DB_CLIENT !== 'pg') {
  if (!fs.existsSync(filename)) {
    console.error(`BASE DE DATOS AUSENTE: no existe ${filename}. Coloca tu dev.sqlite3 original antes de migrar.`);
    process.exit(1);
  }
  const backupDir = path.join(path.dirname(filename), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `dev.sqlite3.${stamp}.backup`);
  fs.copyFileSync(filename, backupPath);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = filename + suffix;
    if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, backupPath + suffix);
  }
  console.log(`Respaldo SQLite creado: ${backupPath}`);
}

execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['knex', 'migrate:latest'], { cwd: backendDir, stdio: 'inherit', env: process.env });
