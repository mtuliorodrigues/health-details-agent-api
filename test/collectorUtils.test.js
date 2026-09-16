const test = require('node:test');
const assert = require('node:assert/strict');
const { clientsFromTable } = require('../src/collectors/collectorUtils');

test('estrutura os campos da tabela MikroTik sem alterar seus valores', () => {
  const clients = clientsFromTable({
    headers: ['Radio Name', 'MAC Address', 'Uptime', 'Tx/Rx Signal Strength (dBm)', 'Tx/Rx CCQ'],
    rows: [['cliente-a', 'AA:BB:CC:DD:EE:FF', '2d 03:15:00', '-55/-57', '92/91%']]
  }, { includeCcq: true });
  assert.deepEqual(clients, [{ radioName: 'cliente-a', mac: 'AA:BB:CC:DD:EE:FF', uptime: '2d 03:15:00', txRxSignalStrength: '-55/-57', txRxCcq: '92/91%' }]);
});
