import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaUrl, validateTargets, validateText } from '../src/validate.js';

const zoneOpts = { allowedDeviceIds: new Set(), maxZoneSize: 3 };
const urlOpts = { mediaHostAllowlist: new Set(['media.example.com']), maxUrlLength: 200 };

const rejects = (fn, status) => assert.throws(fn, (err) => err.status === status);

test('text: trims, collapses whitespace, enforces limits', () => {
  assert.equal(validateText('  Front   door\nis open ', 250), 'Front door is open');
  rejects(() => validateText('', 250), 400);
  rejects(() => validateText('   ', 250), 400);
  rejects(() => validateText(42, 250), 400);
  rejects(() => validateText('x'.repeat(11), 10), 400);
  rejects(() => validateText('bell\u0007', 250), 400);
  rejects(() => validateText('<speak>hi</speak>', 250), 400);
});

test('targets: valid ids, size cap, duplicates, allowlist', () => {
  assert.deepEqual(validateTargets(['G090XX', 'abc_1-2'], zoneOpts), ['G090XX', 'abc_1-2']);
  rejects(() => validateTargets([], zoneOpts), 400);
  rejects(() => validateTargets('G090XX', zoneOpts), 400);
  rejects(() => validateTargets(['a', 'b', 'c', 'd'], zoneOpts), 400);
  rejects(() => validateTargets(['a', 'a'], zoneOpts), 400);
  rejects(() => validateTargets(['bad id'], zoneOpts), 400);
  rejects(() => validateTargets(['../x'], zoneOpts), 400);
  const allowOpts = { allowedDeviceIds: new Set(['A1']), maxZoneSize: 3 };
  assert.deepEqual(validateTargets(['A1'], allowOpts), ['A1']);
  rejects(() => validateTargets(['A1', 'B2'], allowOpts), 403);
});

test('media url: accepts a public allowlisted https mp3', () => {
  const ok = 'https://media.example.com/sounds/doorbell.mp3';
  assert.equal(validateMediaUrl(ok, urlOpts), ok);
  assert.equal(validateMediaUrl('https://MEDIA.example.com:443/a.MP3', urlOpts), 'https://media.example.com/a.MP3');
});

test('media url: rejects unsafe or unsupported urls', () => {
  const cases = [
    ['http://media.example.com/a.mp3', 400],
    ['ftp://media.example.com/a.mp3', 400],
    ['file:///etc/passwd', 400],
    ['javascript:alert(1)', 400],
    ['https://user:pw@media.example.com/a.mp3', 400],
    ['https://media.example.com:8443/a.mp3', 400],
    ['https://media.example.com/a.mp3?token=secret', 400],
    ['https://media.example.com/a.mp3#t=1', 400],
    ['https://192.168.1.10/a.mp3', 400],
    ['https://[::1]/a.mp3', 400],
    ['https://localhost/a.mp3', 400],
    ['https://hubitat.lan/a.mp3', 400],
    ['https://nas.local/a.mp3', 400],
    ['https://evil.example.org/a.mp3', 403],
    ['https://media.example.com.evil.org/a.mp3', 403],
    ['https://media.example.com/a.wav', 400],
    ['https://media.example.com/a b.mp3', 400],
    ['/local/doorbell.mp3', 400],
    ['doorbell.mp3', 400],
    ['', 400],
    [`https://media.example.com/${'a'.repeat(200)}.mp3`, 400],
  ];
  for (const [url, status] of cases) {
    assert.throws(() => validateMediaUrl(url, urlOpts), (err) => err.status === status, url);
  }
});

test('media url: empty allowlist disables playback', () => {
  const opts = { mediaHostAllowlist: new Set(), maxUrlLength: 200 };
  rejects(() => validateMediaUrl('https://media.example.com/a.mp3', opts), 403);
});
