#!/usr/bin/env node
// 4T-002007 (Epic 3E-000333): Erzeuger der Kalender-Tafeln des Programms —
// der erzeugten, versionierten Programm-Dateien unter
// `src/shared/calendar/year-tables/<Name>.js`, aus denen die Vorlagen mit
// Jahres-Struktur je Jahr ihre Monatsfolge lesen (Baustein 4T-002363, T5:
// «beim Bau erzeugt» heißt mit diesem Werkzeug erzeugt und versioniert, nicht
// bei jedem Bau neu).
//
// **Warum ein Werkzeug und keine Hand-Arbeit.** Eine Tafel trägt zweihundert
// Jahre mit je bis zu dreizehn Monatslängen; ein einziger falscher Wert bliebe
// in sich schlüssig und fiele erst beim Umrechnen eines Datums auf. Die Tafel
// entsteht deshalb nur aus einer benannten Quelle, mit Selbst-Prüfungen beim
// Erzeugen, einem Kopf (Quelle, Fassung, Stand, Zeitraum, Prüfsumme) und der
// Zusage, dass ein zweiter Lauf dieselbe Datei Byte für Byte ergibt. Der Stand
// ist eine Eingabe und kommt nicht aus der Uhr (Muster der wiederholbaren
// Bauten). Geprüft wird die Tafel nie gegen ihre Quelle, sondern in ihrer
// Nachweis-Prüfdatei gegen eine zweite, unabhängige (Epic A6).
//
// **Quellen.** Die Liste QUELLEN trennt die Quelle vom gemeinsamen Teil
// (Schreiber, Kopf, Prüfsumme, Vergleich). Je Tafel ein Eintrag
// { beschreibung, nachweis, fassung(), kurzFassung(), istSchaltjahr(), lesen() };
// lesen() liefert { ersteJahr, ersterTag, namensStellen, jahre: [{ jahr,
// zeile, kommentar }] } und bricht bei einem Verstoß gegen die
// Selbst-Prüfungen ab. Einträge: persian (4T-002007) aus der
// Kalender-Schnittstelle, chinese (4T-002006) aus der Bibliothek
// lunar-javascript (Entwicklungs-Abhängigkeit, exakt festgelegt; geladen erst
// im Leser, damit die übrigen Einträge ohne sie laufen) und islamic-umalqura
// (4T-002008) aus der Kalender-Schnittstelle, mit Schutz gegen deren stillen
// Rückfall auf die tabellarische Rechnung. Bei einer Quelle mit
// fassungBindend führt --pruefen auch eine andere installierte Fassung als
// Abweichung, weil eine andere Fassung eine andere Tafel erzeugen könnte.
//
// Aufruf aus der Wurzel des Arbeitsbereichs:
//   node scripts/kalender-tafel-erzeugen.js <Name> --stand JJJJ-MM-TT   schreibt die Tafel
//   node scripts/kalender-tafel-erzeugen.js <Name> --pruefen            vergleicht byte-genau
// --pruefen erzeugt mit Stand und Fassung aus dem Kopf der vorhandenen Datei,
// damit ein Lauf unter einer anderen Fassung der Quelle den Inhalt vergleicht.
// Rückgabewert 0 gleich oder geschrieben, 1 abweichend oder Selbst-Prüfung
// verletzt, 2 falscher Aufruf.
//
// Entwicklungs-Hilfsmittel: ohne Aufrufer in der Anwendung, ohne Electron und
// ohne Netz.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO = path.resolve(__dirname, '..');
const TAFEL_ORDNER = path.join(REPO, 'src', 'shared', 'calendar', 'year-tables');
const TAG_MS = 86400000;
// Rata Die des 01.01.1970 (Tag 1 ist der 01.01.0001, gregorianisch proleptisch).
const RD_1970 = 719163;

function rataDie(ms) {
  return Math.floor(ms / TAG_MS) + RD_1970;
}

function tagText(ms) {
  const d = new Date(ms);
  const zwei = (n) => String(n).padStart(2, '0');
  return `${zwei(d.getUTCDate())}.${zwei(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(`Selbst-Prüfung verletzt: ${text}`);
}

// --- Quelle persian -----------------------------------------------------------------

// Persischer Kalender in der amtlichen Lesart aus der Kalender-Schnittstelle
// der Laufzeit. Aufgenommen wird jedes persische Jahr, dessen 1. Farvardin in
// den gregorianischen Jahren 1900 bis 2100 liegt (B2 des Epics); gemessen am
// 2026-10-24 unter ICU 74.2 und 77.1 gleich (4T-002007, Kapitel «Messung»).
const PERSISCH = Object.freeze({
  ersteJahr: 1279,
  ersterTag: 693675, // 21.03.1900
  endeTag: 767089, // 21.03.2101, ausschließlich
  jahre: 201,
  tage: 73414,
});

function lesePersisch() {
  const f = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  pruefe(
    f.resolvedOptions().calendar === 'persian',
    'die Schnittstelle kennt den Kalender persian',
  );
  const jahre = [];
  let offen = null;
  let vorher = null;
  for (let ms = Date.UTC(1900, 0, 1); ms <= Date.UTC(2101, 11, 31); ms += TAG_MS) {
    const teile = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    const t = { y: Number(teile.year), m: Number(teile.month), d: Number(teile.day) };
    if (vorher) {
      const weiter =
        (t.y === vorher.y && t.m === vorher.m && t.d === vorher.d + 1) ||
        (t.y === vorher.y && t.m === vorher.m + 1 && t.d === 1) ||
        (t.y === vorher.y + 1 && t.m === 1 && t.d === 1 && vorher.m === 12);
      pruefe(weiter, `lückenlose Tagesfolge am ${tagText(ms)}`);
    }
    vorher = t;
    if (t.m === 1 && t.d === 1) {
      offen = null;
      const gJahr = new Date(ms).getUTCFullYear();
      if (gJahr >= 1900 && gJahr <= 2100) {
        offen = { jahr: t.y, beginn: rataDie(ms), beginnMs: ms, monate: [] };
        jahre.push(offen);
      }
    }
    if (!offen) continue;
    if (t.d === 1) offen.monate.push(1);
    else offen.monate[offen.monate.length - 1] += 1;
  }
  pruefe(jahre.length === PERSISCH.jahre, `${PERSISCH.jahre} Jahre (gefunden ${jahre.length})`);
  pruefe(jahre[0].jahr === PERSISCH.ersteJahr, `erstes Jahr ${PERSISCH.ersteJahr}`);
  pruefe(jahre[0].beginn === PERSISCH.ersterTag, `erster Tag Rata Die ${PERSISCH.ersterTag}`);
  let tage = 0;
  jahre.forEach((j, i) => {
    pruefe(j.jahr === PERSISCH.ersteJahr + i, `Jahr ${j.jahr} folgt lückenlos`);
    pruefe(j.beginn === PERSISCH.ersterTag + tage, `Jahr ${j.jahr} schließt an`);
    const gestalt =
      j.monate.length === 12 &&
      j.monate.slice(0, 6).every((n) => n === 31) &&
      j.monate.slice(6, 11).every((n) => n === 30) &&
      (j.monate[11] === 29 || j.monate[11] === 30);
    pruefe(gestalt, `Jahr ${j.jahr}: 6 × 31, 5 × 30, dann 29 oder 30 (${j.monate.join(',')})`);
    tage += j.monate.reduce((a, b) => a + b, 0);
  });
  pruefe(tage === PERSISCH.tage, `${PERSISCH.tage} Tage (gezählt ${tage})`);
  pruefe(PERSISCH.ersterTag + tage === PERSISCH.endeTag, `Ende Rata Die ${PERSISCH.endeTag}`);
  return {
    ersteJahr: PERSISCH.ersteJahr,
    ersterTag: PERSISCH.ersterTag,
    namensStellen: 12,
    jahre: jahre.map((j) => ({
      jahr: j.jahr,
      zeile: j.monate.join(','),
      kommentar: `${j.jahr}, ab ${tagText(j.beginnMs)}`,
    })),
  };
}

// --- Quelle chinese -----------------------------------------------------------------

// Traditioneller chinesischer Kalender aus der Bibliothek lunar-javascript
// (astronomische Rechnung von Neumond und Sonnenterminen nach Pekinger Zeit).
// Nicht aus der Schnittstelle: Sie rechnet im Zeitraum an zwölf Stellen
// anders als die amtliche Hongkong-Tafel, die Bibliothek an keiner (Messung
// vom 2026-10-24, 4T-002006, Kapitel «Warum»). Zeitraum nach TF1 und B2 des
// Epics: chinesisches Jahr 1901 (ab 19.02.1901) bis 2100 (bis 28.01.2101).
const CHINESISCH = Object.freeze({
  ersteJahr: 1901,
  ersterTag: 694010, // 19.02.1901
  endeTag: 767038, // 29.01.2101, ausschließlich
  jahre: 200,
  monate: 2473,
  schaltmonate: 73,
  tage: 73028,
});

function lunarBibliothek() {
  return require('lunar-javascript');
}

function fassungLunar() {
  const ordner = path.dirname(require.resolve('lunar-javascript/package.json'));
  const { version } = require('lunar-javascript/package.json');
  const lunarJs = fs.readFileSync(path.join(ordner, 'lunar.js'));
  const summe = crypto.createHash('sha256').update(lunarJs).digest('hex');
  return `lunar-javascript ${version}, lunar.js SHA-256 ${summe}`;
}

// Jahreszahl der Tafel (F1 des Tasks 4T-002006, entschieden vom Product Owner
// am 2026-10-24): das gregorianische Jahr, in dem das chinesische Jahr
// beginnt, wie getYear() der Bibliothek und relatedYear der Schnittstelle.
function chinesischesJahr(lunar) {
  return lunar.getYear();
}

function leseChinesisch() {
  const { Solar } = lunarBibliothek();
  const jahre = [];
  let offen = null;
  let vorher = null;
  const ab = (CHINESISCH.ersterTag - RD_1970) * TAG_MS;
  const bis = (CHINESISCH.endeTag - RD_1970) * TAG_MS;
  for (let ms = ab; ms <= bis; ms += TAG_MS) {
    const d = new Date(ms);
    const lunar = Solar.fromYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()).getLunar();
    // Monat 1 bis 12, Schaltmonat negativ (API-Dokumentation der Bibliothek).
    const t = {
      y: chinesischesJahr(lunar),
      m: Math.abs(lunar.getMonth()),
      leap: lunar.getMonth() < 0,
      d: lunar.getDay(),
    };
    if (vorher) {
      const weiter =
        (t.y === vorher.y && t.m === vorher.m && t.leap === vorher.leap && t.d === vorher.d + 1) ||
        (t.d === 1 && (vorher.d === 29 || vorher.d === 30));
      pruefe(weiter, `lückenlose Tagesfolge am ${tagText(ms)}`);
    }
    vorher = t;
    if (ms === bis) {
      pruefe(
        t.y === CHINESISCH.ersteJahr + CHINESISCH.jahre && t.m === 1 && !t.leap && t.d === 1,
        `der ${tagText(bis)} ist Jahr ${CHINESISCH.ersteJahr + CHINESISCH.jahre}, Monat 1, Tag 1`,
      );
      break;
    }
    if (t.m === 1 && !t.leap && t.d === 1) {
      offen = { jahr: t.y, beginnMs: ms, monate: [] };
      jahre.push(offen);
    }
    pruefe(offen, `der ${tagText(ab)} ist Jahr ${CHINESISCH.ersteJahr}, Monat 1, Tag 1`);
    if (t.d === 1) offen.monate.push({ zahl: t.m, leap: t.leap, laenge: 1 });
    else offen.monate[offen.monate.length - 1].laenge += 1;
  }
  pruefe(jahre.length === CHINESISCH.jahre, `${CHINESISCH.jahre} Jahre (gefunden ${jahre.length})`);
  pruefe(jahre[0].jahr === CHINESISCH.ersteJahr, `erstes Jahr ${CHINESISCH.ersteJahr}`);
  let tage = 0;
  let monate = 0;
  let schalt = 0;
  jahre.forEach((j, i) => {
    pruefe(j.jahr === CHINESISCH.ersteJahr + i, `Jahr ${j.jahr} folgt lückenlos`);
    pruefe(j.monate.length === 12 || j.monate.length === 13, `Jahr ${j.jahr}: 12 oder 13 Monate`);
    const leaps = j.monate.filter((m) => m.leap);
    pruefe(leaps.length === (j.monate.length === 13 ? 1 : 0), `Jahr ${j.jahr}: ein Schaltmonat`);
    let zahl = 0;
    for (const m of j.monate) {
      if (m.leap) pruefe(m.zahl === zahl, `Jahr ${j.jahr}: Schaltmonat folgt Monat ${m.zahl}`);
      else pruefe(m.zahl === (zahl += 1), `Jahr ${j.jahr}: Monat ${zahl} in Folge`);
      pruefe(m.laenge === 29 || m.laenge === 30, `Jahr ${j.jahr}: Monatslänge 29 oder 30`);
      tage += m.laenge;
    }
    monate += j.monate.length;
    schalt += leaps.length;
  });
  pruefe(monate === CHINESISCH.monate, `${CHINESISCH.monate} Monate (gezählt ${monate})`);
  pruefe(schalt === CHINESISCH.schaltmonate, `${CHINESISCH.schaltmonate} Schaltmonate (${schalt})`);
  pruefe(tage === CHINESISCH.tage, `${CHINESISCH.tage} Tage (gezählt ${tage})`);
  pruefe(CHINESISCH.ersterTag + tage === CHINESISCH.endeTag, `Ende Rata Die ${CHINESISCH.endeTag}`);
  return {
    ersteJahr: CHINESISCH.ersteJahr,
    ersterTag: CHINESISCH.ersterTag,
    namensStellen: 24,
    jahre: jahre.map((j) => ({
      jahr: j.jahr,
      zeile: j.monate.map((m) => `${m.laenge}${m.leap ? 'L' : ''}`).join(','),
      kommentar: `${j.jahr}, ab ${tagText(j.beginnMs)}`,
    })),
  };
}

// --- Quelle islamic-umalqura --------------------------------------------------------

// Islamischer Kalender nach Umm al-Qura in der heutigen amtlichen Ausgabe aus
// der Kalender-Schnittstelle der Laufzeit. Aufgenommen wird jedes islamische
// Jahr 1318 bis 1500 AH (Auswahl nach dem islamischen Jahr, TF3 des Epics);
// gemessen am 2026-10-24 unter ICU 74.2 und 77.1 gleich und Monat für Monat
// gleich dem amtlichen Portal der KACST (4T-002008, Kapitel «Messung»).
// Außerhalb 1301 bis 1600 AH fällt die Schnittstelle ohne Kennzeichnung auf
// die tabellarische Rechnung islamic-civil zurück; eine Fassung ohne
// Umm-al-Qura-Daten gäbe an jedem Tag dasselbe wie islamic-civil. Der Leser
// verlangt deshalb mindestens einen abweichenden Tag (gemessen 27 078).
const UMM_AL_QURA = Object.freeze({
  ersteJahr: 1318,
  letzteJahr: 1500,
  ersterTag: 693715, // 30.04.1900
  endeTag: 758565, // 17.11.2077, ausschließlich
  jahre: 183,
  monate: 2196,
  tage: 64850,
});

function islamischerLeser(kalender) {
  const f = new Intl.DateTimeFormat(`en-u-ca-${kalender}-nu-latn`, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  pruefe(
    f.resolvedOptions().calendar === kalender,
    `die Schnittstelle kennt den Kalender ${kalender}`,
  );
  return (ms) => {
    const teile = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    return { y: Number(teile.year), m: Number(teile.month), d: Number(teile.day) };
  };
}

function leseUmmAlQura() {
  const lies = islamischerLeser('islamic-umalqura');
  const liesTabellarisch = islamischerLeser('islamic-civil');
  const jahre = [];
  let offen = null;
  let vorher = null;
  let abweichend = 0;
  for (let ms = Date.UTC(1899, 0, 1); ms <= Date.UTC(2078, 11, 31); ms += TAG_MS) {
    const t = lies(ms);
    if (vorher) {
      const weiter =
        (t.y === vorher.y && t.m === vorher.m && t.d === vorher.d + 1) ||
        (t.y === vorher.y && t.m === vorher.m + 1 && t.d === 1) ||
        (t.y === vorher.y + 1 && t.m === 1 && t.d === 1 && vorher.m === 12);
      pruefe(weiter, `lückenlose Tagesfolge am ${tagText(ms)}`);
    }
    vorher = t;
    if (t.m === 1 && t.d === 1) {
      offen = null;
      if (t.y >= UMM_AL_QURA.ersteJahr && t.y <= UMM_AL_QURA.letzteJahr) {
        offen = { jahr: t.y, beginn: rataDie(ms), beginnMs: ms, monate: [] };
        jahre.push(offen);
      }
    }
    if (!offen) continue;
    const c = liesTabellarisch(ms);
    if (c.y !== t.y || c.m !== t.m || c.d !== t.d) abweichend += 1;
    if (t.d === 1) offen.monate.push(1);
    else offen.monate[offen.monate.length - 1] += 1;
  }
  // Zuerst, damit ein Rückfall mit dieser Meldung abbricht statt mit einer Folge-Meldung.
  pruefe(abweichend > 0, 'kein stiller Rückfall: mindestens ein Tag weicht von islamic-civil ab');
  pruefe(
    jahre.length === UMM_AL_QURA.jahre,
    `${UMM_AL_QURA.jahre} Jahre (gefunden ${jahre.length})`,
  );
  pruefe(jahre[0].jahr === UMM_AL_QURA.ersteJahr, `erstes Jahr ${UMM_AL_QURA.ersteJahr}`);
  pruefe(jahre[0].beginn === UMM_AL_QURA.ersterTag, `erster Tag Rata Die ${UMM_AL_QURA.ersterTag}`);
  let tage = 0;
  let monate = 0;
  jahre.forEach((j, i) => {
    pruefe(j.jahr === UMM_AL_QURA.ersteJahr + i, `Jahr ${j.jahr} folgt lückenlos`);
    pruefe(j.beginn === UMM_AL_QURA.ersterTag + tage, `Jahr ${j.jahr} schließt an`);
    const summe = j.monate.reduce((a, b) => a + b, 0);
    const gestalt =
      j.monate.length === 12 &&
      j.monate.every((n) => n === 29 || n === 30) &&
      (summe === 354 || summe === 355);
    pruefe(gestalt, `Jahr ${j.jahr}: 12 Monate zu 29 oder 30, 354 oder 355 Tage`);
    tage += summe;
    monate += j.monate.length;
  });
  pruefe(monate === UMM_AL_QURA.monate, `${UMM_AL_QURA.monate} Monate (gezählt ${monate})`);
  pruefe(tage === UMM_AL_QURA.tage, `${UMM_AL_QURA.tage} Tage (gezählt ${tage})`);
  pruefe(
    UMM_AL_QURA.ersterTag + tage === UMM_AL_QURA.endeTag,
    `Ende Rata Die ${UMM_AL_QURA.endeTag}`,
  );
  return {
    ersteJahr: UMM_AL_QURA.ersteJahr,
    ersterTag: UMM_AL_QURA.ersterTag,
    namensStellen: 12,
    jahre: jahre.map((j) => ({
      jahr: j.jahr,
      zeile: j.monate.join(','),
      kommentar: `${j.jahr}, ab ${tagText(j.beginnMs)}`,
    })),
  };
}

// Fassung und Kurz-Fassung einer Quelle aus der Kalender-Schnittstelle.
function fassungSchnittstelle() {
  return `Node ${process.versions.node}, ICU ${process.versions.icu}, CLDR ${process.versions.cldr}`;
}

function kurzFassungSchnittstelle(fassung) {
  const icu = /ICU ([^,]+)/.exec(fassung);
  return `ICU ${icu ? icu[1] : '?'}`;
}

const QUELLEN = Object.freeze({
  persian: Object.freeze({
    beschreibung: (z) => [
      `Tafel «persian»: persischer Kalender in der amtlichen Lesart, persische`,
      `Jahre ${z.ersteJahr} (ab ${z.ab}) bis ${z.letzteJahr} (bis ${z.bis}): ${z.jahre} Jahre, davon`,
      `${z.schaltjahre} Schaltjahre, ${z.tageText} Tage.`,
      'Quelle: Kalender-Schnittstelle der Laufzeit (Intl.DateTimeFormat, Kalender',
      'persian).',
    ],
    nachweis: [
      'Nachweis: test/unit/kalender-vorlage-persisch.test.js gegen die',
      'Schaltjahr-Tafel des Kalender-Zentrums der Universität Teheran.',
    ],
    fassung: fassungSchnittstelle,
    // Schaltjahr: der letzte Monat hat 30 Tage.
    istSchaltjahr: (zeile) => zeile.endsWith(',30'),
    kurzFassung: kurzFassungSchnittstelle,
    lesen: lesePersisch,
  }),
  chinese: Object.freeze({
    beschreibung: (z) => [
      `Tafel «chinese»: traditioneller chinesischer Kalender, chinesische Jahre`,
      `${z.ersteJahr} (ab ${z.ab}) bis ${z.letzteJahr} (bis ${z.bis}): ${z.jahre} Jahre, ${z.monateText} Monate,`,
      `davon ${z.schaltmonate} Schaltmonate, ${z.tageText} Tage. Jahreszahl: das gregorianische`,
      'Jahr, in dem das chinesische Jahr beginnt; ein Schaltmonat trägt ein L und folgt',
      'dem Monat gleicher Zahl.',
      'Quelle: astronomische Rechnung (Neumond und Sonnentermine nach Pekinger Zeit)',
      'der Bibliothek lunar-javascript, Lizenz MIT, Copyright (c) 2018 6tail.',
    ],
    nachweis: [
      'Nachweis: test/unit/kalender-vorlage-chinesisch.test.js gegen die amtlichen',
      'Dateien des Datenportals der Regierung Hongkongs (2023 bis 2028) und über den',
      'ganzen Zeitraum gegen die Kalender-Schnittstelle der Laufzeit als zweite Rechnung.',
    ],
    fassung: fassungLunar,
    fassungBindend: true,
    kurzFassung: (fassung) => fassung.split(',')[0],
    // Schaltjahr: das Jahr trägt einen Schaltmonat.
    istSchaltjahr: (zeile) => zeile.includes('L'),
    lesen: leseChinesisch,
  }),
  'islamic-umalqura': Object.freeze({
    beschreibung: (z) => [
      `Tafel «islamic-umalqura»: islamischer Kalender nach Umm al-Qura in der heutigen`,
      `amtlichen Ausgabe, Jahre ${z.ersteJahr} AH (ab ${z.ab}) bis ${z.letzteJahr} AH (bis ${z.bis}):`,
      `${z.jahre} Jahre, davon ${z.schaltjahre} mit 355 Tagen, ${z.tageText} Tage.`,
      'Quelle: Kalender-Schnittstelle der Laufzeit (Intl.DateTimeFormat, Kalender',
      'islamic-umalqura).',
    ],
    nachweis: [
      'Nachweis: test/unit/kalender-vorlage-umm-al-qura.test.js gegen die Monatsanfänge',
      'des amtlichen Portals der KACST (www.ummulqura.org.sa), gelesen am 2026-10-24.',
    ],
    fassung: fassungSchnittstelle,
    kurzFassung: kurzFassungSchnittstelle,
    // Gezählt werden die Jahre mit 355 Tagen (kein Schaltmonat, kein Schalttag
    // nach fester Regel; die Beschreibung nennt sie nicht «Schaltjahre»).
    istSchaltjahr: (zeile) => zeile.split(',').reduce((a, b) => a + Number(b), 0) === 355,
    lesen: leseUmmAlQura,
  }),
});

// --- Gemeinsamer Teil -------------------------------------------------------------------

function pruefsumme(zeilen) {
  return crypto.createHash('sha256').update(zeilen.join('\n'), 'utf8').digest('hex');
}

function tausender(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function quelleVon(name) {
  const quelle = Object.prototype.hasOwnProperty.call(QUELLEN, name) ? QUELLEN[name] : null;
  if (!quelle) throw new Error(`unbekannte Tafel «${name}» (bekannt: ${Object.keys(QUELLEN)})`);
  return quelle;
}

// Text der Tafel-Datei; stand (JJJJ-MM-TT) und fassung (Text) sind Eingaben.
function erzeugeTafelText(name, { stand, fassung }) {
  const quelle = quelleVon(name);
  if (typeof stand !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(stand)) {
    throw new Error('Stand fehlt oder ist nicht JJJJ-MM-TT');
  }
  if (typeof fassung !== 'string' || fassung.trim() === '') throw new Error('Fassung fehlt');
  const daten = quelle.lesen();
  const zeilen = daten.jahre.map((j) => j.zeile);
  const summe = pruefsumme(zeilen);
  const letzte = daten.jahre[daten.jahre.length - 1];
  let tage = 0;
  let monate = 0;
  for (const z of zeilen) {
    const laengen = z.split(',');
    monate += laengen.length;
    tage += laengen.reduce((a, b) => a + parseInt(b, 10), 0);
  }
  const endeMs = (daten.ersterTag + tage - 1 - RD_1970) * TAG_MS;
  const kennzahlen = {
    ersteJahr: daten.ersteJahr,
    letzteJahr: letzte.jahr,
    ab: daten.jahre[0].kommentar.split(' ab ')[1],
    bis: tagText(endeMs),
    jahre: zeilen.length,
    schaltjahre: zeilen.filter((z) => quelle.istSchaltjahr(z)).length,
    monateText: tausender(monate),
    schaltmonate: zeilen.join(',').split('L').length - 1,
    tageText: tausender(tage),
  };
  const kopf = [
    'Erzeugt von scripts/kalender-tafel-erzeugen.js; nicht von Hand ändern.',
    ...quelle.beschreibung(kennzahlen),
    `Fassung: ${fassung}.`,
    ...quelle.nachweis,
    `Stand: ${stand}. Prüfsumme der Zeilen (SHA-256):`,
    `${summe}.`,
  ];
  const text = [
    ...kopf.map((z) => `// ${z}`),
    "'use strict';",
    '',
    'module.exports = {',
    `  name: '${name}',`,
    `  erzeugt: 'scripts/kalender-tafel-erzeugen.js, ${quelle.kurzFassung(fassung)}, Stand ${stand}',`,
    `  ersteJahr: ${daten.ersteJahr},`,
    `  ersterTag: ${daten.ersterTag}, // Rata Die des ${kennzahlen.ab}`,
    `  namensStellen: ${daten.namensStellen},`,
    `  pruefsumme: '${summe}',`,
    '  jahre: [',
    ...daten.jahre.map((j) => `    '${j.zeile}', // ${j.kommentar}`),
    '  ],',
    '};',
    '',
  ];
  return { text: text.join('\n'), kennzahlen, pruefsumme: summe };
}

// Stand und Fassung aus dem Kopf einer vorhandenen Tafel-Datei, sonst null.
function liesKopf(text) {
  const stand = /^\/\/ Stand: (\d{4}-\d{2}-\d{2})\./m.exec(text);
  const fassung = /^\/\/ Fassung: (.+)\.$/m.exec(text);
  return stand && fassung ? { stand: stand[1], fassung: fassung[1] } : null;
}

function tafelPfad(name) {
  return path.join(TAFEL_ORDNER, `${name}.js`);
}

function main(argv) {
  const [name, schalter, wert] = argv;
  if (!name || !['--stand', '--pruefen'].includes(schalter)) {
    console.error('Aufruf: kalender-tafel-erzeugen.js <Name> --stand JJJJ-MM-TT | --pruefen');
    return 2;
  }
  const quelle = QUELLEN[name];
  if (!quelle) {
    console.error(`Unbekannte Tafel «${name}»; bekannt: ${Object.keys(QUELLEN).join(', ')}`);
    return 2;
  }
  const ziel = tafelPfad(name);
  if (schalter === '--stand') {
    const erg = erzeugeTafelText(name, { stand: wert, fassung: quelle.fassung() });
    fs.mkdirSync(TAFEL_ORDNER, { recursive: true });
    fs.writeFileSync(ziel, erg.text, 'utf8');
    const k = erg.kennzahlen;
    console.log(`Geschrieben: ${path.relative(REPO, ziel)}`);
    console.log(
      `${k.ersteJahr} (ab ${k.ab}) bis ${k.letzteJahr} (bis ${k.bis}): ${k.jahre} Jahre, ` +
        `${k.monateText} Monate, ${k.schaltjahre} Schaltjahre, ${k.schaltmonate} Schaltmonate, ` +
        `${k.tageText} Tage`,
    );
    console.log(`Prüfsumme der Zeilen: ${erg.pruefsumme}`);
    return 0;
  }
  if (!fs.existsSync(ziel)) {
    console.error(`Keine Tafel unter ${path.relative(REPO, ziel)}`);
    return 1;
  }
  const vorhanden = fs.readFileSync(ziel, 'utf8');
  const kopf = liesKopf(vorhanden);
  if (!kopf) {
    console.error('Kopf der Tafel ohne Stand oder Fassung');
    return 1;
  }
  const installiert = quelle.fassung();
  if (quelle.fassungBindend && installiert !== kopf.fassung) {
    console.error(
      `Fassung der Quelle geändert: Kopf «${kopf.fassung}», installiert «${installiert}»`,
    );
    console.error('Tafel neu erzeugen und den Nachweis neu bewerten.');
    return 1;
  }
  const neu = erzeugeTafelText(name, kopf).text;
  if (neu === vorhanden) {
    console.log(`Gleich: ${path.relative(REPO, ziel)} (Quelle ${installiert})`);
    return 0;
  }
  const a = vorhanden.split('\n');
  const b = neu.split('\n');
  let i = 0;
  while (i < Math.max(a.length, b.length) && a[i] === b[i]) i += 1;
  console.error(`Abweichung in Zeile ${i + 1} (Quelle ${installiert}):`);
  console.error(`  Datei:   ${a[i]}`);
  console.error(`  erzeugt: ${b[i]}`);
  return 1;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  }
}

module.exports = { QUELLEN, erzeugeTafelText, liesKopf, tafelPfad, pruefsumme };
