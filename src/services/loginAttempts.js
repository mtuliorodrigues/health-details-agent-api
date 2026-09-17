const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// One persistent store shared by every Vercel invocation. No passwords or raw IPs.
function createLoginAttempts(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
  const read = db.prepare('SELECT count, expires FROM attempts WHERE bucket = ?');
  const write = db.prepare('INSERT INTO attempts (bucket, count, expires) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1');
  const clean = db.prepare('DELETE FROM attempts WHERE expires <= ?');
  return {
    consume(clientKey, now = Date.now()) {
      db.exec('BEGIN IMMEDIATE');
      try {
        clean.run(now);
        const buckets = [[`client:${clientKey}`, 10], ['global', 100]];
        let retryAfter = 0;
        for (const [key, limit] of buckets) {
          const current = read.get(key);
          if (current && current.count >= limit) retryAfter = Math.max(retryAfter, Math.ceil((current.expires - now) / 1000));
        }
        if (!retryAfter) for (const [key] of buckets) write.run(key, now + 15 * 60 * 1000);
        db.exec('COMMIT');
        return { allowed: retryAfter === 0, retryAfter };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close() { db.close(); }
  };
}

let store;
function consumeLoginAttempt(clientKey) {
  store ||= createLoginAttempts(path.join(__dirname, '../../.local-state/login-attempts.sqlite'));
  return store.consume(clientKey);
}
module.exports = { createLoginAttempts, consumeLoginAttempt };
