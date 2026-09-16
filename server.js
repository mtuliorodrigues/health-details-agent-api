const express = require('express');
const cors = require('cors');
const path = require('path');
const healthRoutes = require('./src/routes/healthRoutes');
const collectorRoutes = require('./src/routes/collectorRoutes');

if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(path.join(__dirname, '.env'));
}

const app = express();
const PORT = process.env.PORT || 8000;
const API_KEY = process.env.API_KEY;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const requestBuckets = new Map();
const configuredFrontendOrigin = process.env.FRONTEND_ORIGIN;

function isAllowedOrigin(origin) {
  if (!origin || origin === `http://127.0.0.1:${PORT}`) return true;
  if (configuredFrontendOrigin === origin) return true;
  return /^https:\/\/health-details-[a-z0-9-]+-tulio-s-org\.vercel\.app$/i.test(origin);
}

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    const allowed = isAllowedOrigin(origin);
    callback(allowed ? null : new Error('Origem não permitida pelo agente.'), allowed);
  }
}));
app.use(express.json());

app.use('/api', (req, res, next) => {
  const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  if (!isLocal && !(API_KEY && req.get('x-api-key') === API_KEY)) {
    return res.status(401).json({ status: 'error', message: 'Autenticação necessária para acesso remoto.' });
  }
  const now = Date.now();
  const bucket = requestBuckets.get(req.ip) || [];
  const recentRequests = bucket.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ status: 'error', message: 'Limite de consultas atingido. Tente novamente em breve.' });
  }
  recentRequests.push(now);
  requestBuckets.set(req.ip, recentRequests);
  return next();
});

app.use('/api', healthRoutes);
app.use('/api', collectorRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'host-health-diagnostic' });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(error.statusCode || 500).json({ status: 'error', message: error.statusCode ? error.message : 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`Host Health Diagnostic running at http://127.0.0.1:${PORT}`);
});
