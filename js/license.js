/* ============================================================
   ContractCraft — license key engine (client-side)
   ------------------------------------------------------------
   A license key is the first 8 hex characters (formatted
   XXXX-XXXX, uppercase) of the FNV-1a 32-bit hash of:
       <salt> + normalizedEmail
   where normalizedEmail = trimmed + lowercased email, and
   salt = "contractcraft-salt-v1"        (single unlock)
       or "contractcraft-bundle-salt-v1" (bundle unlock).

   This is an offline entitlement check, not cryptographic
   copy protection — that is intentional. The value being sold
   is the generated document; see README for the honest limits
   of client-side gating and optional hardening ideas.
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'cc_license_v1';
  var DAY_MS = 24 * 60 * 60 * 1000;

  var SALT_SINGLE = 'contractcraft-salt-v1';
  var SALT_BUNDLE = 'contractcraft-bundle-salt-v1';

  function root() {
    return (typeof window !== 'undefined') ? window : globalThis;
  }

  /* FNV-1a, 32-bit. Uses Math.imul to stay in 32-bit space. */
  function fnv1a32(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function normEmail(email) {
    return String(email == null ? '' : email).trim().toLowerCase();
  }

  function saltFor(mode) {
    return (mode === 'bundle') ? SALT_BUNDLE : SALT_SINGLE;
  }

  /* The canonical key for an email + mode. Used by the buyer
     modal AND by license-gen.html. */
  function keyFor(email, mode) {
    var h = fnv1a32(saltFor(mode) + normEmail(email));
    var hex = h.toString(16).toUpperCase();
    while (hex.length < 8) { hex = '0' + hex; }
    return hex.slice(0, 4) + '-' + hex.slice(4, 8);
  }

  /* Accepts keys with or without the dash, any case. */
  function normalizeKey(key) {
    return String(key == null ? '' : key).replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  }

  function isValidFormat(key) {
    return /^[0-9A-F]{8}$/.test(normalizeKey(key));
  }

  /* Validate an email + key pair. Returns 'single', 'bundle' or null.
     We try bundle first only if provided mode is bundle; otherwise
     try both so a buyer pasting either key type succeeds. */
  function validate(email, key, mode) {
    if (!normEmail(email) || !isValidFormat(key)) { return null; }
    var modes = (mode === 'single' || mode === 'bundle') ? [mode] : ['single', 'bundle'];
    for (var i = 0; i < modes.length; i++) {
      if (normalizeKey(key) === normalizeKey(keyFor(email, modes[i]))) {
        return modes[i];
      }
    }
    return null;
  }

  /* ---------- persisted license ---------- */

  function getLicense() {
    try {
      var raw = root().localStorage.getItem(LS_KEY);
      if (!raw) { return null; }
      var lic = JSON.parse(raw);
      if (!lic || !lic.type) { return null; }
      if (lic.expires && Date.now() > lic.expires) {
        root().localStorage.removeItem(LS_KEY);
        return null;
      }
      return lic;
    } catch (e) {
      return null;
    }
  }

  function setLicense(lic) {
    try {
      root().localStorage.setItem(LS_KEY, JSON.stringify(lic));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearLicense() {
    try { root().localStorage.removeItem(LS_KEY); } catch (e) { /* noop */ }
  }

  /* Paid unlocks never expire. Demo unlock lasts 24h. */
  function unlockPaid(type, email, key) {
    var lic = { type: type, email: normEmail(email), key: normalizeKey(key), ts: Date.now(), expires: null };
    setLicense(lic);
    return lic;
  }

  function unlockDemo() {
    var lic = { type: 'demo', email: 'demo@local.test', key: 'DEMO', ts: Date.now(), expires: Date.now() + DAY_MS };
    setLicense(lic);
    return lic;
  }

  function isUnlocked() {
    return !!getLicense();
  }

  /* bundle/demo unlock everything; single unlocks only the main agreement */
  function canDownload(docId) {
    var lic = getLicense();
    if (!lic) { return false; }
    if (lic.type === 'bundle' || lic.type === 'demo') { return true; }
    if (lic.type === 'single') { return docId === 'agreement'; }
    return false;
  }

  var api = {
    fnv1a32: fnv1a32,
    normEmail: normEmail,
    keyFor: keyFor,
    normalizeKey: normalizeKey,
    isValidFormat: isValidFormat,
    validate: validate,
    getLicense: getLicense,
    setLicense: setLicense,
    clearLicense: clearLicense,
    unlockPaid: unlockPaid,
    unlockDemo: unlockDemo,
    isUnlocked: isUnlocked,
    canDownload: canDownload
  };

  root().CCLicense = api;
})();
