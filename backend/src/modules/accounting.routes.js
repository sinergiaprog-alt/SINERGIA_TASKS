const express = require('express');
const db = require('../config/db');
const { newId } = require('../config/id');
const { requireAuth, requireArea } = require('../middleware/auth');
const { auditar } = require('./audit');
const router = express.Router();
router.use(requireAuth);
router.use(requireArea('CONTABILIDAD'));

router.get('/summary', async (req, res, next) => {
  try {
    const [clients, payments, extras] = await Promise.all([
      db('accounting_clients').where({ estado: 'ACTIVO' }).count('id as c').first(),
      db('accounting_payments').sum({ total: 'monto' }).first(),
      db('accounting_extras').sum({ total: 'monto' }).first(),
    ]);
    res.json({
      summary: {
        clientes: Number(clients?.c || 0),
        pagado: Number(payments?.total || 0),
        extras: Number(extras?.total || 0),
      },
    });
  } catch (e) { next(e); }
});

router.get('/clients', async (req, res, next) => {
  try {
    const clients = await db('accounting_clients').orderBy('nombre');
    const [contractedRows, paymentRows, extraRows] = await Promise.all([
      db('accounting_client_projects').select('client_id').sum({ total: 'monto_contratado' }).groupBy('client_id'),
      db('accounting_payments').select('client_id').sum({ total: 'monto' }).groupBy('client_id'),
      db('accounting_extras').select('client_id').sum({ total: 'monto' }).groupBy('client_id'),
    ]);

    const contracted = new Map(contractedRows.map(r => [r.client_id, Number(r.total || 0)]));
    const paid = new Map(paymentRows.map(r => [r.client_id, Number(r.total || 0)]));
    const extras = new Map(extraRows.map(r => [r.client_id, Number(r.total || 0)]));

    res.json({
      clients: clients.map(client => {
        const contratado = contracted.get(client.id) || 0;
        const pagado = paid.get(client.id) || 0;
        const extrasTotal = extras.get(client.id) || 0;
        return {
          ...client,
          contratado,
          pagado,
          extras: extrasTotal,
          pendiente: Math.max(0, contratado + extrasTotal - pagado),
        };
      }),
    });
  } catch (e) { next(e); }
});

router.post('/clients', async (req, res, next) => {
  try {
    const { nombre, documento, email, telefono, direccion } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
    const row = {
      id: newId('cli'), nombre: nombre.trim(), documento: documento?.trim() || null,
      email: email?.trim() || null, telefono: telefono?.trim() || null,
      direccion: direccion?.trim() || null,
    };
    await db('accounting_clients').insert(row);
    await auditar(req.user.id, 'CREAR', 'ACCOUNTING_CLIENT', row.id, { nombre: row.nombre });
    res.status(201).json({ client: row });
  } catch (e) { next(e); }
});

router.get('/clients/:id', async (req, res, next) => {
  try {
    const client = await db('accounting_clients').where({ id: req.params.id }).first();
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });
    const [projects, payments, extras] = await Promise.all([
      db('accounting_client_projects as cp')
        .join('projects as p', 'p.id', 'cp.project_id')
        .where('cp.client_id', client.id)
        .select('cp.*', 'p.nombre', 'p.asunto'),
      db('accounting_payments').where({ client_id: client.id }).orderBy('fecha', 'desc'),
      db('accounting_extras').where({ client_id: client.id }).orderBy('fecha', 'desc'),
    ]);
    res.json({ client, projects, payments, extras });
  } catch (e) { next(e); }
});

router.post('/clients/:id/projects', async (req, res, next) => {
  try {
    const { projectId, montoContratado } = req.body;
    const client = await db('accounting_clients').where({ id: req.params.id }).first();
    const project = await db('projects').where({ id: projectId }).first();
    if (!client || !project) return res.status(404).json({ error: 'Cliente o proyecto no encontrado.' });
    const amount = Number(montoContratado || 0);
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'El monto contratado no es válido.' });
    const row = { id: newId('cp'), client_id: client.id, project_id: project.id, monto_contratado: amount };
    await db('accounting_client_projects').insert(row);
    await auditar(req.user.id, 'VINCULAR', 'ACCOUNTING_CLIENT_PROJECT', row.id, { clientId: client.id, projectId: project.id, montoContratado: amount });
    res.status(201).json({ project: row });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Ese proyecto ya está vinculado al cliente.' });
    next(e);
  }
});

async function validarMovimiento({ clientId, projectId }) {
  const client = await db('accounting_clients').where({ id: clientId }).first();
  if (!client) return { error: 'Cliente no encontrado.', status: 404 };
  if (projectId) {
    const linked = await db('accounting_client_projects').where({ client_id: clientId, project_id: projectId }).first();
    if (!linked) return { error: 'El proyecto seleccionado no está vinculado a este cliente.', status: 400 };
  }
  return { client };
}

router.post('/payments', async (req, res, next) => {
  try {
    const { clientId, projectId, monto, fecha, metodo, referencia, concepto } = req.body;
    if (!clientId || Number(monto) <= 0 || !fecha) return res.status(400).json({ error: 'Cliente, monto y fecha son obligatorios.' });
    const valid = await validarMovimiento({ clientId, projectId });
    if (valid.error) return res.status(valid.status).json({ error: valid.error });
    const row = {
      id: newId('pay'), client_id: clientId, project_id: projectId || null, monto: Number(monto), fecha,
      metodo: metodo || 'TRANSFERENCIA', referencia: referencia?.trim() || null,
      concepto: concepto?.trim() || null, registrado_por: req.user.id,
    };
    await db('accounting_payments').insert(row);
    await auditar(req.user.id, 'CREAR', 'ACCOUNTING_PAYMENT', row.id, { clientId, monto: Number(monto), projectId: projectId || null });
    res.status(201).json({ payment: row });
  } catch (e) { next(e); }
});

router.post('/extras', async (req, res, next) => {
  try {
    const { clientId, projectId, concepto, monto, fecha } = req.body;
    if (!clientId || !concepto?.trim() || Number(monto) <= 0 || !fecha) return res.status(400).json({ error: 'Cliente, concepto, monto y fecha son obligatorios.' });
    const valid = await validarMovimiento({ clientId, projectId });
    if (valid.error) return res.status(valid.status).json({ error: valid.error });
    const row = {
      id: newId('ext'), client_id: clientId, project_id: projectId || null,
      concepto: concepto.trim(), monto: Number(monto), fecha, registrado_por: req.user.id,
    };
    await db('accounting_extras').insert(row);
    await auditar(req.user.id, 'CREAR', 'ACCOUNTING_EXTRA', row.id, { clientId, monto: Number(monto), projectId: projectId || null });
    res.status(201).json({ extra: row });
  } catch (e) { next(e); }
});

module.exports = router;
