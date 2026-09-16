const express = require('express');
const { getDeviceHealth } = require('../services/deviceService');
const { isPrivateIp, validateIp } = require('../utils/ipUtils');

const router = express.Router();

function validateDeviceIp(req, res, next) {
  const ip = req.params.ip || req.body?.ip;
  if (!validateIp(ip)) return res.status(400).json({ status: 'error', message: 'IP IPv4 inválido.' });
  if (!isPrivateIp(ip)) return res.status(403).json({ status: 'error', message: 'Apenas endereços IPv4 privados são permitidos.' });
  return next();
}

function sendError(res, error) {
  console.error('Device check failed:', error.message);
  return res.status(error.statusCode || 500).json({ status: 'error', message: error.statusCode ? error.message : 'Erro ao consultar dispositivo.' });
}

router.get('/device/:ip', validateDeviceIp, async (req, res) => {
  try {
    return res.json(await getDeviceHealth(req.params.ip));
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/device/check', validateDeviceIp, async (req, res) => {
  try {
    return res.json(await getDeviceHealth(req.body.ip));
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
