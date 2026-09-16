const { normalizeIp } = require('../utils/ipUtils');
const { runPing, runTracert } = require('../utils/networkTools');

function calculateHealth(ping) {
  if (!ping.success) return 0;
  const latencyPenalty = Math.min(40, (ping.latency || 100) / 5);
  return Math.max(0, Math.round(100 - (ping.packets.loss * 0.6) - latencyPenalty));
}

async function getDeviceHealth(ip) {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp) {
    const error = new Error('IP inválido');
    error.statusCode = 400;
    throw error;
  }

  const [ping, traceroute] = await Promise.all([runPing(normalizedIp), runTracert(normalizedIp)]);
  return {
    status: 'success',
    valid: true,
    device: {
      ip: normalizedIp,
      type: 'Dispositivo de rede',
      vendor: 'Não identificado',
      status: ping.success ? 'online' : 'offline',
      health: calculateHealth(ping),
      network: 'Não informado',
      signal: null,
      radio: { ccq: null, source: 'Dados de rádio exigem SNMP ou API do fabricante.' },
      latency: ping.latency,
      packetLoss: ping.packets.loss,
      cpu: null,
      memory: null,
      temp: null,
      ping,
      traceroute,
      checkedAt: new Date().toISOString()
    }
  };
}

module.exports = { getDeviceHealth };
