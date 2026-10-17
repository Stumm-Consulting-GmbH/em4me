// 4T-002277 (Epic 3E-000348): Deutung der Angaben je Folie nach Marp-Art -
// die Steuer-Kommentare einer Folie werden zu ihrer wirksamen Gestaltung
// (Theme, Slot-Werte, Kopf- und Fusszeile, Seitenzahl), dazu der globale
// Schluessel `headingDivider`. Schwester des Format-Kerns
// presentation-core.js (Muster kanban-einstellungen.js neben kanban-core.js):
// Der Kern findet und trennt, hier wird gedeutet.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM, kein
// Datei-Zugriff). Befunde sind Codes, keine Prosa, und es wird nie geworfen.
//
// **Geltung** (Entscheidung des Product Owners vom 2026-10-14, Frage D1,
// Option (a), Marp-Schreibweise): `<!-- _schluessel: wert -->` wirkt nur auf
// die Folie, auf der der Kommentar steht; `<!-- schluessel: wert -->` ohne
// `_` wirkt ab dieser Folie fuer alle folgenden, auch `theme`. Allein
// `headingDivider` ist global: Er gilt fuer den ganzen Satz, der letzte Wert
// zaehlt (Kopf zuerst, dann die Kommentare in Dokument-Reihenfolge), und seine
// Listen-Form (`[1, 3]`) bleibt ohne Wirkung.
//
// **Kette je Folie:** Dateikopf, dann die Angaben ohne `_` der vorigen Folien
// und dieser Folie, dann die eigenen `_`-Angaben. Ein Theme-Wechsel ersetzt
// das Basis-Theme samt der Uebersteuerungen des Kopf-Blocks (der Block ist ein
// eigenes Theme); die Slot-Angaben aus Kommentaren bleiben wie bei Marp ueber
// einen Theme-Wechsel hinweg wirksam, weil sie unabhaengig vom Theme gelten.
//
// **Gedeutet** werden `backgroundColor` und `backgroundImage` (Slot
// `background`), `color` (Slot `text`), `header`, `footer`, `paginate`
// (`true`, `false`, `hold`, `skip`), `theme` und die sieben Slot-Namen
// selbst. Ein ungueltiger Wert ergibt einen Befund und laesst den geltenden
// Wert stehen. Die uebrigen Marp-Schluessel (`style`, `lang`, `math`,
// `class`, `backgroundPosition`, `backgroundRepeat`, `backgroundSize`,
// `size`) bleiben ohne Wirkung und ohne Befund.
//
// **Seitenzahl** nach Marpit: `hold` zeigt die Zahl, zaehlt aber nicht
// weiter; `skip` verbirgt sie und zaehlt nicht weiter; `false` verbirgt sie
// und zaehlt weiter.
'use strict';

const yaml = require('js-yaml');
const { FOLIEN_SLOTS, slotWertPruefen, themeAufloesen } = require('./presentation-themes.js');

// Steuer-Schluessel von Marp (Marpit `directives.js`: globale und lokale;
// marp-core: `size`, `math` als eigene globale).
const MARP_GLOBAL = ['headingDivider', 'style', 'theme', 'lang'];
const MARP_GLOBAL_KERN = ['size', 'math'];
const MARP_LOKAL = [
  'backgroundColor',
  'backgroundImage',
  'backgroundPosition',
  'backgroundRepeat',
  'backgroundSize',
  'class',
  'color',
  'footer',
  'header',
  'paginate',
];
// Die Angaben je Folie dieser Anwendung: die Slot-Namen, global und lokal
// wie die lokalen Marp-Schluessel.
const LOKAL = [...MARP_LOKAL, ...FOLIEN_SLOTS, 'theme'];
const MARP_WERKZEUG_KOMMENTARE = [
  /^prettier-ignore(-(start|end))?$/,
  /^markdownlint-((disable|enable).*|capture|restore)$/,
  /^lint (disable|enable|ignore).*$/,
  // Marp-Kommentar zur Skalierung einer Ueberschrift; die Skalierung selbst
  // bleibt ausserhalb des Umfangs (4T-002277, Punkt (e)).
  /^fit$/,
];

// Welcher Schluessel welchen Slot traegt.
const SLOT_VON = {
  backgroundColor: 'background',
  backgroundImage: 'background',
  color: 'text',
};
for (const slot of FOLIEN_SLOTS) SLOT_VON[slot] = slot;

const PAGINATE_ZUSTAND = {
  true: 'zeigen',
  false: 'aus',
  hold: 'halten',
  skip: 'ueberspringen',
};

const UEBERSCHRIFT_EBENEN = 6;

function yamlAbbildung(text) {
  try {
    const obj = yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA });
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

// Marpit `looseYAML` (in marp-core voreingestellt): der Wert eines bekannten
// Schluessels wird in Anfuehrungszeichen gesetzt, damit `color: #fff` lesbar ist.
const LOCKER_SCHLUESSEL = [...new Set([...MARP_GLOBAL, ...MARP_LOKAL, ...LOKAL])]
  .map((k) => `_?${k}`)
  .flatMap((k) => [k, `"${k}"`, `'${k}'`])
  .join('|');
const LOCKER_RE = new RegExp(`^((?:${LOCKER_SCHLUESSEL})\\s*:)(.+)$`);
const YAML_SONDERZEICHEN = `["'{|>~&*[`;

function locker(text) {
  return text
    .split(/\r?\n/)
    .map((zeile) =>
      zeile.replace(LOCKER_RE, (original, schluessel, wert) => {
        const getrimmt = wert.trim();
        if (getrimmt === '' || YAML_SONDERZEICHEN.includes(getrimmt[0])) return original;
        const abstand = wert.slice(0, wert.length - wert.trimStart().length);
        return `${schluessel}${abstand}"${getrimmt.split('"').join('\\"')}"`;
      }),
    )
    .join('\n')
    .trim();
}

/** Die YAML-Abbildung eines Steuer-Kommentars oder null. */
function steuerAbbildung(inhalt) {
  return yamlAbbildung(locker(String(inhalt == null ? '' : inhalt)));
}

function istBekannt(k) {
  if (MARP_GLOBAL.includes(k) || MARP_GLOBAL_KERN.includes(k) || LOKAL.includes(k)) return true;
  return k.startsWith('_') && LOKAL.includes(k.slice(1));
}

/**
 * Ist ein Kommentar eine Steuer-Anweisung nach Marp-Art? Ja, wenn sein Inhalt
 * als YAML-Abbildung mindestens einen bekannten Schluessel traegt, oder bei
 * einem der Werkzeug-Kommentare und `fit`.
 *
 * @param {string} inhalt
 * @returns {boolean}
 */
function istSteuerKommentar(inhalt) {
  const roh = String(inhalt == null ? '' : inhalt).trim();
  if (MARP_WERKZEUG_KOMMENTARE.some((re) => re.test(roh))) return true;
  const obj = steuerAbbildung(roh);
  return Boolean(obj) && Object.keys(obj).some(istBekannt);
}

// --- headingDivider ------------------------------------------------------------

// Ganzzahl 1 bis 6 oder null; ein Array (Listen-Form) ist `liste`.
function trennEbene(wert) {
  if (Array.isArray(wert)) return 'liste';
  const s = typeof wert === 'number' ? String(wert) : typeof wert === 'string' ? wert.trim() : '';
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= UEBERSCHRIFT_EBENEN ? n : null;
}

/**
 * Die wirksame Ebene von `headingDivider`: der letzte Wert aus Kopf und
 * Steuer-Kommentaren. Die Listen-Form ist ohne Wirkung und ohne Befund; ein
 * anderer ungueltiger Wert ergibt `headingDividerUngueltig` und laesst den
 * geltenden Wert stehen.
 *
 * @param {unknown} kopfWert Wert im Kopf (undefined ohne Angabe).
 * @param {number} kopfZeile Zeile des Kopf-Schluessels, fuer den Befund.
 * @param {Array<{inhalt: string, zeile: number}>} steuer Steuer-Kommentare in
 *   Dokument-Reihenfolge.
 * @param {Array<object>} befunde
 * @returns {number} 0 ohne Wirkung, sonst die hoechste trennende Ebene.
 */
function ueberschriftenTrennung(kopfWert, kopfZeile, steuer, befunde) {
  let ebene = 0;
  const uebernimmWert = (wert, zeile) => {
    const e = trennEbene(wert);
    if (e === 'liste') ebene = 0;
    else if (e === null) {
      befunde.push({ code: 'headingDividerUngueltig', zeile, detail: JSON.stringify(wert) });
    } else ebene = e;
  };
  if (kopfWert !== undefined && kopfWert !== null) uebernimmWert(kopfWert, kopfZeile);
  for (const k of steuer || []) {
    const obj = steuerAbbildung(k.inhalt);
    if (obj && Object.prototype.hasOwnProperty.call(obj, 'headingDivider')) {
      uebernimmWert(obj.headingDivider, k.zeile);
    }
  }
  return ebene;
}

// --- Gestaltung je Folie -------------------------------------------------------------

function anfangsLauf(kopf, katalog) {
  const k = kopf || {};
  return {
    theme: themeAufloesen(k.theme, katalog),
    slots: {},
    header: typeof k.header === 'string' ? k.header : null,
    footer: typeof k.footer === 'string' ? k.footer : null,
    seitenzahl: k.paginate === true ? 'zeigen' : 'aus',
  };
}

// Wendet einen Schluessel auf ein Ziel an (Lauf oder Angabe der Folie).
function wende(ziel, name, wert, zeile, befunde, katalog) {
  const befund = (code, detail) => befunde.push({ code, zeile, detail });
  if (name === 'theme') {
    if (typeof wert !== 'string' || wert.trim() === '') {
      befund('folieWertUngueltig', name);
      return;
    }
    const theme = themeAufloesen(wert, katalog);
    if (theme.befunde.length) befund('folieThemeUnbekannt', wert.trim());
    else ziel.theme = theme;
    return;
  }
  if (Object.prototype.hasOwnProperty.call(SLOT_VON, name)) {
    const geprueft = slotWertPruefen(wert);
    if (geprueft === null) befund('folieWertUngueltig', name);
    else ziel.slots[SLOT_VON[name]] = geprueft;
    return;
  }
  if (name === 'header' || name === 'footer') {
    if (typeof wert === 'string') ziel[name] = wert;
    else befund('folieWertUngueltig', name);
    return;
  }
  if (name === 'paginate') {
    const s = typeof wert === 'string' ? wert.trim() : '';
    if (Object.prototype.hasOwnProperty.call(PAGINATE_ZUSTAND, s)) {
      ziel.seitenzahl = PAGINATE_ZUSTAND[s];
    } else befund('folieWertUngueltig', name);
  }
  // Alle uebrigen bekannten Schluessel bleiben ohne Wirkung.
}

/**
 * Loest die Gestaltung jeder Folie auf. Wirft nie.
 *
 * @param {object} kopf Kopf des Format-Kerns (`theme`, `paginate`, `header`,
 *   `footer`).
 * @param {Array<Array<{inhalt: string, zeile: number}>>} steuerJeFolie die
 *   Steuer-Kommentare je Folie in Dokument-Reihenfolge.
 * @param {Array<object>} befunde Befund-Liste des Modells (mit Zeile).
 * @param {{eigene?: Array<object>}} [katalog] 4T-002281: der Katalog eigener
 *   Themes, weitergereicht an `themeAufloesen` für den Kopf und für jeden
 *   Theme-Wechsel per Kommentar.
 * @returns {Array<{theme: string, slots: Object<string,string>, syntax: string,
 *   header: string|null, footer: string|null,
 *   seitenzahl: 'zeigen'|'aus'|'halten'|'ueberspringen', seite: number}>}
 */
function gestaltungJeFolie(kopf, steuerJeFolie, befunde, katalog) {
  const lauf = anfangsLauf(kopf, katalog);
  let zaehler = 0;
  return (steuerJeFolie || []).map((steuer) => {
    const eigen = { slots: {} };
    for (const k of steuer || []) {
      const obj = steuerAbbildung(k.inhalt);
      if (!obj) continue;
      for (const [schluessel, wert] of Object.entries(obj)) {
        const nurHier = schluessel.startsWith('_');
        const name = nurHier ? schluessel.slice(1) : schluessel;
        if (!LOKAL.includes(name)) continue;
        wende(nurHier ? eigen : lauf, name, wert, k.zeile, befunde, katalog);
      }
    }
    const theme = eigen.theme || lauf.theme;
    const seitenzahl = eigen.seitenzahl || lauf.seitenzahl;
    if (seitenzahl === 'zeigen' || seitenzahl === 'aus') zaehler += 1;
    const hat = (feld) => Object.prototype.hasOwnProperty.call(eigen, feld);
    return {
      theme: theme.name,
      slots: { ...theme.slots, ...lauf.slots, ...eigen.slots },
      syntax: theme.syntax,
      header: hat('header') ? eigen.header : lauf.header,
      footer: hat('footer') ? eigen.footer : lauf.footer,
      seitenzahl,
      seite: zaehler,
    };
  });
}

module.exports = {
  MARP_GLOBAL,
  MARP_LOKAL,
  istSteuerKommentar,
  ueberschriftenTrennung,
  gestaltungJeFolie,
};
