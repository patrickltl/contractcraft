/* ============================================================
   ContractCraft — app controller
   Form state + autosave, generation, tabs, watermark,
   copy/download/print, edit mode, unlock modal.
   Plain script, no dependencies.
   ============================================================ */
(function () {
  'use strict';

  var LS_FORM = 'cc_form_v1';
  var WM_TEXT = 'PREVIEW \u2014 UNLOCK TO DOWNLOAD';

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  var state = {
    docs: null,          // generated docs {agreement, nda, sow}
    tab: 'agreement',
    editing: false,
    overrides: {}        // docId -> edited plain text
  };

  /* ---------------- tiny utils ---------------- */

  function toast(msg, ok) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (ok === false ? ' toast-err' : '');
    clearTimeout(toast._h);
    toast._h = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  function todayIso() {
    var d = new Date();
    var m = String(d.getMonth() + 1); if (m.length < 2) { m = '0' + m; }
    var day = String(d.getDate()); if (day.length < 2) { day = '0' + day; }
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function stamp() {
    var d = new Date();
    var m = String(d.getMonth() + 1); if (m.length < 2) { m = '0' + m; }
    var day = String(d.getDate()); if (day.length < 2) { day = '0' + day; }
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------------- form: collect / autosave ---------------- */

  function fieldVal(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function collectForm() {
    var delivs = $$('.del-row input').map(function (i) { return i.value; });
    return {
      f_name: fieldVal('f_name'),
      f_business: fieldVal('f_business'),
      f_address: fieldVal('f_address'),
      c_name: fieldVal('c_name'),
      c_address: fieldVal('c_address'),
      project: fieldVal('project'),
      deliverables: delivs,
      start_date: fieldVal('start_date'),
      end_date: fieldVal('end_date'),
      duration_text: fieldVal('duration_text'),
      rate_type: fieldVal('rate_type') || 'hourly',
      rate_amount: fieldVal('rate_amount'),
      currency: fieldVal('currency') || 'USD',
      pay_terms: fieldVal('pay_terms') || 'net14',
      late_fee: fieldVal('late_fee'),
      revision_rounds: fieldVal('revision_rounds'),
      kill_fee: fieldVal('kill_fee'),
      confidentiality: $('#confidentiality').checked,
      notice_days: fieldVal('notice_days'),
      law_state: fieldVal('law_state') || 'California',
      law_other: fieldVal('law_other'),
      dispute: fieldVal('dispute') || 'med_arb'
    };
  }

  function applyForm(d) {
    d = d || {};
    var set = function (id, v) { var el = document.getElementById(id); if (el && v != null && v !== '') { el.value = v; } };
    set('f_name', d.f_name); set('f_business', d.f_business); set('f_address', d.f_address);
    set('c_name', d.c_name); set('c_address', d.c_address);
    set('project', d.project);
    set('start_date', d.start_date); set('end_date', d.end_date); set('duration_text', d.duration_text);
    set('rate_type', d.rate_type || 'hourly'); set('rate_amount', d.rate_amount);
    set('currency', d.currency || 'USD'); set('pay_terms', d.pay_terms || 'net14');
    set('late_fee', d.late_fee); set('revision_rounds', d.revision_rounds);
    set('kill_fee', d.kill_fee); set('notice_days', d.notice_days);
    set('law_state', d.law_state || 'California'); set('law_other', d.law_other);
    set('dispute', d.dispute || 'med_arb');
    if (d.confidentiality === false) { $('#confidentiality').checked = false; }
    if (Array.isArray(d.deliverables)) {
      $$('.del-row').forEach(function (r) { r.remove(); });
      var list = d.deliverables.length ? d.deliverables : [''];
      list.forEach(function (v) { addDeliverableRow(v); });
    }
    toggleLawOther();
    toggleRateLabel();
  }

  function saveForm() {
    try {
      localStorage.setItem(LS_FORM, JSON.stringify(collectForm()));
      var s = $('#saveHint');
      s.textContent = 'Saved';
      s.className = 'save-hint show';
      clearTimeout(saveForm._h);
      saveForm._h = setTimeout(function () { s.className = 'save-hint'; }, 1400);
    } catch (e) { /* storage unavailable */ }
  }

  function loadForm() {
    try {
      var raw = localStorage.getItem(LS_FORM);
      if (raw) { applyForm(JSON.parse(raw)); }
    } catch (e) { /* ignore corrupt save */ }
  }

  /* ---------------- deliverable rows ---------------- */

  function addDeliverableRow(value) {
    var row = document.createElement('div');
    row.className = 'del-row';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.placeholder = 'e.g. Moodboard (PDF) — week 1';
    input.value = value || '';
    input.setAttribute('aria-label', 'Deliverable');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon del-remove';
    btn.textContent = '\u00D7';
    btn.title = 'Remove deliverable';
    btn.setAttribute('aria-label', 'Remove deliverable');
    btn.addEventListener('click', function () {
      var rows = $$('.del-row');
      if (rows.length > 1) { row.remove(); saveForm(); }
      else { input.value = ''; saveForm(); }
    });
    row.appendChild(input);
    row.appendChild(btn);
    $('#deliverables').appendChild(row);
  }

  /* ---------------- conditional UI bits ---------------- */

  function toggleLawOther() {
    var sel = $('#law_state');
    var wrap = $('#law_other_wrap');
    if (wrap) { wrap.style.display = (sel.value === 'other') ? '' : 'none'; }
  }

  function toggleRateLabel() {
    var label = $('#rate_amount_label');
    if (!label) { return; }
    label.textContent = ($('#rate_type').value === 'fixed') ? 'Fixed fee amount' : 'Hourly rate';
  }

  /* ---------------- license / gate ---------------- */

  function license() {
    return window.CCLicense.getLicense();
  }

  function canDownloadDoc(docId) {
    return window.CCLicense.canDownload(docId);
  }

  function unlockedLabel() {
    var lic = license();
    if (!lic) { return null; }
    if (lic.type === 'bundle') { return 'Bundle unlocked'; }
    if (lic.type === 'single') { return 'Agreement unlocked'; }
    if (lic.type === 'demo') { return 'Demo unlock active'; }
    return null;
  }

  /* ---------------- output rendering ---------------- */

  function currentDoc() {
    if (!state.docs) { return null; }
    return state.docs[state.tab];
  }

  function docText(doc) {
    if (state.overrides[doc.id]) { return state.overrides[doc.id]; }
    return doc.txt;
  }

  function editedToHtml(text) {
    var paras = String(text).split(/\n{2,}/);
    var out = [];
    for (var i = 0; i < paras.length; i++) {
      var p = paras[i].replace(/^\s+|\s+$/g, '');
      if (p) { out.push('<p class="doc-edit-para">' + escapeHtml(p).replace(/\n/g, '<br>') + '</p>'); }
    }
    return out.join('\n');
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderWatermark(paper) {
    var old = $('.paper-wm', paper);
    if (old) { old.remove(); }
    if (license()) { return; }
    var wm = document.createElement('div');
    wm.className = 'paper-wm';
    wm.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 36; i++) {
      var span = document.createElement('span');
      span.textContent = WM_TEXT;
      wm.appendChild(span);
    }
    paper.appendChild(wm);
  }

  function renderTabs() {
    $$('.tab-btn').forEach(function (btn) {
      var id = btn.getAttribute('data-tab');
      btn.setAttribute('aria-selected', id === state.tab ? 'true' : 'false');
      var badge = $('.tab-lock', btn);
      var docLocked = !canDownloadDoc(id);
      if (badge) { badge.style.display = (license() && docLocked && id !== 'agreement') ? '' : 'none'; }
    });
  }

  function renderDoc() {
    var doc = currentDoc();
    if (!doc) { return; }
    var paper = $('#paper');
    var bodyHtml = state.overrides[doc.id] ? editedToHtml(state.overrides[doc.id]) : doc.html;
    paper.innerHTML = bodyHtml;
    renderWatermark(paper);
    renderTabs();
    renderActions();
    $('#outputEmpty').style.display = 'none';
    $('#outputWrap').style.display = '';
  }

  function renderActions() {
    var doc = currentDoc();
    if (!doc) { return; }
    var lic = license();
    var allowed = canDownloadDoc(doc.id);

    $('#btnCopy').style.display = '';
    $('#btnCopy').disabled = false;

    ['Html', 'Md', 'Txt'].forEach(function (fmt) {
      var btn = $('#btnDl' + fmt);
      btn.classList.toggle('is-gated', !allowed);
    });
    $('#btnPdf').classList.toggle('is-gated', !allowed);
    $('#btnEdit').style.display = lic ? '' : 'none';
    $('#btnEdit').textContent = state.editing ? 'Exit editing' : 'Edit text';

    /* gate notice under the toolbar */
    var notice = $('#gateNotice');
    if (!lic) {
      notice.innerHTML = 'Free preview is watermarked. Unlock for ' + SITE_CONFIG.priceSingle +
        ' to download clean files, or get every document in the bundle for ' + SITE_CONFIG.priceBundle + '.';
      notice.style.display = '';
    } else if (!allowed) {
      notice.innerHTML = 'This document is part of the ' + SITE_CONFIG.priceBundle + ' bundle. Upgrade to download the NDA and Statement of Work.';
      notice.style.display = '';
    } else if (lic.type === 'demo') {
      notice.innerHTML = 'Demo unlock active (expires in 24h). Downloads are clean and unwatermarked.';
      notice.style.display = '';
    } else {
      notice.style.display = 'none';
    }

    /* upsell card visibility */
    var up = $('#upsellCard');
    if (!lic) {
      up.style.display = '';
      $('#upsellTitle').textContent = 'Download this contract, watermark-free';
      $('#upsellCopy').textContent = 'You have the full text in front of you. Unlock once and keep the file forever — no subscription, no per-download fees.';
      $('#upsellActions').style.display = '';
    } else if (lic.type === 'single' && doc.id !== 'agreement') {
      up.style.display = '';
      $('#upsellTitle').textContent = 'Get the NDA and Statement of Work too';
      $('#upsellCopy').textContent = 'The bundle adds a mutual NDA and a statement-of-work template — the two documents freelancers need right after the contract.';
      $('#upsellActions').style.display = '';
    } else {
      up.style.display = 'none';
    }

    updateNavStatus();
  }

  function updateNavStatus() {
    var btn = $('#navUnlock');
    var label = unlockedLabel();
    if (label) {
      btn.textContent = label;
      btn.classList.add('is-unlocked');
    } else {
      btn.textContent = 'Unlock \u2014 ' + SITE_CONFIG.priceSingle;
      btn.classList.remove('is-unlocked');
    }
    var priceTag = $('.price-tag');
    if (priceTag) { priceTag.textContent = SITE_CONFIG.priceSingle; }
    var lic = license();
    $('#demoBanner').style.display = (lic && lic.type === 'demo') ? '' : 'none';
    if (lic && lic.type === 'demo' && lic.expires) {
      var hrs = Math.max(0, Math.ceil((lic.expires - Date.now()) / 3600000));
      $('#demoBanner').textContent = 'Demo unlock active for the next ~' + hrs + 'h. All downloads are clean and unwatermarked.';
    }
  }

  /* ---------------- actions ---------------- */

  function validateForm() {
    var missing = [];
    if (!$('#f_name').value.trim()) { missing.push($('#f_name')); }
    if (!$('#c_name').value.trim()) { missing.push($('#c_name')); }
    if (!$('#project').value.trim()) { missing.push($('#project')); }
    $$('.input.invalid').forEach(function (el) { el.classList.remove('invalid'); });
    if (missing.length) {
      missing.forEach(function (el) {
        el.classList.add('invalid');
        el.setAttribute('aria-invalid', 'true');
      });
      missing[0].focus();
      toast('Add your name, the client\u2019s name, and a short services description first.', false);
      return false;
    }
    return true;
  }

  function generate() {
    if (!validateForm()) { return; }
    state.editing = false;
    state.overrides = {};
    var data = collectForm();
    data.deliverables = data.deliverables.filter(function (x) { return x.trim(); });
    state.docs = window.ContractGen.generateAll(data);
    state.tab = 'agreement';
    renderDoc();
    saveForm();
    toast('Contract generated. Free preview is ready below.');
    var out = $('#generator');
    if (window.innerWidth < 960) {
      $('#outputWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function gatedClick(allowed, docId) {
    if (allowed) { return true; }
    openModal();
    return false;
  }

  function doCopy() {
    var doc = currentDoc();
    if (!doc) { return; }
    var text = docText(doc);
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Copied plain text to clipboard.'); }
      catch (e) { toast('Copy failed — select the text manually.', false); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast('Copied plain text to clipboard.'); },
        fallback
      );
    } else { fallback(); }
  }

  function doDownload(fmt) {
    var doc = currentDoc();
    if (!doc) { return; }
    if (!gatedClick(canDownloadDoc(doc.id), doc.id)) { return; }
    var base = doc.fileBase + '-' + stamp();
    var isEdited = !!state.overrides[doc.id];
    if (fmt === 'html') {
      var html = isEdited
        ? window.ContractGen.standaloneHtml(doc.title, editedToHtml(state.overrides[doc.id]), { watermarked: false })
        : doc.standaloneHtml(false);
      download(base + '.html', html, 'text/html');
    } else if (fmt === 'md') {
      download(base + '.md', isEdited ? docText(doc) : doc.md, 'text/markdown');
    } else {
      download(base + '.txt', docText(doc), 'text/plain');
    }
    toast('Downloaded ' + base + '.' + fmt.toUpperCase() + ' — clean, no watermark.');
  }

  function doPrint() {
    var doc = currentDoc();
    if (!doc) { return; }
    if (!gatedClick(canDownloadDoc(doc.id), doc.id)) { return; }
    fillPrintMount();
    window.print();
  }

  function fillPrintMount() {
    var doc = currentDoc();
    if (!doc) { return; }
    var mount = $('#printMount');
    var paper = $('#paper').cloneNode(true);
    var wm = $('.paper-wm', paper);
    if (wm && license()) { wm.remove(); } // unlocked users get a clean print
    mount.innerHTML = '';
    mount.appendChild(paper);
  }

  function clearPrintMount() {
    var mount = $('#printMount');
    if (mount) { mount.innerHTML = ''; }
  }

  /* ---------------- edit mode ---------------- */

  function toggleEdit() {
    var doc = currentDoc();
    if (!doc) { return; }
    if (!license()) { openModal(); return; }
    if (!canDownloadDoc(doc.id)) { toast('Editing is available once this document is unlocked.', false); return; }
    var editor = $('#editorWrap');
    var paper = $('#paper');
    if (state.editing) {
      state.editing = false;
      editor.style.display = 'none';
      paper.style.display = '';
      renderDoc();
    } else {
      state.editing = true;
      $('#editor').value = docText(doc);
      editor.style.display = '';
      paper.style.display = 'none';
      $('#editor').focus();
    }
    renderActions();
  }

  function saveEdit() {
    var doc = currentDoc();
    if (!doc) { return; }
    state.overrides[doc.id] = $('#editor').value;
    state.editing = false;
    $('#editorWrap').style.display = 'none';
    $('#paper').style.display = '';
    renderDoc();
    toast('Edits applied — downloads will include your changes.');
  }

  /* ---------------- unlock modal ---------------- */

  function openModal() {
    var m = $('#unlockModal');
    m.style.display = 'flex';
    $('#modalMsg').textContent = '';
    $('#modalMsg').className = 'modal-msg';
    setTimeout(function () { $('#m_email').focus(); }, 60);
  }

  function closeModal() {
    $('#unlockModal').style.display = 'none';
  }

  function tryUnlock() {
    var email = $('#m_email').value;
    var key = $('#m_key').value;
    var mode = window.CCLicense.validate(email, key);
    var msg = $('#modalMsg');
    if (!mode) {
      msg.textContent = 'That email and license key don\u2019t match. Check for typos (the key looks like A1B2-C3D4).';
      msg.className = 'modal-msg err';
      return;
    }
    window.CCLicense.unlockPaid(mode, email, key);
    msg.textContent = mode === 'bundle'
      ? 'Bundle unlocked. All three documents now download clean.'
      : 'Agreement unlocked. Downloads are clean and unwatermarked.';
    msg.className = 'modal-msg ok';
    setTimeout(function () {
      closeModal();
      state.editing = false;
      renderDoc();
      renderActions();
      toast(mode === 'bundle' ? 'Bundle unlocked. Happy drafting!' : 'Unlocked. Happy drafting!');
    }, 700);
  }

  /* ---------------- buy buttons ---------------- */

  function buyClicked(kind) {
    var link = kind === 'bundle' ? SITE_CONFIG.stripePaymentLinkBundle : SITE_CONFIG.stripePaymentLinkSingle;
    if (link && link.indexOf('https://') === 0) {
      window.open(link, '_blank', 'noopener');
      return;
    }
    toast('Checkout link not configured yet \u2014 see README \u201cStripe link setup\u201d. Tip: you can preview the full flow with ?demo=1 in the URL.', false);
  }

  /* ---------------- wire-up ---------------- */

  function wire() {
    /* nav */
    $('#navUnlock').addEventListener('click', function () {
      if (license()) { toast(unlockedLabel() + ' \u2014 you\u2019re all set.'); }
      else { openModal(); }
    });
    $('#navToggle').addEventListener('click', function () {
      var nav = $('#navLinks');
      nav.style.display = (nav.style.display === 'flex') ? '' : 'flex';
    });
    $$('a.nav-link').forEach(function (a) {
      a.addEventListener('click', function () {
        if (window.innerWidth < 860) { $('#navLinks').style.display = ''; }
      });
    });

    /* form */
    $('#btnGenerate').addEventListener('click', generate);
    $('#btnReset').addEventListener('click', function () {
      if (!window.confirm('Clear the form and any saved draft?')) { return; }
      try { localStorage.removeItem(LS_FORM); } catch (e) { /* noop */ }
      window.location.reload();
    });
    $('#btnExample').addEventListener('click', function () {
      applyForm({
        f_name: 'Alex Rivera', f_business: 'Rivera Design Co.',
        f_address: '412 Pine St, Suite 5, Portland, OR 97204',
        c_name: 'Northwind Studio LLC', c_address: '88 Harbor Ave, Floor 3, Seattle, WA 98101',
        project: 'Brand identity design for Northwind Studio\u2019s product launch, including logo concepts, color system, and a usage guideline document.',
        deliverables: ['Logo concept pack \u2014 3 directions (PDF), week 2', 'Final logo files (SVG/PNG/PDF), week 3', 'Brand guidelines document (PDF), week 4'],
        start_date: todayIso(), end_date: '', duration_text: '4 weeks from start date',
        rate_type: 'fixed', rate_amount: '4200', currency: 'USD', pay_terms: 'net50',
        late_fee: '1.5', revision_rounds: '2', kill_fee: '25',
        confidentiality: true, notice_days: '14', law_state: 'Oregon', law_other: '', dispute: 'med_arb'
      });
      saveForm();
      toast('Example details loaded \u2014 replace them with your own.');
    });
    $('#btnAddDeliv').addEventListener('click', function () { addDeliverableRow(''); saveForm(); });
    $('#law_state').addEventListener('change', function () { toggleLawOther(); saveForm(); });
    $('#rate_type').addEventListener('change', function () { toggleRateLabel(); saveForm(); });

    var form = $('#contractForm');
    ['input', 'change'].forEach(function (evt) {
      form.addEventListener(evt, function (e) {
        if (e.target.classList && e.target.classList.contains('invalid') && e.target.value.trim()) {
          e.target.classList.remove('invalid');
          e.target.removeAttribute('aria-invalid');
        }
        if (evt === 'change' || (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
          saveForm();
        }
      });
    });

    /* tabs */
    $$('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.tab = btn.getAttribute('data-tab');
        state.editing = false;
        $('#editorWrap').style.display = 'none';
        $('#paper').style.display = '';
        if (state.docs) { renderDoc(); }
      });
    });

    /* actions */
    $('#btnCopy').addEventListener('click', doCopy);
    $('#btnDlHtml').addEventListener('click', function () { doDownload('html'); });
    $('#btnDlMd').addEventListener('click', function () { doDownload('md'); });
    $('#btnDlTxt').addEventListener('click', function () { doDownload('txt'); });
    $('#btnPdf').addEventListener('click', doPrint);
    $('#btnEdit').addEventListener('click', toggleEdit);
    $('#btnSaveEdit').addEventListener('click', saveEdit);
    $('#btnCancelEdit').addEventListener('click', function () {
      state.editing = false;
      $('#editorWrap').style.display = 'none';
      $('#paper').style.display = '';
      renderActions();
    });

    /* unlock modal */
    $('#btnCloseModal').addEventListener('click', closeModal);
    $('#unlockModal').addEventListener('click', function (e) {
      if (e.target === $('#unlockModal')) { closeModal(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(); }
    });
    $('#btnDoUnlock').addEventListener('click', tryUnlock);
    $('#unlockModal').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); tryUnlock(); }
    });

    /* buy buttons everywhere */
    $$('[data-buy]').forEach(function (btn) {
      btn.addEventListener('click', function () { buyClicked(btn.getAttribute('data-buy')); });
    });
    $$('[data-open-modal]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
    });

    /* print plumbing: Ctrl+P on a locked doc keeps the watermark */
    window.addEventListener('beforeprint', function () {
      if (!state.docs) { return; }
      if (!$('#printMount').innerHTML) {
        var paper = $('#paper').cloneNode(true); // keeps watermark for free previews
        $('#printMount').appendChild(paper);
      }
    });
    window.addEventListener('afterprint', clearPrintMount);

    /* FAQ details: close others for tidy reading */
    $$('.faq details').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (d.open) {
          $$('.faq details').forEach(function (o) { if (o !== d) { o.open = false; } });
        }
      });
    });

    $('#year').textContent = String(new Date().getFullYear());
  }

  /* ---------------- boot ---------------- */

  function boot() {
    loadForm();
    wire();

    /* ?demo=1 -> 24h unlock (documented in README) */
    var params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      window.CCLicense.unlockDemo();
    }

    updateNavStatus();
    toggleLawOther();
    toggleRateLabel();

    /* prefill start date for first-time visitors */
    if (!$('#start_date').value) { $('#start_date').value = todayIso(); }

    if (window.CCLicense.isUnlocked() && state.docs) { renderDoc(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* test hook (harmless in production, used by automated checks) */
  window.__cc = {
    collectForm: collectForm,
    generate: generate,
    state: state,
    fillPrintMount: fillPrintMount
  };
})();
