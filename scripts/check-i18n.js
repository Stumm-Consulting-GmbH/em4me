// S-09 (4T-000185): Waechter fuer die i18n-Synchronitaet. Prueft die fuenf
// Sprachdateien auf identische Key-Mengen, nicht-leere Werte und pro Key
// identische Platzhalter-Mengen ({name}-Tokens). Wird als Unit-Test
// eingebunden (test/unit/i18n.test.js) und laeuft damit in `npm test`
// und ueber den pre-commit-Hook bei jedem Commit; zusaetzlich direkt
// aufrufbar: `node scripts/check-i18n.js`.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const I18N_DIR = path.resolve(__dirname, '..', 'src', 'i18n');
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

function placeholders(value) {
  const found = new Set();
  for (const m of String(value).matchAll(/\{([a-zA-Z0-9_]+)\}/g)) found.add(m[1]);
  return found;
}

// Liefert { ok, errors: string[], keyCount } ueber alle fuenf Dateien.
function checkI18n(dir = I18N_DIR) {
  const errors = [];
  const dicts = {};
  for (const lang of LANGS) {
    const file = path.join(dir, `${lang}.json`);
    try {
      dicts[lang] = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      errors.push(`${lang}.json: nicht parsebar (${err.message})`);
    }
  }
  if (errors.length > 0) return { ok: false, errors, keyCount: 0 };

  const refLang = 'de';
  const refKeys = Object.keys(dicts[refLang]);
  const refSet = new Set(refKeys);

  for (const lang of LANGS) {
    const keys = new Set(Object.keys(dicts[lang]));
    if (lang !== refLang) {
      for (const k of refSet) {
        if (!keys.has(k)) errors.push(`${lang}.json: Key fehlt: ${k}`);
      }
      for (const k of keys) {
        if (!refSet.has(k)) errors.push(`${lang}.json: ueberzaehliger Key: ${k}`);
      }
    }
    for (const [k, v] of Object.entries(dicts[lang])) {
      if (typeof v !== 'string' || v.trim() === '') {
        errors.push(`${lang}.json: leerer oder nicht-String-Wert: ${k}`);
      }
    }
  }

  // Platzhalter-Konsistenz gegen die DE-Referenz.
  for (const k of refKeys) {
    const refPh = placeholders(dicts[refLang][k]);
    for (const lang of LANGS) {
      if (lang === refLang || dicts[lang][k] === undefined) continue;
      const ph = placeholders(dicts[lang][k]);
      const missing = [...refPh].filter((p) => !ph.has(p));
      const extra = [...ph].filter((p) => !refPh.has(p));
      if (missing.length > 0 || extra.length > 0) {
        errors.push(
          `${lang}.json: Platzhalter-Abweichung bei ${k}` +
            (missing.length ? ` (fehlt: {${missing.join('}, {')}})` : '') +
            (extra.length ? ` (zu viel: {${extra.join('}, {')}})` : ''),
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, keyCount: refKeys.length };
}

module.exports = { checkI18n, LANGS, I18N_DIR };

if (require.main === module) {
  const result = checkI18n();
  if (result.ok) {
    console.log(
      `check-i18n: OK (${LANGS.length} Sprachen, ${result.keyCount} Keys, schluesselgleich)`,
    );
  } else {
    console.error(`check-i18n: ${result.errors.length} Problem(e):`);
    for (const e of result.errors) console.error('  - ' + e);
    process.exitCode = 1;
  }
}
