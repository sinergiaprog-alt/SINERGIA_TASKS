const db = require('../src/config/db');
const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Uso: node scripts/check-user.js correo@dominio.com');
  process.exit(1);
}
(async () => {
  try {
    const users = await db('users').select('id','nombre','email','firebase_uid','role','areas','activo','created_at').whereRaw('LOWER(email) = ?', [email]);
    console.log(JSON.stringify({ email, encontrados: users.length, users }, null, 2));
  } finally { await db.destroy(); }
})().catch((err) => { console.error(err); process.exit(1); });
