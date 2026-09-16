const { execFile } = require('child_process');

const COMMAND_TIMEOUT_MS = 5_000;

function execute(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: COMMAND_TIMEOUT_MS, windowsHide: true }, (error, stdout = '', stderr = '') => {
      resolve({ error, stdout, stderr });
    });
  });
}

async function runPing(ip) {
  const isWindows = process.platform === 'win32';
  const { error, stdout, stderr } = await execute('ping', isWindows ? ['-n', '4', '-w', '1000', ip] : ['-c', '4', '-W', '1', ip]);
  const parsed = parsePing(stdout);
  return { success: !error && parsed.packets.received > 0, packets: parsed.packets, latency: parsed.latency, error: error ? 'Ping não respondeu.' : null, output: (stdout || stderr).trim().slice(0, 240) };
}

async function runTracert(ip) {
  const isWindows = process.platform === 'win32';
  const { error, stdout, stderr } = await execute(isWindows ? 'tracert' : 'traceroute', isWindows ? ['-d', '-h', '10', '-w', '1000', ip] : ['-n', '-m', '10', '-w', '1', ip]);
  return { success: !error, hops: parseTraceroute(stdout), error: error ? 'Traceroute não foi concluído.' : null, output: (stdout || stderr).trim().slice(0, 250) };
}

function parsePing(output = '') {
  const windows = output.match(/(?:Sent|Enviados)\s*=\s*(\d+),\s*(?:Received|Recebidos)\s*=\s*(\d+),\s*(?:Lost|Perdidos)\s*=\s*(\d+)/i);
  const unix = output.match(/(\d+)\s+packets\s+transmitted,\s+(\d+)\s+(?:packets\s+)?received(?:,\s*[^\n]*?(\d+(?:\.\d+)?)%\s*packet loss)?/i);
  const sent = windows ? Number(windows[1]) : unix ? Number(unix[1]) : 0;
  const received = windows ? Number(windows[2]) : unix ? Number(unix[2]) : 0;
  const loss = windows ? Number(windows[3]) : unix && unix[3] ? Number(unix[3]) : sent ? 100 : 0;
  const average = output.match(/(?:Average|M.{0,2}dia)\s*=\s*<?(\d+)ms/i) || output.match(/=\s*[\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+\s*ms/i);
  return { packets: { sent, received, loss: Math.max(0, Math.min(100, loss)) }, latency: average ? Math.round(Number(average[1])) : null };
}

function parseTraceroute(output = '') {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) return [];
    const addresses = match[2].match(/(?:\d{1,3}\.){3}\d{1,3}/g);
    const times = [...match[2].matchAll(/<?(\d+)\s*ms/gi)].map((item) => Number(item[1]));
    return [{ hop: Number(match[1]), route: addresses ? addresses.at(-1) : '*', latency: times.length ? `${Math.round(times.reduce((sum, value) => sum + value, 0) / times.length)} ms` : null }];
  });
}

module.exports = { runPing, runTracert, parsePing, parseTraceroute };
