const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const projectsRoutes = require('./modules/projects/projects.routes');
const tasksRoutes = require('./modules/tasks/tasks.routes');
const filesRoutes = require('./modules/files/files.routes');
const commentsRoutes = require('./modules/comments/comments.routes');
const transfersRoutes = require('./modules/transfers/transfers.routes');
const issuesRoutes = require('./modules/issues.routes');
const participantsRoutes = require('./modules/participants.routes');
const accountingRoutes = require('./modules/accounting.routes');
const { router: notificationsRouter } = require('./modules/notifications');
const auditRoutes = require('./modules/audit.routes');
const cryptoRoutes = require('./modules/crypto.routes');

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',').map(x => x.trim()).filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ─── HELMET — headers de seguridad ───────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // El frontend lo maneja por su lado (Vite)
  crossOriginEmbedderPolicy: false,
}));
// Headers adicionales explícitos (refuerzo)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// ─── BODY PARSING ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── RATE LIMITING GLOBAL ────────────────────────────────────────────────────
// Límite general: 300 requests por 15 min por IP (usuarios normales no lo alcanzan)
const limiterGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta más tarde.' },
  skip: (req) => req.path === '/api/health',
});
app.use('/api', limiterGeneral);

// Límite estricto en autenticación: 20 intentos por 15 min por IP
const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación. Intenta más tarde.' },
});
app.use('/api/auth', limiterAuth);

// Límite en subida de archivos: 30 uploads por 15 min por IP
const limiterFiles = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas subidas de archivos. Intenta más tarde.' },
});
app.use('/api/files', limiterFiles);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ─── BOOTSTRAP — solo disponible si no hay usuarios en el sistema ─────────────
// Se monta antes de requireAuth porque es el primer uso del sistema.
// El propio endpoint verifica que no existan usuarios antes de actuar.
app.use('/api/auth', authRoutes);

// ─── RUTAS PROTEGIDAS (todas requieren requireAuth internamente) ──────────────
app.use('/api/users', usersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/participants', participantsRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/notifications', notificationsRouter);
app.use('/api/audit', auditRoutes);
app.use('/api/crypto', cryptoRoutes);

// ─── MANEJADOR DE ERRORES CENTRALIZADO ────────────────────────────────────────
// Nunca expone stack traces ni detalles internos al cliente.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} — ${err.message}`);
    console.error(err.stack);
  }
  res.status(status).json({
    error: status >= 500
      ? 'Error interno del servidor.'
      : (err.message || 'Solicitud inválida.'),
    ...(err.code ? { code: err.code } : {}),
  });
});

module.exports = app;
