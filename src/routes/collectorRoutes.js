const express = require('express');
const { isPrivateIp, validateIp } = require('../utils/ipUtils');
const { collectDevice, VENDORS } = require('../collectors/deviceCollectors');
const { runPing, runTracert } = require('../utils/networkTools');
const { persistCollection } = require('../services/supabaseService');

const router = express.Router();

router.get('/collectors/vendors', (req, res) => res.json({ status: 'success', vendors: { auto: { label: 'Detectar automaticamente' }, ...VENDORS } }));

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
    send('error', { message: error.statusCode ? error.message : 'Falha durante a coleta.' });
  } finally {
    res.end();
  }
});

async function runDiagnostic(req, res, next, type) {
  const { ip } = req.body || {};
  if (!validateIp(ip)) return res.status(400).json({ status: 'error', message: 'IP IPv4 inválido.' });
  if (!isPrivateIp(ip)) return res.status(403).json({ status: 'error', message: 'Apenas endereços IPv4 privados são permitidos.' });
  try {
    const result = type === 'ping' ? await runPing(ip) : await runTracert(ip);
    return res.json({ status: 'success', [type]: result });
  } catch (error) {
    return next(error);
  }
}

router.post('/devices/diagnostics/ping', (req, res, next) => runDiagnostic(req, res, next, 'ping'));
router.post('/devices/diagnostics/traceroute', (req, res, next) => runDiagnostic(req, res, next, 'traceroute'));

module.exports = router;
