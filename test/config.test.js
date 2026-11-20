import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { RateLimiter } from '../src/rate-limit.js';

test('config requires a long token and validates numbers', () => {
  assert.throws(() => loadConfig({}), /BRIDGE_TOKEN/);
  assert.throws(() => loadConfig({ BRIDGE_TOKEN: 'short' }), /BRIDGE_TOKEN/);
  const token = 'x'.repeat(32);
  assert.throws(() => loadConfig({ BRIDGE_TOKEN: token, MAX_TEXT_LENGTH: '500' }), /MAX_TEXT_LENGTH/);
  assert.throws(() => loadConfig({ BRIDGE_TOKEN: token, PORT: 'abc' }), /PORT/);
  const config = loadConfig({ BRIDGE_TOKEN: token, ALLOWED_DEVICE_IDS: ' A1, B2 ,', MEDIA_HOST_ALLOWLIST: 'Media.Example.com' });
  assert.deepEqual([...config.allowedDeviceIds], ['A1', 'B2']);
  assert.deepEqual([...config.mediaHostAllowlist], ['media.example.com']);
  assert.equal(config.host, '127.0.0.1');
});

test('rate limiter refills over time and honors cooldown', () => {
  let now = 0;
  const limiter = new RateLimiter({ perMinute: 6, burst: 1, now: () => now });
  assert.equal(limiter.take(), 0);
  assert.equal(limiter.take(), 10);
  now = 10_000;
  assert.equal(limiter.take(), 0);
  limiter.startCooldown(60);
  now = 30_000;
  assert.equal(limiter.take(), 40);
});
