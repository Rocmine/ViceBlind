import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const K = require('../src/shared/keywords.js');

const balanced = K.compile({ level: 'balanced' });
const light = K.compile({ level: 'light' });
const strict = K.compile({ level: 'strict' });

const HITS = [
  'GTA 6', 'GTA6', 'gta 6', 'Gta-6', 'GTA_6', 'GTA.6', 'GTA VI', 'gta vi', 'GTA-VI', 'GTA_VI', 'GTAVI',
  'GTA Six', 'gta six', '#GTA6', '#GTAVI', 'GTA6Trailer', 'GTA 6!', '(GTA 6)', '"GTA VI"', 'GTA 6',
  'Grand Theft Auto VI', 'Grand Theft Auto 6', 'grand theft auto six', 'Grand Theft Auto: VI'.replace(':', ''),
  'GTA 6’s release', 'ГТА 6', 'GTA 6の発売日',
  'Is GTA 6 out on PC?', 'Top 10 GTA VI theories', 'gta-6-trailer-3-breakdown',
];
for (const s of HITS) {
  test(`core hit: ${s}`, () => {
    assert.ok(light.test(s), `light should match "${s}"`);
    assert.ok(balanced.test(s), `balanced should match "${s}"`);
  });
}

const MISSES = [
  'GTA V', 'GTA 5', 'GTA5', 'GTA 60fps', 'GTA 600', 'GTA via mods', 'GTA visuals', 'GTA vice', 'GTA Sixteen',
  'played GTA. 6 hours straight', 'GTA, 6 friends', 'AGTA 6', 'MGTA6',
  'Grand Theft Auto V', 'Grand Theft Auto 5', 'Grand Theft Auto IV', 'Grand Theft Auto: San Andreas',
  'Jason Momoa', 'Jason Statham', 'Lucia', 'Lucia di Lammermoor', 'Jason', 'Duval', 'Cal', 'Brian',
  'Vice versa', 'Viceroy', 'Leonidas', 'Leonid', 'Grass rivers of Ohio'.replace('Grass rivers', 'Grass-fed rivers'),
  'Ambrosia salad', 'rockstar', 'Take 2 minutes', 'the Kalamata olives',
];
for (const s of MISSES) {
  test(`balanced miss: ${s}`, () => {
    // "rockstar" and "Ambrosia" are strict-only; everything here must pass balanced.
    assert.equal(balanced.test(s), false, `balanced should NOT match "${s}"`);
  });
}

test('character names', () => {
  for (const s of ['Jason Duval', 'jason duval', 'Lucia Caminos', 'Jason and Lucia', 'Lucia & Jason', 'Cal Hampton',
    'Boobie Ike', "Dre'Quan Priest", 'DreQuan', 'Real Dimez', 'Bae-Luxe', 'Bae Luxe', 'Raul Bautista', 'Raúl Bautista',
    'Brian Heder', "Jason Duval's"]) {
    assert.ok(balanced.test(s), s);
    assert.equal(light.test(s), false, `light must not match ${s}`);
  }
});

test('places', () => {
  for (const s of ['Leonida', 'the Leonida Keys', 'Vice City', 'vice city map', 'Grassrivers', 'Port Gellhorn', 'Mount Kalaga', 'Mt. Kalaga']) {
    assert.ok(balanced.test(s), s);
    assert.equal(light.test(s), false, `light must not match ${s}`);
  }
});

test('studio words are strict only', () => {
  for (const s of ['Rockstar Games', 'Rockstar', 'Take-Two', 'Take Two Interactive', 'GTA Online', 'Ambrosia', 'Grand Theft Auto']) {
    assert.equal(balanced.test(s), false, `balanced must not match ${s}`);
    assert.ok(strict.test(s), `strict should match ${s}`);
  }
});

test('first() reports the matching term and text', () => {
  const m = balanced.first('New Lucia Caminos clip from GTA 6');
  assert.equal(m.term.label, 'Lucia Caminos');
  assert.equal(m.text, 'Lucia Caminos');
  assert.equal(balanced.first('GTA VI leak').term.pack, 'core');
});

test('all() returns every match in order', () => {
  const ms = balanced.all('GTA 6 in Vice City with Jason Duval');
  assert.deepEqual(ms.map((m) => m.text), ['GTA 6', 'Vice City', 'Jason Duval']);
  assert.ok(ms.every((m, i) => i === 0 || m.index > ms[i - 1].index));
});

test('testCore ignores non-core packs', () => {
  assert.ok(balanced.testCore('gta-6-trailer'));
  assert.equal(balanced.testCore('vice-city-map'), false);
});

test('custom words: plain, phrase, wildcard, too short', () => {
  const c = K.compile({ level: 'light', custom: ['Tommy Vercetti', 'trailer*', 'a', '*'] });
  assert.ok(c.test('Tommy Vercetti returns'));
  assert.ok(c.test('trailer'));
  assert.ok(c.test('trailers'));
  assert.ok(c.test('the trailer3 drop'));
  assert.equal(c.test('Tommy'), false);
  assert.equal(c.test('a b c'), false, 'one-letter custom word is ignored');
  assert.equal(c.test('anything'), false, 'bare * is ignored');
  assert.ok(c.test('GTA 6'), 'core stays on');
});

test('custom words are escaped, not treated as regex', () => {
  const c = K.compile({ level: 'light', custom: ['(.*)', 'c++', 'a.b'] });
  assert.equal(c.test('anything at all'), false);
  assert.ok(c.test('a.b'));
  assert.equal(c.test('axb'), false);
});

test('muting a term works, but core cannot be muted', () => {
  const c = K.compile({ level: 'balanced', muted: ['Vice City', 'GTA 6 / GTA VI'] });
  assert.equal(c.test('Vice City'), false);
  assert.ok(c.test('GTA 6'));
});

test('unknown level falls back to balanced', () => {
  assert.ok(K.compile({ level: 'nope' }).test('Jason Duval'));
  assert.ok(K.compile().test('Leonida'));
});

test('regex is stateless across calls (no lastIndex bug)', () => {
  for (let i = 0; i < 5; i++) assert.ok(balanced.test('GTA 6'));
  assert.equal(balanced.all('GTA 6 GTA 6').length, 2);
  assert.equal(balanced.all('GTA 6 GTA 6').length, 2);
});

test('performance: 200 KB of text under 100 ms', () => {
  const chunk = 'The quick brown fox jumps over the lazy dog while reading patch notes for another game entirely. ';
  const big = chunk.repeat(2200) + ' GTA 6';
  const t0 = performance.now();
  assert.ok(balanced.test(big));
  const dt = performance.now() - t0;
  assert.ok(dt < 100, `took ${dt.toFixed(1)} ms`);
});
