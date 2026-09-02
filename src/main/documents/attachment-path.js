// 4T-000787 (Epic 3E-000125): Ablage-Kern fuer Anlagen. Beantwortet die eine
// Frage, die beide Eingabewege stellen (Einfuegen aus der Zwischenablage,
// Ziehen auf eine Dokument-Flaeche): Wohin gehoert die Datei, wie heisst sie
// dort, und liegt der Ort innerhalb der erlaubten Grenze?
//
// Bewusst Electron-frei (nur node:path) und ohne Datei-Operationen, damit
// unit-testbar. Das Anlegen des Verzeichnisses und das Schreiben der Datei
// bleiben im IPC-Handler; die Kollisions-Suche bekommt ihre Existenz-Pruefung
// als Parameter herein.
//
// Vorbild fuer Aufbau und Reinheit ist area-path.js, das aus demselben Grund
// alle Bereichs-Grenzen der App traegt, ohne Electron zu kennen.
'use strict';

const path = require('node:path');

// Die vier Ablage-Formen (PO-Festlegung 2026-07-29). 'bereich' ist die
// einzige, die eine gebundene Bereichs-Wurzel voraussetzt; die uebrigen drei
// liegen im Ordner-Teilbaum des Dokuments und kommen deshalb ohne die in
// 4T-000788 aufgeweitete Bild-Grenze aus.
const ABLAGE_FORMEN = ['neben', 'fest', 'dokument', 'bereich'];

// Voreinstellung in beiden Lagen, mit und ohne Bereich: der Ordner mit dem
// Namen des Dokuments.
const STANDARD_FORM = 'dokument';
const STANDARD_ORDNERNAME = 'Anlagen';

// Obergrenze der Kollisions-Suche. Ein Verzeichnis mit derart vielen
// gleichnamigen Anlagen ist kein regulaerer Zustand; die Grenze verhindert
// eine Endlosschleife, falls die Existenz-Pruefung dauerhaft true meldet.
const MAX_NAMENS_VERSUCHE = 1000;

// Unter Windows in Datei- und Ordnernamen verbotene Zeichen, gleiche Menge
// wie in area-path.js (sanitizeNewFileName).
const VERBOTENE_ZEICHEN = /[\\/<>:"|?*]/;

// Normalisiert die Konfiguration aus Store bzw. Bereichsdatei. Unbekannte
// Werte fallen auf die Voreinstellung zurueck, statt zu werfen: eine von Hand
// verdorbene Einstellung darf das Ablegen nicht unmoeglich machen.
function normalisiereAnlagenKonfig(roh) {
  const form =
    roh && typeof roh.form === 'string' && ABLAGE_FORMEN.includes(roh.form)
      ? roh.form
      : STANDARD_FORM;
  const name = roh && typeof roh.ordnername === 'string' ? roh.ordnername.trim() : '';
  return { form, ordnername: name === '' ? STANDARD_ORDNERNAME : name };
}

// Ein Ordnername ist genau dann brauchbar, wenn er ein einzelnes Segment ohne
// Pfad-Anteile ist. '..' und Pfad-Trenner werden abgewiesen und nicht etwa
// zurechtgebogen — ein stillschweigend veraenderter Ordnername waere fuer den
// Anwender nicht nachvollziehbar und koennte aus dem Bereich hinausfuehren.
function istGueltigerOrdnername(name) {
  if (typeof name !== 'string') return false;
  const wert = name.trim();
  if (wert === '' || wert === '.' || wert === '..') return false;
  if (VERBOTENE_ZEICHEN.test(wert)) return false;
  if (/^\.+$/.test(wert)) return false;
  return true;
}

// Basisname des Dokuments ohne Endung, bereinigt um verbotene Zeichen. Der
// Name stammt aus einer existierenden Datei und ist daher in aller Regel schon
// gueltig; die Bereinigung ist die defensive Sicherung fuer Sonderfaelle.
// Bleibt nichts uebrig, faellt der Aufrufer auf den festen Ordnernamen zurueck.
function ordnernameAusDokument(dokumentPfad) {
  if (typeof dokumentPfad !== 'string' || dokumentPfad === '') return null;
  const basis = path.basename(dokumentPfad, path.extname(dokumentPfad));
  const bereinigt = basis.replace(new RegExp(VERBOTENE_ZEICHEN.source, 'g'), '').trim();
  if (bereinigt === '' || /^\.+$/.test(bereinigt)) return null;
  return bereinigt;
}

// Liegt ziel innerhalb von wurzel (die Wurzel selbst zaehlt als innerhalb)?
// Eigene, case-insensitive Fassung analog zu area-path.isInsideArea; hier
// bewusst nicht importiert, damit das Modul ohne Bereichs-Kontext testbar
// bleibt und der Vergleich fuer beide Wurzel-Arten (Bereich und Dokument-
// Ordner) derselbe ist.
function liegtInnerhalb(wurzel, ziel) {
  if (typeof wurzel !== 'string' || typeof ziel !== 'string') return false;
  const w = path
    .resolve(wurzel)
    .replace(/[\\/]+$/, '')
    .toLowerCase();
  const z = path
    .resolve(ziel)
    .replace(/[\\/]+$/, '')
    .toLowerCase();
  if (w === '' || z === '') return false;
  return z === w || z.startsWith(w + path.sep);
}

// Loest das Ziel-Verzeichnis der Ablage auf.
//
// Liefert { ok: true, verzeichnis, wurzel } oder { ok: false, grund }. Der
// Grund ist eine stabile Kennung, die der Renderer in eine lokalisierte
// Meldung uebersetzt; er ist bewusst kein fertiger Text, damit die Sprache
// im Renderer bleibt.
function loeseAblageOrt({ dokumentPfad, bereichsWurzel, konfig } = {}) {
  const { form, ordnername } = normalisiereAnlagenKonfig(konfig);

  // Ohne gespeichertes Dokument gibt es keinen Bezugspunkt fuer den Verweis.
  // Das gilt auch bei gebundenem Bereich: Ein Markdown-Verweis wird immer
  // relativ zur Datei aufgeloest, und die gibt es hier noch nicht.
  if (typeof dokumentPfad !== 'string' || dokumentPfad === '') {
    return { ok: false, grund: 'kein-dokument' };
  }
  const dokumentOrdner = path.dirname(path.resolve(dokumentPfad));

  if (form === 'bereich') {
    if (typeof bereichsWurzel !== 'string' || bereichsWurzel === '') {
      return { ok: false, grund: 'kein-bereich' };
    }
    if (!istGueltigerOrdnername(ordnername)) {
      return { ok: false, grund: 'ungueltiger-ordnername' };
    }
    const wurzel = path.resolve(bereichsWurzel);
    const verzeichnis = path.join(wurzel, ordnername);
    if (!liegtInnerhalb(wurzel, verzeichnis)) {
      return { ok: false, grund: 'ausserhalb-der-wurzel' };
    }
    return { ok: true, verzeichnis, wurzel };
  }

  // Die uebrigen drei Formen sind dokumentnah. Ihre Grenze ist der Ordner des
  // Dokuments, unabhaengig davon, ob ein Bereich gebunden ist.
  let verzeichnis;
  if (form === 'neben') {
    verzeichnis = dokumentOrdner;
  } else if (form === 'dokument') {
    const ausDokument = ordnernameAusDokument(dokumentPfad);
    const segment = ausDokument || ordnername;
    if (!istGueltigerOrdnername(segment)) {
      return { ok: false, grund: 'ungueltiger-ordnername' };
    }
    verzeichnis = path.join(dokumentOrdner, segment);
  } else {
    if (!istGueltigerOrdnername(ordnername)) {
      return { ok: false, grund: 'ungueltiger-ordnername' };
    }
    verzeichnis = path.join(dokumentOrdner, ordnername);
  }
  if (!liegtInnerhalb(dokumentOrdner, verzeichnis)) {
    return { ok: false, grund: 'ausserhalb-der-wurzel' };
  }
  return { ok: true, verzeichnis, wurzel: dokumentOrdner };
}

// Zeitstempel-Anteil des erzeugten Dateinamens: JJJJMMTT-HHMMSS in LOKALER
// Zeit. Bewusste Abweichung von der UTC-Konvention des Projekts, die fuer
// persistierte Daten gilt: Dieser Wert ist Bestandteil eines Dateinamens fuer
// Menschen und wird nie zurueckgelesen oder verglichen.
function zeitstempelTeil(zeitpunkt) {
  const d = zeitpunkt instanceof Date ? zeitpunkt : new Date();
  const zwei = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${zwei(d.getMonth() + 1)}${zwei(d.getDate())}` +
    `-${zwei(d.getHours())}${zwei(d.getMinutes())}${zwei(d.getSeconds())}`
  );
}

// Name fuer eine Anlage ohne eigenen Namen (Bildschirmfoto aus der
// Zwischenablage): Dokumentname, Unterstrich, Datum-Uhrzeit (PO-Festlegung
// 2026-07-29). Ohne brauchbaren Dokumentnamen bleibt der Zeitstempel allein,
// damit immer ein Name entsteht.
function erzeugeAnlagenNamen({ dokumentPfad, endung, zeitpunkt } = {}) {
  const stamm = ordnernameAusDokument(dokumentPfad);
  const ext = typeof endung === 'string' && endung !== '' ? endung.replace(/^\.+/, '') : 'png';
  const zeit = zeitstempelTeil(zeitpunkt);
  return stamm ? `${stamm}_${zeit}.${ext}` : `${zeit}.${ext}`;
}

// Bereinigt den Namen einer mitgebrachten Datei auf einen nackten Dateinamen.
// Anders als area-path.sanitizeNewFileName wird KEINE '.md'-Endung ergaenzt —
// eine Anlage behaelt ihre eigene.
function bereinigeDateinamen(name) {
  if (typeof name !== 'string') return null;
  const nurName = path.basename(name).trim();
  if (nurName === '' || nurName === '.' || nurName === '..') return null;
  const bereinigt = nurName.replace(new RegExp(VERBOTENE_ZEICHEN.source, 'g'), '').trim();
  if (bereinigt === '' || /^\.+$/.test(bereinigt)) return null;
  return bereinigt;
}

// Sucht einen freien Dateinamen im Ziel-Verzeichnis. `existiert` ist ein
// Praedikat (absoluter Pfad -> boolean), das der Aufrufer aus dem Dateisystem
// bedient; damit bleibt dieses Modul frei von fs. Eine vorhandene Datei wird
// nie ueberschrieben, sondern der Name um einen Zaehler erweitert.
function freierDateiname({ verzeichnis, name, existiert } = {}) {
  if (typeof verzeichnis !== 'string' || typeof name !== 'string' || name === '') return null;
  if (typeof existiert !== 'function') return null;
  const ext = path.extname(name);
  const stamm = name.slice(0, name.length - ext.length);
  if (!existiert(path.join(verzeichnis, name))) return name;
  for (let i = 2; i <= MAX_NAMENS_VERSUCHE; i += 1) {
    const kandidat = `${stamm}-${i}${ext}`;
    if (!existiert(path.join(verzeichnis, kandidat))) return kandidat;
  }
  return null;
}

// Pfad der abgelegten Datei, relativ zum Dokument und mit Vorwaerts-
// Schraegstrichen. Der Verweis bleibt damit plattformneutral und ueberlebt das
// Verschieben des ganzen Baums, solange Dokument und Anlage zueinander stehen
// bleiben.
function verweisPfad({ dokumentPfad, zielPfad } = {}) {
  if (typeof dokumentPfad !== 'string' || typeof zielPfad !== 'string') return null;
  if (dokumentPfad === '' || zielPfad === '') return null;
  const von = path.dirname(path.resolve(dokumentPfad));
  const rel = path.relative(von, path.resolve(zielPfad));
  if (rel === '') return null;
  return rel.split(path.sep).join('/');
}

// 4T-000790 (Epic 3E-000125): Endungen, deren Oeffnen ueber das Betriebssystem
// Code ausfuehrt. Sie werden nicht gesperrt, aber erst nach einer Rueckfrage
// geoeffnet, die Name und vollen Pfad zeigt (PO-Festlegung 2026-07-29).
//
// Die Liste ist bewusst konservativ und nennt die Windows-Faelle, die durch
// blosses Oeffnen starten. Sie ist KEIN vollstaendiger Schutz — sie kann es
// nicht sein, weil die Zuordnung von Endung zu Programm beim Anwender liegt.
// Ihr Zweck ist, den unauffaelligen Fall auffaellig zu machen: ein Dokument aus
// fremder Hand mit einem harmlos beschrifteten Link auf eine mitgelieferte
// ausfuehrbare Datei.
const AUSFUEHRBARE_ENDUNGEN = new Set([
  'exe',
  'com',
  'bat',
  'cmd',
  'msi',
  'msp',
  'scr',
  'pif',
  'cpl',
  'lnk',
  'url',
  'ps1',
  'psm1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'hta',
  'reg',
  'jar',
]);

function istAusfuehrbareEndung(pfad) {
  if (typeof pfad !== 'string' || pfad === '') return false;
  return AUSFUEHRBARE_ENDUNGEN.has(path.extname(pfad).slice(1).toLowerCase());
}

module.exports = {
  ABLAGE_FORMEN,
  STANDARD_FORM,
  STANDARD_ORDNERNAME,
  AUSFUEHRBARE_ENDUNGEN,
  istAusfuehrbareEndung,
  normalisiereAnlagenKonfig,
  istGueltigerOrdnername,
  ordnernameAusDokument,
  loeseAblageOrt,
  erzeugeAnlagenNamen,
  bereinigeDateinamen,
  freierDateiname,
  verweisPfad,
};
