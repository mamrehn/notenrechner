// Run: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../grading.js');

const S = (max, step = 0.5, bonus = 0) => ({ max, step, bonus });
const lows = (scale) => scale.map((b) => b.from);
const ranges = (scale) => scale.map((b) => (b.reachable ? [b.from, b.to] : null));
const percentRanges = (scale) => scale.map((b) => [b.percentFrom, b.percentTo, b.percentToIncluded]);

test('100 points reproduce the official IHK key (§ 24 MPO)', () => {
  assert.deepEqual(ranges(G.buildScale(S(100, 1))), [[92, 100], [81, 91], [67, 80], [50, 66], [30, 49], [0, 29]]);
  assert.deepEqual(ranges(G.buildScale(S(100, 0.5))), [[92, 100], [81, 91.5], [67, 80.5], [50, 66.5], [30, 49.5], [0, 29.5]]);
  // lower bound included, upper bound excluded ("81 – unter 92"), only 100 % included
  assert.deepEqual(percentRanges(G.buildScale(S(100))), [[92, 100, true], [81, 92, false], [67, 81, false], [50, 67, false], [30, 50, false], [0, 30, false]]);
  assert.deepEqual(G.KEY.map((b) => b.word), ['sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend']);
});

test('decimal grades follow § 24 MPO and agree with the grade bands', () => {
  const expected = { 100: 1.0, 99: 1.1, 98: 1.1, 93: 1.4, 92: 1.4, 91: 1.5, 86: 2.0, 85: 2.0, 81: 2.4, 80: 2.5, 79: 2.5,
    76: 2.8, 73: 3.0, 67: 3.4, 66: 3.5, 61: 3.8, 57: 4.0, 50: 4.4, 49: 4.5, 31: 5.4, 30: 5.4, 29: 5.5, 25: 5.5,
    24: 5.6, 15: 5.7, 14: 5.8, 9: 5.9, 5: 5.9, 4: 6.0, 0: 6.0 };
  for (const [percent, decimal] of Object.entries(expected)) assert.equal(G.decimalForPercent(Number(percent)), decimal, percent + ' %');
  let previous = 0;
  for (let p = 100; p >= 0; p--) {
    const decimal = G.decimalForPercent(p);
    assert.ok(decimal >= previous, 'monotone at ' + p);
    assert.equal(Math.round(decimal), G.bandForPercent(p).grade, 'band of ' + p + ' %');
    previous = decimal;
  }
  assert.equal(G.decimalForPercent(91.96), 1.5, 'rounded down, not up');
});

test('table bounds are rounded up to the grid, never down', () => {
  // 13 points: 92 % = 11,96 · 81 % = 10,53 · 67 % = 8,71 · 50 % = 6,5 · 30 % = 3,9
  assert.deepEqual(lows(G.buildScale(S(13, 0.5))), [12, 11, 9, 6.5, 4, 0]);
  assert.deepEqual(lows(G.buildScale(S(13, 1))), [12, 11, 9, 7, 4, 0]);
  // The first version rounded to the nearest half point and gave a 3 for 8,5 of 13 (65 %)
  assert.equal(G.evaluate(8.5, S(13)).grade, 4);
  // No floating point drift: 0.92 * 100 = 92.00000000000001
  assert.deepEqual(lows(G.buildScale(S(50, 0.5))), [46, 40.5, 33.5, 25, 15, 0]);
});

test('hundredths (mebis default) give the exact percent bounds', () => {
  const scale = G.buildScale(S(13, 0.01));
  assert.deepEqual(lows(scale), [11.96, 10.53, 8.71, 6.5, 3.9, 0]);
  assert.deepEqual(ranges(scale).slice(0, 2), [[11.96, 13], [10.53, 11.95]], 'no 11.950000000000001');
  assert.deepEqual(lows(G.buildScale(S(17, 0.01))), [15.64, 13.77, 11.39, 8.5, 5.1, 0]);
});

test('every grid score lies in the table row of its grade', () => {
  for (const step of [0.5, 1]) {
    for (let max = step; max <= 120; max += step) {
      const settings = S(max, step);
      const scale = G.buildScale(settings);
      for (let units = 0; units * step <= max; units++) {
        const points = units * step;
        const r = G.evaluate(points, settings, scale);
        assert.equal(r.grade, G.bandForPercent(r.wholePercent).grade, `${points}/${max} (Schritt ${step})`);
        assert.ok(r.onTable, `Zeile ${points}/${max}`);
      }
    }
  }
  for (const max of [13, 17.5, 40, 99.99]) {
    const settings = S(max, 0.01);
    const scale = G.buildScale(settings);
    for (let units = 0; units <= Math.round(max * 100); units++) {
      const r = G.evaluate(units / 100, settings, scale);
      assert.ok(r.onTable, `Zeile ${units / 100}/${max} (Schritt 0,01)`);
    }
  }
});

test('decimal scores (mebis) are graded by their exact percentage', () => {
  const r1 = G.evaluate(11.97, S(13));            // 92,08 %
  assert.equal(r1.grade, 1);
  assert.equal(r1.onTable, false, 'between the ranges 11–11,5 and 12–13');
  const r2 = G.evaluate(11.95, S(13));            // 91,92 %
  assert.equal(r2.grade, 2);
  assert.equal(r2.decimal, 1.5);
  const r3 = G.evaluate(13.353, S(15));           // 89,02 %
  assert.equal(r3.grade, 2);
  assert.equal(r3.wholePercent, 89);
  assert.equal(r3.decimal, 1.7);
  assert.equal(G.floorTo(r3.percent, 1), 89);
  assert.equal(G.evaluate(11.2, S(13)).onTable, true, 'inside 11–11,5');
  assert.equal(G.floorTo(G.percentOf(11.9599, 13), 2), 91.99, 'display never rounds up into the next grade');
});

test('tiny maxima leave some grid ranges empty', () => {
  const scale = G.buildScale(S(2, 1));
  assert.deepEqual(scale.map((b) => b.reachable), [true, false, false, true, false, true]);
  assert.equal(G.evaluate(2, S(2, 1)).grade, 1);
  assert.equal(G.evaluate(1, S(2, 1)).grade, 4);
  assert.equal(G.evaluate(1.7, S(2, 1)).grade, 2, 'decimals still reach "gut"');
});

test('bonus points extend the top range, bounds stay on the maximum', () => {
  const settings = S(30, 0.5, 3);
  const scale = G.buildScale(settings);
  assert.deepEqual(ranges(scale)[0], [28, 33]);
  assert.deepEqual(percentRanges(scale)[0], [92, 110, true]);
  assert.deepEqual(lows(scale), lows(G.buildScale(S(30))));
  const r = G.evaluate(33, settings);
  assert.equal(r.grade, 1);
  assert.equal(r.wholePercent, 100);
  assert.equal(r.decimal, 1.0);
});

test('input validation', () => {
  assert.equal(G.parseNumber('11,5'), 11.5);
  assert.equal(G.parseNumber('13,353'), 13.353);
  assert.equal(G.parseNumber('14.23'), 14.23);
  assert.equal(G.parseNumber(',5'), 0.5);
  assert.equal(G.parseNumber(' 12 '), 12);
  for (const bad of ['', '-3', 'abc', '1.000,5', '11 12', '1,2,3']) assert.ok(Number.isNaN(G.parseNumber(bad)), bad);
  assert.deepEqual(G.checkSettings(S(40)), {});
  assert.deepEqual(G.checkSettings(S(13.333, 1)), {}, 'decimal maxima are fine');
  assert.ok(G.checkSettings(S(0)).max);
  assert.ok(G.checkSettings({ max: 13, step: 1, bonus: -1 }).bonus);
  assert.equal(G.checkPoints(13.353, S(15)), null);
  assert.match(G.checkPoints(14, S(13)), /Mehr als 13 Punkte.*Zusatzpunkte/);
  assert.equal(G.checkPoints(14, S(13, 1, 1)), null);
});

test('class lists: lenient separators, points only, alignment', () => {
  const mixed = G.evaluateList('2 3  32 26 3.5 5,8', S(40));
  assert.deepEqual(mixed.rows.map((r) => r.points), [2, 3, 32, 26, 3.5, 5.8]);
  assert.equal(mixed.gradesText, '6 6  3 4 6 6', 'grades replace the values, separators stay');

  const column = G.evaluateList('11,5\n\n13,353\nAnna 9\n20\n7\n\n', S(15));
  assert.deepEqual(column.rows.map((r) => [r.position, r.points, r.grade]), [[1, 11.5, 3], [3, 13.353, 2], [6, 7, 5]]);
  assert.deepEqual(column.skipped.map((s) => s.position), [4, 5], 'a column keeps its row numbers, gaps included');
  assert.match(column.skipped[0].reason, /ohne Namen/);
  assert.equal(column.empty, 1);
  assert.equal(column.gradesText, '3\n\n2\n\n\n5');

  const semi = G.evaluateList('11,5;12;;9\n8', S(13));
  assert.deepEqual(semi.rows.map((r) => r.points), [11.5, 12, 9, 8]);
  assert.equal(semi.gradesText, '2;1;;3\n4');

  const tabs = G.evaluateList('11,5\t\t9\n7 8', S(13));
  assert.deepEqual(tabs.rows.map((r) => r.points), [11.5, 9, 7, 8]);
  assert.equal(tabs.gradesText, '2\t\t3\n4 4');

  const commas = G.evaluateList('11,5, 12, 9\n1.5,2,3\n1,2,3', S(13));
  assert.deepEqual(commas.rows.map((r) => r.points), [11.5, 12, 9, 1.5, 2, 3]);
  assert.match(commas.skipped[0].reason, /Nicht eindeutig/);
});

test('calculator: task maxima', () => {
  const t = G.parseTaskMaxima('10 8 12 10', 0.5);
  assert.deepEqual(t.maxima, [10, 8, 12, 10]);
  assert.equal(t.total, 40);
  assert.deepEqual(t.problems, []);
  assert.match(G.parseTaskMaxima('10 7,5', 1).problems[0], /Aufgabe 2.*nur ganze Punkte/);
  assert.match(G.parseTaskMaxima('10 0', 0.5).problems[0], /größer als 0/);
  assert.match(G.parseTaskMaxima('10 x', 0.5).problems[0], /Aufgabe 2/);
});

test('calculator: one row, missing and impossible inputs', () => {
  const settings = S(40, 0.5);
  const maxima = [10, 8, 12, 10];
  const full = G.evaluateSheetRow(['9,5', '8', '7', '10'], maxima, settings);
  assert.equal(full.complete, true);
  assert.equal(full.sum, 34.5);
  assert.equal(full.result.grade, 2);

  const gap = G.evaluateSheetRow(['9,5', '', '7', '0'], maxima, settings);
  assert.equal(gap.complete, false);
  assert.deepEqual(gap.missing, [2], 'empty is missing, 0 is zero points');
  assert.equal(gap.sum, 16.5, 'partial sum');
  assert.equal(gap.result, null);

  const bad = G.evaluateSheetRow(['7,3', '9', 'x', '10'], maxima, settings);
  assert.deepEqual(bad.invalid.map((i) => [i.task, i.message]), [[1, 'nur ganze oder halbe Punkte'], [2, 'höchstens 8'], [3, 'Keine gültige Zahl']]);
  assert.equal(G.evaluateSheetRow(['7,5', '8', '12', '10'], maxima, S(40, 1)).invalid[0].message, 'nur ganze Punkte');
  assert.equal(G.evaluateSheetRow(['7,25', '8', '12', '10'], maxima, S(40, 0.01)).complete, true);
  assert.equal(G.evaluateSheetRow(['', '', '', ''], maxima, settings).touched, false);
  // tasks add up to more than the maximum: the sum is flagged, not graded
  const over = G.evaluateSheetRow(['10', '8', '12', '10', '5'], [10, 8, 12, 10, 5], settings);
  assert.equal(over.complete, false);
  assert.match(over.problem, /Mehr als 40/);
});

test('class statistics', () => {
  const result = G.evaluateList('13\n11,5\n6', S(13));
  assert.equal(result.stats.count, 3);
  assert.equal(result.stats.passed, 2);
  assert.deepEqual(result.stats.distribution, [1, 1, 0, 0, 1, 0]);
  assert.ok(Math.abs(result.stats.averageGrade - 8 / 3) < 1e-12);
  assert.equal(G.evaluateList('', S(13)).stats, null);
});

test('class statistics: median, standard deviation, range, percent bands', () => {
  assert.equal(G.median([3, 1, 2]), 2);
  assert.equal(G.median([4, 1, 3, 2]), 2.5);
  assert.ok(Math.abs(G.standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138089935) < 1e-9, 'sample SD like STABW.S');
  assert.equal(G.standardDeviation([5]), null);
  const { stats } = G.evaluateList('10 20 30 40 25 39,5', S(40));
  assert.equal(stats.medianPoints, 27.5);
  assert.equal(stats.minPercent, 25);
  assert.equal(stats.maxPercent, 100);
  // 25 %, 50 %, 75 %, 100 %, 62,5 %, 98,75 % → grades 6, 4, 3, 1, 4, 1
  assert.equal(stats.medianGrade, 3.5);
});

test('class statistics: where the results sit inside each grade', () => {
  // „befriedigend“ is 67 – unter 81 %: centre 74 %, half width 7
  const near2 = G.evaluateList('80 79', S(100)).stats.lean[2];
  assert.equal(near2.count, 2);
  assert.ok(Math.abs(near2.lean - 11 / 14) < 1e-9, 'upper half, towards grade 2');
  const near4 = G.evaluateList('67 68', S(100)).stats.lean[2];
  assert.ok(near4.lean < -0.8, 'lower half, towards grade 4');
  const centred = G.evaluateList('70 78', S(100)).stats.lean[2];
  assert.ok(Math.abs(centred.lean) < 1e-9);
  assert.equal(G.evaluateList('100', S(100)).stats.lean[0].lean, 1);
  assert.equal(G.evaluateList('0', S(100)).stats.lean[5].lean, -1);
  assert.equal(G.evaluateList('33', { max: 30, step: 0.5, bonus: 3 }).stats.lean[0].lean, 1, 'bonus above 100 % counts as 100 %');
  const empty = G.evaluateList('80', S(100)).stats.lean[0];
  assert.deepEqual([empty.count, empty.lean, empty.meanPercent], [0, 0, null]);
});
