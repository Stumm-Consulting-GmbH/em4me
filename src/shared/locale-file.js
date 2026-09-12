// 4T-001593 (Story 4S-000905, Epic 3E-000129): Prüfung einer eingespielten
// Sprachdatei und Ableitung ihrer Kennung.
//
// **Warum die Prüfung hier und nicht im IPC-Modul liegt:** Sie ist der
// sicherheits-tragende Teil des Einspiel-Weges und muss ohne Electron und ohne
// Datei-System prüfbar sein — Text hinein, Urteil heraus. Der Hauptprozess
// bleibt damit auf Dialog, Ablage und Verdrahtung beschränkt.
//
// **Was geprüft wird und warum genau das.** Eine eingespielte Sprachdatei ist
// die erste fremde Eingabe, aus der nutzersichtbarer Text der Anwendung wird.
// Gemessen am Bestand (2026-09-09) gelangt ein übersetzter Text NICHT als HTML
// in die laufende Oberfläche: `applyTranslations` setzt ausschliesslich
// textContent, title, placeholder und aria-label, und im gesamten
// Anzeige-Prozess gibt es keine Stelle, die einen übersetzten Text als HTML
// setzt. Der wirksame Weg ist ein anderer: Die Katalog-Schlüssel
// (help.feature.*, help.shortcut.*) gehen in die GENERIERTEN Handbuch-Seiten
// als Markdown-Tabellenzellen, dort maskiert `escapeTableCell` nur `|` und den
// Zeilenumbruch, und die Seite läuft anschliessend durch die Markdown-Pipeline.
// Rohes HTML ist dort abgeschaltet (`html: false`), Markdown-Konstrukte wirken.
//
// **Daraus folgt die Auszeichnungs-Regel** (Entscheidung des Product Owners vom
// 2026-09-09): Ein eingespielter Wert darf genau die Konstrukt-ARTEN führen,
// die die englische Fassung an DEMSELBEN Schlüssel führt. Nicht die Anzahl —
// eine Übersetzung darf zwei Code-Spans haben, wo das Original einen hat —,
// sondern die Art. Verworfen wurde das pauschale Maskieren: Die mitgelieferten
// Fassungen führen selbst Auszeichnung (gemessen am 2026-09-09: 102 Code-Spans,
// 6 Links, 2 Bilder, 2 Fettungen; die frühere Angabe von 8 Links zählte die
// beiden Bilder mit, weil ihr Muster die Bild-Syntax nicht ausnahm), und eine Übersetzung, die sie nicht führen darf, wäre
// schlechter als ihr Original.
'use strict';

// --- Metadaten der Sprachdatei (4T-001593, Korrektur vom 2026-09-09) --------
//
// **Die Sprache benennt sich in der Datei, nicht im Datei-Namen** (Anordnung
// des Product Owners vom 2026-09-09). Die erste Fassung leitete die Kennung
// aus dem Datei-Namen ab; das ist gegenüber jedem etablierten Format eine
// Abweichung und obendrein fehlerträchtig — ein Datei-Name ändert sich beim
// Kopieren, beim Herunterladen («…(1).json»), beim Umbenennen und beim
// Verschieben zwischen Systemen, und mit ihm die Identität der Sprache.
//
// Die verbreiteten Katalog-Formate lösen das übereinstimmend über Metadaten
// IN der Datei: gettext trägt die Sprache im Kopf-Eintrag, das Application
// Resource Bundle in `@@locale`, die Katalog-Formate der Browser-Erweiterungen
// in eigenen Feldern. Übernommen ist die ARB-Schreibweise mit doppeltem `@`,
// weil sie im selben flachen Objekt lebt und sich damit von jedem
// Übersetzungs-Schlüssel unterscheidet, ohne das Format zu verlassen.
//
// Die beiden Felder stehen in der Vorlage bereits als leere Einträge ganz
// oben: Der Übersetzer findet sie an erster Stelle, statt sie erfinden zu
// müssen.
const META_LOCALE = '@@locale';
const META_NAME = '@@name';
const META_SCHLUESSEL = [META_LOCALE, META_NAME];

// Sprach-Code nach dem Muster von BCP 47: zwei oder drei Buchstaben, optional
// ein Schrift- oder Regions-Zusatz. Bewusst keine Liste gültiger Codes — wer
// eine Sprache übersetzt, die keine Norm kennt, soll sie trotzdem benennen
// können; geprüft wird die Form, nicht die Existenz.
const LOCALE_MUSTER = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;

// Obergrenze des Anzeige-Namens: Er steht in der Sprach-Auswahl, und ein
// überlanger Name spränge dort aus der Zeile.
const MAX_NAME_LAENGE = 40;

// Platzhalter-Muster wie in scripts/check-i18n.js — dieselbe Regel, mit der die
// mitgelieferten Fassungen gemessen werden.
const PLATZHALTER = /\{([a-zA-Z0-9_]+)\}/g;

// Obergrenze der Datei. Die mitgelieferten Fassungen liegen bei 250 bis 290 KB;
// 4 MB lassen den fünfzehnfachen Spielraum für ausführliche Übersetzungen und
// weisen zugleich ab, was als Sprachdatei nicht mehr gemeint sein kann.
const MAX_BYTES = 4 * 1024 * 1024;

// Konstrukt-Arten, die in einer Tabellenzelle der generierten Handbuch-Seite
// wirken. Die Reihenfolge ist die Prüf-Reihenfolge; Bild vor Link, weil ein
// Bild syntaktisch einen Link enthält.
const KONSTRUKTE = [
  { art: 'bild', muster: /!\[[^\]]*\]\([^)]*\)/ },
  { art: 'link', muster: /(?<!!)\[[^\]]+\]\([^)]*\)/ },
  { art: 'wikiLink', muster: /\[\[[^\]]+\]\]/ },
  { art: 'code', muster: /`[^`]+`/ },
  { art: 'fett', muster: /\*\*[^*]+\*\*/ },
  { art: 'kursiv', muster: /(^|[^*\w])[*_][^*_\n]+[*_]([^*\w]|$)/ },
  { art: 'html', muster: /<[a-zA-Z/][^>]*>/ },
  { art: 'ueberschrift', muster: /^#{1,6}\s/ },
  { art: 'liste', muster: /^\s*([-*+]|\d+\.)\s/ },
];

// Erlaubte Schemata eines Link- oder Bild-Ziels. Alles andere wird abgewiesen,
// auch wenn die englische Fassung an dieser Stelle einen Link führt: Die
// Erlaubnis gilt der ART des Konstrukts, nie einem beliebigen Ziel. `javascript:`
// ist der Fall, um den es geht; relative Pfade und Anker bleiben zulässig, weil
// die Katalog-Texte auf Handbuch-Seiten verweisen.
const ERLAUBTE_SCHEMATA = ['http:', 'https:', 'mailto:'];

/** Menge der Platzhalter-Namen eines Wertes. */
function platzhalterVon(wert) {
  const found = new Set();
  for (const m of String(wert).matchAll(PLATZHALTER)) found.add(m[1]);
  return found;
}

/** Menge der Konstrukt-Arten eines Wertes. */
function konstrukteVon(wert) {
  const text = String(wert);
  const arten = new Set();
  for (const { art, muster } of KONSTRUKTE) {
    if (muster.test(text)) arten.add(art);
  }
  return arten;
}

/** Ziele aller Links und Bilder eines Wertes. */
function zieleVon(wert) {
  const ziele = [];
  for (const m of String(wert).matchAll(/!?\[[^\]]*\]\(([^)]*)\)/g)) ziele.push(m[1].trim());
  return ziele;
}

/**
 * Ist ein Link-Ziel zulässig? Erlaubt sind die drei Schemata oben sowie Ziele
 * ohne Schema (relative Pfade, Anker) — genau das, was die mitgelieferten
 * Katalog-Texte verwenden.
 */
function zielErlaubt(ziel) {
  const wert = String(ziel).trim();
  if (wert === '') return false;
  // Ein Schema erkennt man am Doppelpunkt vor dem ersten Schrägstrich; ein
  // Windows-Pfad wie C:\… faellt bewusst ebenfalls darunter und ist unerlaubt.
  const schema = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(wert);
  if (!schema) return true;
  return ERLAUBTE_SCHEMATA.includes(schema[1].toLowerCase() + ':');
}

/**
 * Liest die Kennung einer eingespielten Sprache aus ihren Metadaten.
 *
 * Der Datei-Name spielt keine Rolle: Er kann sich beim Kopieren, Herunterladen
 * oder Verschieben ändern, ohne dass die Sprache eine andere würde. Was zählt,
 * steht in der Datei — `@@locale` als Code und `@@name` als Anzeige-Name in
 * der eigenen Sprache (Anordnung des Product Owners vom 2026-09-09).
 *
 * @param {object} daten Geparste Sprachdatei.
 * @param {string[]} mitgelieferteCodes Codes der mitgelieferten Sprachen.
 * @returns {{ok: true, id: string, code: string, name: string}|{ok: false, error: string, detail?: string}}
 */
function kennungAusMetadaten(daten, mitgelieferteCodes = []) {
  const code = typeof daten?.[META_LOCALE] === 'string' ? daten[META_LOCALE].trim() : '';
  const name = typeof daten?.[META_NAME] === 'string' ? daten[META_NAME].trim() : '';

  // Beide Felder stehen als leere Einträge in der Vorlage; leer heisst also
  // «noch nicht ausgefüllt» und bekommt eine Meldung, die genau das sagt.
  if (!code) return { ok: false, error: 'locale-fehlt' };
  if (!LOCALE_MUSTER.test(code)) return { ok: false, error: 'locale-ungueltig', detail: code };
  if (!name) return { ok: false, error: 'name-fehlt' };
  if (name.length > MAX_NAME_LAENGE) return { ok: false, error: 'name-zu-lang' };

  // Ein mitgelieferter Code ist belegt. Die eigene Sprache TRITT NEBEN die
  // mitgelieferten, sie ersetzt keine: Sonst hinge das Verhalten der
  // Anwendung davon ab, welche Datei zuletzt eingespielt wurde, und ein
  // Zurück gäbe es nur über das Datei-System.
  if (mitgelieferteCodes.includes(code.toLowerCase())) {
    return { ok: false, error: 'locale-belegt', detail: code };
  }

  return { ok: true, id: `custom:${code}`, code, name };
}

/** Ist der Schlüssel ein Metadaten-Feld und damit keine Übersetzung? */
function istMetaSchluessel(schluessel) {
  return META_SCHLUESSEL.includes(schluessel);
}

/**
 * Prüft eine eingespielte Sprachdatei gegen die englische Fassung.
 *
 * Die Prüfung bricht beim ERSTEN Verstoß ab und meldet ihn mit Art und
 * betroffenem Schlüssel: Eine Liste aller Verstöße wäre für den Anwender kein
 * besserer Bericht, sondern eine Wand — und der stille Teil-Import ist ohnehin
 * ausgeschlossen (Zug-Entscheidung Z3).
 *
 * @param {string} text Roher Datei-Inhalt.
 * @param {Record<string, string>} referenz Englische Fassung als Bezugsgröße.
 * @param {string[]} mitgelieferteCodes Codes der mitgelieferten Sprachen.
 * @returns {{ok: true, id: string, code: string, name: string, werte: object, uebersprungen: string[]}|{ok: false, error: string, schluessel?: string, detail?: string}}
 */
function pruefeSprachdatei(text, referenz, mitgelieferteCodes = []) {
  // 1. Größe. Vor dem Parsen, weil das Parsen einer absurd großen Datei die
  //    Kosten des Angriffs bereits trägt.
  const bytes = Buffer.byteLength(String(text), 'utf8');
  if (bytes > MAX_BYTES) return { ok: false, error: 'zu-gross', detail: String(bytes) };

  // 2. Aufbau: gültiges JSON, ein einziges flaches Objekt.
  let daten;
  try {
    daten = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: 'kein-json', detail: String(err && err.message) };
  }
  if (daten === null || typeof daten !== 'object' || Array.isArray(daten)) {
    return { ok: false, error: 'kein-objekt' };
  }

  // 3. Metadaten: Die Sprache benennt sich selbst. Vor allem Übrigen geprüft,
  //    weil eine Datei ohne Identität keine Sprachdatei ist — und weil der
  //    Anwender dann eine Meldung bekommt, die ihm sagt, was oben in seiner
  //    Datei fehlt, statt einer über den ersten unpassenden Eintrag.
  const kennung = kennungAusMetadaten(daten, mitgelieferteCodes);
  if (!kennung.ok) return kennung;

  const werte = {};
  const uebersprungen = [];

  for (const [schluessel, wert] of Object.entries(daten)) {
    // Metadaten sind keine Übersetzung: Sie wandern weder in die Werte noch
    // in die Liste der unbekannten Schlüssel.
    if (istMetaSchluessel(schluessel)) continue;

    // 4. Wert-Typ: ausnahmslos Zeichenketten, nach derselben Regel, die
    //    check-i18n.js für die mitgelieferten Fassungen durchsetzt.
    if (typeof wert !== 'string') {
      return { ok: false, error: 'wert-kein-text', schluessel };
    }

    // 5. Schlüssel-Bestand: Unbekanntes wird übersprungen und gemeldet, nicht
    //    stillschweigend übernommen (Z3). Fehlende Schlüssel sind kein
    //    Verstoß — sie sind der Regelfall und Gegenstand des Rückfalls.
    if (!Object.prototype.hasOwnProperty.call(referenz, schluessel)) {
      uebersprungen.push(schluessel);
      continue;
    }

    const original = String(referenz[schluessel]);

    // 5. Platzhalter: dieselbe Menge wie die englische Fassung. Ein fehlender
    //    Platzhalter verschluckt eine Zahl, ein erfundener bleibt als roher
    //    Text stehen — beides sieht der Übersetzer nicht, der Anwender schon.
    const soll = platzhalterVon(original);
    const ist = platzhalterVon(wert);
    if (soll.size !== ist.size || [...soll].some((p) => !ist.has(p))) {
      return { ok: false, error: 'platzhalter', schluessel };
    }

    // 6. Auszeichnungen: nur die Arten, die das Original an dieser Stelle führt.
    const erlaubt = konstrukteVon(original);
    const gefunden = konstrukteVon(wert);
    const zuviel = [...gefunden].filter((a) => !erlaubt.has(a));
    if (zuviel.length > 0) {
      return { ok: false, error: 'auszeichnung', schluessel, detail: zuviel.join(', ') };
    }

    // 7. Link-Ziele: die Erlaubnis gilt der Art des Konstrukts, nie einem
    //    beliebigen Ziel. Auch wo das Original einen Link führt, bleibt
    //    `javascript:` ausgeschlossen.
    for (const ziel of zieleVon(wert)) {
      if (!zielErlaubt(ziel)) {
        return { ok: false, error: 'link-ziel', schluessel, detail: ziel.slice(0, 60) };
      }
    }

    werte[schluessel] = wert;
  }

  // Eine Datei ohne einen einzigen bekannten Schlüssel ist keine Sprachdatei,
  // sondern ein Irrtum des Anwenders — sie anzunehmen ergäbe eine Sprache, die
  // vollständig auf Englisch zurückfällt.
  if (Object.keys(werte).length === 0) return { ok: false, error: 'keine-bekannten-schluessel' };

  return { ok: true, id: kennung.id, code: kennung.code, name: kennung.name, werte, uebersprungen };
}

/**
 * Baut den Text der Sprach-Vorlage: die beiden Metadaten-Felder als leere
 * Einträge ganz oben, danach der Katalog der Ausgangssprache.
 *
 * Die Felder stehen **leer** und nicht mit Beispiel-Werten in der Vorlage: Ein
 * vorbelegter Wert würde stehen bleiben, und dann hiesse jede eingespielte
 * Sprache gleich. Leer ist unmissverständlich «hier gehört etwas hin», und die
 * Prüfung sagt es noch einmal, falls es jemand übersieht.
 *
 * @param {Record<string, string>} dict Katalog der Ausgangssprache.
 * @returns {string} JSON-Text der Vorlage.
 */
function buildLocaleTemplate(dict) {
  return schreibeSprachdatei('', '', dict);
}

/**
 * Schreibt eine Sprachdatei: Metadaten voran, danach die Werte.
 *
 * Dieselbe Funktion für die ausgegebene Vorlage und für die abgelegte eigene
 * Sprache — beide sind dieselbe Art Datei, und wer die abgelegte im
 * Benutzerprofil ansieht, erkennt die Sprache daran ohne Umweg über den
 * Datei-Namen.
 *
 * @param {string} code Sprach-Code für `@@locale`.
 * @param {string} name Anzeige-Name für `@@name`.
 * @param {Record<string, string>} werte Übersetzungen.
 * @returns {string} JSON-Text.
 */
function schreibeSprachdatei(code, name, werte) {
  return JSON.stringify({ [META_LOCALE]: code, [META_NAME]: name, ...werte }, null, 2) + '\n';
}

module.exports = {
  pruefeSprachdatei,
  kennungAusMetadaten,
  istMetaSchluessel,
  buildLocaleTemplate,
  schreibeSprachdatei,
  konstrukteVon,
  platzhalterVon,
  zielErlaubt,
  META_LOCALE,
  META_NAME,
  META_SCHLUESSEL,
  MAX_NAME_LAENGE,
  MAX_BYTES,
  ERLAUBTE_SCHEMATA,
};
