function headerIndex(headers, pattern) {
  return headers.findIndex((header) => pattern.test(header));
}

function clientsFromTable(table, { includeCcq = false } = {}) {
  const headers = table.headers.map((item) => item.toLowerCase());
  const radioNameIndex = headerIndex(headers, /radio name|station|client|name|hostname/);
  const macIndex = headerIndex(headers, /mac|address/);
  const uptimeIndex = headerIndex(headers, /^uptime$/);
  const signalIndex = headerIndex(headers, /^signal$|signal strength|rssi/);
  const txRxSignalStrengthIndex = headerIndex(headers, /tx\s*\/\s*rx.*signal|signal.*tx\s*\/\s*rx/);
  const ccqIndex = includeCcq ? headerIndex(headers, /ccq/) : -1;

  return table.rows.map((cells) => ({
    radioName: radioNameIndex >= 0 ? cells[radioNameIndex] || null : null,
    mac: macIndex >= 0 ? cells[macIndex] || null : null,
    uptime: uptimeIndex >= 0 ? cells[uptimeIndex] ?? null : null,
    txRxSignalStrength: cells[txRxSignalStrengthIndex >= 0 ? txRxSignalStrengthIndex : signalIndex] ?? null,
    txRxCcq: ccqIndex >= 0 ? cells[ccqIndex] ?? null : null
  })).filter((client) => client.radioName || client.mac || client.txRxSignalStrength !== null || client.txRxCcq !== null);
}

function clientsFromUbiquitiText(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const deviceName = lines.findIndex((line) => /^device\s*name$/i.test(line));
  const signal = lines.findIndex((line, index) => index > deviceName && /^signal$/i.test(line));
  const remoteSignal = lines.findIndex((line, index) => index > signal && /^remote\s*signal$/i.test(line));
  const connectionTime = lines.findIndex((line, index) => index > remoteSignal && /^connection\s*time$/i.test(line));
  if (deviceName < 0 || signal < 0 || remoteSignal < 0 || connectionTime < 0) return [];
  const clients = [];
  const values = lines.slice(connectionTime + 1);
  for (let index = 0; index + 3 < values.length; index += 4) {
    const [radioName, localSignal, remote, uptime] = values.slice(index, index + 4);
    clients.push({ radioName, mac: null, uptime, txRxSignalStrength: localSignal, txRxCcq: remote });
  }
  return clients;
}

function ubiquitiUptimeFromText(text) { const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean); const index = lines.findIndex((line) => /^tempo de disponibilidade$/i.test(line)); return index >= 0 ? lines[index + 1] || null : null; }
function clientFromUbiquitiDashboard(text) { const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean); const remote = lines.findIndex((line) => /^remote\b/i.test(line)); const signals = lines.filter((line) => /^sinal\s+/i.test(line)).map((line) => line.replace(/^sinal\s+/i, '')); const time = lines.findIndex((line) => /^connection time$/i.test(line)); const name = lines.slice(remote + 1).find((line) => !/^nanostation|^[0-9a-f]{2}:/i.test(line)); return remote >= 0 && name && signals.length >= 2 && time >= 0 ? [{ radioName: name, mac: null, uptime: lines[time + 1] || null, txRxSignalStrength: signals[0], txRxCcq: signals[1] }] : []; }
function valueFromPanel(text, label) { const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean); const index = lines.findIndex((line) => line.replace(/:$/, '').toLowerCase() === label.toLowerCase()); return index >= 0 ? lines[index + 1] || null : null; }
function clientsFromM5Table(table) { if (!table) return []; const headers = table.headers.map((header) => header.toLowerCase().replace(/\s+/g, ' ').trim()); const find = (p) => headers.findIndex((header) => p.test(header)); const device = find(/device name/); const name = device >= 0 ? device : find(/station|name/); const ccq = find(/ccq/); const time = find(/connection time|uptime/); const tx = find(/tx signal/); const rx = find(/rx signal/); return table.rows.map((row) => ({ radioName: name >= 0 ? row[name] || null : null, mac: null, uptime: time >= 0 ? row[time] || null : null, txRxSignalStrength: tx >= 0 ? row[tx] || null : null, txRxCcq: ccq >= 0 ? row[ccq] || null : null, rxSignal: rx >= 0 ? row[rx] || null : null })).filter((client) => client.radioName || client.txRxCcq || client.uptime); }

module.exports = { clientsFromTable, clientsFromUbiquitiText, ubiquitiUptimeFromText, clientFromUbiquitiDashboard, valueFromPanel, clientsFromM5Table };
