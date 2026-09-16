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

module.exports = { clientsFromTable };
