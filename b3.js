/* ================================================================
   B3 Schulportal Styleguide — b3.js
   Version 6.0 · optional, dependency-free behaviors for style.css

   <script src="b3.js" defer></script>

   Everything is wired automatically from markup (ARIA roles, classes,
   data attributes) — no per-app copy-paste of event handlers. Content
   added later: call B3.init(container).

   Public API (window.B3):
     B3.toast(type, message, { duration })   'success'|'error'|'warning'|'info'
     B3.confirm({ title, message, confirmLabel, cancelLabel, danger }) → Promise<boolean>
     B3.setTheme('light'|'dark')              persisted in localStorage 'b3-theme'
     B3.fmt.date / time / dateTime / number / percent / bytes / duration
     B3.init(root)

   To avoid a flash of the light theme, put this in <head> as well:
     <script>try{document.documentElement.dataset.theme=localStorage.getItem('b3-theme')||'light'}catch(e){}</script>
   ================================================================ */
(function () {
  'use strict';

  const ICONS = {
    success: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    error:   'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
    warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    info:    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'
  };

  const svg = (path) =>
    '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor"><path d="' + path + '"/></svg>';

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } }
  };

  /* --- German formats (§ Language): 15.07.2026 · 14:30 Uhr · 1,5 · 87 % */
  const fmt = {
    date: (d) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: (d) => new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr',
    dateTime: (d) => fmt.date(d) + ', ' + fmt.time(d),
    number: (n, digits) => Number(n).toLocaleString('de-DE', digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    /* percent(0.87) → "87 %" (pass a fraction, like Intl does) */
    percent: (fraction, digits = 0) => Number(fraction).toLocaleString('de-DE', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }),
    bytes: (n) => {
      const units = ['B', 'KB', 'MB', 'GB'];
      let i = 0;
      while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
      return fmt.number(n, i === 0 ? 0 : 1) + ' ' + units[i];
    },
    /* duration(5400) → "90:00" — total minutes:seconds, as exam timers count */
    duration: (seconds) => {
      const s = Math.max(0, Math.round(seconds));
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
  };

  /* --- Theme ------------------------------------------------------ */
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    store.set('b3-theme', theme);
    document.querySelectorAll('[data-b3-theme-toggle]').forEach((btn) =>
      btn.setAttribute('aria-pressed', String(theme === 'dark')));
  }

  /* --- Toasts ----------------------------------------------------- */
  function toastRegion() {
    let region = document.querySelector('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    return region;
  }

  function toast(type, message, options = {}) {
    const kind = ICONS[type] ? type : 'info';
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    if (kind === 'error') el.setAttribute('role', 'alert');
    el.innerHTML = svg(ICONS[kind]) + '<span></span>' +
      '<button type="button" class="toast-close" aria-label="Meldung schließen">×</button>';
    el.querySelector('span').textContent = message;
    el.querySelector('.toast-close').addEventListener('click', () => el.remove());
    toastRegion().appendChild(el);
    // Errors stay until dismissed; everything else leaves after 5 s.
    const duration = options.duration ?? (kind === 'error' ? 0 : 5000);
    if (duration > 0) setTimeout(() => el.remove(), duration);
    return el;
  }

  /* --- Confirm dialog -------------------------------------------- */
  function confirmDialog({ title, message, confirmLabel = 'Bestätigen', cancelLabel = 'Abbrechen', danger = false }) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'modal';
      const id = 'b3-confirm-' + Date.now();
      dialog.setAttribute('aria-labelledby', id);
      dialog.innerHTML =
        '<div class="modal-header"><h2 class="modal-title" id="' + id + '"></h2></div>' +
        '<p></p>' +
        '<form method="dialog" class="modal-footer">' +
        '<button class="btn secondary" value="cancel"></button>' +
        '<button class="btn ' + (danger ? 'danger' : 'primary') + '" value="ok"></button>' +
        '</form>';
      dialog.querySelector('.modal-title').textContent = title;
      dialog.querySelector('p').textContent = message;
      dialog.querySelector('[value="cancel"]').textContent = cancelLabel;
      dialog.querySelector('[value="ok"]').textContent = confirmLabel;
      dialog.addEventListener('close', () => {
        resolve(dialog.returnValue === 'ok');
        dialog.remove();
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.querySelector('[value="cancel"]').focus(); // safe default for binding actions
    });
  }

  /* --- Wiring ----------------------------------------------------- */
  const wired = new WeakSet();
  const once = (el) => (wired.has(el) ? false : (wired.add(el), true));

  function initTabs(root) {
    root.querySelectorAll('[role="tablist"]').forEach((tablist) => {
      if (!once(tablist)) return;
      const tabs = [...tablist.querySelectorAll('[role="tab"]')];
      const select = (tab, focus) => {
        tabs.forEach((t) => {
          const selected = t === tab;
          t.setAttribute('aria-selected', String(selected));
          t.tabIndex = selected ? 0 : -1;
          const panel = document.getElementById(t.getAttribute('aria-controls'));
          if (panel) panel.hidden = !selected;
        });
        if (focus) tab.focus();
        tablist.dispatchEvent(new CustomEvent('b3:change', { detail: { tab }, bubbles: true }));
      };
      tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => select(tab, false));
        tab.addEventListener('keydown', (e) => {
          const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
          if (!(e.key in keys)) return;
          e.preventDefault();
          select(tabs[(keys[e.key] + tabs.length) % tabs.length], true);
        });
      });
    });
  }

  function initToggles(root) {
    // Segmented control: exactly one pressed
    root.querySelectorAll('.segmented').forEach((group) => {
      if (!once(group)) return;
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || !group.contains(btn)) return;
        group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        group.dispatchEvent(new CustomEvent('b3:change', { detail: { value: btn.value || btn.textContent.trim() }, bubbles: true }));
      });
    });
    // Filter pills: independent toggles (single choice inside [data-single])
    root.querySelectorAll('button.pill[aria-pressed]').forEach((pill) => {
      if (!once(pill)) return;
      pill.addEventListener('click', () => {
        const group = pill.closest('[data-single]');
        if (group) group.querySelectorAll('button.pill[aria-pressed]').forEach((p) => p.setAttribute('aria-pressed', String(p === pill)));
        else pill.setAttribute('aria-pressed', String(pill.getAttribute('aria-pressed') !== 'true'));
        pill.dispatchEvent(new CustomEvent('b3:change', { bubbles: true }));
      });
    });
    // Removable tags
    root.querySelectorAll('.pill .remove-btn').forEach((btn) => {
      if (!once(btn)) return;
      btn.addEventListener('click', () => btn.closest('.pill').remove());
    });
    // Theme toggles
    root.querySelectorAll('[data-b3-theme-toggle]').forEach((btn) => {
      if (!once(btn)) return;
      btn.setAttribute('aria-pressed', String(document.documentElement.getAttribute('data-theme') === 'dark'));
      btn.addEventListener('click', () =>
        setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
    });
    // Dialog openers: <button data-open-dialog="id">
    root.querySelectorAll('[data-open-dialog]').forEach((btn) => {
      if (!once(btn)) return;
      btn.addEventListener('click', () => document.getElementById(btn.dataset.openDialog)?.showModal());
    });
  }

  /* Dropdown menus: native popover; we position and add arrow keys. */
  function initMenus(root) {
    root.querySelectorAll('.menu[popover]').forEach((menu) => {
      if (!once(menu)) return;
      const items = () => [...menu.querySelectorAll('.menu-item:not([disabled])')];
      menu.addEventListener('toggle', (e) => {
        const invoker = document.querySelector('[popovertarget="' + menu.id + '"]');
        invoker?.setAttribute('aria-expanded', String(e.newState === 'open'));
        if (e.newState !== 'open' || !invoker) return;
        const r = invoker.getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        const gap = 4;
        let top = r.bottom + gap;
        if (top + m.height > innerHeight - 8 && r.top - gap - m.height > 8) top = r.top - gap - m.height;
        let left = r.left;
        if (left + m.width > innerWidth - 8) left = Math.max(8, r.right - m.width);
        menu.style.top = top + 'px';
        menu.style.left = left + 'px';
        items()[0]?.focus();
      });
      menu.addEventListener('keydown', (e) => {
        const list = items();
        const i = list.indexOf(document.activeElement);
        const keys = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 };
        if (!(e.key in keys)) return;
        e.preventDefault();
        list[(keys[e.key] + list.length) % list.length]?.focus();
      });
      menu.addEventListener('click', (e) => {
        if (e.target.closest('.menu-item')) menu.hidePopover();
      });
    });
    // Close open menus on scroll (positions are fixed to the viewport)
    if (!wired.has(document)) {
      wired.add(document);
      addEventListener('scroll', () => document.querySelectorAll('.menu:popover-open').forEach((m) => m.hidePopover()), { passive: true });
    }
  }

  function copyText(text, feedbackEl, button) {
    const done = () => {
      if (feedbackEl) {
        feedbackEl.textContent = 'Kopiert';
        setTimeout(() => { feedbackEl.textContent = ''; }, 2000);
      } else if (button) {
        const label = button.textContent;
        button.textContent = 'Kopiert';
        setTimeout(() => { button.textContent = label; }, 2000);
      }
    };
    navigator.clipboard?.writeText(text).then(done, () => toast('error', 'Kopieren nicht möglich. Bitte markiere den Text und drücke Strg + C.'));
  }

  function initCopy(root) {
    // <button data-copy="#selector"> or data-copy="literal text"
    root.querySelectorAll('[data-copy]').forEach((btn) => {
      if (!once(btn)) return;
      btn.addEventListener('click', () => {
        const ref = btn.dataset.copy;
        let target = null;
        try { target = ref.startsWith('#') ? document.querySelector(ref) : null; } catch (e) { /* not a selector */ }
        const text = target ? (target.value ?? target.textContent) : ref;
        copyText(text.trim(), btn.closest('.copy-field')?.querySelector('.copy-feedback'), btn);
      });
    });
    root.querySelectorAll('.code-figure .code-copy').forEach((btn) => {
      if (!once(btn)) return;
      btn.addEventListener('click', () => copyText(btn.closest('.code-figure').querySelector('pre').textContent, null, btn));
    });
  }

  function initForms(root) {
    // Range slider → <output for="id">, optional data-unit=" %"
    root.querySelectorAll('input.range-slider').forEach((input) => {
      if (!once(input)) return;
      const out = root.querySelector('output[for~="' + input.id + '"]') || document.querySelector('output[for~="' + input.id + '"]');
      if (!out) return;
      const unit = input.dataset.unit ?? '';
      const render = () => { out.textContent = fmt.number(input.value) + unit; };
      input.addEventListener('input', render);
      render();
    });
    // Upload zone: drag highlight + hand dropped files to the input
    root.querySelectorAll('.upload-zone').forEach((zone) => {
      if (!once(zone)) return;
      const input = zone.querySelector('input[type="file"]');
      ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('dragover'); }));
      ['dragleave', 'dragend', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('dragover'); }));
      zone.addEventListener('drop', (e) => {
        if (!input || !e.dataTransfer?.files.length) return;
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  /* Quiz: <div class="quiz-options" data-quiz> with <button class="quiz-option" data-correct="true">
     and a sibling <div class="quiz-feedback-slot" data-correct-text="…" data-incorrect-text="…"> */
  function initQuiz(root) {
    root.querySelectorAll('.quiz-options[data-quiz]').forEach((group) => {
      if (!once(group)) return;
      const slot = group.parentElement.querySelector('[data-correct-text]');
      group.addEventListener('click', (e) => {
        const chosen = e.target.closest('.quiz-option');
        if (!chosen || chosen.disabled) return;
        const right = chosen.dataset.correct === 'true';
        group.querySelectorAll('.quiz-option').forEach((o) => {
          o.disabled = true;
          if (o.dataset.correct === 'true') o.classList.add('correct');
        });
        if (!right) chosen.classList.add('incorrect');
        if (slot) {
          slot.innerHTML = '';
          const fb = document.createElement('div');
          fb.className = 'quiz-feedback ' + (right ? 'correct' : 'incorrect');
          fb.setAttribute('role', 'status');
          fb.innerHTML = '<span aria-hidden="true">' + (right ? '✓' : '✗') + '</span><div><strong></strong> <span></span></div>';
          fb.querySelector('strong').textContent = right ? 'Richtig.' : 'Noch nicht.';
          fb.querySelector('div span').textContent = right ? slot.dataset.correctText : slot.dataset.incorrectText;
          slot.appendChild(fb);
        }
        group.dispatchEvent(new CustomEvent('b3:answer', { detail: { correct: right, option: chosen }, bubbles: true }));
      });
    });
  }

  function init(root = document) {
    initTabs(root);
    initToggles(root);
    initMenus(root);
    initCopy(root);
    initForms(root);
    initQuiz(root);
  }

  // Apply the stored theme before first paint where possible
  const stored = store.get('b3-theme');
  if (stored && !document.documentElement.hasAttribute('data-theme')) {
    document.documentElement.setAttribute('data-theme', stored);
  }

  window.B3 = { init, toast, confirm: confirmDialog, setTheme, fmt };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
})();
