const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLoginAttempts } = require('../src/services/loginAttempts');

test('limite persiste após reabertura, separa clientes e libera após 15 minutos', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'health-login-test-'));
  const filename = path.join(directory, 'attempts.sqlite');
  let store = createLoginAttempts(filename);
  try {
    for (let i = 0; i < 10; i++) assert.equal(store.consume('client-a', 1000).allowed, true);
    assert.deepEqual(store.consume('client-a', 1001), { allowed: false, retryAfter: 900 });
    store.close(); store = createLoginAttempts(filename);
    assert.equal(store.consume('client-a', 1002).allowed, false);
    assert.equal(store.consume('client-b', 1002).allowed, true);
    assert.equal(store.consume('client-a', 901000).allowed, true);
  } finally { store.close(); fs.rmSync(directory, { recursive: true }); }
});

test('limite global bloqueia tentativas distribuídas sem crescer indefinidamente', () => {
  const store = createLoginAttempts(':memory:');
  try {
    for (let i = 0; i < 100; i++) assert.equal(store.consume(`client-${i}`, 1000).allowed, true);
    assert.equal(store.consume('another-client', 1000).allowed, false);
  } finally { store.close(); }
});
