const test = require('node:test');
const assert = require('node:assert/strict');
const { hasMatchingAgentKey } = require('../src/middleware/agentAuth');

test('aceita somente a chave interna exata', () => {
  assert.equal(hasMatchingAgentKey('chave-de-teste', 'chave-de-teste'), true);
  assert.equal(hasMatchingAgentKey('chave-invalida', 'chave-de-teste'), false);
  assert.equal(hasMatchingAgentKey(undefined, 'chave-de-teste'), false);
});
