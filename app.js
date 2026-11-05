/* ================================================================
   app.js — Notenrechner UI. The grading rules live in grading.js;
   this file reads the inputs, renders and keeps the URL in sync.
   URL: ?max=13&p=11.5&step=1&bonus=2&title=… (legacy ?smax= still read).
   The name field never leaves the page: not in the URL, not stored.
   ================================================================ */
(function () {
  'use strict';

  const G = window.Grading;
  const $ = (id) => document.getElementById(id);

  const ERROR_ICON = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
  const NBSP = String.fromCharCode(160);

  /* --- German formats: 13,353 · 88,46 % (rounded down) · 1,8 ------- */
  const pointsFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
  const percentFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
  const num = (n) => pointsFormat.format(n);
  const pct = (percent) => percentFormat.format(G.floorTo(percent, 2));
  const pctUnit = (percent) => pct(percent) + NBSP + '%';
  const fixed = (n, digits) => B3.fmt.number(n, digits);
  const points = (n) => num(n) + NBSP + (n === 1 ? 'Punkt' : 'Punkte');
  const ofPoints = (n) => num(n) + NBSP + (n === 1 ? 'Punkt' : 'Punkten');   // „von 13 Punkten“
  // "12 – 13" / "81 – unter 92": the dash lines up in the column, screen readers hear "bis"
  const range = (from, to) => '<span data-range><span>' + from + '</span><span aria-hidden="true">–</span>' +
    '<span class="visually-hidden">bis</span><span>' + to + '</span></span>';
  const percentTo = (band) => (band.percentToIncluded ? '' : 'unter ') + pct(band.percentTo);
  const STEP_TEXT = { 0.5: 'Grenzen in halben Punkten', 1: 'Grenzen in ganzen Punkten', 0.01: 'Grenzen auf 0,01 Punkte genau' };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const toField = (value) => String(value ?? '').replace('.', ',');

  let settings = null;      // last valid { max, step, bonus }
  let scale = null;
  let result = null;        // evaluation of the entered score
  let gradesText = '';

  /* --- Fields and errors ------------------------------------------ */
  function setError(input, message) {
    const el = $(input.id + '-error');
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    el.hidden = !message;
    el.innerHTML = message ? ERROR_ICON : '';
    if (message) el.append(message);
  }

  const readStep = () => Number($('step').querySelector('button[aria-pressed="true"]').value);

  function setStep(step) {
    $('step').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.value) === step)));
  }

  function readFields() {
    const bonusText = $('bonus').value.trim();
    return {
      max: G.parseNumber($('max').value),
      step: readStep(),
      bonus: bonusText === '' ? 0 : G.parseNumber(bonusText)
    };
  }

  const describe = (s) => points(s.max) + (s.bonus ? ' + ' + num(s.bonus) + NBSP + 'Zusatzpunkte' : '') + ', ' + STEP_TEXT[s.step];

  /* --- URL --------------------------------------------------------- */
  function fieldsFromUrl() {
    const q = new URLSearchParams(location.search);
    const max = q.get('max') || '100';
    let bonus = q.get('bonus') || '';
    // v1 links: smax = maximum including bonus points
    if (!bonus && q.has('smax')) {
      const extra = G.parseNumber(q.get('smax')) - G.parseNumber(max);
      if (extra > 0) bonus = String(extra);
    }
    $('title').value = q.get('title') || '';
    $('max').value = toField(max);
    $('bonus').value = toField(bonus);
    $('points').value = toField(q.get('p') || '');
    $('tasks').value = (q.get('tasks') || '').split('_').filter(Boolean).map(toField).join(' ');
    const step = G.parseNumber(q.get('step') || '');
    setStep(G.STEPS.includes(step) ? step : G.DEFAULT_STEP);
  }

  function writeUrl() {
    if (!settings) return;
    const q = new URLSearchParams();
    const title = $('title').value.trim();
    if (title) q.set('title', title);
    q.set('max', String(settings.max));
    if (settings.step !== G.DEFAULT_STEP) q.set('step', String(settings.step));
    if (settings.bonus) q.set('bonus', String(settings.bonus));
    if (result) q.set('p', String(result.points));
    if (tasks.maxima.length && !tasks.problems.length) q.set('tasks', tasks.maxima.join('_'));
    const url = location.pathname + '?' + q.toString() + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  }

  /* --- Points calculator (teachers) ---------------------------------
     One row per person, one cell per task, built for typing a whole
     class from a stack of exams: Enter / Space / + to the next task,
     Shift+Enter or Backspace in an empty cell back, arrows like a
     spreadsheet, paste from Excel fills several cells. Empty = missing
     (0 must be typed). The sheet survives a reload (sessionStorage) and
     is gone with the tab. */
  const CLEAR_ICON = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>';
  const SHEET_STORE = 'notenrechner-sheet';
  const averageFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
  let tasks = { maxima: [], total: 0, problems: [] };
  let sheet = [[]];          // cell texts per person
  let sheetColumns = '';     // maxima the table was built for
  let rowResults = [];
  let activeRow = 0;
  let editedRow = null;      // row typed in since it got focus (announced when left)

  const isTouched = (row) => row.some((cell) => String(cell ?? '').trim() !== '');
  const taskList = (numbers) => numbers.map((n) => 'A' + n).join(', ');
  const rowOf = (el) => Number(el.closest('tr').dataset.row);
  const taskOf = (el) => Number(el.dataset.task);
  const lastTask = () => tasks.maxima.length - 1;

  function rowNote(row) {
    const notes = row.invalid.map((x) => 'A' + x.task + ': ' + x.message);
    if (row.touched && row.missing.length) notes.push(taskList(row.missing) + (row.missing.length === 1 ? ' fehlt' : ' fehlen'));
    if (row.problem) notes.push(row.problem);
    return notes.join('. ');
  }

  function saveSheet() {
    try {
      if (sheet.some(isTouched)) sessionStorage.setItem(SHEET_STORE, JSON.stringify({ columns: tasks.maxima.join('|'), tasksText: $('tasks').value, sheet }));
      else sessionStorage.removeItem(SHEET_STORE);
    } catch (e) { /* private mode: nothing to keep */ }
  }

  function savedSheet() {
    try { return JSON.parse(sessionStorage.getItem(SHEET_STORE) || 'null'); } catch (e) { return null; }
  }

  function renderTasks() {
    tasks = G.parseTaskMaxima($('tasks').value, settings.step);
    setError($('tasks'), tasks.problems.join(' '));
    const valid = tasks.maxima.length > 0 && tasks.problems.length === 0;
    $('calc-empty').hidden = valid;
    $('calc-sheet').hidden = !valid;
    $('tasks-summary').textContent = valid
      ? tasks.maxima.length + (tasks.maxima.length === 1 ? ' Aufgabe' : ' Aufgaben') + ', zusammen ' + points(tasks.total) + '.'
      : '';
    const top = settings.max + settings.bonus;
    const fits = Math.abs(tasks.total - settings.max) < 1e-9 || Math.abs(tasks.total - top) < 1e-9;
    $('tasks-mismatch').hidden = !valid || fits;
    if (valid && !fits) {
      $('tasks-mismatch-text').textContent = 'Die Aufgaben ergeben ' + points(tasks.total) + ', die Höchstpunktzahl ist ' + num(settings.max) + '.';
      $('tasks-apply').textContent = 'Höchstpunktzahl auf ' + num(tasks.total) + ' setzen';
      $('tasks-apply').hidden = Boolean(settings.bonus);
    }
    return valid;
  }

  function buildSheet() {
    sheetColumns = tasks.maxima.join('|');
    $('calc-head').innerHTML = '<tr><th scope="col" class="numeric">Nr.</th>' +
      tasks.maxima.map((m, i) => '<th scope="col" class="center"><span aria-hidden="true">A' + (i + 1) + '</span>' +
        '<span class="visually-hidden">Aufgabe ' + (i + 1) + ', höchstens ' + points(m) + '</span><br>' +
        '<span class="text-muted" aria-hidden="true">max. ' + num(m) + '</span></th>').join('') +
      '<th scope="col" class="numeric">Summe</th><th scope="col" class="center">Note</th><th scope="col">Hinweis</th>' +
      '<th scope="col" class="actions"><span class="visually-hidden">Aktionen</span></th></tr>';
    while (sheet.length > 1 && !isTouched(sheet[sheet.length - 1]) && !isTouched(sheet[sheet.length - 2])) sheet.pop();
    if (!sheet.length || isTouched(sheet[sheet.length - 1])) sheet.push([]);
    $('calc-body').innerHTML = '';
    sheet.forEach((_, i) => $('calc-body').appendChild(sheetRow(i)));
    activeRow = Math.min(activeRow, sheet.length - 1);
  }

  function sheetRow(i) {
    const tr = document.createElement('tr');
    tr.dataset.row = String(i);
    tr.innerHTML = '<th scope="row" class="numeric">' + (i + 1) + '</th>' +
      tasks.maxima.map((m, t) => '<td><input class="form-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-task="' + t + '"' +
        ' aria-label="Nr. ' + (i + 1) + ', Aufgabe ' + (t + 1) + '" aria-describedby="calc-note-' + i + '"></td>').join('') +
      '<td class="numeric" data-sum></td><td class="center" data-grade></td><td id="calc-note-' + i + '" data-note></td>' +
      '<td class="actions"><button class="btn ghost small icon-only" type="button" data-clear aria-label="Punkte von Nr. ' + (i + 1) + ' löschen" title="Punkte dieser Zeile löschen">' + CLEAR_ICON + '</button></td>';
    tr.querySelectorAll('input').forEach((input) => { input.value = sheet[i][taskOf(input)] ?? ''; });
    return tr;
  }

  function renderSheetRow(i) {
    const tr = $('calc-body').children[i];
    const row = G.evaluateSheetRow(sheet[i], tasks.maxima, settings, scale);
    rowResults[i] = row;
    tr.querySelectorAll('input').forEach((input, t) => {
      const problem = row.checks[t].problem;
      if (problem && problem !== 'missing') input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    });
    tr.querySelector('[data-note]').textContent = rowNote(row);
    tr.querySelector('[data-sum]').innerHTML = !row.touched ? '' : row.complete
      ? num(row.sum)
      : '<span class="text-muted">' + num(row.sum) + '<span class="visually-hidden"> bisher</span></span>';
    tr.querySelector('[data-grade]').textContent = row.result ? row.result.grade : (row.touched ? '–' : '');
    tr.querySelector('[data-clear]').hidden = !row.touched;
    return row;
  }

  // First person still to do: an incomplete row, else the empty row at the end
  function nextOpenRow() {
    const open = rowResults.findIndex((r) => r && r.touched && !r.complete);
    if (open >= 0) return open;
    const empty = rowResults.findIndex((r) => r && !r.touched);
    return empty >= 0 ? empty : sheet.length - 1;
  }

  function focusCell(row, task) {
    const tr = $('calc-body').children[row];
    const input = tr && tr.querySelectorAll('input')[task];
    if (input) { input.focus(); input.select(); }
    return Boolean(input);
  }

  // Jump to the first missing or wrong cell of a row
  function focusProblem(i) {
    const row = rowResults[i];
    const t = row ? row.checks.findIndex((c) => c.problem) : 0;
    focusCell(i, Math.max(0, t));
  }

  function markActive() {
    [...$('calc-body').children].forEach((tr, i) => {
      if (i === activeRow) tr.setAttribute('data-active', '');
      else tr.removeAttribute('data-active');
    });
  }

  // Big readout for the person being typed. Right after the last task of a
  // person (focus already on the next, still empty row) it keeps showing the
  // finished result, so it can be copied onto the exam.
  function renderReadout() {
    let i = Math.min(activeRow, rowResults.length - 1);
    let row = rowResults[i];
    let finished = false;
    if (row && !row.touched && i > 0 && rowResults[i - 1] && rowResults[i - 1].complete) {
      i -= 1;
      row = rowResults[i];
      finished = true;
    }
    $('cr-who').textContent = 'Summe Nr. ' + (i + 1) + (finished ? ', fertig' : '');
    if (!row || !row.touched) {
      $('cr-sum').textContent = '–';
      $('cr-state').textContent = 'noch keine Punkte';
      $('cr-grade').textContent = '–';
      $('cr-word').textContent = '';
      return;
    }
    $('cr-sum').textContent = num(row.sum);
    $('cr-state').textContent = row.complete ? 'von ' + ofPoints(settings.max) : 'bisher. ' + rowNote(row);
    $('cr-grade').textContent = row.result ? row.result.grade : '–';
    $('cr-word').textContent = row.result ? row.result.word : 'erst wenn alles eingetragen ist';
  }

  function renderSheetSummary() {
    const touched = rowResults.map((r, i) => ({ r, i })).filter(({ r }) => r && r.touched);
    const done = touched.filter(({ r }) => r.complete);
    const open = touched.filter(({ r }) => !r.complete);
    const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
    const avgGrade = avg(done.map(({ r }) => r.result.grade));
    $('calc-count').textContent = touched.length
      ? done.length + ' vollständig' + (open.length ? ', ' + open.length + ' offen' : '') + (avgGrade !== null ? ', Ø Note ' + fixed(avgGrade, 2) : '')
      : 'Noch keine Punkte eingetragen';
    $('calc-open').innerHTML = open.length
      ? '<span class="text-muted">Offen:</span> ' + open.map(({ r, i }) =>
        '<button class="btn ghost small" type="button" data-goto="' + i + '">Nr. ' + (i + 1) + ': ' + escapeHtml(rowNote(r)) + '</button>').join('')
      : '';
    $('calc-next').textContent = 'Weiter bei Nr. ' + (nextOpenRow() + 1);
    // Averages per task: which task was hard
    const fmt = (a) => (a === null ? '' : averageFormat.format(a));
    $('calc-foot').innerHTML = done.length || touched.length
      ? '<tr><th scope="row" class="numeric">Ø</th>' + tasks.maxima.map((m, t) =>
        '<td class="numeric">' + fmt(avg(touched.map(({ r }) => r.checks[t].points).filter((p) => p !== null))) + '</td>').join('') +
        '<td class="numeric">' + fmt(avg(done.map(({ r }) => r.sum))) + '</td><td class="center">' + (avgGrade === null ? '' : fixed(avgGrade, 2)) + '</td><td colspan="2"></td></tr>'
      : '';
    renderReadout();
  }

  function renderCalc() {
    if (!renderTasks()) return;
    if (sheetColumns !== tasks.maxima.join('|')) buildSheet();
    rowResults = [];
    sheet.forEach((_, i) => renderSheetRow(i));
    markActive();
    renderSheetSummary();
  }

  function ensureTrailingRow() {
    if (isTouched(sheet[sheet.length - 1])) {
      sheet.push([]);
      $('calc-body').appendChild(sheetRow(sheet.length - 1));
      renderSheetRow(sheet.length - 1);
    }
  }

  function onSheetInput(e) {
    const input = e.target.closest('input[data-task]');
    if (!input) return;
    const i = rowOf(input);
    sheet[i][taskOf(input)] = input.value;
    const row = renderSheetRow(i);
    ensureTrailingRow();
    renderSheetSummary();
    saveSheet();
    editedRow = i;
  }

  function onSheetFocus(e) {
    const input = e.target.closest('input[data-task]');
    if (!input) return;
    const previous = activeRow;
    activeRow = rowOf(input);
    // Announce a person's result once, when moving on from their row (not while typing "1" of "10")
    if (editedRow !== null && editedRow === previous && previous !== activeRow && rowResults[previous] && rowResults[previous].touched) {
      const done = rowResults[previous];
      $('calc-live').textContent = done && done.complete
        ? 'Nr. ' + (previous + 1) + ': ' + points(done.sum) + ', Note ' + done.result.grade + '.'
        : 'Nr. ' + (previous + 1) + ' ist noch offen: ' + rowNote(done) + '.';
      editedRow = null;
    }
    markActive();
    renderReadout();
  }

  function onSheetKey(e) {
    const input = e.target.closest('input[data-task]');
    if (!input || e.altKey || e.ctrlKey || e.metaKey) return;
    const i = rowOf(input);
    const t = taskOf(input);
    const forward = () => (t < lastTask() ? focusCell(i, t + 1) : focusCell(i + 1, 0));
    const back = () => (t > 0 ? focusCell(i, t - 1) : i > 0 && focusCell(i - 1, lastTask()));
    const caret = [input.selectionStart, input.selectionEnd];
    const atStart = caret[0] === 0 && caret[1] === 0;
    const atEnd = caret[0] === input.value.length && caret[1] === input.value.length;
    switch (e.key) {
      case 'Enter': e.preventDefault(); if (e.shiftKey) back(); else forward(); break;
      case ' ':
      case '+': e.preventDefault(); forward(); break;
      case 'Backspace': if (input.value === '') { e.preventDefault(); back(); } break;
      case 'ArrowDown': e.preventDefault(); focusCell(i + 1, t); break;
      case 'ArrowUp': e.preventDefault(); focusCell(i - 1, t); break;
      case 'ArrowRight': if (atEnd) { e.preventDefault(); forward(); } break;
      case 'ArrowLeft': if (atStart) { e.preventDefault(); back(); } break;
      default:
    }
  }

  // Pasting several values (an Excel row or block) fills the cells from here on
  function onSheetPaste(e) {
    const input = e.target.closest('input[data-task]');
    if (!input) return;
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (!/[\t\n;]|\S\s+\S/.test(text.trim())) return;
    e.preventDefault();
    const i0 = rowOf(input);
    const t0 = taskOf(input);
    let dropped = 0;
    let lastRow = i0;
    let lastCol = t0;
    text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').forEach((line, r) => {
      const cells = line.includes('\t') ? line.split('\t') : line.trim().split(/[\s;]+/);
      const i = i0 + r;
      while (sheet.length <= i) sheet.push([]);
      cells.forEach((value, c) => {
        if (t0 + c > lastTask()) { if (value.trim()) dropped++; return; }
        sheet[i][t0 + c] = value.trim();
        lastRow = i;
        lastCol = t0 + c;
      });
    });
    sheetColumns = '';
    renderCalc();
    saveSheet();
    if (lastCol < lastTask()) focusCell(lastRow, lastCol + 1);
    else focusCell(lastRow + 1, 0);
    if (dropped) B3.toast('warning', dropped + (dropped === 1 ? ' Wert passte' : ' Werte passten') + ' nicht mehr in die Aufgaben und wurde' + (dropped === 1 ? '' : 'n') + ' weggelassen.');
  }

  async function onSheetClick(e) {
    const clear = e.target.closest('[data-clear]');
    if (!clear) return;
    const i = rowOf(clear);
    const ok = await B3.confirm({
      title: 'Punkte von Nr. ' + (i + 1) + ' löschen?',
      message: 'Die Zeile bleibt stehen, damit die Nummern zum Stapel passen. Nur ihre Punkte werden gelöscht.',
      confirmLabel: 'Punkte löschen',
      danger: true
    });
    if (!ok) return;
    sheet[i] = [];
    sheetColumns = '';
    renderCalc();
    saveSheet();
    focusCell(i, 0);
  }

  // Sum and grade per person, one line each; incomplete rows stay empty so the order holds
  function sheetLines(withGrade) {
    const last = rowResults.map((r) => r && r.touched).lastIndexOf(true);
    return rowResults.slice(0, last + 1).map((r) => (r.complete ? num(r.sum) + (withGrade ? '\t' + r.result.grade : '') : ''));
  }

  /* --- Rendering ----------------------------------------------------- */
  function renderTitle() {
    const title = $('title').value.trim();
    document.title = (title || (settings ? 'Notenschlüssel für ' + points(settings.max) : 'Notenschlüssel')) + ' – Notenrechner';
  }

  function renderKey() {
    $('key-meta').textContent = describe(settings);
    $('key-caption').textContent = 'Notenschlüssel für ' + describe(settings);
    $('key-body').innerHTML = scale.map((band) => {
      const current = result && result.grade === band.grade;
      const pointCell = band.reachable
        ? '<td class="center">' + range(num(band.from), num(band.to)) + '</td>'
        : '<td class="center text-muted">keine Punktzahl</td>';
      return '<tr' + (current ? ' aria-current="true"' : '') + (band.reachable ? '' : ' data-reachable="false"') + '>' +
        '<th scope="row" class="center">' + band.grade + '</th>' +
        '<td>' + band.word + (current ? ' <span class="badge neutral">Ergebnis</span>' : '') + '</td>' +
        pointCell +
        '<td class="center">' + range(pct(band.percentFrom), percentTo(band)) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderResult() {
    $('result').hidden = !result;
    $('result-empty').hidden = Boolean(result);
    if (!result) {
      $('result-live').textContent = '';
      $('key-note').hidden = true;
      return;
    }
    const r = result;
    $('r-grade').textContent = r.grade;
    $('r-word').textContent = r.word;
    $('r-percent').innerHTML = pct(r.percent) + '<span class="metric-unit">%</span>';
    $('r-points').textContent = num(r.points) + ' von ' + ofPoints(settings.max);
    $('r-decimal').textContent = fixed(r.decimal, 1);
    // Finer decimals than half points (mebis, 11,97): the note under the key explains it.
    // Half points on a whole-point grid (12,5) get their own sentence here.
    const fine = !G.isOnGrid(r.points, 0.5);
    $('key-note').hidden = !fine;
    $('r-between').hidden = r.onTable || fine;
    $('r-between').textContent = r.onTable || fine ? '' : num(r.points) + ' Punkte liegen zwischen zwei Punktbereichen der Tabelle. Maßgeblich ist der Prozentwert.';
    $('result-live').textContent = 'Note ' + r.grade + ', ' + r.word + ', ' + pct(r.percent) + ' Prozent.';
  }

  function renderPrint() {
    const title = $('title').value.trim();
    const name = $('name').value.trim();
    $('print-title').textContent = title || 'Notenschlüssel';
    const facts = [];
    if (name) facts.push(['Name', name]);
    if (settings) facts.push(['Höchstpunktzahl', describe(settings)]);
    if (result) {
      facts.push(['Ergebnis', num(result.points) + ' von ' + ofPoints(settings.max) + ', ' + pctUnit(result.percent) +
        ', Note ' + result.grade + ' (' + result.word + '), Dezimalnote ' + fixed(result.decimal, 1)]);
    }
    $('print-facts').innerHTML = facts.map(([k, v]) => '<dt>' + escapeHtml(k) + '</dt><dd>' + escapeHtml(v) + '</dd>').join('');
  }

  /* Notenspiegel with tilted tops. Height = number of people (the dotted
     flat bar). The top tilts around its middle by where they sit inside
     the grade's percent range: left side higher = closer to the better
     grade, right side higher = closer to the worse grade, level = centred.
     The angle is lean × 45°: ±45° when all results sit on the bound. A
     short bar whose tilted top would pass the baseline is cut there, so
     the angle stays true. */
  function leanText(b) {
    if (!b.count) return '–';
    const strength = Math.abs(b.lean);
    if (strength < 0.2) return 'mittig';
    const towards = b.lean > 0
      ? (b.grade === 1 ? '100 %' : 'Note ' + (b.grade - 1))
      : (b.grade === 6 ? '0 %' : 'Note ' + (b.grade + 1));
    return (strength >= 0.6 ? 'deutlich' : 'eher') + ' Richtung ' + towards;
  }

  function leanChart(stats) {
    const width = 600;
    const base = 200;
    const room = 170;                // baseline to the highest corner, leaving space for the counts
    const slot = width / 6;
    const barWidth = 56;
    const half = barWidth / 2;       // rise over half the bar at 45°
    const round = (v) => Math.round(v * 10) / 10;
    const most = Math.max(...stats.distribution, 1);
    const scale = (room - half) / most;      // the tallest bar still has room for a 45° rise
    const bars = [];
    const outlines = [];
    const labels = [];
    stats.lean.forEach((b, i) => {
      const cx = slot * i + slot / 2;
      const x0 = cx - half;
      const x1 = cx + half;
      const h = b.count * scale;              // flat height = count
      const rise = Math.tan((b.lean * Math.PI) / 4) * half;   // angle = lean × 45°
      const hLeft = h + rise;
      const hRight = h - rise;
      if (b.count) {
        let points;
        if (hRight < 0) points = [x0, base, x0, base - hLeft, cx + h / b.lean, base];        // cut at the baseline
        else if (hLeft < 0) points = [cx - h / -b.lean, base, x1, base - hRight, x1, base];
        else points = [x0, base, x0, base - hLeft, x1, base - hRight, x1, base];
        bars.push('<polygon class="lean-bar" points="' + points.map(round).join(' ') + '"/>');
        if (Math.abs(rise) >= 0.5) {
          const yFlat = base - h;
          const xLow = rise > 0 ? x1 : x0;                      // the side whose corner sits below the flat top
          const yLow = base - Math.max(0, rise > 0 ? hRight : hLeft);
          outlines.push('<path class="flat-bar" d="M' + round(x0) + ' ' + round(yFlat) + 'H' + round(x1) +
            'M' + round(xLow) + ' ' + round(yLow) + 'V' + round(yFlat) + '"/>');
        }
      }
      const top = b.count ? Math.max(hLeft, hRight) : 0;
      bars.push('<text class="value-label" x="' + cx + '" y="' + round(base - top - 8) + '" text-anchor="middle">' + b.count + '</text>');
      labels.push('<text x="' + cx + '" y="' + (base + 24) + '" text-anchor="middle">' + b.grade + '</text>');
    });
    return '<g class="series-1">' + bars.join('') + '</g>' + outlines.join('') +
      '<line class="baseline" x1="0" x2="' + width + '" y1="' + base + '" y2="' + base + '"/>' +
      '<g class="axis">' + labels.join('') + '</g>';
  }

  function renderClass() {
    const { rows, skipped, empty, stats, gradesText: text } = G.evaluateList($('list').value, settings);
    gradesText = text;
    $('class-section').dataset.print = stats ? 'show' : 'hide';
    $('class-empty').hidden = Boolean(stats);
    $('class-stats').hidden = !stats;
    $('class-results').hidden = !stats;

    $('class-skipped').hidden = skipped.length === 0;
    $('class-skipped-title').textContent = (skipped.length === 1 ? '1 Eintrag wurde' : skipped.length + ' Einträge wurden') + ' nicht ausgewertet.';
    $('class-skipped-list').innerHTML = skipped.map((s) =>
      '<li>Nr. ' + s.position + ' („' + escapeHtml(s.raw) + '“): ' + escapeHtml(s.reason) + '</li>').join('');

    if (!stats) return;
    $('c-count').textContent = stats.count;
    $('c-grade').textContent = fixed(stats.averageGrade, 2);
    $('c-percent').innerHTML = pct(stats.averagePercent) + '<span class="metric-unit">%</span>';
    $('c-grade-median').textContent = 'Median ' + num(stats.medianGrade);
    $('c-passed').textContent = stats.passed;
    $('c-passed-of').textContent = 'von ' + stats.count;
    $('c-percent-median').textContent = 'Median ' + pctUnit(stats.medianPercent) + ', ' + points(stats.medianPoints);
    $('c-sd').innerHTML = stats.sdPoints === null ? '–' : averageFormat.format(stats.sdPoints) + '<span class="metric-unit">Punkte</span>';
    $('c-sd-percent').textContent = stats.sdPoints === null ? 'ab 2 Werten' : averageFormat.format(stats.sdPercent) + ' Prozentpunkte';
    $('c-range').textContent = num(stats.minPoints) + ' – ' + num(stats.maxPoints);
    $('c-range-percent').textContent = 'Punkte, ' + pct(stats.minPercent) + ' – ' + pctUnit(stats.maxPercent);
    $('c-chart-subtitle').textContent = stats.count + ' ausgewertet' + (empty ? ', ' + empty + ' leer' : '') + ', Ø Note ' + fixed(stats.averageGrade, 2);
    $('c-chart').setAttribute('aria-label', 'Notenspiegel: ' + stats.lean.map((b) =>
      'Note ' + b.grade + ': ' + b.count + (b.count ? ', ' + leanText(b) : '')).join('; '));
    $('c-chart').innerHTML = leanChart(stats);
    $('c-chart-body').innerHTML = stats.lean.map((b) =>
      '<tr><td>' + b.grade + ' (' + G.KEY[b.grade - 1].word + ')</td><td class="numeric">' + b.count + '</td>' +
      '<td class="numeric">' + pctUnit((b.count / stats.count) * 100) + '</td>' +
      '<td class="numeric">' + (b.meanPercent === null ? '–' : pctUnit(b.meanPercent)) + '</td><td>' + leanText(b) + '</td></tr>').join('');

    $('c-rows').innerHTML = rows.map((r) =>
      '<tr>' +
      '<td class="numeric">' + r.position + '</td>' +
      '<td class="numeric">' + num(r.points) + '</td>' +
      '<td class="numeric">' + pctUnit(r.percent) + '</td>' +
      '<td class="center">' + r.grade + '</td>' +
      '<td class="numeric">' + fixed(r.decimal, 1) + '</td>' +
      '</tr>').join('');
  }

  function renderInvalid() {
    $('key-meta').textContent = '';
    $('key-body').innerHTML = '<tr><td colspan="4">Gib oben eine gültige Höchstpunktzahl ein, dann erscheint hier der Notenschlüssel.</td></tr>';
    $('result').hidden = true;
    $('result-empty').hidden = false;
    $('result-live').textContent = '';
    $('class-stats').hidden = true;
    $('class-results').hidden = true;
    $('class-skipped').hidden = true;
    $('class-empty').hidden = false;
    $('class-section').dataset.print = 'hide';
    $('key-note').hidden = true;
    $('calc-sheet').hidden = true;
    $('calc-empty').hidden = false;
    $('tasks-mismatch').hidden = true;
  }

  /* --- Main loop ----------------------------------------------------- */
  function update({ syncUrl = true } = {}) {
    const fields = readFields();
    const errors = G.checkSettings(fields);
    setError($('max'), errors.max);
    setError($('bonus'), errors.bonus);
    settings = null;
    scale = null;
    result = null;
    if (errors.max || errors.bonus) {
      renderInvalid();
      renderTitle();
      renderPrint();
      return;
    }
    settings = fields;
    scale = G.buildScale(settings);

    const entered = $('points').value.trim();
    if (entered === '') setError($('points'), null);
    else {
      const p = G.parseNumber(entered);
      const problem = G.checkPoints(p, settings);
      setError($('points'), problem);
      if (!problem) result = G.evaluate(p, settings, scale);
    }

    renderTitle();
    renderKey();
    renderResult();
    renderCalc();
    renderClass();
    renderPrint();
    if (syncUrl) writeUrl();
  }

  /* --- Copying --------------------------------------------------------- */
  async function copy(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      B3.toast('success', message);
    } catch (e) {
      B3.toast('error', 'Kopieren nicht möglich. Markiere den Text und drücke Strg + C.');
    }
  }

  /* Self-contained text for e-mail or messenger: title, name, result,
     the key, and the link last (optional, for the full view). */
  function infoText() {
    const title = $('title').value.trim();
    const name = $('name').value.trim();
    const blocks = [];
    const head = [];
    if (title) head.push(title);
    if (name) head.push('Name: ' + name);
    if (result) {
      head.push('Ergebnis: ' + num(result.points) + ' von ' + ofPoints(settings.max) + ' (' + pctUnit(result.percent) + '), Note ' +
        result.grade + ' (' + result.word + '), Dezimalnote ' + fixed(result.decimal, 1));
    }
    if (head.length) blocks.push(head.join('\n'));
    blocks.push(['Notenschlüssel für ' + describe(settings) + ':'].concat(scale.map((b) =>
      b.grade + ' ' + b.word + ': ' +
      (b.reachable ? (b.from === b.to ? points(b.from) : num(b.from) + ' – ' + num(b.to) + ' Punkte') + ', ' : '') +
      pct(b.percentFrom) + ' – ' + percentTo(b) + NBSP + '%')).join('\n'));
    blocks.push('Rechner: ' + location.href);
    return blocks.join('\n\n');
  }

  function renderExamples() {
    const base = location.origin + location.pathname;
    const examples = [
      ['?max=13&p=11.5', '11,5 von 13 Punkten'],
      ['?max=15&p=13.353', '13,353 von 15 Punkten aus einem mebis-Test'],
      ['?title=Lernzielkontrolle+SQL&max=40&step=1', 'Notenschlüssel mit Titel, Grenzen in ganzen Punkten'],
      ['?max=20&step=0.01', 'Grenzen auf 0,01 Punkte genau, wie in mebis'],
      ['?max=30&bonus=3&p=31.5', '31,5 Punkte bei 30 Punkten und 3 Zusatzpunkten']
    ];
    $('examples').innerHTML = examples.map(([query, text]) =>
      '<li><a href="' + escapeHtml(base + query) + '">' + escapeHtml(text) + '</a></li>').join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    fieldsFromUrl();
    const saved = savedSheet();
    if (saved && !$('tasks').value.trim()) $('tasks').value = saved.tasksText || '';
    renderExamples();
    update({ syncUrl: false });
    if (settings && saved && saved.columns === tasks.maxima.join('|') && Array.isArray(saved.sheet)) {
      sheet = saved.sheet.map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? '')) : []));
      sheetColumns = '';
      renderCalc();
    }
    if (tasks.maxima.length) $('calc-section').open = true;

    $('settings').addEventListener('submit', (e) => e.preventDefault());
    ['title', 'max', 'bonus', 'points', 'tasks'].forEach((id) => $(id).addEventListener('input', () => update()));
    $('step').addEventListener('b3:change', () => update());
    $('name').addEventListener('input', renderPrint);
    $('list').addEventListener('input', () => { if (settings) renderClass(); });
    $('calc-body').addEventListener('input', onSheetInput);
    $('calc-body').addEventListener('keydown', onSheetKey);
    $('calc-body').addEventListener('focusin', onSheetFocus);
    $('calc-body').addEventListener('paste', onSheetPaste);
    $('calc-body').addEventListener('click', onSheetClick);
    $('calc-open').addEventListener('click', (e) => { const b = e.target.closest('[data-goto]'); if (b) focusProblem(Number(b.dataset.goto)); });
    $('calc-next').addEventListener('click', () => focusProblem(nextOpenRow()));
    // Enter in the task field starts typing points
    $('tasks').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('calc-sheet').hidden) { e.preventDefault(); focusProblem(nextOpenRow()); } });
    $('tasks-apply').addEventListener('click', () => { $('max').value = toField(tasks.total); update(); });
    $('calc-copy').addEventListener('click', () => copy(sheetLines(true).join('\n'), 'Summen und Noten kopiert, eine Zeile pro Person.'));
    $('calc-transfer').addEventListener('click', () => {
      $('list').value = sheetLines(false).join('\n');
      $('class-section').open = true;
      renderClass();
      $('class-section').scrollIntoView({ block: 'start' });
      B3.toast('success', 'Summen an „Klasse auswerten“ übergeben.');
    });
    $('calc-clear').addEventListener('click', async () => {
      const ok = await B3.confirm({ title: 'Alle Punkte löschen?', message: 'Die Punkte aller Personen in der Tabelle werden gelöscht.', confirmLabel: 'Alle Punkte löschen', danger: true });
      if (!ok) return;
      sheet = [[]];
      sheetColumns = '';
      activeRow = 0;
      renderCalc();
      saveSheet();
    });
    window.addEventListener('beforeunload', (e) => {
      if (sheet.some(isTouched)) { e.preventDefault(); e.returnValue = ''; }
    });

    $('print').addEventListener('click', () => { renderPrint(); window.print(); });
    $('copy-link').addEventListener('click', () => { writeUrl(); copy(location.href, 'Link kopiert.'); });
    $('copy-text').addEventListener('click', () => {
      if (!settings) { $('max').focus(); return; }
      writeUrl();
      copy(infoText(), result ? 'Ergebnis und Notenschlüssel kopiert.' : 'Notenschlüssel kopiert.');
    });
    $('copy-grades').addEventListener('click', () => copy(gradesText, 'Noten kopiert, in derselben Reihenfolge wie die Punkte.'));

    window.addEventListener('popstate', () => {
      fieldsFromUrl();
      update({ syncUrl: false });
    });
  });
})();
