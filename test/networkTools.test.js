const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePing, parseTraceroute } = require('../src/utils/networkTools');
const { isPrivateIp, normalizeIp } = require('../src/utils/ipUtils');

test('parseia resumo de ping do Windows', () => {
  const result = parsePing('Packets: Sent = 3, Received = 3, Lost = 0 (0% loss),\r\nAverage = 12ms');
  assert.deepEqual(result, { packets: { sent: 3, received: 3, loss: 0 }, latency: 12 });
});

test('parseia resumo de ping do Windows em português', () => {
  const result = parsePing('Pacotes: Enviados = 4, Recebidos = 4, Perdidos = 0 (0% de perda),\r\nMédia = 3ms');
  assert.deepEqual(result, { packets: { sent: 4, received: 4, loss: 0 }, latency: 3 });
});

test('parseia resumo de ping Unix', () => {
  const result = parsePing('3 packets transmitted, 2 received, 33.333% packet loss\nrtt min/avg/max/mdev = 1.0/4.7/8.2/0.5 ms');
  assert.equal(result.packets.loss, 33.333);
  assert.equal(result.latency, 5);
});

test('mantém saltos com latência no traceroute', () => {
  const hops = parseTraceroute('  1    1 ms    2 ms    3 ms  10.0.0.1\n  2     *        *        *');
  assert.deepEqual(hops, [{ hop: 1, route: '10.0.0.1', latency: '2 ms' }, { hop: 2, route: '*', latency: null }]);
});

test('normaliza e restringe IPs a faixas privadas', () => {
  assert.equal(normalizeIp('192.168.001.010'), '192.168.1.10');
  assert.equal(isPrivateIp('192.168.1.10'), true);
  assert.equal(isPrivateIp('8.8.8.8'), false);
});
