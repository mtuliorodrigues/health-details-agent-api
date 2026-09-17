const express = require('express');
const { hasMatchingAgentKey } = require('../middleware/agentAuth');
const { consumeLoginAttempt } = require('../services/loginAttempts');
const router = express.Router();

router.post('/internal/login-attempt', (req, res) => {
  res.set('Cache-Control', 'no-store');
  // This internal endpoint always requires the key, even in compatibility mode.
  if (!hasMatchingAgentKey(req.get('X-Agent-Key'), process.env.AGENT_API_KEY)) {
    return res.status(401).json({ status: 'error', message: 'Não autorizado.' });
  }
  if (typeof req.body?.clientKey !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.clientKey)) {
    return res.status(400).json({ status: 'error', message: 'Identificador inválido.' });
  }
  try {
    return res.json(consumeLoginAttempt(req.body.clientKey));
  } catch {
    return res.status(503).json({ status: 'error', message: 'Controle de acesso indisponível.' });
  }
});
module.exports = router;
