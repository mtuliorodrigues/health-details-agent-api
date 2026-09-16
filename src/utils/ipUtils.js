function validateIp(ip) {
  if (!ip || typeof ip !== 'string') return false;

  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;

  return parts.every(part => {
    if (!/^\d+$/.test(part)) return false;
    const val = Number(part);
    return val >= 0 && val <= 255;
  });
}

function normalizeIp(ip) {
  if (!validateIp(ip)) return null;
  return ip.trim().split('.').map(part => String(Number(part))).join('.');
}

function isPrivateIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  const [first, second] = normalized.split('.').map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

module.exports = {
  validateIp,
  normalizeIp,
  isPrivateIp
};
