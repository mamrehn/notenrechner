/* ================================================================
   app.js — Notenrechner UI. The grading rules live in grading.js;
   this file reads the inputs, renders and keeps the URL in sync.
   URL: ?max=13&p=11.5&step=1&bonus=2 (legacy ?smax= still read)
   ================================================================ */
(function () {
  'use strict';

  const G = window.Grading;
  const $ = (id) => document.getElementById(id);

  const ERROR_ICON = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';

  /* --- German formats: 11,5 · 88,5 % · 1,8 ------------------------ */
  const numberFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
  const num = (n) => numberFormat.format(n);
  const fixed = (n, digits) => B3.fmt.number(n, digits);
  const percentValue = (share) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(share * 100);
  const percent = (share) => percentValue(share) + '\u00a0%';
  const pointsText = (n) => num(n) + '\u00a0' + (n === 1 ? 'Punkt' : 'Punkte');
  const ofPoints = (n) => num(n) + '\u00a0' + (n === 1 ? 'Punkt' : 'Punkten');   // „von 13 Punkten“
  const gradeCell = (grade) => (grade <= 2 ? 'cell-success' : grade <= 4 ? 'cell-warning' : 'cell-error');
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const toField = (value) => String(value ?? '').replace('.', ',');
  const toUrl = (n) => String(n);

  let settings = null;      // last valid { max, step, bonus }
  let result = null;        // evaluation of the entered score
  let classRows = [];

  /* --- Fields and errors ------------------------------------------ */
  function setError(input, message) {
    const el = $(input.id + '-error');
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    el.hidden = !message;
    el.innerHTML = message ? ERROR_ICON : '';
    if (message) el.append(message);
  }

  function stepInput(step) {
    return document.querySelector('input[name="step"][value="' + (step === 1 ? '1' : '0.5') + '"]');
  }

  function readFields() {
    const bonusText = $('bonus').value.trim();
    return {
      max: G.parseNumber($('max').value),
      step: Number(document.querySelector('input[name="step"]:checked').value),
      bonus: bonusText === '' ? 0 : G.parseNumber(bonusText)
    };
  }

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
    $('max').value = toField(max);
    $('bonus').value = toField(bonus);
    $('points').value = toField(q.get('p') || '');
    const step = ['1', 'ganz'].includes(q.get('step')) ? 1 : 0.5;
    stepInput(step).checked = true;
  }

  function writeUrl() {
    if (!settings) return;
    const q = new URLSearchParams();
    q.set('max', toUrl(settings.max));
    if (settings.step === 1) q.set('step', '1');
    if (settings.bonus) q.set('bonus', toUrl(settings.bonus));
    if (result) q.set('p', toUrl(result.points));
    const url = location.pathname + '?' + q.toString() + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  }

  /* --- Rendering ----------------------------------------------------- */
  function describeSettings(s) {
    return pointsText(s.max) + (s.bonus ? ' + ' + num(s.bonus) + '\u00a0Zusatzpunkte' : '') + ', ' + (s.step === 1 ? 'ganze' : 'halbe') + ' Punkte';
  }

  function renderKey(scale) {
    $('key-meta').textContent = describeSettings(settings);
    $('key-caption').textContent = 'Notenschlüssel für ' + describeSettings(settings);
    document.title = 'Notenschlüssel für ' + pointsText(settings.max) + ' – Notenrechner';
    $('key-body').innerHTML = scale.map((band) => {
      const current = result && result.grade === band.grade;
      const points = band.reachable
        ? '<td class="numeric">' + num(band.from) + '</td><td class="numeric">' + num(band.to) + '</td>'
        : '<td class="numeric" colspan="2">nicht erreichbar</td>';
      return '<tr' + (current ? ' aria-current="true"' : '') + (band.reachable ? '' : ' data-reachable="false"') + '>' +
        '<th scope="row" class="' + gradeCell(band.grade) + '">' + band.grade + '</th>' +
        '<td>' + band.word + (current ? ' <span class="badge neutral">Ergebnis</span>' : '') + '</td>' +
        points +
        '<td class="numeric">' + band.max + '–' + band.min + '</td>' +
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
    $('r-share').innerHTML = percentValue(r.share) + '<span class="metric-unit">%</span>';
    $('r-points').textContent = num(r.points) + ' von ' + ofPoints(settings.max);
    $('r-decimal').textContent = fixed(r.decimal, 1);
    $('r-ihk').textContent = r.ihkPoints + ' von 100 IHK-Punkten';
    let next = '';
    if (r.better) {
      next = 'Bis zur Note ' + r.better.grade + ' („' + r.better.word + '“) ' + (r.missing === 1 ? 'fehlt ' : 'fehlen ') + pointsText(r.missing) + '.';
    }
    $('r-next').textContent = next;
    $('r-next').hidden = !next;
    $('result-live').textContent = 'Note ' + r.grade + ', ' + r.word + ', bei ' + num(r.points) + ' von ' + ofPoints(settings.max) + '.';
  }

  function renderAllScores() {
    if (!$('all-scores').open) return;
    $('scores-body').innerHTML = G.allScores(settings).map((r) => {
      const current = result && result.points === r.points;
      return '<tr' + (current ? ' aria-current="true"' : '') + '>' +
        '<th scope="row" class="numeric">' + num(r.points) + '</th>' +
        '<td class="numeric">' + percent(r.share) + '</td>' +
        '<td class="numeric">' + r.ihkPoints + '</td>' +
        '<td class="' + gradeCell(r.grade) + '">' + r.grade + '</td>' +
        '<td class="numeric">' + fixed(r.decimal, 1) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderClass() {
    const { rows, skipped, stats } = G.evaluateList($('list').value, settings);
    classRows = rows;
    $('class-section').dataset.print = stats ? 'show' : 'hide';
    $('class-empty').hidden = Boolean(stats);
    $('class-stats').hidden = !stats;
    $('class-results').hidden = !stats;

    $('class-skipped').hidden = skipped.length === 0;
    $('class-skipped-title').textContent = skipped.length === 1
      ? '1 Zeile wurde nicht ausgewertet.'
      : skipped.length + ' Zeilen wurden nicht ausgewertet.';
    $('class-skipped-list').innerHTML = skipped.map((s) =>
      '<li>Zeile ' + s.line + ' („' + escapeHtml(s.text) + '“): ' + escapeHtml(s.reason) + '</li>').join('');

    if (!stats) return;
    $('c-count').textContent = stats.count;
    $('c-grade').textContent = fixed(stats.averageGrade, 2);
    $('c-share').innerHTML = percentValue(stats.averageShare) + '<span class="metric-unit">%</span>';
    $('c-points').textContent = 'Ø ' + num(stats.averagePoints) + ' von ' + ofPoints(settings.max);
    $('c-passed').textContent = stats.passed;
    $('c-passed-of').textContent = 'von ' + stats.count + ', ' + percent(stats.passed / stats.count);

    const most = Math.max(...stats.distribution);
    $('c-chart-subtitle').textContent = stats.count + (stats.count === 1 ? ' Person' : ' Personen') + ', Ø ' + fixed(stats.averageGrade, 2);
    $('c-chart').setAttribute('aria-label', 'Notenspiegel: ' + stats.distribution.map((n, i) => 'Note ' + (i + 1) + ': ' + n).join(', '));
    $('c-chart').innerHTML = stats.distribution.map((n, i) =>
      '<div class="bar-chart-item"><div class="bar-track"><div class="bar" style="height: ' + (most ? Math.round((n / most) * 100) : 0) + '%">' +
      '<span class="bar-value">' + n + '</span></div></div><span class="bar-label">' + (i + 1) + '</span></div>').join('');
    $('c-chart-body').innerHTML = stats.distribution.map((n, i) =>
      '<tr><td>' + (i + 1) + ' (' + G.KEY[i].word + ')</td><td class="numeric">' + n + '</td><td class="numeric">' + percent(n / stats.count) + '</td></tr>').join('');

    $('c-rows').innerHTML = rows.map((r, i) =>
      '<tr>' +
      '<td class="numeric">' + (i + 1) + '</td>' +
      '<th scope="row">' + (r.name ? escapeHtml(r.name) : '<span class="text-muted">ohne Namen</span>') + '</th>' +
      '<td class="numeric">' + num(r.points) + '</td>' +
      '<td class="numeric">' + percent(r.share) + '</td>' +
      '<td class="' + gradeCell(r.grade) + '">' + r.grade + '</td>' +
      '<td class="numeric">' + fixed(r.decimal, 1) + '</td>' +
      '</tr>').join('');
  }

  function renderInvalid() {
    $('key-meta').textContent = '';
    $('key-body').innerHTML = '<tr><td colspan="5">Gib oben eine gültige Höchstpunktzahl ein, dann erscheint hier der Notenschlüssel.</td></tr>';
    $('scores-body').innerHTML = '';
    $('result').hidden = true;
    $('result-empty').hidden = false;
    $('result-live').textContent = '';
    $('class-stats').hidden = true;
    $('class-results').hidden = true;
    $('class-skipped').hidden = true;
    $('class-empty').hidden = false;
  }

  /* --- Main loop ----------------------------------------------------- */
  function update({ syncUrl = true } = {}) {
    const fields = readFields();
    const errors = G.checkSettings(fields);
    setError($('max'), errors.max);
    setError($('bonus'), errors.bonus);
    if (errors.max || errors.bonus) {
      settings = null;
      result = null;
      renderInvalid();
      return;
    }
    settings = fields;
    const scale = G.buildScale(settings);

    const entered = $('points').value.trim();
    result = null;
    if (entered === '') setError($('points'), null);
    else {
      const points = G.parseNumber(entered);
      const problem = G.checkPoints(points, settings);
      setError($('points'), problem);
      if (!problem) result = G.evaluate(points, settings, scale);
    }

    renderKey(scale);
    renderResult();
    renderAllScores();
    renderClass();
    if (syncUrl) writeUrl();
  }

  /* --- Actions ------------------------------------------------------- */
  async function copy(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      B3.toast('success', message);
    } catch (e) {
      B3.toast('error', 'Kopieren nicht möglich. Markiere den Text und drücke Strg + C.');
    }
  }

  function classListAsTsv() {
    const header = ['Nr.', 'Name', 'Punkte', 'Anteil in %', 'Note', 'IHK-Dezimalnote'];
    const lines = classRows.map((r, i) => [i + 1, r.name, num(r.points), percentValue(r.share), r.grade, fixed(r.decimal, 1)].join('\t'));
    return [header.join('\t')].concat(lines).join('\n');
  }

  function renderExamples() {
    const base = location.origin + location.pathname;
    const examples = [
      ['?max=13&p=11', '11 von 13 Punkten'],
      ['?max=40&step=1', 'Notenschlüssel für 40 Punkte, nur ganze Punkte'],
      ['?max=30&bonus=3&p=31.5', '31,5 Punkte bei 30 Punkten und 3 Zusatzpunkten']
    ];
    $('examples').innerHTML = examples.map(([query, text]) => {
      const href = base + query;
      return '<li><a href="' + escapeHtml(href) + '">' + escapeHtml(text) + '</a></li>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    fieldsFromUrl();
    renderExamples();
    update({ syncUrl: false });

    $('settings').addEventListener('submit', (e) => e.preventDefault());
    ['max', 'bonus', 'points'].forEach((id) => $(id).addEventListener('input', () => update()));
    document.querySelectorAll('input[name="step"]').forEach((radio) => radio.addEventListener('change', () => update()));
    $('list').addEventListener('input', () => { if (settings) renderClass(); });
    $('all-scores').addEventListener('toggle', () => { if (settings) renderAllScores(); });

    $('print').addEventListener('click', () => window.print());
    $('copy-link').addEventListener('click', () => {
      writeUrl();
      copy(location.href, 'Link kopiert.');
    });
    $('copy-list').addEventListener('click', () => copy(classListAsTsv(), 'Liste kopiert. Du kannst sie z. B. in Excel einfügen.'));

    window.addEventListener('popstate', () => {
      fieldsFromUrl();
      update({ syncUrl: false });
    });
  });
})();
