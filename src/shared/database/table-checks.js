// 4T-001930 (Epic 3E-000256, E22): Die Prüfregeln einer Tabellen-Definition —
// Feld-Regeln am Definitions-Eintrag (`check`) und Datensatz-Regeln auf der
// oberen Ebene des Behälters (`checks`), gelesen und normalisiert. Seit
// 4T-001932 (E22.7) auch die Bearbeitbarkeits-Bedingung (`editable`) am
// Behälter, mit derselben Normalisierung wie eine Datensatz-Regel.
//
// **Warum es die Regel gibt.** Die Datenbank vergibt keine Typen für Formate;
// eine E-Mail-Adresse ist ein Text wie jeder andere. Was sonst ein Typ getragen
// hätte, trägt deshalb die Prüfregel, und sie steht in der Definition, an der
// einen Stelle, an der auch alles andere über ein Feld steht. Stünde sie in den
// Masken, wäre sie über jeden anderen Eingangs-Weg zu umgehen.
//
// **Die drei Auflagen aus E22 tragen dieses Modul:**
//
//   1. Keine dritte Ausdrucks-Sprache. Ein Ausdruck ist einer der
//      Abfrage-Sprache und läuft durch deren Parser und deren Funktions-Katalog;
//      der reguläre Ausdruck ist der einzige zweite Weg, weil Formate ohne ihn
//      nicht beschreibbar sind.
//   2. Benannte Regeln von Anfang an. Der Katalog `REGEL_NAMEN` ist heute leer,
//      die Form ist aber gelesen: Ein Name, den die Anwendung (noch) nicht
//      kennt, wird gemeldet und nicht als Ausdruck missdeutet.
//   3. Der Ort folgt der Reichweite. Was EINEN Wert prüft, steht am Feld und
//      spricht ihn als `value` an; was mehrere Felder eines Datensatzes
//      zusammen prüft, steht am Behälter und spricht sie mit ihren Namen an.
//
// **Die Schreibweise ist die entschiedene** (Product Owner, 2026-09-24): ein
// Text als Kurzform, ein Objekt `{ rule, message }` mit Meldung, am Feld auch
// eine Liste beider. Die Kurzform ist die gewohnte Form des Hauses, wie bei
// `label` als Text oder Sprach-Zuordnung; ohne sie kostete der häufigste Fall,
// eine Regel ohne Meldung, zwei Zeilen statt einer.
//
// **Weiche Linie wie im ganzen Definitions-Modul:** Jede unbrauchbare Regel
// entfällt einzeln mit einem Hinweis; die übrigen Regeln, das Feld und die
// Tabelle bleiben wirksam. Eine unbrauchbare Meldung lässt allein die Meldung
// entfallen, die Regel prüft weiter, dann mit dem allgemeinen Satz.
//
// **Hier wird gelesen, nicht geprüft.** Ob ein Wert eine Regel erfüllt, ist
// Sache der Schreib-Schnittstelle; dieses Modul liefert ihr die Regeln fertig
// übersetzt (RegExp, Syntaxbaum), damit keine Stelle den Text ein zweites Mal
// deuten muss und zwei Deutungen nicht auseinanderlaufen können.
//
// Blatt-Modul innerhalb der Datenbank wie `table-columns.js`: Es lädt
// `table-definition.js` nicht (die Richtung ist umgekehrt) und liefert Hinweise
// als `{ code, name?, expected? }`; den Hinweis in der Gestalt des Katalogs baut
// die Definition, weil nur sie die Stelle in der Definitions-Liste kennt.
//
// Prozess-neutral (kein Electron, kein Dateizugriff, kein DOM).
'use strict';

const { parseExpression, collectFieldRefs } = require('../query/perspective-query.js');
const { validateQuery } = require('../query/query-functions.js');
const { istEinfachesObjekt, alsText, normalisiereBeschriftung } = require('./beschriftung.js');

// Schlüssel am Definitions-Eintrag und am Behälter. Zwei Namen für zwei
// Reichweiten: Ein Autor, der am Feld `check` schreibt, meint diesen einen Wert,
// und die Einzahl sagt es ihm.
const DB_CHECK_KEY = 'check';
const DB_CHECKS_KEY = 'checks';
// 4T-001932 (E22.7): die Bearbeitbarkeits-Bedingung am Behälter.
const DB_EDITABLE_KEY = 'editable';

// Der eigene Wert heißt in einer Feld-Regel `value`, und nur er: Eine
// Feld-Regel, die ein anderes Feld anspricht, gehört als Datensatz-Regel an den
// Behälter, weil sie mehr als einen Wert prüft.
const WERT_BEZUG = 'value';

// Der Katalog der mitgelieferten Regeln. Heute leer (E22, zweite Auflage: die
// Form von Anfang an, der Inhalt mit dem ersten Bedarf). Eingefroren, damit
// kein Aufrufer ihn zur Laufzeit erweitert und damit an der Definition vorbei
// Regeln erfindet.
const REGEL_NAMEN = Object.freeze([]);

// --- Die Formen einer Regel ----------------------------------------------------------

// Ein regulärer Ausdruck steht zwischen Schrägstrichen, dahinter optional die
// Flags. Gierig bis zum LETZTEN Schrägstrich, damit ein Schrägstrich im Muster
// keine Maskierung braucht (`/^\d+/\d+$/`).
const REGEX_FORM = /^\/([\s\S]+)\/([A-Za-z]*)$/;

// Die Flags `g` und `y` machen einen regulären Ausdruck zustandsbehaftet: Er
// merkt sich zwischen zwei Prüfungen die Stelle, an der er aufgehört hat, und
// dieselbe Regel lieferte für denselben Wert abwechselnd zwei Ergebnisse. Für
// eine Prüfung, ob ein Wert passt, tragen sie nichts bei; sie werden
// abgewiesen, statt die Falle an die Schreib-Schnittstelle weiterzureichen.
const ZUSTANDS_FLAGS = /[gy]/;

// Ein Regel-Name ist ein einzelnes Wort: Buchstaben, Ziffern, Unterstrich und
// Bindestrich, beginnend mit einem Buchstaben oder Unterstrich. Kein Operator,
// kein Leerzeichen, kein Punkt (ein Punkt wäre ein Bezug wie `file.name`).
const NAMENS_FORM = /^[\p{L}_][\p{L}\p{N}_-]*$/u;

// Welche Form trägt ein Regel-Text? Die Reihenfolge ist die Entscheidung:
//
//   - Ein Text, der mit einem Schrägstrich beginnt, ist als regulärer Ausdruck
//     gemeint, auch wenn er die Form verfehlt. Ein Ausdruck der Abfrage-Sprache
//     kann nicht mit einem Schrägstrich beginnen; der Hinweis «kein gültiger
//     regulärer Ausdruck» führt den Autor deshalb an die richtige Stelle, der
//     Hinweis «kein gültiger Ausdruck» nicht.
//   - Ein einzelnes Wort ist ein Regel-Name, außer es ist `value` selbst: Das
//     ist der einzige gültige Ausdruck, der zugleich ein einzelnes Wort ist.
//     Jedes andere Wort wäre als Ausdruck ein Bezug auf ein fremdes Feld und in
//     einer Feld-Regel ohnehin unzulässig.
//   - Alles Übrige ist ein Ausdruck der Abfrage-Sprache.
function formVon(quelle) {
  if (quelle.startsWith('/')) return 'regex';
  if (NAMENS_FORM.test(quelle) && quelle.toLowerCase() !== WERT_BEZUG) return 'name';
  return 'expr';
}

// Regulären Ausdruck übersetzen. Liefert die RegExp oder null.
function alsRegex(quelle) {
  const treffer = REGEX_FORM.exec(quelle);
  if (!treffer) return null;
  const [, muster, flags] = treffer;
  if (ZUSTANDS_FLAGS.test(flags)) return null;
  try {
    return new RegExp(muster, flags);
  } catch {
    return null;
  }
}

// Ausdruck der Abfrage-Sprache parsen und gegen den Funktions-Katalog prüfen.
// Liefert { ast, refs } oder null. Dieselbe Folge wie bei den abgeleiteten
// Feldern der Eigenschafts-Profile (parse, validate, Bezüge einsammeln).
function alsAusdruck(quelle) {
  const geparst = parseExpression(quelle);
  if (!geparst.ok || validateQuery(geparst.ast)) return null;
  const refs = [];
  collectFieldRefs(geparst.ast, refs);
  return { ast: geparst.ast, refs };
}

// Einen Namen im Katalog nachschlagen, ohne Rücksicht auf Groß- und
// Kleinschreibung wie bei Feld-Namen. Liefert die Schreibweise des Katalogs
// oder null.
function katalogName(quelle) {
  const klein = quelle.toLowerCase();
  const treffer = REGEL_NAMEN.find((name) => name.toLowerCase() === klein);
  return treffer === undefined ? null : treffer;
}

// Eine gesetzte Meldung normalisieren. Liefert { message, unbrauchbar }.
// Nicht gesetzt (fehlt, null, leerer Text) ist kein Verstoß: Die Regel prüft
// dann mit dem allgemeinen Satz der Anwendung.
function leseMeldung(roh) {
  if (roh === undefined || roh === null) return { message: null, unbrauchbar: false };
  if (typeof roh === 'string' && roh.trim() === '') return { message: null, unbrauchbar: false };
  const message = normalisiereBeschriftung(roh);
  return { message, unbrauchbar: message === null };
}

// Einen Regel-Eintrag in seine beiden Teile zerlegen: den Regel-Text und die
// rohe Meldung. Liefert null, wenn der Eintrag keine der beiden Formen trägt.
// Weitere Schlüssel im Objekt bleiben unangetastet und hinweisfrei, nach der
// Zusage des Definitions-Moduls für Angaben, die es (noch) nicht beschreibt.
function zerlegeEintrag(eintrag) {
  const quelle = alsText(eintrag);
  if (quelle !== null) return { quelle, meldung: undefined };
  if (!istEinfachesObjekt(eintrag)) return null;
  const regel = alsText(eintrag.rule);
  return regel === null ? null : { quelle: regel, meldung: eintrag.message };
}

// --- Feld-Regeln ---------------------------------------------------------------------

// Eine Feld-Regel aus ihrem Text. Liefert { regel } oder { code }.
function feldRegel(quelle) {
  const form = formVon(quelle);
  if (form === 'regex') {
    const regex = alsRegex(quelle);
    return regex === null ? { code: 'checkRegex' } : { regel: { art: 'regex', quelle, regex } };
  }
  if (form === 'name') {
    const name = katalogName(quelle);
    return name === null ? { code: 'checkUnknownRule' } : { regel: { art: 'name', quelle, name } };
  }
  const ausdruck = alsAusdruck(quelle);
  if (ausdruck === null) return { code: 'checkExpr' };
  // Auch `file.…` und `this.…` sind hier unzulässig: Sie sprechen die Datei
  // an und nicht den Wert, und eine Regel über die Datei ist keine Regel über
  // dieses Feld.
  if (ausdruck.refs.some((ref) => ref !== WERT_BEZUG)) return { code: 'checkFieldRef' };
  return { regel: { art: 'expr', quelle, ast: ausdruck.ast } };
}

/**
 * Liest die Feld-Regeln eines Definitions-Eintrags (`check`).
 *
 * Ein Wert oder eine Liste von Werten; ein Wert ist ein Regel-Text oder ein
 * Objekt `{ rule, message }`. Jede unbrauchbare Regel entfällt einzeln.
 *
 * @param {*} roh Der rohe Wert unter `check`.
 * @returns {{ checks: Array<object>, hints: Array<{code: string, expected?: *}> }}
 *   `checks` sind die gültigen Regeln `{ art, quelle, regex?, ast?, name?,
 *   message }`, `hints` die Hinweise ohne Ortsbezug; die Definition hängt Stelle
 *   und Feld-Namen an.
 */
function leseFeldRegeln(roh) {
  const checks = [];
  const hints = [];
  if (roh === undefined || roh === null) return { checks, hints };
  const eintraege = Array.isArray(roh) ? roh : [roh];
  for (const eintrag of eintraege) {
    const teile = zerlegeEintrag(eintrag);
    if (teile === null) {
      hints.push({ code: 'check' });
      continue;
    }
    const gelesen = feldRegel(teile.quelle);
    if (gelesen.code) {
      // Beim unbekannten Namen ist der Katalog die Auskunft, die weiterhilft;
      // eine Kopie, damit der Hinweis ihn nicht mit sich trägt.
      if (gelesen.code === 'checkUnknownRule')
        hints.push({ code: gelesen.code, expected: [...REGEL_NAMEN] });
      else hints.push({ code: gelesen.code });
      continue;
    }
    const meldung = leseMeldung(teile.meldung);
    if (meldung.unbrauchbar) hints.push({ code: 'checkMessage' });
    checks.push({ ...gelesen.regel, message: meldung.message });
  }
  return { checks, hints };
}

// --- Datensatz-Regeln ----------------------------------------------------------------

// Die Codes einer Regel über die Felder eines Datensatzes, je Gegenstand. Die
// Bearbeitbarkeits-Bedingung (4T-001932) wird genauso gelesen, trägt aber eigene
// Codes: Zwei Gegenstände teilen sich im Katalog keinen Code, sonst führte der
// Satz einer Datensatz-Regel den Autor an die falsche Angabe seiner Datei.
const DATENSATZ_CODES = Object.freeze({ expr: 'checksExpr', unbekannt: 'checkUnknownField' });
const BEARBEITBAR_CODES = Object.freeze({
  expr: 'editableExpr',
  unbekannt: 'editableUnknownField',
});

// Eine Datensatz-Regel aus ihrem Text. `bekannt` sind die kleingeschriebenen
// Namen der gültigen Felder, `codes` die Codes ihres Gegenstands. Liefert
// { regel } oder { code, expected? }.
//
// Eine Datensatz-Regel ist immer ein Ausdruck (E22, dritte Auflage): Ein
// regulärer Ausdruck prüft genau einen Wert und gehört ans Feld, ein Regel-Name
// ebenso. Ein einzelnes Wort ist hier deshalb kein Name, sondern ein Bezug auf
// ein Feld, etwa ein Wahrheitswert, der gesetzt sein muss.
function datensatzRegel(quelle, bekannt, feldNamen, codes) {
  const ausdruck = alsAusdruck(quelle);
  if (ausdruck === null) return { code: codes.expr };
  if (ausdruck.refs.some((ref) => !bekannt.has(ref)))
    return { code: codes.unbekannt, expected: feldNamen };
  return { regel: { art: 'expr', quelle, ast: ausdruck.ast } };
}

// Die Namen der gültigen Felder und ihre kleingeschriebene Menge für den
// Vergleich der Bezüge.
function feldBezuege(fields) {
  const feldNamen = fields.map((feld) => feld.name);
  return { feldNamen, bekannt: new Set(feldNamen.map((name) => name.toLowerCase())) };
}

/**
 * Liest die Datensatz-Regeln auf der oberen Ebene des Behälters (`checks`).
 *
 * Eine Liste; jeder Eintrag ist ein Ausdruck als Text oder ein Objekt
 * `{ rule, message }`. Die Bezüge des Ausdrucks müssen Feld-Namen der
 * Definition sein (ohne Rücksicht auf Groß- und Kleinschreibung).
 *
 * @param {*} roh Der rohe Wert unter `checks`.
 * @param {Array<{name: string}>} fields Die gültigen Felder der Definition.
 * @returns {{ checks: Array<object>, hints: Array<{code: string, name?: string, expected?: *}> }}
 *   `name` eines Hinweises ist der Text der Regel, weil eine Datensatz-Regel an
 *   keinem Feld hängt, das sie benennen könnte.
 */
function leseDatensatzRegeln(roh, fields) {
  const checks = [];
  const hints = [];
  if (roh === undefined || roh === null) return { checks, hints };
  if (!Array.isArray(roh)) {
    hints.push({ code: 'checksNotList' });
    return { checks, hints };
  }
  const { feldNamen, bekannt } = feldBezuege(fields);
  for (const eintrag of roh) {
    const teile = zerlegeEintrag(eintrag);
    if (teile === null) {
      hints.push({ code: 'checksEntry' });
      continue;
    }
    const gelesen = datensatzRegel(teile.quelle, bekannt, feldNamen, DATENSATZ_CODES);
    if (gelesen.code) {
      hints.push({ code: gelesen.code, name: teile.quelle, expected: gelesen.expected });
      continue;
    }
    const meldung = leseMeldung(teile.meldung);
    if (meldung.unbrauchbar) hints.push({ code: 'checksMessage', name: teile.quelle });
    checks.push({ ...gelesen.regel, message: meldung.message });
  }
  return { checks, hints };
}

// --- Bedingte Bearbeitbarkeit (4T-001932) ----------------------------------------------

// **Warum eine eigene Angabe und keine Prüfregel** (E22.7). Eine Prüfregel
// befragt den Datensatz, wie er nach dem Auftrag stünde; die Bearbeitbarkeit
// befragt ihn, wie er vorgefunden wurde. Der gebuchte Beleg ist gesperrt, auch
// wenn der Auftrag ihn zugleich auf «offen» zurücksetzen will. Gelesen wird sie
// trotzdem wie eine Datensatz-Regel, weil sie dieselbe Gestalt hat: ein
// Ausdruck über die Feld-Namen der Tabelle, als Text oder als Objekt
// `{ rule, message }`. Eine Liste ist nicht vorgesehen; eine Tabelle hat genau
// eine Bedingung, und wer mehrere braucht, verknüpft sie im Ausdruck.
//
// **Eine unbrauchbare Angabe entfällt, und die Tabelle bleibt bearbeitbar**
// (Entscheidung des Product Owners vom 2026-09-24). Die Fehlerrichtung ist hier
// ungewohnt: Das Entfallen hebt eine Sperre auf, statt eine Regel zu lockern.
// Es folgt trotzdem der weichen Linie jeder Einzel-Angabe der Definition, weil
// ein Tippfehler sonst die ganze Tabelle unbearbeitbar machte, auch für die
// Korrektur ihrer eigenen Daten; der Hinweis macht den Verlust sichtbar.

/**
 * Liest die Bearbeitbarkeits-Bedingung auf der oberen Ebene des Behälters
 * (`editable`).
 *
 * @param {*} roh Der rohe Wert unter `editable`.
 * @param {Array<{name: string}>} fields Die gültigen Felder der Definition.
 * @returns {{ editable: object|null, hints: Array<{code: string, name?: string, expected?: *}> }}
 *   `editable` ist die gültige Regel `{ art: 'expr', quelle, ast, message }`
 *   oder null (keine oder keine brauchbare Angabe); `name` eines Hinweises ist
 *   der Text der Bedingung, wie bei einer Datensatz-Regel.
 */
function leseBearbeitbarkeit(roh, fields) {
  const hints = [];
  if (roh === undefined || roh === null) return { editable: null, hints };
  const teile = zerlegeEintrag(roh);
  if (teile === null) {
    hints.push({ code: 'editable' });
    return { editable: null, hints };
  }
  const { feldNamen, bekannt } = feldBezuege(fields);
  const gelesen = datensatzRegel(teile.quelle, bekannt, feldNamen, BEARBEITBAR_CODES);
  if (gelesen.code) {
    hints.push({ code: gelesen.code, name: teile.quelle, expected: gelesen.expected });
    return { editable: null, hints };
  }
  const meldung = leseMeldung(teile.meldung);
  if (meldung.unbrauchbar) hints.push({ code: 'editableMessage', name: teile.quelle });
  return { editable: { ...gelesen.regel, message: meldung.message }, hints };
}

module.exports = {
  DB_CHECK_KEY,
  DB_CHECKS_KEY,
  DB_EDITABLE_KEY,
  REGEL_NAMEN,
  leseFeldRegeln,
  leseDatensatzRegeln,
  leseBearbeitbarkeit,
};
