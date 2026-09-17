const crypto = require('crypto');

function hasMatchingAgentKey(providedKey, expectedKey) {
  if (typeof providedKey !== 'string' || typeof expectedKey !== 'string') return false;
  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(expectedKey);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function createAgentAuth({ required, expectedKey }) {
  return (req, res, next) => {
    if (!required) return next();
    if (!expectedKey) {
      return res.status(503).json({ status: 'error', message: 'Autenticação do agente não configurada.' });
    }
    if (!hasMatchingAgentKey(req.get('X-Agent-Key'), expectedKey)) {
      return res.status(401).json({ status: 'error', message: 'Não autorizado.' });
    }
    return next();
  };
}

module.exports = { createAgentAuth, hasMatchingAgentKey };
