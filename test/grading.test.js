// Run: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../grading.js');

const lows = (scale) => scale.map((b) => b.from);
const ranges = (scale) => scale.map((b) => (b.reachable ? [b.from, b.to] : null));

test('100 points reproduce the official IHK key (§ 24 MPO)', () => {
  const whole = G.buildScale({ max: 100, step: 1, bonus: 0 });
  assert.deepEqual(ranges(whole), [[92, 100], [81, 91], [67, 80], [50, 66], [30, 49], [0, 29]]);
  const half = G.buildScale({ max: 100, step: 0.5, bonus: 0 });
  assert.deepEqual(ranges(half), [[92, 100], [81, 91.5], [67, 80.5], [50, 66.5], [30, 49.5], [0, 29.5]]);
  assert.deepEqual(G.KEY.map((b) => b.word), ['sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend']);
});

test('decimal grades follow § 24 MPO and agree with the grade bands', () => {
  const expected = { 100: 1.0, 99: 1.1, 98: 1.1, 93: 1.4, 92: 1.4, 91: 1.5, 86: 2.0, 85: 2.0, 81: 2.4, 80: 2.5, 79: 2.5,
    76: 2.8, 73: 3.0, 67: 3.4, 66: 3.5, 61: 3.8, 57: 4.0, 50: 4.4, 49: 4.5, 31: 5.4, 30: 5.4, 29: 5.5, 25: 5.5,
    24: 5.6, 15: 5.7, 14: 5.8, 9: 5.9, 5: 5.9, 4: 6.0, 0: 6.0 };
  for (const [points, decimal] of Object.entries(expected)) assert.equal(G.decimalForIhkPoints(Number(points)), decimal, points + ' IHK-Punkte');
  let previous = 0;
  for (let p = 100; p >= 0; p--) {
    const decimal = G.decimalForIhkPoints(p);
    assert.ok(decimal >= previous, 'monotone at ' + p);
    assert.equal(Math.round(decimal), G.bandForIhkPoints(p).grade, 'band of ' + p + ' IHK-Punkte');
    previous = decimal;
  }
});

test('thresholds are rounded up to the step, never down', () => {
  // 13 points: 92 % = 11,96 · 81 % = 10,53 · 67 % = 8,71 · 50 % = 6,5 · 30 % = 3,9
  assert.deepEqual(lows(G.buildScale({ max: 13, step: 0.5, bonus: 0 })), [12, 11, 9, 6.5, 4, 0]);
  assert.deepEqual(lows(G.buildScale({ max: 13, step: 1, bonus: 0 })), [12, 11, 9, 7, 4, 0]);
  // The old version rounded to the nearest half point and gave a 3 for 8,5 of 13 (65 %)
  assert.equal(G.evaluate(8.5, { max: 13, step: 0.5, bonus: 0 }).grade, 4);
  // Exact percentages stay exact (no floating point drift: 0.92 * 100 = 92.00000000000001)
  assert.deepEqual(lows(G.buildScale({ max: 50, step: 0.5, bonus: 0 })), [46, 40.5, 33.5, 25, 15, 0]);
});

test('every score in every scale gets the grade of its percentage', () => {
  for (const step of G.STEPS) {
    for (let max = step; max <= 120; max += step) {
      const settings = { max, step, bonus: 0 };
      const scale = G.buildScale(settings);
      for (let units = 0; units * step <= max; units++) {
        const points = units * step;
        const r = G.evaluate(points, settings, scale);
        const percent = (points * 100) / max;
        const band = G.KEY.find((b) => percent >= b.min - 1e-9);
        assert.equal(r.grade, band.grade, `${points}/${max} (Schritt ${step})`);
        assert.equal(G.bandForIhkPoints(r.ihkPoints).grade, r.grade, `IHK-Punkte ${points}/${max}`);
        const row = scale[r.grade - 1];
        assert.ok(row.reachable && points >= row.from && points <= row.to, `Zeile ${points}/${max}`);
      }
    }
  }
});

test('tiny maxima leave some grades unreachable', () => {
  const scale = G.buildScale({ max: 2, step: 1, bonus: 0 });
  assert.deepEqual(scale.map((b) => b.reachable), [true, false, false, true, false, true]);
  assert.equal(G.evaluate(2, { max: 2, step: 1, bonus: 0 }).grade, 1);
  assert.equal(G.evaluate(1, { max: 2, step: 1, bonus: 0 }).grade, 4);
});

test('bonus points extend the top band, thresholds stay on the maximum', () => {
  const settings = { max: 30, step: 0.5, bonus: 3 };
  const scale = G.buildScale(settings);
  assert.deepEqual(ranges(scale)[0], [28, 33]);
  assert.deepEqual(lows(scale), lows(G.buildScale({ max: 30, step: 0.5, bonus: 0 })));
  const r = G.evaluate(33, settings);
  assert.equal(r.grade, 1);
  assert.equal(r.ihkPoints, 100);
  assert.equal(r.decimal, 1.0);
  assert.ok(r.share > 1);
});

test('points missing for the next better grade', () => {
  const settings = { max: 13, step: 0.5, bonus: 0 };
  assert.equal(G.evaluate(11.5, settings).missing, 0.5);
  assert.equal(G.evaluate(11.5, settings).better.grade, 1);
  assert.equal(G.evaluate(13, settings).better, null);
  // skips unreachable grades: with 2 points max, 1 point (4) → next is 1
  assert.equal(G.evaluate(1, { max: 2, step: 1, bonus: 0 }).better.grade, 1);
});

test('input validation', () => {
  assert.equal(G.parseNumber('11,5'), 11.5);
  assert.equal(G.parseNumber(' 12 '), 12);
  assert.ok(Number.isNaN(G.parseNumber('')));
  assert.ok(Number.isNaN(G.parseNumber('-3')));
  assert.ok(Number.isNaN(G.parseNumber('1.000,5')));
  assert.deepEqual(G.checkSettings({ max: 40, step: 0.5, bonus: 0 }), {});
  assert.ok(G.checkSettings({ max: 0, step: 0.5, bonus: 0 }).max);
  assert.ok(G.checkSettings({ max: 13.25, step: 0.5, bonus: 0 }).max);
  assert.ok(G.checkSettings({ max: 13.5, step: 1, bonus: 0 }).max);
  assert.ok(G.checkSettings({ max: 13, step: 1, bonus: 0.5 }).bonus);
  const s = { max: 13, step: 1, bonus: 0 };
  assert.equal(G.checkPoints(12, s), null);
  assert.match(G.checkPoints(11.5, s), /Halbe Punkte/);
  assert.match(G.checkPoints(14, s), /Mehr als 13/);
  assert.equal(G.checkPoints(14, { max: 13, step: 1, bonus: 1 }), null);
});

test('class lists: names, separators and units', () => {
  const { entries, skipped } = G.parseList([
    'Name;Punkte',
    'Anna Schmidt\t11,5',
    'Ben: 9',
    'Cem;12.5',
    'Dana, 7 Punkte',
    '',
    '10 8,5; 6',
    '3, 4,5, 2'
  ].join('\n'));
  assert.deepEqual(entries.map((e) => [e.name, e.points]), [
    ['Anna Schmidt', 11.5], ['Ben', 9], ['Cem', 12.5], ['Dana', 7],
    ['', 10], ['', 8.5], ['', 6], ['', 3], ['', 4.5], ['', 2]
  ]);
  assert.deepEqual(skipped.map((s) => s.line), [1]);
});

test('class statistics', () => {
  const result = G.evaluateList('Anna 13\nBen 11,5\nCem 6\nDana 20\nEmil 9,25', { max: 13, step: 0.5, bonus: 0 });
  assert.deepEqual(result.rows.map((r) => r.grade), [1, 2, 5]);
  assert.deepEqual(result.skipped.map((s) => s.line), [4, 5]);
  assert.equal(result.stats.count, 3);
  assert.equal(result.stats.passed, 2);
  assert.deepEqual(result.stats.distribution, [1, 1, 0, 0, 1, 0]);
  assert.ok(Math.abs(result.stats.averageGrade - 8 / 3) < 1e-12);
  assert.equal(G.evaluateList('', { max: 13, step: 0.5, bonus: 0 }).stats, null);
});

test('every score listed for the lookup table', () => {
  const rows = G.allScores({ max: 13, step: 0.5, bonus: 1 });
  assert.equal(rows.length, 29);
  assert.equal(rows[0].points, 14);
  assert.equal(rows.at(-1).points, 0);
});
