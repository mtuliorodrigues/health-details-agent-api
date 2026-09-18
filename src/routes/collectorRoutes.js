const express = require('express');
const { isPrivateIp, validateIp } = require('../utils/ipUtils');
const { collectDevice, VENDORS } = require('../collectors/deviceCollectors');
const { runPing } = require('../utils/networkTools');
const { persistCollection, listCollectionHistory, deleteCollectionHistory } = require('../services/supabaseService');

const router = express.Router();

router.get('/collectors/vendors', (req, res) => res.json({ status: 'success', vendors: { auto: { label: 'Detectar automaticamente' }, ...VENDORS } }));

router.get('/devices/history', async (req, res, next) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 30;
  const page = Number.parseInt(req.query.page, 10) || 1;
  const { ip = '', vendor = '', from = '', to = '', status = '' } = req.query;
  try {
    return res.json({ status: 'success', ...(await listCollectionHistory({ limit, page, ip, vendor, from, to, status })) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/devices/history/:id', async (req, res, next) => {
  const { id } = req.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ status: 'error', message: 'Identificador de coleta inválido.' });
  }
  try {
    const result = await deleteCollectionHistory(id);
    if (!result.deleted) return res.status(404).json({ status: 'error', message: 'Coleta não encontrada.' });
    return res.json({ status: 'success', ...result });
  } catch (error) {
    return next(error);
  }
});

router.post('/devices/collect', async (req, res, next) => {
  const { ip, vendor, credentials, protocol } = req.body || {};
  if (!validateIp(ip)) return res.status(400).json({ status: 'error', message: 'IP IPv4 inválido.' });
  if (!isPrivateIp(ip)) return res.status(403).json({ status: 'error', message: 'Apenas endereços IPv4 privados são permitidos.' });
  if (vendor !== 'auto' && !VENDORS[vendor]) return res.status(400).json({ status: 'error', message: 'Tipo de dispositivo inválido.' });
  try {
    const testCredentials = process.env.TEST_DEVICE_USERNAME && process.env.TEST_DEVICE_PASSWORD
      ? { username: process.env.TEST_DEVICE_USERNAME, password: process.env.TEST_DEVICE_PASSWORD }
      : null;
    const collection = await collectDevice({ ip, vendor, credentials: credentials || testCredentials, protocol });
    return res.json({ ...collection, storage: await persistCollection(collection) });
  } catch (error) {
    return next(error);
  }
});

router.get('/devices/collect/stream', async (req, res) => {
  const { ip, vendor, protocol } = req.query;
  if (!validateIp(ip) || !isPrivateIp(ip) || (vendor !== 'auto' && !VENDORS[vendor])) return res.status(400).json({ status: 'error', message: 'IP ou tipo de dispositivo inválido.' });

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const testCredentials = process.env.TEST_DEVICE_USERNAME && process.env.TEST_DEVICE_PASSWORD
    ? { username: process.env.TEST_DEVICE_USERNAME, password: process.env.TEST_DEVICE_PASSWORD }
    : null;
  try {
    send('log', { message: 'Iniciando coleta da interface web.' });
    const collection = await collectDevice({ ip, vendor, credentials: testCredentials, protocol, onProgress: (message) => send('log', { message }) });
    send('result', { ...collection, storage: await persistCollection(collection) });
  } catch (error) {
    console.error('[collection stream] failed', { ip, vendor, message: error.message, code: error.code, statusCode: error.statusCode });
    send('error', { message: error.statusCode ? error.message : 'Falha durante a coleta.' });
  } finally {
    res.end();
  }
});

async function runPingDiagnostic(req, res, next) {
  const { ip } = req.body || {};
  if (!validateIp(ip)) return res.status(400).json({ status: 'error', message: 'IP IPv4 inválido.' });
  if (!isPrivateIp(ip)) return res.status(403).json({ status: 'error', message: 'Apenas endereços IPv4 privados são permitidos.' });
  try {
    const ping = await runPing(ip);
    return res.json({ status: 'success', ping });
  } catch (error) {
    return next(error);
  }
}

router.post('/devices/diagnostics/ping', runPingDiagnostic);

module.exports = router;
