/* ================================================================
   grading.js — IHK grading key, scaled to any maximum score.

   Source: § 24 "Bewertungsschlüssel" of the Musterprüfungsordnung für
   die Durchführung von Abschluss- und Umschulungsprüfungen (Richtlinie
   des Hauptausschusses des BIBB vom 07.10.2025, BAnz AT 07.11.2025 S3).
   The key is defined on whole points of a 100-point scale:
     100–92 sehr gut · 91–81 gut · 80–67 befriedigend ·
     66–50 ausreichend · 49–30 mangelhaft · 29–0 ungenügend

   Scaling rule used here (the Prüfungsordnung has no rounding rule for
   other maxima): grade n needs at least min(n) % of the maximum. The
   threshold is rounded UP to the next half or whole point, so nobody
   gets a grade whose percentage they did not reach.
   Example: 13 points max, half points → sehr gut from 92 % × 13 =
   11,96 → 12 points.

   Pure functions, no DOM. Loads as a classic script (window.Grading,
   works from file://) and as CommonJS for `node --test`.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Grading = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;

  /* Lower bound of each grade in IHK points (§ 24 MPO). */
  const KEY = Object.freeze([
    { grade: 1, word: 'sehr gut', min: 92, max: 100 },
    { grade: 2, word: 'gut', min: 81, max: 91 },
    { grade: 3, word: 'befriedigend', min: 67, max: 80 },
    { grade: 4, word: 'ausreichend', min: 50, max: 66 },
    { grade: 5, word: 'mangelhaft', min: 30, max: 49 },
    { grade: 6, word: 'ungenügend', min: 0, max: 29 }
  ].map(Object.freeze));

  /* Decimal grade per IHK point (§ 24 MPO, column "Note als Dezimalzahl"):
     [lowest IHK points, decimal grade], highest first. */
  const DECIMAL = Object.freeze([
    [100, 1.0], [98, 1.1], [96, 1.2], [94, 1.3], [92, 1.4],
    [91, 1.5], [90, 1.6], [89, 1.7], [88, 1.8], [87, 1.9], [85, 2.0], [84, 2.1], [83, 2.2], [82, 2.3], [81, 2.4],
    [79, 2.5], [78, 2.6], [77, 2.7], [75, 2.8], [74, 2.9], [72, 3.0], [71, 3.1], [70, 3.2], [68, 3.3], [67, 3.4],
    [65, 3.5], [63, 3.6], [62, 3.7], [60, 3.8], [58, 3.9], [56, 4.0], [55, 4.1], [53, 4.2], [51, 4.3], [50, 4.4],
    [48, 4.5], [46, 4.6], [44, 4.7], [42, 4.8], [40, 4.9], [38, 5.0], [36, 5.1], [34, 5.2], [32, 5.3], [30, 5.4],
    [25, 5.5], [20, 5.6], [15, 5.7], [10, 5.8], [5, 5.9], [0, 6.0]
  ].map(Object.freeze));

  /* Point steps a test can be scored in. Every input must be a multiple
     of 0,5, which keeps all arithmetic exact in binary floating point. */
  const STEPS = Object.freeze([0.5, 1]);
  const DEFAULT_STEP = 0.5;
  const MAX_LIMIT = 1000;

  const isMultipleOf = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-6;
  const ceilToStep = (value, step) => Math.ceil(value / step - EPS) * step;

  /* "11,5" / "11.5" / " 12 " → number; anything else → NaN */
  function parseNumber(text) {
    if (typeof text === 'number') return text;
    const s = String(text ?? '').trim();
    if (!/^\d+(?:[.,]\d+)?$/.test(s)) return NaN;
    return Number(s.replace(',', '.'));
  }

  function bandForIhkPoints(ihkPoints) {
    return KEY.find((band) => ihkPoints >= band.min);
  }

  function decimalForIhkPoints(ihkPoints) {
    return DECIMAL.find(([min]) => ihkPoints >= min)[1];
  }

  /* Score → IHK points (0–100, whole). Rounded down, consistent with the
     strict thresholds: below 92 % is never 92 IHK points. */
  function toIhkPoints(points, max) {
    return Math.min(100, Math.max(0, Math.floor((points * 100) / max + EPS)));
  }

  /* Validate settings. Returns { errors: { field: message } }. */
  function checkSettings({ max, step, bonus }) {
    const errors = {};
    if (!Number.isFinite(max)) errors.max = 'Gib die Höchstpunktzahl als Zahl ein, z. B. 40 oder 37,5.';
    else if (max <= 0) errors.max = 'Die Höchstpunktzahl muss größer als 0 sein.';
    else if (max > MAX_LIMIT) errors.max = 'Gib höchstens ' + MAX_LIMIT + ' Punkte ein.';
    else if (!isMultipleOf(max, 0.5)) errors.max = 'Gib die Höchstpunktzahl in ganzen oder halben Punkten an.';
    else if (!isMultipleOf(max, step)) errors.max = 'Mit ganzen Punkten muss auch die Höchstpunktzahl ganz sein. Wähle „Halbe Punkte“.';
    if (!Number.isFinite(bonus) || bonus < 0) errors.bonus = 'Gib die Zusatzpunkte als Zahl ab 0 ein.';
    else if (!isMultipleOf(bonus, step)) errors.bonus = step === 1
      ? 'Mit ganzen Punkten sind nur ganze Zusatzpunkte möglich.'
      : 'Gib die Zusatzpunkte in ganzen oder halben Punkten an.';
    else if (bonus > MAX_LIMIT) errors.bonus = 'Gib höchstens ' + MAX_LIMIT + ' Zusatzpunkte ein.';
    return errors;
  }

  /* Returns null if the score is valid for the settings, else a message. */
  function checkPoints(points, { max, step, bonus }) {
    const top = max + bonus;
    if (!Number.isFinite(points)) return 'Gib die erreichten Punkte als Zahl ein, z. B. 11,5.';
    if (points < 0) return 'Die Punkte dürfen nicht negativ sein.';
    if (points > top + EPS) return 'Mehr als ' + formatPlain(top) + ' Punkte sind nicht möglich.';
    if (!isMultipleOf(points, step)) {
      return step === 1
        ? 'Mit ganzen Punkten ist ' + formatPlain(points) + ' nicht möglich. Wähle „Halbe Punkte“.'
        : 'Gib die Punkte in ganzen oder halben Punkten an.';
    }
    return null;
  }

  const formatPlain = (n) => String(n).replace('.', ',');

  /* The grading scale for one test: for each grade the lowest and highest
     score (both multiples of step). `reachable` is false when rounding
     leaves no score for a grade (tiny maxima, e.g. 2 points). */
  function buildScale({ max, step = DEFAULT_STEP, bonus = 0 }) {
    const top = max + bonus;
    const lows = KEY.map((band) => (band.min === 0 ? 0 : ceilToStep((band.min * max) / 100, step)));
    return KEY.map((band, i) => {
      const from = lows[i];
      const to = i === 0 ? top : lows[i - 1] - step;
      return Object.assign({}, band, { from, to, reachable: from <= to + EPS });
    });
  }

  /* One score → grade, share, IHK points, decimal grade, and how many
     points are missing for the next better reachable grade. */
  function evaluate(points, settings, scale = buildScale(settings)) {
    const index = scale.findIndex((band) => band.reachable && points >= band.from - EPS);
    const band = scale[index];
    const ihkPoints = toIhkPoints(points, settings.max);
    const better = scale.slice(0, index).reverse().find((b) => b.reachable) || null;
    return {
      points,
      grade: band.grade,
      word: band.word,
      share: points / settings.max,
      ihkPoints,
      decimal: decimalForIhkPoints(ihkPoints),
      better,
      missing: better ? better.from - points : 0
    };
  }

  /* Every possible score from top to 0 (for the lookup table). */
  function allScores(settings) {
    const scale = buildScale(settings);
    const count = Math.round((settings.max + settings.bonus) / settings.step);
    const rows = [];
    for (let i = count; i >= 0; i--) rows.push(evaluate(i * settings.step, settings, scale));
    return rows;
  }

  /* ---------- class list ----------------------------------------- */
  const NUM = '\\d+(?:[.,]\\d+)?';
  // Only numbers: "11,5 12 9", "11,5; 12; 9" or "11,5, 12, 9" (a decimal comma never has a space after it)
  const NUMBERS_ONLY = new RegExp('^' + NUM + '(?:(?:\\s*;\\s*|\\s*,\\s+|\\s+)' + NUM + ')*[\\s;,]*$');
  const NUMBER_SEP = /\s*;\s*|\s*,\s+|\s+/;
  // "Name 11,5", "Name: 11,5", "Name;11,5", "Name<Tab>11,5", "Name 11,5 Punkte"
  const NAME_AND_POINTS = new RegExp('^(.*?)[\\s;:,=]*(' + NUM + ')\\s*(?:P(?:unkte?|kte?\\.?)?)?\\s*$', 'i');

  /* Text (one person per line) → entries and lines that were skipped. */
  function parseList(text) {
    const entries = [];
    const skipped = [];
    String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line) return;
      if (NUMBERS_ONLY.test(line)) {
        line.split(NUMBER_SEP).filter((t) => t && t !== ';' && t !== ',').forEach((token) => {
          entries.push({ line: i + 1, name: '', points: parseNumber(token.replace(/[;,]$/, '')) });
        });
        return;
      }
      const m = NAME_AND_POINTS.exec(line);
      if (!m) { skipped.push({ line: i + 1, text: line, reason: 'Keine Punktzahl gefunden.' }); return; }
      entries.push({ line: i + 1, name: m[1].replace(/[\s;:,=]+$/, ''), points: parseNumber(m[2]) });
    });
    return { entries, skipped };
  }

  /* Text + settings → evaluated rows, skipped lines and statistics. */
  function evaluateList(text, settings) {
    const { entries, skipped } = parseList(text);
    const scale = buildScale(settings);
    const rows = [];
    entries.forEach((entry) => {
      const problem = checkPoints(entry.points, settings);
      if (problem) skipped.push({ line: entry.line, text: entry.name ? entry.name + ' ' + formatPlain(entry.points) : formatPlain(entry.points), reason: problem });
      else rows.push(Object.assign({ line: entry.line, name: entry.name }, evaluate(entry.points, settings, scale)));
    });
    skipped.sort((a, b) => a.line - b.line);
    const n = rows.length;
    const sum = (f) => rows.reduce((acc, r) => acc + f(r), 0);
    const distribution = KEY.map((band) => rows.filter((r) => r.grade === band.grade).length);
    return {
      rows,
      skipped,
      stats: n === 0 ? null : {
        count: n,
        averageGrade: sum((r) => r.grade) / n,
        averagePoints: sum((r) => r.points) / n,
        averageShare: sum((r) => r.share) / n,
        passed: rows.filter((r) => r.grade <= 4).length,
        distribution
      }
    };
  }

  return {
    KEY, DECIMAL, STEPS, DEFAULT_STEP, MAX_LIMIT,
    parseNumber, isMultipleOf, ceilToStep,
    bandForIhkPoints, decimalForIhkPoints, toIhkPoints,
    checkSettings, checkPoints, buildScale, evaluate, allScores,
    parseList, evaluateList
  };
});
