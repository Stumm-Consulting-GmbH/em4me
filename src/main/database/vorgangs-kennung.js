// 4T-001820 (Epic 3E-000254, E10.5, Bauplan B1 bis B5): Der Erzeuger der
// Vorgangs-Kennung — der je Datenbank monoton wachsende Zähler, seine Datei und
// seine Wiedergewinnung aus dem Bestand.
//
// **Alle Belege eines Auftrags tragen dieselbe Vorgangs-Kennung.** Sie ist die
// einzige Aussage darüber, dass ein Kopf und seine Positionen gemeinsam
// gespeichert wurden. Das Beleg-Format (`src/shared/database/change-record.js`)
// nimmt sie als **Wert** entgegen und führt selbst keinen Zähler; hier entsteht
// er.
//
// **Der Ort ist entschieden und nicht gewählt** (Entscheidung des Product Owners
// vom 2026-09-20): eine eigene, von der Anwendung geführte Datei in der
// Bereichs-Wurzel, `Area_Database.mdda`. Verworfen sind der Steckbrief der
// Datenbank, weil er ein Dokument des Anwenders ist, die Einstellungs-Datei des
// Bereichs, weil jede Datensatz-Änderung die Einstellungen neu schriebe, und der
// Sperr-Ordner, weil er nie mitreist und sich Kennungen nach einer Weitergabe
// wiederholen könnten. **An der Endung `.mdda` und nur an ihr** hängen der
// Ausschluss aus jeder Dateiliste, die Unsichtbarkeit für die Volltext-Suche,
// das Übergehen durch den Bereichs-Watcher und die Abweisung beim
// Direkt-Öffnen; eine Datei, die bei jedem Auftrag neu geschrieben wird, darf
// den Beobachter des Bereichs nicht bei jedem Auftrag wecken.
//
// **Das Muster führt dieses Modul selbst** (B3): JSON mit `schemaVersion` und
// benannten Sektionen, unbekannte Sektionen und unbekannte Angaben überleben das
// Schreiben. Der Grund ist am Quelltext von `src/main/documents/mdd-store.js`
// abgelesen und nicht vermutet: Jenes Modul trägt seine drei Datei-Arten über
// **feste Namen** und je eigene Bau- und Deute-Funktionen, es hat keinen Weg für
// eine vierte Art. Damit gilt hier dieselbe Lage wie bei Buch und Regal, die das
// Muster aus demselben Grund je selbst führen.
//
// **Geschrieben wird über den gemeinsamen atomaren Schreibweg** und nicht
// anfügend: Die Datei trägt genau einen Wert, und ein halb geschriebener Zähler
// wäre schlimmer als ein verlorener. Die Konflikt-Prüfung gegen den gelesenen
// Stand gehört dazu — eine fremde Änderung zwischen Lesen und Schreiben lässt
// den Zug scheitern, statt eine bereits vergebene Kennung ein zweites Mal zu
// vergeben.
//
// **Monoton, nicht lückenlos.** Ein Auftrag, der nach dem Ziehen abbricht,
// hinterlässt eine Lücke. Das ist gewollt und dieselbe Regel, nach der die
// interne Datensatz-Kennung beim Eröffnen einer Neuanlage gezogen wird. Die
// Alternative wäre die Wiederverwendung, und ein wiederverwendeter Schlüssel ist
// in einer Beleg-Kette ein Datenverlust ohne Fehlermeldung.
//
// **Die Sperre ist eine Pflicht-Naht und wird nicht selbst genommen** (B2, Form
// der Verdichtung in `change-log.js`). Welche Sperren ein Schreibzug braucht,
// weiß die Schreib-Schnittstelle; sie reicht die Naht herein. Ohne sie wird
// verweigert, und zwar bevor irgendetwas gelesen wird. Die Sperr-Art `counter`
// steht in der Sperr-Ordnung **zuletzt**, und unter ihr wird keine weitere
// genommen: Dieses Modul kennt die Sperr-Verwaltung nicht.
//
// **Nicht hier:** ein IPC-Kanal, eine Oberfläche, ein Sprach-Schlüssel und die
// Anlässe, die einen Auftrag auslösen. Dieses Modul hat in diesem Vorgang außer
// seinen Prüffällen keinen Aufrufer, und das ist gewollt.
'use strict';

// 4T-001964: Vorgabe ist der frisch lesende Dateizugriff; unter einer Sperre
// liefert der Netzwerk-Client sonst den Stand vor dem Ersetzen durch einen
// anderen Rechner (Begründung in frisch-lesen.js).
const { frischerDateizugriff } = require('../documents/frisch-lesen.js');
const path = require('node:path');

const { MDDL_EXT, extensionOf } = require('../../shared/markdown-data-family.js');
// Die EINE Ordner-Regel der Anwendung (node_modules und jeder Punkt-Ordner). Die
// Wiedergewinnung unten übergeht damit denselben Bestand wie Index, Suche und
// Statistik — und den Sperr-Ordner erbt sie dabei mit, weil dessen
// Gültigkeits-Regel den führenden Punkt erzwingt. Eine zweite Kopie der
// Bedingung wäre die Stelle, an der beide auseinanderliefen.
const { isIgnoredDirName } = require('../index/scan.js');
const { ersetzeDatei } = require('../documents/atomic-write.js');
// Der lesende Zugriff auf eine Beleg-Datei. Die Wiedergewinnung liest sie über
// denselben Weg wie jeder andere Leser; ein zweiter Parser entsteht nicht.
const { leseBelegDatei } = require('./change-log.js');

// Fester Name der Zähler-Datei in der Bereichs-Wurzel, produktneutral und im
// Präfix `Area_` der übrigen Objekte der Bereichs-Ebene.
const VORGANGS_DATEI_NAME = 'Area_Database.mdda';

// Versions-Kennung des Formats im Datenbestand (Entwicklungsrichtlinien,
// Kapitel 12). Eigene Zählung neben dem Muster, wie Buch und Regal sie führen.
const VORGANGS_SCHEMA_VERSION = 1;

// Sektion und Angabe. Englisch wie die übrigen Namen persistierter Formate,
// weil ein Bereich weitergegeben werden kann und eine Notation nicht übersetzt
// wird; `lastTx` trägt denselben Namen wie die Angabe `tx` am Beleg-Marker.
const SEKTION_VORGAENGE = 'transactions';
const ANGABE_LETZTER = 'lastTx';

// Codes der Fehlschläge. Sie tragen den Namen ihrer Lage, damit die
// Schreib-Schnittstelle die belegte Sperre vom nicht beschreibbaren Ort
// unterscheiden kann, ohne den Text zu lesen (Muster change-log.js).
const VORGANG_CODES = Object.freeze({
  wurzel: 'vorgangWurzelFehlt',
  // B2: Der Aufruf ohne Sperr-Naht ist keine Störung des Dateisystems, sondern
  // ein Aufruf, der so nicht stattfinden darf.
  ohneSperre: 'vorgangOhneSperre',
  // B5: die beiden benannten Fehlschläge des Ziehens.
  gesperrt: 'vorgangGesperrt',
  schreiben: 'vorgangSchreibenFehlgeschlagen',
  // Eine fremde Änderung zwischen Lesen und Schreiben. Eigener Code und nicht
  // «Schreiben fehlgeschlagen»: Der Ort ist beschreibbar, es hat nur jemand
  // anders in derselben Sekunde geschrieben.
  konflikt: 'vorgangFremdeAenderung',
  // Die Naht hat geworfen. Sie gehört dem Aufrufer, und ein Wurf aus ihr ist
  // nicht der Fehlschlag dieses Moduls.
  sperre: 'vorgangSperreFehlgeschlagen',
  // Eine Datei aus einer neueren Programm-Fassung wird gelesen, aber nie
  // überschrieben (Entwicklungsrichtlinien, Kapitel 12).
  schemaVersion: 'vorgangSchemaVersionUnbekannt',
  // 4T-001964: Die Zähler-Datei existiert auf dem Laufwerk (das exklusive
  // Anlegen scheitert an ihr), erscheint dem Lesen aber über alle
  // Wiederholungen als fehlend. Wiedergewinnen hieße, auf einem veralteten
  // Bild des Bestands zu zählen.
  unsichtbar: 'vorgangDateiUnsichtbar',
});

// 4T-001964: Abstände der Wiederholungen, wenn die Zähler-Datei existiert, aber
// als fehlend gelesen wird. Insgesamt rund sieben Sekunden, weil der
// Netzwerk-Client ein «nicht gefunden» rund fünf Sekunden lang merkt.
const UNSICHTBAR_ABSTAENDE_MS = Object.freeze([250, 500, 1000, 1000, 1500, 1500, 1500]);

function alsText(fehlerWert) {
  return fehlerWert && fehlerWert.message ? fehlerWert.message : String(fehlerWert);
}

function fehler(code, text) {
  return { ok: false, code, error: text };
}

// Einspritzbare Nähte nach dem Vorbild change-log.js. Die Sperre ist **keine**
// Vorgabe, sondern Pflicht (siehe `zieheVorgang`).
function nahtstellen(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  return {
    fsp: d.fsp || frischerDateizugriff,
    ersetzen: typeof d.ersetzen === 'function' ? d.ersetzen : ersetzeDatei,
    leseBelege: typeof d.leseBelege === 'function' ? d.leseBelege : leseBelegDatei,
    abstaendeUnsichtbar: Array.isArray(d.abstaendeUnsichtbar)
      ? d.abstaendeUnsichtbar
      : UNSICHTBAR_ABSTAENDE_MS,
  };
}

// Ganze Zahl aus einem Text. Die Vorgangs-Kennung steht am Beleg-Marker als
// Text; was sich nicht als nicht-negative ganze Zahl lesen lässt, ist für den
// Zähler keine Auskunft.
function ganzeZahl(roh) {
  if (typeof roh === 'number') return Number.isSafeInteger(roh) && roh >= 0 ? roh : null;
  if (typeof roh !== 'string' || !/^\d+$/.test(roh)) return null;
  const zahl = parseInt(roh, 10);
  return Number.isSafeInteger(zahl) ? zahl : null;
}

/**
 * Pfad der Zähler-Datei eines Bereichs.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @returns {string}
 */
function vorgangsDateiPfad(bereichsWurzel) {
  return path.join(bereichsWurzel, VORGANGS_DATEI_NAME);
}

function leererBehaelter() {
  return { schemaVersion: VORGANGS_SCHEMA_VERSION, [SEKTION_VORGAENGE]: {} };
}

// Deutet den rohen Datei-Inhalt. Liefert den Behälter nur, wenn er dem Muster
// folgt und seine Version diesem Modul bekannt ist; die gelesene Version kommt
// in jedem Fall mit, damit der Aufrufer eine NEUERE Fassung erkennen und die
// Datei unberührt lassen kann.
function deuteBehaelter(roh) {
  if (typeof roh !== 'string' || roh.trim() === '') return { behaelter: null, version: null };
  let wert;
  try {
    wert = JSON.parse(roh);
  } catch {
    return { behaelter: null, version: null };
  }
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) {
    return { behaelter: null, version: null };
  }
  const version = Number.isSafeInteger(wert.schemaVersion) ? wert.schemaVersion : null;
  if (version !== VORGANGS_SCHEMA_VERSION) return { behaelter: null, version };
  return { behaelter: wert, version };
}

// Der zuletzt vergebene Wert, oder null, wenn die Angabe fehlt oder unbrauchbar
// ist. Null heißt «der Stand ist wiederzugewinnen» und nie «fang bei null an»:
// Ein angenommener Stand null vergäbe jede Kennung ein zweites Mal.
function letzterAus(behaelter) {
  if (behaelter === null) return null;
  const sektion = behaelter[SEKTION_VORGAENGE];
  if (!sektion || typeof sektion !== 'object' || Array.isArray(sektion)) return null;
  return ganzeZahl(sektion[ANGABE_LETZTER]);
}

// Setzt den Wert und lässt alles andere stehen (AK3). Geändert wird genau die
// eine Angabe; unbekannte Sektionen und unbekannte Angaben derselben Sektion
// reisen unangetastet mit, damit eine ältere Programmfassung einer neueren
// nichts wegschreibt.
function setzeLetzten(behaelter, wert) {
  behaelter.schemaVersion = VORGANGS_SCHEMA_VERSION;
  const sektion = behaelter[SEKTION_VORGAENGE];
  if (!sektion || typeof sektion !== 'object' || Array.isArray(sektion)) {
    behaelter[SEKTION_VORGAENGE] = {};
  }
  behaelter[SEKTION_VORGAENGE][ANGABE_LETZTER] = wert;
  return behaelter;
}

/**
 * Liest die Zähler-Datei eines Bereichs.
 *
 * Eine fehlende und eine unlesbare Datei führen auf **denselben** Weg: `letzter`
 * ist null, und der Stand ist wiederzugewinnen (B4). Ein nicht beschreibbarer
 * Ort meldet sich erst beim Schreiben, mit eigenem Code.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {{fsp?: object}} [deps]
 * @returns {Promise<{ok: true, pfad: string, vorhanden: boolean, fehlend: boolean, roh: string|null,
 *   behaelter: object|null, version: number|null, letzter: number|null}
 *   |{ok: false, code: string, error: string}>}
 */
async function leseVorgangsDatei(bereichsWurzel, deps) {
  if (typeof bereichsWurzel !== 'string' || bereichsWurzel === '') {
    return fehler(VORGANG_CODES.wurzel, 'Keine Bereichs-Wurzel übergeben.');
  }
  const { fsp } = nahtstellen(deps);
  const pfad = vorgangsDateiPfad(bereichsWurzel);
  let roh = null;
  let vorhanden = false;
  let fehlend = false;
  try {
    const text = await fsp.readFile(pfad, 'utf8');
    vorhanden = true;
    roh = typeof text === 'string' ? text : null;
  } catch (err) {
    // Fehlend wie unlesbar: beides ist «kein Stand», und beides ist kein
    // Fehlschlag dieses Weges. 4T-001964: `fehlend` hält allein das «nicht
    // gefunden» fest, weil nur dieses aus dem Zwischenspeicher kommen kann.
    fehlend = Boolean(err && err.code === 'ENOENT');
  }
  const { behaelter, version } = deuteBehaelter(roh);
  const letzter = letzterAus(behaelter);
  return { ok: true, pfad, vorhanden, fehlend, roh, behaelter, version, letzter };
}

// Sammelt die Beleg-Dateien eines Bereichs, rekursiv. Ein nicht lesbarer Ordner
// hält die Wiedergewinnung nicht auf: Sie ist der Ausnahmefall nach einem
// Verlust, und ein Abbruch an einem einzelnen Ordner machte sie unbrauchbar.
async function sammleBelegDateien(fsp, ordner, gefunden) {
  let eintraege;
  try {
    eintraege = await fsp.readdir(ordner, { withFileTypes: true });
  } catch {
    return;
  }
  for (const eintrag of eintraege) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) {
      if (isIgnoredDirName(eintrag.name)) continue;
      await sammleBelegDateien(fsp, voll, gefunden);
    } else if (eintrag.isFile() && extensionOf(eintrag.name) === MDDL_EXT) {
      gefunden.push(voll);
    }
  }
}

/**
 * Gewinnt den Stand des Zählers aus dem Bestand wieder (B4, AK9).
 *
 * Gesucht wird das höchste `tx` aller Beleg-Dateien des Bereichs. **Beschädigte
 * Belege halten sie nicht auf**: Ihr Wert zählt mit, wenn er sich als Zahl lesen
 * lässt, und wird sonst übergangen und gezählt. Ein Beleg, der von sich aus
 * keine Vorgangs-Kennung trägt (Fremd-Änderung, verdichtete Spanne), ist keine
 * Auffälligkeit und wird eigens gezählt.
 *
 * Teuer und selten: Sie läuft erst beim ersten Ziehen nach einem Verlust der
 * Datei, nicht beim Öffnen des Bereichs.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {{fsp?: object, leseBelege?: Function}} [deps]
 * @returns {Promise<{ok: true, hoechster: number, dateien: number, unlesbareDateien: number,
 *   belege: number, ohneVorgang: number, uebergangen: number}
 *   |{ok: false, code: string, error: string}>}
 */
async function gewinneStandWieder(bereichsWurzel, deps) {
  if (typeof bereichsWurzel !== 'string' || bereichsWurzel === '') {
    return fehler(VORGANG_CODES.wurzel, 'Keine Bereichs-Wurzel übergeben.');
  }
  const { fsp, leseBelege } = nahtstellen(deps);
  const dateien = [];
  await sammleBelegDateien(fsp, bereichsWurzel, dateien);

  let hoechster = 0;
  let unlesbareDateien = 0;
  let belege = 0;
  let ohneVorgang = 0;
  let uebergangen = 0;
  for (const pfad of dateien) {
    // `belegPfadFuer` bildet aus Basisnamen und Endung denselben Pfad, wenn
    // bereits die Beleg-Datei übergeben wird; der Leser nimmt sie deshalb
    // unverändert entgegen.
    const gelesen = await leseBelege(pfad, deps);
    if (!gelesen || gelesen.ok !== true) {
      unlesbareDateien += 1;
      continue;
    }
    for (const beleg of gelesen.belege || []) {
      belege += 1;
      const roh = beleg ? beleg.vorgang : null;
      if (roh === null || roh === undefined || roh === '') {
        ohneVorgang += 1;
        continue;
      }
      const wert = ganzeZahl(roh);
      if (wert === null) {
        uebergangen += 1;
        continue;
      }
      if (wert > hoechster) hoechster = wert;
    }
  }
  return {
    ok: true,
    hoechster,
    dateien: dateien.length,
    unlesbareDateien,
    belege,
    ohneVorgang,
    uebergangen,
  };
}

// 4T-001964: Klärt, ob eine als fehlend gelesene Zähler-Datei wirklich fehlt.
// Das exklusive Anlegen kann der Netzwerk-Client nicht aus seinem Gedächtnis
// beantworten, er muss die Gegenstelle fragen. Gelingt es, fehlte die Datei
// wirklich, und die angelegte leere Datei passt zur Erwartung '' des
// Schreibens. Scheitert es an einer vorhandenen Datei, wird bis zur Sichtbarkeit
// wiederholt gelesen. Jeder andere Fehler lässt den bisherigen Weg unverändert,
// damit sich schreibgeschützte Lagen nicht anders verhalten als zuvor.
async function klaereFehlen(bereichsWurzel, gelesen, d) {
  const { fsp, abstaendeUnsichtbar } = nahtstellen(d);
  let griff;
  try {
    griff = await fsp.open(gelesen.pfad, 'wx');
  } catch (err) {
    if (!err || err.code !== 'EEXIST') return gelesen;
    for (const ms of abstaendeUnsichtbar) {
      await new Promise((fertig) => setTimeout(fertig, ms));
      const erneut = await leseVorgangsDatei(bereichsWurzel, d);
      if (!erneut.ok || erneut.vorhanden) return erneut;
    }
    return fehler(
      VORGANG_CODES.unsichtbar,
      'Die Zähler-Datei existiert auf dem Laufwerk, erscheint beim Lesen aber als nicht vorhanden.',
    );
  }
  try {
    await griff.close();
  } catch {
    // Der Griff ist unbeschrieben; ein Fehler beim Schließen ändert am Stand nichts.
  }
  return gelesen;
}

/**
 * Zieht die nächste Vorgangs-Kennung eines Bereichs.
 *
 * **Die Sperre ist Pflicht-Naht** (B2): Fehlt sie, wird verweigert, bevor
 * irgendetwas gelesen wird; ein Ziehen ohne Sperre ist damit nicht möglich. Die
 * Naht bekommt allein die Arbeit, weil der Gegenstand der Bereich als Ganzes ist
 * und keinen Pfad trägt.
 *
 * **Ein Fehlschlag lässt den ganzen Auftrag scheitern** (B5). Gezogen wird,
 * bevor irgendetwas geschrieben ist; belegte Sperre, nicht beschreibbare Datei
 * und fremde Änderung tragen je einen eigenen Code, den die Schreib-Schnittstelle
 * in ihrem Meldungs-Modell deutet. Ein Auftrag ohne Vorgangs-Kennung wird nie
 * geschrieben.
 *
 * **Ein «nicht gefunden» wird bestätigt, bevor wiedergewonnen wird**
 * (4T-001964, Befund vom 2026-09-27): Im Zwei-Rechner-Wettlauf zog ein Rechner
 * drei Sekunden nach dem anderen dieselbe Kennung 1. Der andere hatte die
 * Zähler-Datei gerade angelegt; der Netzwerk-Client des ersten merkte sich ein
 * früheres «nicht gefunden» einige Sekunden lang, meldete die Datei als fehlend,
 * und die Wiedergewinnung aus den ebenso veralteten Belegen ergab null. Das
 * Lesen mit Schreibrecht hilft hier nicht, weil schon das Öffnen `ENOENT`
 * liefert. Deshalb wird die Datei zuvor exklusiv angelegt (`klaereFehlen`).
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {{mitSperre: (arbeit: () => Promise<any>) => Promise<any>, fsp?: object,
 *   ersetzen?: Function, leseBelege?: Function, abstaendeUnsichtbar?: number[]}} deps
 *   `mitSperre` ist Pflicht.
 * @returns {Promise<{ok: true, vorgang: number, wiedergewonnen: boolean, pfad: string}
 *   |{ok: false, code: string, error: string}>}
 */
async function zieheVorgang(bereichsWurzel, deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  // Fail-closed und VOR jedem Zugriff, wie bei der Verdichtung: Ohne Naht wird
  // weder gelesen noch geschrieben.
  if (typeof d.mitSperre !== 'function') {
    return fehler(
      VORGANG_CODES.ohneSperre,
      'Der Vorgangs-Zähler verlangt die Sperre des Bereichs als Naht mitSperre.',
    );
  }
  if (typeof bereichsWurzel !== 'string' || bereichsWurzel === '') {
    return fehler(VORGANG_CODES.wurzel, 'Keine Bereichs-Wurzel übergeben.');
  }
  const { ersetzen } = nahtstellen(d);

  const arbeit = async () => {
    let gelesen = await leseVorgangsDatei(bereichsWurzel, d);
    if (gelesen.ok && gelesen.fehlend) gelesen = await klaereFehlen(bereichsWurzel, gelesen, d);
    if (!gelesen.ok) return gelesen;
    // Eine neuere Fassung wird gelesen, aber nie zurückgeschrieben: Was dieses
    // Modul an ihr nicht versteht, könnte gerade der Zähler sein.
    if (gelesen.version !== null && gelesen.version > VORGANGS_SCHEMA_VERSION) {
      return fehler(
        VORGANG_CODES.schemaVersion,
        `Die Zähler-Datei trägt die unbekannte Schema-Version ${gelesen.version}.`,
      );
    }

    let stand = gelesen.letzter;
    let wiedergewonnen = false;
    if (stand === null) {
      const wieder = await gewinneStandWieder(bereichsWurzel, d);
      if (!wieder.ok) return wieder;
      stand = wieder.hoechster;
      wiedergewonnen = true;
    }
    const vorgang = stand + 1;

    const behaelter = gelesen.behaelter === null ? leererBehaelter() : gelesen.behaelter;
    setzeLetzten(behaelter, vorgang);
    const text = `${JSON.stringify(behaelter, null, 2)}\n`;
    // Der gelesene Stand als Erwartung. Bei fehlender Datei steht die leere
    // Zeichenkette: Eine Neuanlage ist kein Konflikt, aber eine Datei, die
    // inzwischen ein anderer angelegt hat, ist einer.
    const ergebnis = await ersetzen(gelesen.pfad, text, {
      expected: gelesen.roh === null ? '' : gelesen.roh,
    });
    if (ergebnis && ergebnis.ok === true) {
      return { ok: true, vorgang, wiedergewonnen, pfad: gelesen.pfad };
    }
    if (ergebnis && ergebnis.reason === 'conflict') {
      return fehler(
        VORGANG_CODES.konflikt,
        'Die Zähler-Datei hat sich zwischen Lesen und Schreiben geändert.',
      );
    }
    return fehler(
      VORGANG_CODES.schreiben,
      ergebnis && ergebnis.error ? ergebnis.error : 'Das Ersetzen der Zähler-Datei schlug fehl.',
    );
  };

  try {
    const ergebnis = await d.mitSperre(arbeit);
    // Der zweite Ausgang der Naht: Die Sperre war nicht zu bekommen, die Arbeit
    // ist gar nicht erst gelaufen. Das ist nach B5 ein Fehlschlag des Ziehens
    // und kein Normalfall — ohne Kennung wird nichts geschrieben.
    if (ergebnis && ergebnis.nichtGenommen === true) {
      return {
        ...fehler(VORGANG_CODES.gesperrt, 'Die Zähler-Sperre des Bereichs war nicht zu bekommen.'),
        konflikt: ergebnis.konflikt || null,
      };
    }
    return ergebnis;
  } catch (err) {
    return fehler(VORGANG_CODES.sperre, alsText(err));
  }
}

module.exports = {
  VORGANG_CODES,
  VORGANGS_DATEI_NAME,
  VORGANGS_SCHEMA_VERSION,
  SEKTION_VORGAENGE,
  ANGABE_LETZTER,
  vorgangsDateiPfad,
  leseVorgangsDatei,
  gewinneStandWieder,
  zieheVorgang,
};
