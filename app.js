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
    const url = location.pathname + '?' + q.toString() + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
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
      return;
    }
    const r = result;
    $('r-grade').textContent = r.grade;
    $('r-word').textContent = r.word;
    $('r-percent').innerHTML = pct(r.percent) + '<span class="metric-unit">%</span>';
    $('r-points').textContent = num(r.points) + ' von ' + ofPoints(settings.max);
    $('r-decimal').textContent = fixed(r.decimal, 1);
    // Decimal scores can fall between two point ranges; say which column decides
    $('r-between').hidden = r.onTable;
    $('r-between').textContent = r.onTable ? '' : num(r.points) + ' Punkte liegen zwischen zwei Punktbereichen der Tabelle. Maßgeblich ist der Prozentwert.';
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

  function renderClass() {
    const { rows, skipped, empty, stats, gradesText: text } = G.evaluateList($('list').value, settings, $('separator').value);
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
    $('c-passed').textContent = stats.passed;
    $('c-passed-of').textContent = 'von ' + stats.count;

    const most = Math.max(...stats.distribution);
    $('c-chart-subtitle').textContent = stats.count + ' ausgewertet' + (empty ? ', ' + empty + ' leer' : '') + ', Ø Note ' + fixed(stats.averageGrade, 2);
    $('c-chart').setAttribute('aria-label', 'Notenspiegel: ' + stats.distribution.map((n, i) => 'Note ' + (i + 1) + ': ' + n).join(', '));
    $('c-chart').innerHTML = stats.distribution.map((n, i) =>
      '<div class="bar-chart-item"><div class="bar-track"><div class="bar" style="height: ' + (most ? Math.round((n / most) * 100) : 0) + '%">' +
      '<span class="bar-value">' + n + '</span></div></div><span class="bar-label">' + (i + 1) + '</span></div>').join('');
    $('c-chart-body').innerHTML = stats.distribution.map((n, i) =>
      '<tr><td>' + (i + 1) + ' (' + G.KEY[i].word + ')</td><td class="numeric">' + n + '</td><td class="numeric">' + pctUnit((n / stats.count) * 100) + '</td></tr>').join('');

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
    renderExamples();
    update({ syncUrl: false });

    $('settings').addEventListener('submit', (e) => e.preventDefault());
    ['title', 'max', 'bonus', 'points'].forEach((id) => $(id).addEventListener('input', () => update()));
    $('step').addEventListener('b3:change', () => update());
    $('name').addEventListener('input', renderPrint);
    $('list').addEventListener('input', () => { if (settings) renderClass(); });
    $('separator').addEventListener('change', () => { if (settings) renderClass(); });

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
