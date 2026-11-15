import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const K = require('../src/shared/keywords.js');
const S = require('../src/shared/settings.js');

test('wildcards are suffix-only: inner or leading wildcards are ignored', () => {
  const c = K.compile({ level: 'light', custom: ['a*b*c*d*e', 'ok*word', '*lead', 'trail*'] });
  assert.equal(c.test('aXbXcXdXe'), false, 'chained wildcards must not compile');
  assert.equal(c.test('okayword'), false, 'inner wildcard must not compile');
  assert.equal(c.test('leading'), false, 'leading wildcard must not compile');
  assert.ok(c.test('trailers'), 'a suffix wildcard still works');
  assert.ok(c.test('trail'), 'and matches the bare word');
});

test('a suffix wildcard is bounded to 40 extra letters', () => {
  const c = K.compile({ level: 'light', custom: ['trail*'] });
  assert.ok(c.test('trail' + 'x'.repeat(40)));
  assert.equal(c.test('trail' + 'x'.repeat(41)), false);
});

test('worst-case custom words stay fast on hostile text (the old chained-wildcard hang)', () => {
  const words = ['a*a*a*b', 'x*y*z*q', '*aa*aa*aa', 'aaaa*', 'a* a* a* b', 'jason*duval*lucia*caminos'];
  const c = K.compile({ level: 'strict', custom: words });
  const hostile = 'a'.repeat(100000) + ' ' + 'x y '.repeat(25000);
  const t0 = performance.now();
  c.test(hostile);
  c.first(hostile);
  const dt = performance.now() - t0;
  assert.ok(dt < 750, `matching took ${dt.toFixed(0)} ms`);
});

test('very long text is scanned in windows, nothing is skipped', () => {
  const c = K.compile({ level: 'light' });
  assert.ok(c.test('x'.repeat(200000) + ' GTA 6'), 'match at the very end');
  assert.ok(c.test('GTA 6 ' + 'x'.repeat(200000)), 'match at the very start');
  const pad = 'x'.repeat(49990);
  assert.ok(c.test(pad + ' GTA 6 ' + 'y'.repeat(60000)), 'match straddling a window boundary');
  assert.equal(c.first('x'.repeat(120000) + ' GTA 6').index, 120001);
});

test('200 custom words compile and match quickly', () => {
  const words = Array.from({ length: 200 }, (_, i) => `custom word number ${i}`);
  const t0 = performance.now();
  const c = K.compile({ level: 'balanced', custom: words });
  assert.ok(c.test('this has custom word number 199 in it'));
  assert.ok(performance.now() - t0 < 500);
});

test('settings.clean: garbage becomes safe defaults', () => {
  for (const bad of [null, undefined, 42, 'x', [], { level: 'root', style: {}, reveal: 7, custom: 'nope', trusted: 5, pcDate: '2026-13-99x', motion: 'maybe' }]) {
    const s = S.clean(bad);
    assert.ok(['light', 'balanced', 'strict'].includes(s.level));
    assert.ok(['blur', 'cover', 'remove'].includes(s.style));
    assert.ok(['two', 'one', 'locked'].includes(s.reveal));
    assert.ok(Array.isArray(s.custom) && Array.isArray(s.trusted) && Array.isArray(s.muted));
    assert.ok(s.pcDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(s.pcDate));
    assert.ok(s.motion === 'on' || s.motion === 'off');
  }
});

test('settings.clean: oversized lists and strings are truncated', () => {
  const s = S.clean({
    custom: Array.from({ length: 5000 }, (_, i) => 'w'.repeat(500) + i),
    trusted: Array.from({ length: 5000 }, (_, i) => `site${i}.example`),
    muted: Array.from({ length: 5000 }, (_, i) => `m${i}`),
  });
  assert.ok(s.custom.length <= 200 && s.custom.every((w) => w.length <= 60));
  assert.ok(s.trusted.length <= 500);
  assert.ok(s.muted.length <= 100);
});

test('settings.clean: non-string list entries are dropped, prototype keys ignored', () => {
  const s = S.clean(JSON.parse('{"custom":[1,null,{"a":1},"ok word"],"__proto__":{"enabled":false},"constructor":{"x":1}}'));
  assert.deepEqual(s.custom, ['ok word']);
  assert.equal(s.enabled, true);
  assert.equal(Object.prototype.enabled, undefined, 'prototype must not be polluted');
});

test('trusted-site matching does not trust look-alike domains', () => {
  const s = S.clean({ trusted: ['example.com'] });
  assert.ok(S.isTrusted(s, 'example.com'));
  assert.ok(S.isTrusted(s, 'www.example.com'));
  assert.ok(S.isTrusted(s, 'a.b.example.com'));
  assert.equal(S.isTrusted(s, 'evilexample.com'), false);
  assert.equal(S.isTrusted(s, 'example.com.evil.net'), false);
  assert.equal(S.isTrusted(s, ''), false);
});
