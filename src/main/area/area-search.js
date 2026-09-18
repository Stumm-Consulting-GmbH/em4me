// 4T-000615 (Epic 3E-000116): Bereichs-Suchraum im Hauptprozess.
//
// Die Suche der Anwendung kennt seit 3E-000142 einen Raum jenseits des aktiven
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
const { sucheInTexten } = require('../../shared/search-scope.js');
// 4T-001293 (Epic 3E-000224): Volltext-Cache und Zusammenfuehrung geteilter
// Dokumente liegen in eigenen Modulen; hier bleibt die Suche selbst.
const { konfiguriereCache, CACHE_SCHEMA_VERSION } = require('./area-search-cache.js');
const { kopfRelPfad } = require('./area-search-teile.js');
// 4T-001260 (Epic 3E-000272): Dateien oberhalb der Einzelgrenze bleiben aus dem
// Vorrat und werden je Lauf gelesen; die Fachlichkeit steht daneben.
const { lieseGrosseDateien } = require('./area-search-gross.js');
// 4T-001609 (Epic 3E-000252): Scan, Deckel und Vorrats-Aufbau liegen daneben;
// hier bleibt der Suchlauf selbst.
const { LESE_BREITE, MAX_VORRAT_BYTES, relPfad, baueVorrat } = require('./area-search-vorrat.js');
// 4T-001609 (Epic 3E-000252): Der Datensatz-Block einer Datenbank-Tabelle gehoert
// nicht in den Suchraum (E16.2). Die Bereinigung steht daneben und wird HIER an
// allen vier Wegen aufgerufen, auf denen Text in die Suche gelangt.
const {
  bereinigeSuchtext,
  bereinigeTextMap,
  mitDateiOffset,
} = require('./area-search-datensaetze.js');

// Vorraete je Bereichs-Wurzel: wurzel -> {
//   dateien: Map<relPfad, { text, mtimeMs, size }>, bytes, modus
// }
const vorraete = new Map();

// Juengste Generation je Wurzel. Ein Aufbau, der zwischen zwei Haeppchen
// feststellt, dass eine neuere Anfrage laeuft, bricht ab.
const generationen = new Map();

// 4T-001293: Der Volltext-Cache liegt in area-search-cache.js; hier bleibt nur
// die Durchreiche der Konfiguration.
// 4T-001609: Der Speicher-Deckel ist eine Politik-Zahl und keine Naturkonstante;
// er kommt hier herein wie das Cache-Verzeichnis. Ohne Angabe gilt der
// Betriebswert aus area-search-vorrat.js.
let deckel = null;

function konfiguriereBereichsSuche(optionen) {
  konfiguriereCache(optionen);
  deckel = optionen && typeof optionen.maxVorratBytes === 'number' ? optionen.maxVorratBytes : null;
}

// Anzeige-Titel einer Datei: der wurzel-relative Pfad ohne Endung. Der reine
// Dateiname waere kuerzer, aber in einem Bereich mit gleichnamigen Dateien in
// verschiedenen Ordnern nicht unterscheidbar — und genau das ist der Fall,
// den eine bereichsweite Suche erzeugt.
function anzeigeTitel(rel) {
  return rel.replace(/\.[^./]+$/, '');
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

// 4T-000949 (Befund E-02, Story 4S-000787): Der geschriebene Stand eines offenen
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
function eintraegeAusVorrat(
  vorrat,
  wurzel,
  { ankerRel, aktivRel, aktivText },
  grosseTexte,
  karten,
) {
  const hatEditorStand = !!aktivRel && typeof aktivText === 'string';
  const eintraege = [];
  // 4T-001260: Die Riesen stehen in derselben Reihenfolge-Berechnung wie der
  // Vorrat, damit Anker und offene Datei auch dann vorn stehen, wenn sie gross
  // sind — die Reihenfolge ist die der Trefferliste.
  const alleRel =
    grosseTexte && grosseTexte.size > 0
      ? [...vorrat.reihenfolge, ...grosseTexte.keys()]
      : vorrat.reihenfolge;
  for (const rel of dateiReihenfolge(alleRel, ankerRel, hatEditorStand ? aktivRel : null)) {
    // Die offene Datei steuert ihren Editor-Stand bei; der Platten-Stand
    // derselben Datei bleibt damit aussen vor.
    // '??' statt '||': Ein geleerter Puffer ist ein gueltiger Stand.
    // 4T-001609: Der Puffer-Stand ist der VIERTE Weg und der einzige, der nicht
    // ueber den Vorrat laeuft; ohne die Bereinigung hier waere eine Tabelle
    // durchsuchbar, solange sie geoeffnet ist.
    const roh = hatEditorStand && rel === aktivRel ? aktivText : geschriebenerStand(wurzel, rel);
    let text;
    if (roh !== null && roh !== undefined) {
      const b = bereinigeSuchtext(roh);
      text = b ? b.text : roh;
      if (b && karten) karten.set(rel, b.karte);
    } else {
      const imVorrat = vorrat.texte.get(rel) || {};
      text = (grosseTexte && grosseTexte.get(rel)) ?? imVorrat.text;
      // Die Karte des Vorrats gilt nur fuer seinen eigenen Text; eine grosse
      // Datei bringt ihre eigene mit (bereinigeTextMap oben).
      if (imVorrat.bereinigt === true && imVorrat.karte && karten && !karten.has(rel)) {
        karten.set(rel, imVorrat.karte);
      }
    }
    if (!text) continue;
    eintraege.push(eintrag(wurzel, rel, text));
  }
  return eintraege;
}

// Direkt-Weg oberhalb des Deckels: gedrosselt lesen und je Welle suchen,
// damit der Hauptprozess ansprechbar bleibt und der Speicher nicht doch noch
// den ganzen Bereich traegt.
async function sucheDirekt(
  zustand,
  regex,
  wurzel,
  generation,
  { ankerRel, aktivRel, aktivText },
  karten,
) {
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
    // 4T-000949: Dasselbe gilt fuer jedes andere offene Dokument ueber seinen
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
      // 4T-001293: Oberhalb des Deckels wird nur der NAME auf die Kopf-Datei
      // gezogen, nicht der Text zusammengesetzt (Begruendung in
      // area-search-teile.js). Der Treffer erscheint damit unter dem richtigen
      // Dokument und der Sprung oeffnet es; nur mehrere Teile bleiben mehrere
      // Gruppen.
      // 4T-001609: Zweiter Weg. Oberhalb des Deckels wird je Lauf gelesen, also
      // auch je Lauf bereinigt; die Datei verhaelt sich damit unabhaengig von
      // der Betriebsart gleich.
      const gruppe = kopfRelPfad(welle[k]);
      const b = bereinigeSuchtext(inhalte[k]);
      if (b) karten.set(gruppe, b.karte);
      eintraege.push(eintrag(wurzel, gruppe, b ? b.text : inhalte[k]));
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
    zustand = await baueVorrat(wurzel, () => generationen.get(wurzel) !== generation, {
      deckel,
    });
    if (!zustand) return { ...leer, generation, vorratModus: 'ueberholt' };
    vorraete.set(wurzel, zustand);
  }

  const opt = { ankerRel, aktivRel, aktivText };
  // 4T-001609/4T-001671: Gruppen, deren Text ohne seinen Datensatz-Block
  // durchsucht wurde, mit der Karte, die ihren Offset in die Datei zurueckholt.
  const karten = new Map();
  // 4T-001260: Im Vorrats-Modus kommen die Dateien oberhalb der Einzelgrenze je
  // Lauf von der Platte dazu. Der Regelfall ist ein Bereich ganz ohne solche
  // Dateien; er kostet nichts, weil die Liste dann leer ist.
  // 4T-001609: Dritter Weg — sie werden je Lauf gelesen und deshalb je Lauf
  // bereinigt.
  const grosseTexte = bereinigeTextMap(
    zustand.modus === 'direkt'
      ? null
      : await lieseGrosseDateien(zustand.grosse, {
          leseBreite: LESE_BREITE,
          pufferStand: (rel) => geschriebenerStand(wurzel, rel),
          aktivRel: opt.aktivRel,
          aktivText: opt.aktivText,
        }),
    karten,
    kopfRelPfad,
  );
  if (generationen.get(wurzel) !== generation)
    return { ...leer, generation, vorratModus: 'ueberholt' };
  const ergebnis =
    zustand.modus === 'direkt'
      ? await sucheDirekt(zustand, regex, wurzel, generation, opt, karten)
      : sucheInTexten(eintraegeAusVorrat(zustand, wurzel, opt, grosseTexte, karten), regex);
  if (!ergebnis) return { ...leer, generation, vorratModus: 'ueberholt' };

  return {
    ...ergebnis,
    treffer: mitDateiOffset(ergebnis.treffer, karten),
    generation,
    vorratModus: zustand.modus,
  };
}

/**
 * Die Texte des Bereichs, so wie der Suchlauf sie sieht (4T-001531).
 *
 * **Warum die Tag-Umbenennung hier andockt und nicht selbst liest:** Ein Offset
 * gilt nur in dem Text, in dem er ermittelt wurde, und die Schreib-Strecke
 * misst genau dagegen (`suchStandFuer`). Wer den Bereich ein zweites Mal von
 * der Platte liest, ermittelt seine Fundstellen auf einem Text, den niemand
 * sonst kennt — und jede Datei mit einem offenen, ungespeicherten Reiter
 * bekaeme Offsets, die im Puffer nicht gelten. Deshalb dieselbe Quelle,
 * dieselbe Rangfolge, derselbe Vorrat.
 *
 * Oberhalb des Vorrats-Deckels gibt es nichts zu liefern: Der Direkt-Weg haelt
 * keinen Text fest, und `suchStandFuer` wiese den Lauf danach ohnehin ab. Der
 * Modus reist deshalb mit, statt dass eine leere Liste «nichts gefunden»
 * vortaeuscht.
 *
 * @param {string} wurzel Absoluter Pfad der Bereichs-Wurzel.
 * @param {object} optionen `aktiv` wie beim Suchlauf: Pfad und Editor-Stand
 *   der offenen Datei.
 * **Jeder Eintrag traegt seine Ruecknahme-Karte** (4T-001671), sofern sein Text
 * bereinigt wurde. Wer auf diesen Texten Offsets bildet, rechnet sie damit in
 * die Datei zurueck; ohne sie zeigten sie in einen Text, den keine Datei so
 * enthaelt. Die Eigenschaft reist am Eintrag und nicht in einer Nebenmenge,
 * damit sie ein Aufrufer nicht uebersehen kann.
 *
 * @param {string} wurzel Absoluter Pfad der Bereichs-Wurzel.
 * @param {object} optionen `aktiv` wie beim Suchlauf: Pfad und Editor-Stand
 *   der offenen Datei.
 * @returns {Promise<{modus: string, eintraege: Array<{gruppe, titel, text, kennung, karte}>}>}
 */
async function bereichsTexte(wurzel, optionen = {}) {
  if (!wurzel || typeof wurzel !== 'string') return { modus: 'leer', eintraege: [] };

  // Die Generation eines laufenden Suchlaufs bleibt unangetastet: Dieser Weg
  // entwertet keine Anfrage, er liest nur mit.
  const generation = generationen.has(wurzel) ? generationen.get(wurzel) : 0;
  let zustand = vorraete.get(wurzel);
  if (!zustand) {
    generationen.set(wurzel, generation);
    // Dieselbe Abbruch-Frage und derselbe Deckel wie beim Suchlauf: Der Vorrat
    // gehoert beiden Wegen gemeinsam, und ein zweiter Deckel waere eine zweite
    // Wahrheit ueber denselben Speicher.
    zustand = await baueVorrat(wurzel, () => generationen.get(wurzel) !== generation, {
      deckel,
    });
    if (!zustand) return { modus: 'ueberholt', eintraege: [] };
    vorraete.set(wurzel, zustand);
  }
  if (zustand.modus !== 'vorrat') return { modus: zustand.modus, eintraege: [] };

  const imBereich = (rel) => !!rel && !rel.startsWith('..');
  const aktiv = optionen.aktiv;
  const aktivRelRoh =
    aktiv && typeof aktiv.pfad === 'string' && aktiv.pfad ? relPfad(aktiv.pfad, wurzel) : null;
  const aktivRel = imBereich(aktivRelRoh) ? aktivRelRoh : null;
  const aktivText = aktivRel && typeof aktiv.text === 'string' ? aktiv.text : null;
  const opt = { ankerRel: null, aktivRel, aktivText };

  const karten = new Map();
  const grosseTexte = bereinigeTextMap(
    await lieseGrosseDateien(zustand.grosse, {
      leseBreite: LESE_BREITE,
      pufferStand: (rel) => geschriebenerStand(wurzel, rel),
      aktivRel,
      aktivText,
    }),
    karten,
    kopfRelPfad,
  );
  const eintraege = eintraegeAusVorrat(zustand, wurzel, opt, grosseTexte, karten).map((e) =>
    karten.has(e.gruppe) ? { ...e, karte: karten.get(e.gruppe) } : e,
  );
  return { modus: zustand.modus, eintraege };
}

// 4T-001524 (Epic 3E-000169): Der Stand, auf dem ein Treffer gefunden wurde.
//
// Ein Offset gilt nur in dem Text, in dem die Suche ihn ermittelt hat; dieser
// folgt DERSELBEN Rangfolge wie oben (Puffer vor Platten-Stand). null heisst
// «kein Bezugs-Stand» — dann wird bewusst nicht geschrieben (area-replace.js).
//
// 4T-001671: Die Auskunft nennt ihre EBENE. Der Puffer-Stand ist der rohe Text
// der offenen Datei, der Vorrats-Stand dagegen ein BEREINIGTER, wenn die Datei
// einen Datensatz-Block traegt — er ist mit keiner Datei zeichengleich, und ein
// Vergleich gegen die Platte muesste ohne diese Angabe zwangslaeufig scheitern.
// Die Karte kommt mit, damit die Schreib-Strecke dieselbe Rechnung nachvollzieht,
// mit der die Offsets entstanden sind.
function suchStandFuer(wurzel, rel) {
  const zustand = vorraete.get(wurzel);
  if (!zustand || zustand.modus !== 'vorrat') return null;
  const puffer = geschriebenerStand(wurzel, rel);
  if (puffer !== null) return { text: puffer, quelle: 'puffer', ebene: 'roh', karte: null };
  const vorratsEintrag = zustand.texte.get(rel);
  if (!vorratsEintrag) return null;
  return {
    text: vorratsEintrag.text,
    quelle: 'vorrat',
    ebene: vorratsEintrag.bereinigt === true ? 'bereinigt' : 'roh',
    karte: vorratsEintrag.karte || null,
  };
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
  // 4T-001531 (Epic 3E-000175): dieselben Texte fuer einen zweiten Leser.
  bereichsTexte,
  suchStandFuer,
  gibBereichsVorratFrei,
  MAX_VORRAT_BYTES,
  // 4T-001293: Die Cache-Version lebt jetzt in area-search-cache.js und wird
  // hier weitergereicht, damit die bestehenden Aufrufer unveraendert bleiben.
  CACHE_SCHEMA_VERSION,
};
