/* ================================================================
   grading.js — IHK grading key, scaled to any maximum score.

   Source: § 24 "Bewertungsschlüssel" of the Musterprüfungsordnung für
   die Durchführung von Abschluss- und Umschulungsprüfungen (Richtlinie
   des Hauptausschusses des BIBB vom 07.10.2025, BAnz AT 07.11.2025 S3).
   The key is defined on whole points of a 100-point scale, i.e. on
   whole percent:
     100–92 sehr gut · 91–81 gut · 80–67 befriedigend ·
     66–50 ausreichend · 49–30 mangelhaft · 29–0 ungenügend

   Rules used here (the Prüfungsordnung has none for other maxima):
   1. The grade follows the exact percentage of the maximum: "sehr gut"
      needs at least 92 %. Scores may have any decimals (mebis: 13,353).
   2. For the table, each lower bound is rounded UP to the grid: half
      points, whole points or hundredths (mebis). 13 points, half points:
      92 % = 11,96 → "sehr gut" from 12. For scores on the grid, rule 1
      and the table always agree.
   3. Percent ranges include the lower bound and exclude the upper one
      ("81 – unter 92"); only the top range includes 100 %.
   4. Percentages are shown and looked up rounded DOWN (91,996 % → 91,99 %,
      decimal grade of 91 %), so a display never suggests a better grade.

   Pure functions, no DOM. Loads as a classic script (window.Grading,
   works from file://) and as CommonJS for `node --test`.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Grading = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;
  const PERCENT_EPS = 1e-7;

  /* Lower bound of each grade in percent (§ 24 MPO). */
  const KEY = Object.freeze([
    { grade: 1, word: 'sehr gut', min: 92 },
    { grade: 2, word: 'gut', min: 81 },
    { grade: 3, word: 'befriedigend', min: 67 },
    { grade: 4, word: 'ausreichend', min: 50 },
    { grade: 5, word: 'mangelhaft', min: 30 },
    { grade: 6, word: 'ungenügend', min: 0 }
  ].map(Object.freeze));

  /* Decimal grade per whole percent (§ 24 MPO, column "Note als
     Dezimalzahl"): [lowest percent, decimal grade], highest first. A
     fixed table, not a formula: equal-ish steps inside each grade, but
     the grades span 9 to 30 percent, so overall it is a curve. */
  const DECIMAL = Object.freeze([
    [100, 1.0], [98, 1.1], [96, 1.2], [94, 1.3], [92, 1.4],
    [91, 1.5], [90, 1.6], [89, 1.7], [88, 1.8], [87, 1.9], [85, 2.0], [84, 2.1], [83, 2.2], [82, 2.3], [81, 2.4],
    [79, 2.5], [78, 2.6], [77, 2.7], [75, 2.8], [74, 2.9], [72, 3.0], [71, 3.1], [70, 3.2], [68, 3.3], [67, 3.4],
    [65, 3.5], [63, 3.6], [62, 3.7], [60, 3.8], [58, 3.9], [56, 4.0], [55, 4.1], [53, 4.2], [51, 4.3], [50, 4.4],
    [48, 4.5], [46, 4.6], [44, 4.7], [42, 4.8], [40, 4.9], [38, 5.0], [36, 5.1], [34, 5.2], [32, 5.3], [30, 5.4],
    [25, 5.5], [20, 5.6], [15, 5.7], [10, 5.8], [5, 5.9], [0, 6.0]
  ].map(Object.freeze));

  /* Grid of the table: half points, whole points, hundredths (mebis) */
  const STEPS = Object.freeze([0.5, 1, 0.01]);
  const DEFAULT_STEP = 0.5;
  const MAX_LIMIT = 1000;


  // Grid values are rounded to the step's decimals: 12 - 0.01 → 11.99, not 11.990000000000002
  const stepDecimals = (step) => (String(step).split('.')[1] || '').length;
  const onGrid = (value, step) => Number(value.toFixed(stepDecimals(step)));
  const ceilToStep = (value, step) => onGrid(Math.ceil(value / step - EPS) * step, step);
  const floorTo = (value, digits) => { const f = 10 ** digits; return Math.floor(value * f + PERCENT_EPS) / f; };
  const formatPlain = (n) => String(n).replace('.', ',');

  /* "13,353" / "13.353" / ",5" / " 12 " → number; anything else → NaN */
  function parseNumber(text) {
    if (typeof text === 'number') return text;
    const s = String(text ?? '').trim();
    if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(s)) return NaN;
    return Number(s.replace(',', '.'));
  }

  const percentOf = (points, max) => (points * 100) / max;

  function bandForPercent(percent) {
    return KEY.find((band) => percent >= band.min - PERCENT_EPS);
  }

  /* Whole percent for the decimal table: rounded down, at most 100 */
  const wholePercent = (percent) => Math.min(100, Math.max(0, Math.floor(percent + PERCENT_EPS)));

  function decimalForPercent(percent) {
    const whole = wholePercent(percent);
    return DECIMAL.find(([min]) => whole >= min)[1];
  }

  /* Validate settings. Returns { field: message } for problems. */
  function checkSettings({ max, bonus }) {
    const errors = {};
    if (!Number.isFinite(max)) errors.max = 'Gib die Höchstpunktzahl als Zahl ein, z. B. 40 oder 37,5.';
    else if (max <= 0) errors.max = 'Die Höchstpunktzahl muss größer als 0 sein.';
    else if (max > MAX_LIMIT) errors.max = 'Gib höchstens ' + MAX_LIMIT + ' Punkte ein.';
    if (!Number.isFinite(bonus) || bonus < 0) errors.bonus = 'Gib die Zusatzpunkte als Zahl ab 0 ein.';
    else if (bonus > MAX_LIMIT) errors.bonus = 'Gib höchstens ' + MAX_LIMIT + ' Zusatzpunkte ein.';
    return errors;
  }

  /* Returns null if the score is valid for the settings, else a message. */
  function checkPoints(points, { max, bonus }) {
    const top = max + bonus;
    if (!Number.isFinite(points)) return 'Gib die Punkte als Zahl ein, z. B. 11,5 oder 13,353.';
    if (points < 0) return 'Die Punkte dürfen nicht negativ sein.';
    if (points > top + EPS) {
      return bonus
        ? 'Mehr als ' + formatPlain(top) + ' Punkte sind nicht möglich.'
        : 'Mehr als ' + formatPlain(max) + ' Punkte sind nicht möglich. Gibt es Zusatzpunkte, trag sie bei „Zusatzpunkte“ ein.';
    }
    return null;
  }

  /* The grading scale for one test. Per grade: the score range on the
     grid (from/to, both inclusive multiples of step) and the percent
     range (percentFrom included; percentTo included only for the top
     grade, otherwise the next grade's bound, excluded). `reachable` is
     false when no grid score falls into a grade (tiny maxima); decimal
     scores may still reach it. */
  function buildScale({ max, step = DEFAULT_STEP, bonus = 0 }) {
    const top = max + bonus;
    const lows = KEY.map((band) => (band.min === 0 ? 0 : ceilToStep((band.min * max) / 100, step)));
    return KEY.map((band, i) => {
      const from = lows[i];
      const to = i === 0 ? top : onGrid(lows[i - 1] - step, step);
      return Object.assign({}, band, {
        from,
        to,
        reachable: from <= to + EPS,
        percentFrom: band.min,
        percentTo: i === 0 ? Math.max(100, floorTo(percentOf(top, max), 2)) : KEY[i - 1].min,
        percentToIncluded: i === 0
      });
    });
  }

  /* One score → grade, percent, decimal grade. `onTable` is false when
     the score lies between two point ranges of the table (decimals). */
  function evaluate(points, settings, scale = buildScale(settings)) {
    const percent = percentOf(points, settings.max);
    const band = bandForPercent(percent);
    const row = scale[band.grade - 1];
    return {
      points,
      grade: band.grade,
      word: band.word,
      percent,
      wholePercent: wholePercent(percent),
      decimal: decimalForPercent(percent),
      onTable: row.reachable && points >= row.from - EPS && points <= row.to + EPS
    };
  }

  /* ---------- lenient number lists (class list, task maxima) ------- */
  /* Values may be separated by spaces, tabs, line breaks or semicolons,
     in any mix: "2 3  32 26 3.5 5,8". A comma is a decimal comma ("5,8"),
     unless the token also has a dot ("1.5,2,3": commas separate) or two
     or more commas ("1,2,3": ambiguous, reported). Names are rejected. */
  const TOKEN = /[^\s;]+/g;
  const LETTERS = /[A-Za-zÄÖÜäöüß]/;
  const NAME_REASON = 'Keine Zahl. Gib nur Punkte ein, ohne Namen.';

  // A line with letters is one rejected entry: its numbers are not counted
  // (it may be a name), and the rows below keep their position.
  const lineValues = (line) => (LETTERS.test(line)
    ? [{ raw: line.trim(), points: NaN, reason: NAME_REASON }]
    : (line.match(TOKEN) || []).flatMap(parseToken));

  function parseToken(raw) {
    const tok = raw.replace(/^,+|,+$/g, '');                   // "12," → "12"
    if (tok === '') return [];
    if (LETTERS.test(tok)) return [{ raw, points: NaN, reason: NAME_REASON }];
    const commas = (tok.match(/,/g) || []).length;
    if (commas >= 2 && !tok.includes('.')) {
      return [{ raw, points: NaN, reason: 'Nicht eindeutig. Trenne die Werte mit Leerzeichen oder Semikolon.' }];
    }
    const parts = tok.includes('.') && commas ? tok.split(',') : [tok];
    return parts.map((part) => {
      const points = parseNumber(part);
      return { raw: part, points, reason: Number.isNaN(points) ? 'Keine gültige Zahl.' : null };
    });
  }

  /* Text → values in reading order. If the text is a column (at most one
     value per line), empty lines count as entries, so numbering follows
     the rows of the source (Excel column with gaps). */
  function parseList(text) {
    const lines = String(text ?? '').split(/\r?\n/);
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    const perLine = lines.map(lineValues);
    const column = perLine.every((values) => values.length <= 1);
    const entries = [];
    perLine.forEach((values, line) => {
      if (!values.length) {
        if (column) entries.push({ position: entries.length + 1, line, raw: '', empty: true, points: null, reason: null });
        return;
      }
      values.forEach((v) => entries.push(Object.assign({ position: entries.length + 1, line, empty: false }, v)));
    });
    return entries;
  }

  /* Replace every value in the text by fn(value), keeping all separators,
     so the output pastes back into the same cells. */
  function mapList(text, fn) {
    const lines = String(text ?? '').replace(/\s+$/, '').split(/\r?\n/);
    return lines.map((line) => (LETTERS.test(line) ? '' : line.replace(TOKEN, (raw) => parseToken(raw).map(fn).join(',')))).join('\n');
  }

  /* Descriptive statistics. Standard deviation as the sample one (n − 1),
     like Excel's STABW.S. */
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  function median(values) {
    const v = [...values].sort((a, b) => a - b);
    const n = v.length;
    return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  }
  function standardDeviation(values) {
    if (values.length < 2) return null;
    const m = mean(values);
    return Math.sqrt(values.reduce((a, x) => a + (x - m) ** 2, 0) / (values.length - 1));
  }
  /* Where the results of each grade sit inside its percent range: lean
     −1 = all at the lower bound (next to the worse grade), 0 = centred,
     +1 = all at the upper bound (next to the better grade). Bonus points
     above 100 % count as 100 %. */
  function gradeLean(rows) {
    return KEY.map((band, i) => {
      const lo = band.min;
      const hi = i === 0 ? 100 : KEY[i - 1].min;
      const mid = (lo + hi) / 2;
      const half = (hi - lo) / 2;
      const members = rows.filter((r) => r.grade === band.grade);
      const positions = members.map((r) => Math.max(-1, Math.min(1, (Math.min(r.percent, 100) - mid) / half)));
      return {
        grade: band.grade,
        count: members.length,
        lean: members.length ? mean(positions) : 0,
        meanPercent: members.length ? mean(members.map((r) => r.percent)) : null
      };
    });
  }

  /* Text + settings → evaluated rows, skipped entries, statistics and
     the grades as text in the same layout as the input. */
  function evaluateList(text, settings) {
    const entries = parseList(text);
    const scale = buildScale(settings);
    const rows = [];
    const skipped = [];
    let empty = 0;
    const gradeOf = (v) => {
      if (v.reason) return null;
      return checkPoints(v.points, settings) ? null : evaluate(v.points, settings, scale);
    };
    entries.forEach((entry) => {
      if (entry.empty) { empty++; return; }
      const problem = entry.reason || checkPoints(entry.points, settings);
      if (problem) skipped.push({ position: entry.position, raw: entry.raw, reason: problem });
      else rows.push(Object.assign({ position: entry.position }, evaluate(entry.points, settings, scale)));
    });
    const gradesText = mapList(text, (v) => { const r = gradeOf(v); return r ? String(r.grade) : ''; });
    const n = rows.length;
    const grades = rows.map((r) => r.grade);
    const pointList = rows.map((r) => r.points);
    const percents = rows.map((r) => r.percent);
    return {
      rows,
      skipped,
      empty,
      gradesText,
      stats: n === 0 ? null : {
        count: n,
        averageGrade: mean(grades),
        medianGrade: median(grades),
        averagePoints: mean(pointList),
        medianPoints: median(pointList),
        sdPoints: standardDeviation(pointList),
        minPoints: Math.min(...pointList),
        maxPoints: Math.max(...pointList),
        averagePercent: mean(percents),
        medianPercent: median(percents),
        sdPercent: standardDeviation(percents),
        minPercent: Math.min(...percents),
        maxPercent: Math.max(...percents),
        passed: rows.filter((r) => r.grade <= 4).length,
        distribution: KEY.map((band) => rows.filter((r) => r.grade === band.grade).length),
        lean: gradeLean(rows)
      }
    };
  }

  /* ---------- points calculator (tasks) ---------------------------- */
  /* Does the value fit the grid? 7,5 with half points yes, 7,3 no. */
  const isOnGrid = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-6;
  const gridWord = (step) => ({ 0.5: 'nur ganze oder halbe Punkte', 1: 'nur ganze Punkte', 0.01: 'höchstens zwei Nachkommastellen' })[step];

  /* "10 8 12 10" → maxima per task. Each must be > 0 and on the grid. */
  function parseTaskMaxima(text, step) {
    const values = (String(text ?? '').match(TOKEN) || []).flatMap(parseToken);
    const maxima = [];
    const problems = [];
    values.forEach((v, i) => {
      const label = 'Aufgabe ' + (i + 1);
      if (v.reason) problems.push(label + ' („' + v.raw + '“): ' + v.reason);
      else if (v.points <= 0) problems.push(label + ': Die Höchstpunktzahl muss größer als 0 sein.');
      else if (!isOnGrid(v.points, step)) problems.push(label + ' (' + formatPlain(v.points) + '): ' + gridWord(step) + '.');
      maxima.push(v.reason ? NaN : v.points);
    });
    return { maxima, total: maxima.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0), problems };
  }

  /* One cell of the calculator: '' is missing (0 must be typed), the
     value must be a number on the grid and at most the task's maximum. */
  function checkTaskCell(text, taskMax, step) {
    const raw = String(text ?? '').trim();
    if (raw === '') return { points: null, problem: 'missing' };
    const points = parseNumber(raw);
    if (Number.isNaN(points)) return { points: null, problem: 'Keine gültige Zahl' };
    if (!isOnGrid(points, step)) return { points: null, problem: gridWord(step) };
    if (points > taskMax + EPS) return { points: null, problem: 'höchstens ' + formatPlain(taskMax) };
    return { points, problem: null };
  }

  /* One person's row: sum, missing tasks, invalid cells, grade if complete. */
  function evaluateSheetRow(cells, maxima, settings, scale = buildScale(settings)) {
    const checks = maxima.map((taskMax, i) => checkTaskCell(cells[i], taskMax, settings.step));
    const missing = [];
    const invalid = [];
    let sum = 0;
    checks.forEach((c, i) => {
      if (c.problem === 'missing') missing.push(i + 1);
      else if (c.problem) invalid.push({ task: i + 1, message: c.problem });
      else sum += c.points;
    });
    sum = Number(sum.toFixed(stepDecimals(settings.step)));
    const touched = checks.some((c) => c.problem !== 'missing');
    const complete = missing.length === 0 && invalid.length === 0;
    const overTop = complete && checkPoints(sum, settings);
    return {
      checks,
      sum,
      touched,
      missing,
      invalid,
      complete: complete && !overTop,
      problem: overTop || null,
      result: complete && !overTop ? evaluate(sum, settings, scale) : null
    };
  }

  return {
    KEY, DECIMAL, STEPS, DEFAULT_STEP, MAX_LIMIT,
    parseNumber, ceilToStep, floorTo, percentOf,
    bandForPercent, decimalForPercent, wholePercent,
    checkSettings, checkPoints, buildScale, evaluate,
    parseList, mapList, evaluateList, median, standardDeviation,
    isOnGrid, parseTaskMaxima, checkTaskCell, evaluateSheetRow
  };
});
