// 4T-0615 (Epic 3E-0116): Bereichs-Suchraum im Hauptprozess.
//
// Die Suche der Anwendung kennt seit 3E-0142 einen Raum jenseits des aktiven
// Dokuments (src/shared/search-scope.js). Handbuch und Einstellungen liefern
// ihre Texte im Renderer; ein Bereich kann das nicht, weil seine Dateien auf
// Platte liegen und ihre Zahl unbegrenzt ist. Dateizugriff gehoert in den
// Hauptprozess (Prozess-Schnitt der Entwicklungsrichtlinien), also sucht
// dieses Modul hier und liefert fertige Treffer statt Volltexte.
//
// Aufbau in drei Schichten:
//   Scan     ermittelt die Markdown-Dateien der Bereichs-Wurzel, mit
//            denselben Ignorier-Regeln wie Initial-Scan und Watcher
//            (backlinks.isIgnoredDirName, MD_EXT_RE) — eine Regel, keine
//            Kopie, sonst laufen Datei-Mengen auseinander.
//   Vorrat   haelt die Texte im Speicher, solange gesucht wird. Ohne ihn
//            kostete jeder Tastendruck einen vollen Lesevorgang ueber den
//            Bereich (gemessen 188 ms je 1000 Dateien bei 150 ms Debounce).
//   Cache    persistiert die Texte zwischen zwei Sitzungen, damit der erste
//            Suchlauf nach dem Start nicht wieder alle Dateien liest.
//
// Der Cache liegt bewusst im Nutzerdaten-Verzeichnis der Anwendung und NICHT
// im Bereich des Anwenders (Muster drafts/, extensions/): Er verdoppelte dort
// den Text-Bestand, liefe bei jeder Aenderung durch dessen Ordner-
// Synchronisierung und waere in seinem Backup. Anders als Area_Cache.mdda
// muss er einen Umzug des Bereichs nicht ueberleben, weil er in einem
// Lesevorgang neu entsteht.
//
// Cache-Format ist JSON (Messung am realen Bestand, 1035 Dateien / 8 MB):
// Bis zum durchsuchbaren Zustand, also inklusive der UTF-8-Konvertierung, die
// der Regex-Lauf braucht, liegen JSON (28 ms) und ein Binaer-Container mit
// Offset-Verzeichnis (26 ms) gleichauf. Bei gleichem Tempo gewinnt das
// einfachere und im Projekt bereits verwendete Format; ein eigenes
// Binaer-Format braechte Offset-Arithmetik und einen zweiten Parser ohne
// messbaren Gegenwert.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const backlinks = require('../backlinks.js');
const { MD_EXT_RE } = require('../../shared/markdown/link-scan.js');
const { sucheInTexten } = require('../../shared/search-scope.js');
// 4T-1293 (Epic 3E-0224): Volltext-Cache und Zusammenfuehrung geteilter
// Dokumente liegen in eigenen Modulen; hier bleibt die Suche selbst.
const {
  konfiguriereCache,
  ladeCache,
  schreibeCache,
  CACHE_SCHEMA_VERSION,
} = require('./area-search-cache.js');
const { fasseTeileZusammen, kopfRelPfad } = require('./area-search-teile.js');

// Verzeichnis-Eintraege zwischen zwei Yields (Muster BUILD_BATCH_SIZE des
// Index-Aufbaus und SCAN_BATCH_SIZE der Statistik-Erhebung).
const SCAN_BATCH_SIZE = 500;

// Dateien je Lese-Welle. Genug Parallelitaet, um die Latenz zu verstecken,
// ohne den Datei-Deskriptor-Vorrat auszureizen.
const LESE_BREITE = 16;

// Obergrenze des Speicher-Vorrats, in der Groessenordnung der MAX_BYTES des
// Bereichs-Index. Darueber wird nicht vorgehalten, sondern je Lauf gelesen:
// Die Suche bleibt benutzbar, nur nicht mehr augenblicklich.
const MAX_VORRAT_BYTES = 50 * 1024 * 1024;

// Vorraete je Bereichs-Wurzel: wurzel -> {
//   dateien: Map<relPfad, { text, mtimeMs, size }>, bytes, modus
// }
const vorraete = new Map();

// Juengste Generation je Wurzel. Ein Aufbau, der zwischen zwei Haeppchen
// feststellt, dass eine neuere Anfrage laeuft, bricht ab.
const generationen = new Map();

// 4T-1293: Der Volltext-Cache liegt in area-search-cache.js; hier bleibt nur
// die Durchreiche der Konfiguration.
function konfiguriereBereichsSuche(optionen) {
  konfiguriereCache(optionen);
}

// Wurzel-relativer, portabler ('/') und NFC-normalisierter Schluessel —
// dieselbe Form wie im Bereichs-Index, damit beide dieselbe Datei gleich
// benennen.
function relPfad(absPfad, wurzel) {
  return path.relative(wurzel, absPfad).split(path.sep).join('/').normalize('NFC');
}

// Anzeige-Titel einer Datei: der wurzel-relative Pfad ohne Endung. Der reine
// Dateiname waere kuerzer, aber in einem Bereich mit gleichnamigen Dateien in
// verschiedenen Ordnern nicht unterscheidbar — und genau das ist der Fall,
// den eine bereichsweite Suche erzeugt.
function anzeigeTitel(rel) {
  return rel.replace(/\.[^./]+$/, '');
}

// --- Scan -------------------------------------------------------------------

// Markdown-Dateien der Bereichs-Wurzel samt Groesse und Aenderungszeit.
// Bewusst ein eigener Scan statt eines Zugriffs auf den Bereichs-Index: Der
// Index kann beim ersten Suchlauf noch im Aufbau sein ('indexing'), und eine
// halbe Datei-Liste ergaebe stillschweigend halbe Suchergebnisse. Der Scan
// kostet gemessen 27 ms je 1000 Dateien und ist damit billiger als jede
// Sonderbehandlung des Index-Zustands.
async function scanneBereich(wurzel) {
  const dateien = [];
  let uebersprungeneOrdner = 0;
  let seitYield = 0;
  const dirs = [wurzel];

  while (dirs.length > 0) {
    const dir = dirs.shift();
    let eintraege;
    try {
      eintraege = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      uebersprungeneOrdner += 1;
      console.warn('Bereichs-Suche: Ordner nicht lesbar:', dir, err && err.code);
      continue;
    }
    for (const eintrag of eintraege) {
      const voll = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) {
        if (backlinks.isIgnoredDirName(eintrag.name)) continue;
        dirs.push(voll);
        continue;
      }
      if (!eintrag.isFile() || !MD_EXT_RE.test(eintrag.name)) continue;
      let st;
      try {
        st = await fs.promises.stat(voll);
      } catch {
        /* nicht lesbare Datei ueberspringen statt den Scan abzubrechen */
        continue;
      }
      dateien.push({
        abs: voll,
        rel: relPfad(voll, wurzel),
        size: st.size,
        mtimeMs: st.mtimeMs,
      });
      if (++seitYield >= SCAN_BATCH_SIZE) {
        seitYield = 0;
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }

  // Stabile, nachvollziehbare Reihenfolge der Trefferliste. Der Scan selbst
  // liefert Verzeichnis-Reihenfolge, die sich zwischen Laeufen aendern kann.
  dateien.sort((a, b) => a.rel.localeCompare(b.rel, 'de'));
  return { dateien, uebersprungeneOrdner };
}

// --- Cache ------------------------------------------------------------------

// Liefert Map<rel, { text, mtimeMs, size }>. Fehlend, defekt oder
// versionsfremd ergibt eine leere Map: Der Cache ist ein regenerierbares
// Maschinen-Artefakt, sein Verlust kostet einen Lesevorgang und nie Daten.
// --- Vorrat -----------------------------------------------------------------

// Baut den Vorrat auf: unveraenderte Dateien kommen aus dem Cache, geaenderte
// und neue werden gelesen, entfallene fallen weg. Abgeglichen wird ueber
// Aenderungszeit und Groesse — dieselben zwei Merkmale, die auch der
// Bereichs-Index vergleicht. Ein Inhalts-Hash waere strenger, verlangte aber
// genau den Lesevorgang, den der Cache einspart.
async function baueVorrat(wurzel, generation) {
  const { dateien, uebersprungeneOrdner } = await scanneBereich(wurzel);
  if (generationen.get(wurzel) !== generation) return null;

  const gesamtBytes = dateien.reduce((s, d) => s + d.size, 0);
  if (gesamtBytes > MAX_VORRAT_BYTES) {
    // Kein Vorrat und kein Cache oberhalb des Deckels: Beides waere Speicher
    // bzw. Platte in einer Groessenordnung, die der Anwender nicht bestellt
    // hat. Die Suche laeuft dann je Lauf ueber die Platte.
    return { modus: 'direkt', dateien, bytes: gesamtBytes, uebersprungeneOrdner };
  }

  const cache = await ladeCache(wurzel);
  const texte = new Map();
  let ausCache = 0;
  let gelesen = 0;

  for (let i = 0; i < dateien.length; i += LESE_BREITE) {
    const welle = dateien.slice(i, i + LESE_BREITE);
    const zuLesen = [];
    for (const d of welle) {
      const c = cache.get(d.rel);
      if (c && c.mtimeMs === d.mtimeMs && c.size === d.size) {
        texte.set(d.rel, { text: c.text, mtimeMs: d.mtimeMs, size: d.size });
        ausCache += 1;
      } else {
        zuLesen.push(d);
      }
    }
    if (zuLesen.length > 0) {
      const inhalte = await Promise.all(
        zuLesen.map((d) => fs.promises.readFile(d.abs, 'utf8').catch(() => null)),
      );
      for (let k = 0; k < zuLesen.length; k++) {
        if (inhalte[k] === null) continue;
        texte.set(zuLesen[k].rel, {
          text: inhalte[k],
          mtimeMs: zuLesen[k].mtimeMs,
          size: zuLesen[k].size,
        });
        gelesen += 1;
      }
    }
    if (generationen.get(wurzel) !== generation) return null;
  }

  // Nur schreiben, wenn sich etwas geaendert hat. Ein Suchlauf ohne
  // Datei-Aenderung soll keine Platten-Schreibvorgaenge ausloesen.
  if (gelesen > 0 || ausCache !== cache.size) {
    await schreibeCache(wurzel, texte);
  }

  // 4T-1293: Der Cache haelt die Teil-Dateien einzeln, wie sie auf der Platte
  // liegen; zusammengefuehrt wird erst danach. So bleibt der Cache-Abgleich
  // ueber Aenderungszeit und Groesse Datei fuer Datei gueltig.
  return fasseTeileZusammen({
    modus: 'vorrat',
    texte,
    reihenfolge: dateien.map((d) => d.rel),
    bytes: gesamtBytes,
    uebersprungeneOrdner,
  });
}

// --- Suche ------------------------------------------------------------------

function baueRegex(muster, flags) {
  return new RegExp(muster, typeof flags === 'string' && flags ? flags : 'gm');
}

function absoluterPfad(wurzel, rel) {
  return path.join(wurzel, rel.split('/').join(path.sep));
}

function eintrag(wurzel, rel, text) {
  return {
    gruppe: rel,
    titel: anzeigeTitel(rel),
    text,
    quelle: 'area',
    kennung: absoluterPfad(wurzel, rel),
  };
}

// Die Datei-Reihenfolge einer Trefferliste: der Anker zuerst, dahinter die
// uebrigen in ihrer stabilen alphabetischen Ordnung.
//
// Der Anker ist die Datei, in der die Suche geoeffnet wurde, und bleibt es
// fuer die ganze Such-Sitzung. Ihn bei jedem Lauf auf die gerade offene Datei
// zu setzen, waere naheliegend und falsch: Nach einem Sprung wuerde die
// Zieldatei nach vorn wandern, die Liste sich unter dem Finger umsortieren
// und der Zaehler faktisch nur noch innerhalb der Datei zaehlen (der Fund
// stuende wieder auf Position 1).
function dateiReihenfolge(bekannt, ankerRel, aktivRel) {
  const rest = bekannt.filter((r) => r !== ankerRel);
  // Eine noch nie gespeicherte Datei ist dem Scan unbekannt, hat aber einen
  // Editor-Stand und gehoert deshalb dazu.
  if (aktivRel && aktivRel !== ankerRel && !bekannt.includes(aktivRel)) rest.push(aktivRel);
  return ankerRel ? [ankerRel, ...rest] : rest;
}

// 4T-0949 (Befund E-02, Story 4S-0787): Der geschriebene Stand eines offenen
// Dokuments, das nicht das aktive ist. Bis hierher kannte die Suche allein den
// mitgeschickten Stand der aktiven Datei, waehrend jeder weitere Reiter, die
// zweite Spalte und jedes andere Fenster im Stand ihrer letzten Speicherung
// durchsucht wurden; die Schicht im Hauptprozess fuehrt diese Staende bereits
// und gilt fensteruebergreifend. Vorrat und Sitzungs-Cache bleiben unberuehrt:
// Laege der Puffer in ihnen, schriebe der Cache ihn als Platten-Stand fort und
// er ueberdauerte die Sitzung.
function geschriebenerStand(wurzel, rel) {
  return backlinks.bufferTextFor(absoluterPfad(wurzel, rel));
}

// Eintrags-Liste fuer den Suchraum-Kern aus dem Vorrat.
//
// Die Gruppen-Kennung ist der wurzel-relative Pfad (Anzeige und Gruppierung),
// die Sprung-Kennung der absolute (der Renderer oeffnet damit die Datei, ohne
// die Pfad-Logik des Hauptprozesses ein zweites Mal zu fuehren). Das Feld
// `kennung` ist im Suchraum-Kern genau dafuer vorgesehen und landet als
// `sprung.kennung` am Treffer.
function eintraegeAusVorrat(vorrat, wurzel, { ankerRel, aktivRel, aktivText }) {
  const hatEditorStand = !!aktivRel && typeof aktivText === 'string';
  const eintraege = [];
  for (const rel of dateiReihenfolge(
    vorrat.reihenfolge,
    ankerRel,
    hatEditorStand ? aktivRel : null,
  )) {
    // Die offene Datei steuert ihren Editor-Stand bei; der Platten-Stand
    // derselben Datei bleibt damit aussen vor.
    // '??' statt '||': Ein geleerter Puffer ist ein gueltiger Stand.
    const text =
      hatEditorStand && rel === aktivRel
        ? aktivText
        : (geschriebenerStand(wurzel, rel) ?? (vorrat.texte.get(rel) || {}).text);
    if (!text) continue;
    eintraege.push(eintrag(wurzel, rel, text));
  }
  return eintraege;
}

// Direkt-Weg oberhalb des Deckels: gedrosselt lesen und je Welle suchen,
// damit der Hauptprozess ansprechbar bleibt und der Speicher nicht doch noch
// den ganzen Bereich traegt.
async function sucheDirekt(zustand, regex, wurzel, generation, { ankerRel, aktivRel, aktivText }) {
  const gesamt = { treffer: [], gruppen: [], abgeschnitten: false };
  const hatEditorStand = !!aktivRel && typeof aktivText === 'string';
  const nachPfad = new Map(zustand.dateien.map((d) => [d.rel, d]));
  const reihenfolge = dateiReihenfolge(
    zustand.dateien.map((d) => d.rel),
    ankerRel,
    hatEditorStand ? aktivRel : null,
  );

  for (let i = 0; i < reihenfolge.length; i += LESE_BREITE) {
    const welle = reihenfolge.slice(i, i + LESE_BREITE);
    // Die offene Datei wird nicht gelesen; ihr Editor-Stand liegt bereits vor.
    // 4T-0949: Dasselbe gilt fuer jedes andere offene Dokument ueber seinen
    // Puffer-Stand — auch hier oberhalb des Deckels, sonst haengt die Zusage
    // an der Groesse des Bereichs.
    const inhalte = await Promise.all(
      welle.map((rel) => {
        if (hatEditorStand && rel === aktivRel) return Promise.resolve(aktivText);
        const puffer = geschriebenerStand(wurzel, rel);
        if (puffer !== null) return Promise.resolve(puffer);
        const d = nachPfad.get(rel);
        return d ? fs.promises.readFile(d.abs, 'utf8').catch(() => null) : Promise.resolve(null);
      }),
    );
    if (generationen.get(wurzel) !== generation) return null;
    const eintraege = [];
    for (let k = 0; k < welle.length; k++) {
      if (!inhalte[k]) continue;
      // 4T-1293: Oberhalb des Deckels wird nur der NAME auf die Kopf-Datei
      // gezogen, nicht der Text zusammengesetzt (Begruendung in
      // area-search-teile.js). Der Treffer erscheint damit unter dem richtigen
      // Dokument und der Sprung oeffnet es; nur mehrere Teile bleiben mehrere
      // Gruppen.
      eintraege.push(eintrag(wurzel, kopfRelPfad(welle[k]), inhalte[k]));
    }
    const teil = sucheInTexten(eintraege, regex);
    gesamt.treffer.push(...teil.treffer);
    gesamt.gruppen.push(...teil.gruppen);
    if (teil.abgeschnitten) gesamt.abgeschnitten = true;
  }
  return gesamt;
}

// Fuehrt einen Suchlauf ueber den Bereich aus.
//
// wurzel     absoluter Pfad der Bereichs-Wurzel
// muster     Regex-Quelltext, im Renderer aus buildRegex erzeugt (eine
//            Auslegung von Gross-/Kleinschreibung und Regex-Modus, nicht zwei)
// flags      Flags desselben Ausdrucks
// aktiv      { pfad, text } der offenen Datei. Ihre Treffer entstehen aus dem
//            uebergebenen Editor-Stand statt aus dem Platten-Stand, der dort
//            veraltet sein kann. Die Zusammenfuehrung liegt hier und nicht im
//            Renderer, damit die Wurzel-Relativierung nur an einer Stelle lebt
// anker      Datei, die die Trefferliste ANFUEHRT. Sie steht fuer die Dauer
//            einer Such-Sitzung fest (die Datei, in der die Suche geoeffnet
//            wurde) und ist bewusst NICHT einfach die gerade offene: Sonst
//            sortierte sich die Liste bei jedem Sprung um, und der Zaehler
//            zaehlte faktisch nur innerhalb der angesprungenen Datei — nach
//            dem Sprung stuende deren erster Treffer wieder auf Position 1
// generation Lauf-Kennung des Renderers; sie kommt unveraendert zurueck,
//            damit eine ueberholte Antwort verworfen werden kann
async function sucheImBereich(wurzel, optionen = {}) {
  const leer = {
    treffer: [],
    gruppen: [],
    abgeschnitten: false,
    generation: optionen.generation || 0,
    vorratModus: 'leer',
  };
  if (!wurzel || typeof wurzel !== 'string') return leer;
  const muster = typeof optionen.muster === 'string' ? optionen.muster : '';
  if (!muster) return leer;

  let regex;
  try {
    regex = baueRegex(muster, optionen.flags);
  } catch {
    return leer;
  }

  const generation = optionen.generation || 0;
  generationen.set(wurzel, generation);

  // Nur Dateien INNERHALB des Bereichs bekommen ihre Sonderbehandlung. Ein
  // Reiter ausserhalb (lose Datei bei geoeffnetem Bereich) wuerde sonst als
  // fremde Gruppe in der Liste erscheinen.
  const imBereich = (rel) => !!rel && !rel.startsWith('..');
  const relOderNull = (p) => {
    const rel = typeof p === 'string' && p ? relPfad(p, wurzel) : null;
    return imBereich(rel) ? rel : null;
  };

  const aktiv = optionen.aktiv;
  const aktivRel = relOderNull(aktiv && aktiv.pfad);
  const aktivText = aktivRel && typeof aktiv.text === 'string' ? aktiv.text : null;
  // Ohne ausdruecklichen Anker fuehrt die offene Datei — das ist der erste
  // Lauf einer Such-Sitzung, bevor der Renderer seinen Anker gesetzt hat.
  const ankerRel = relOderNull(optionen.anker) || aktivRel;

  let zustand = vorraete.get(wurzel);
  if (!zustand) {
    zustand = await baueVorrat(wurzel, generation);
    if (!zustand) return { ...leer, generation, vorratModus: 'ueberholt' };
    vorraete.set(wurzel, zustand);
  }

  const opt = { ankerRel, aktivRel, aktivText };
  const ergebnis =
    zustand.modus === 'direkt'
      ? await sucheDirekt(zustand, regex, wurzel, generation, opt)
      : sucheInTexten(eintraegeAusVorrat(zustand, wurzel, opt), regex);
  if (!ergebnis) return { ...leer, generation, vorratModus: 'ueberholt' };

  return { ...ergebnis, generation, vorratModus: zustand.modus };
}

// Gibt den Vorrat frei (Suchleiste geschlossen, Bereich gewechselt, Fenster
// geschlossen). Der Cache bleibt bestehen, er ist der Zweck des naechsten
// Starts.
function gibBereichsVorratFrei(wurzel) {
  if (typeof wurzel === 'string' && wurzel) {
    vorraete.delete(wurzel);
    generationen.delete(wurzel);
    return;
  }
  vorraete.clear();
  generationen.clear();
}

module.exports = {
  konfiguriereBereichsSuche,
  sucheImBereich,
  gibBereichsVorratFrei,
  MAX_VORRAT_BYTES,
  // 4T-1293: Die Cache-Version lebt jetzt in area-search-cache.js und wird
  // hier weitergereicht, damit die bestehenden Aufrufer unveraendert bleiben.
  CACHE_SCHEMA_VERSION,
};
