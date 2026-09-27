// 4T-001940 (Epic 3E-000257, Bauplan B1 und B2): Ein Ergebnis der
// Schreib-Schnittstelle in Anwender-Text auflösen.
//
// **Die Schnittstelle ist sprachneutral** (`record-auftrag.js`): Ein abgewiesener
// Auftrag trägt je Befund einen Lage-Code mit Parametern, ein Befund des
// Regel-Werks reist unter der Lage `auftragPruefBefund` als `naht`. Den Satz
// dazu bildet der Bedienort aus `database.auftrag.<Code>`; dieses Modul ist die
// eine Stelle, an der das geschieht, damit Maske, Daten-Austausch und
// Paket-Import denselben Satz zeigen.
//
// **Prozess-neutral** (kein Electron, kein DOM, kein Fenster-Zustand): Die
// Übersetzungs-Funktion und die Sprache kommen als Umgebung herein. Importiert
// wird allein `beschriftung.js`, weil eine Meldung in mehreren Sprachen nach
// derselben Rückfall-Kette aufgelöst wird wie jede andere Beschriftung.
//
// **Die Einsetzungs-Regeln** (B2): Tabellen erscheinen mit ihrem Namen (Pfad ohne
// Ordner und Endung); Listen werden mit Komma und vor dem letzten Element mit
// dem «und» der Sprache verbunden; Positionen zählen für den Anwender ab 1; eine
// Meldung wird nur eingesetzt, wenn sie nicht leer ist; ein Platzhalter ohne
// Angabe verschwindet samt seinem Leerraum und bleibt nie als Klammer stehen.
//
// **Die Position steht nicht mehr im Text** (B3): Bei einem Auftrag mit einer
// einzigen Anweisung, dem Normalfall der Maske, ist sie Rauschen. Trägt ein
// Auftrag mehrere Anweisungen, setzt dieses Modul das Präfix
// `database.form.positionPrefix` selbst voran.
'use strict';

const { loeseBeschriftung } = require('./beschriftung.js');

const PRAEFIX = 'database.auftrag.';
const PRUEF_BEFUND = 'auftragPruefBefund';
const RUECKFALL = 'unbekannt';

// Angaben, die als Liste reisen, und ob ihre Einträge in Anführungszeichen
// gesetzt werden: Feld- und Tabellen-Namen ja, wie `«{feld}»` in den Texten,
// Kennungen und Positionen nein, wie `{id}`.
const LISTEN = Object.freeze({
  felder: true,
  tabellen: true,
  kennungen: false,
  positionen: false,
});

// Die Gründe einer Regel, für die es einen eigenen Satz gibt; jeder andere
// Grund wird als rohe Angabe gezeigt.
const GRUENDE = new Set(['regex', 'ausdruck', 'nichtAuswertbar', 'zielAngabeFehlt']);

// Die Lage, deren `felder` Felder einer ANDEREN Tabelle nennen (die
// verweisenden Felder der abhängigen Tabelle); sie markieren kein eigenes Feld.
const FREMDE_FELDER = new Set(['regelLoeschenAbhaengige']);

function istText(wert) {
  return typeof wert === 'string' && wert !== '';
}

// Der Name einer Tabelle: der Pfad ohne Ordner und ohne Endung `.md`.
function tabellenName(pfad) {
  if (!istText(pfad)) return null;
  const idx = Math.max(pfad.lastIndexOf('/'), pfad.lastIndexOf('\\'));
  return (idx >= 0 ? pfad.slice(idx + 1) : pfad).replace(/\.md$/i, '');
}

// Die Umgebung mit ihren Rückfällen. `hat` fragt, ob es einen Schlüssel gibt,
// ohne ihn zu übersetzen; die Übersetzungs-Funktion des Anzeige-Prozesses meldet
// einen unbekannten Schlüssel als Fehler, und ein Rückfall ist keiner.
function umgebungVon(roh) {
  const u = roh && typeof roh === 'object' ? roh : {};
  const t = typeof u.t === 'function' ? u.t : (key) => key;
  const hat = typeof u.hat === 'function' ? u.hat : (key) => t(key) !== key;
  return {
    t,
    hat,
    sprache: u.sprache || null,
    rueckfallSprache: u.rueckfallSprache || null,
    mehrereAnweisungen: u.mehrereAnweisungen === true,
  };
}

function eingesetzt(text, name, wert) {
  return text.split(`{${name}}`).join(wert);
}

function inAnfuehrung(u, text) {
  return eingesetzt(u.t('database.form.quoted'), 'text', text);
}

// Eine Liste in Satz-Form: «a», «a und b», «a, b und c».
function listenText(u, eintraege) {
  if (eintraege.length === 0) return null;
  if (eintraege.length === 1) return eintraege[0];
  const und = u.t('database.form.listAnd');
  return `${eintraege.slice(0, -1).join(', ')} ${und} ${eintraege[eintraege.length - 1]}`;
}

// Die Einträge einer Listen-Angabe als Texte. Ein Eintrag der Fremd-Änderung
// trägt sein Feld als Objekt (`{ name, erwartet, vorgefunden }`).
function listenEintraege(name, roh) {
  if (!Array.isArray(roh)) return [];
  return roh
    .map((eintrag) => {
      if (name === 'positionen') return Number.isInteger(eintrag) ? String(eintrag + 1) : null;
      if (name === 'tabellen') return tabellenName(eintrag);
      if (eintrag && typeof eintrag === 'object')
        return istText(eintrag.name) ? eintrag.name : null;
      return istText(eintrag) ? eintrag : null;
    })
    .filter((eintrag) => eintrag !== null);
}

/**
 * Der Wert, den ein Platzhalter bekommt, oder null, wenn die Lage ihn nicht
 * trägt.
 *
 * @param {object} u Die Umgebung.
 * @param {string} name Name des Platzhalters.
 * @param {object} angaben Die Angaben der Lage.
 * @returns {string|null}
 */
function platzhalterWert(u, name, angaben) {
  const roh = angaben[name];
  if (Object.prototype.hasOwnProperty.call(LISTEN, name)) {
    const eintraege = listenEintraege(name, roh);
    return listenText(u, LISTEN[name] ? eintraege.map((e) => inAnfuehrung(u, e)) : eintraege);
  }
  switch (name) {
    case 'tabelle':
    case 'zieltabelle':
      return tabellenName(roh);
    case 'anzeige':
      return istText(roh) ? roh : istText(angaben.id) ? angaben.id : null;
    case 'meldung': {
      const text = loeseBeschriftung(roh, u.sprache, u.rueckfallSprache);
      return istText(text) ? text : null;
    }
    case 'grund': {
      if (!istText(roh)) return null;
      const key = `database.form.grund.${roh}`;
      return GRUENDE.has(roh) && u.hat(key) ? u.t(key) : roh;
    }
    case 'wert':
      // Ein leerer Wert ist eine Angabe und wird gezeigt.
      return typeof roh === 'string' ? roh : null;
    default:
      if (typeof roh === 'number' && Number.isFinite(roh)) return String(roh);
      return istText(roh) ? roh : null;
  }
}

// Setzt alle Platzhalter ein. Ein Platzhalter ohne Angabe verschwindet samt
// dem Leerraum davor, am Satzanfang samt dem Leerraum danach.
function setzeEin(u, text, angaben) {
  const ersetzt = text.replace(/(\s*)\{([a-zA-Z]+)\}(\s*)/g, (treffer, vor, name, nach, stelle) => {
    const wert = platzhalterWert(u, name, angaben);
    if (wert !== null) return `${vor}${wert}${nach}`;
    return stelle === 0 ? '' : nach;
  });
  return ersetzt.trim();
}

// Der Text-Schlüssel einer Lage: die zweite Fassung, wo die Angaben sie
// verlangen (B3), sonst der Code selbst.
function textCode(code, angaben) {
  if (code === 'regelLoeschenAbhaengige' && angaben.anzahl === 1)
    return 'regelLoeschenAbhaengigeEinzeln';
  if (code === 'regelVerweisTabelleUnbekannt' && angaben.zieltabelle === null)
    return 'regelVerweisTabelleFehlt';
  return code;
}

/**
 * Löst eine Lage in Anwender-Text auf.
 *
 * @param {object} lage Ein Befund aus `lagen` des Ergebnisses.
 * @param {{t: Function, hat?: Function, sprache?: string|null,
 *   rueckfallSprache?: string|null, mehrereAnweisungen?: boolean}} umgebung
 * @returns {{code: string|null, text: string, feld: string|null,
 *   felder: Array<string>|null, kopf: boolean}} `code` ist der Code der Lage,
 *   bei einem Befund des Regel-Werks dessen Code; `kopf` ist wahr, wenn die
 *   Lage weder ein Feld noch Felder nennt.
 */
function loeseLageAuf(lage, umgebung) {
  const u = umgebungVon(umgebung);
  const roh = lage && typeof lage === 'object' ? lage : {};
  // Ein Befund des Regel-Werks trägt seine Angaben selbst; die Hülle der
  // Schnittstelle nennt nur Position, Tabelle und Kennung.
  const naht = roh.code === PRUEF_BEFUND && roh.naht && typeof roh.naht === 'object';
  const angaben = naht ? { ...roh, ...roh.naht } : roh;
  const code = istText(angaben.code) ? angaben.code : null;

  let key = code === null ? null : `${PRAEFIX}${textCode(code, angaben)}`;
  if (key !== null && !u.hat(key)) key = naht ? `${PRAEFIX}${PRUEF_BEFUND}` : null;
  if (key === null || !u.hat(key)) key = `${PRAEFIX}${RUECKFALL}`;

  let text = setzeEin(u, u.t(key), angaben);
  if (u.mehrereAnweisungen && Number.isInteger(angaben.position)) {
    const praefix = eingesetzt(
      u.t('database.form.positionPrefix'),
      'n',
      String(angaben.position + 1),
    );
    text = `${praefix} ${text}`;
  }

  const feld = istText(angaben.feld) ? angaben.feld : null;
  const felderRoh =
    Array.isArray(angaben.felder) && !FREMDE_FELDER.has(code)
      ? angaben.felder.filter((f) => istText(f))
      : [];
  const felder = felderRoh.length > 0 ? felderRoh : null;
  return { code, text, feld, felder, kopf: feld === null && felder === null };
}

/**
 * Löst ein Ergebnis der Schreib-Schnittstelle in Anwender-Texte auf.
 *
 * @param {object} ergebnis `{ ok: true, … }` oder `{ ok: false, code, lagen }`.
 * @param {object} umgebung Wie bei `loeseLageAuf`.
 * @returns {Array<object>} Je Lage das Ergebnis von `loeseLageAuf`; leer bei
 *   Erfolg. Ein Ergebnis ohne auslegbare Lage ergibt genau eine Lage mit dem
 *   allgemeinen Text.
 */
function loeseErgebnisAuf(ergebnis, umgebung) {
  if (ergebnis && ergebnis.ok === true) return [];
  const lagen = ergebnis && Array.isArray(ergebnis.lagen) ? ergebnis.lagen : [];
  if (lagen.length > 0) return lagen.map((lage) => loeseLageAuf(lage, umgebung));
  return [loeseLageAuf({ code: ergebnis && ergebnis.code }, umgebung)];
}

/**
 * Setzt die Angaben in einen Text ein, nach denselben Regeln wie die Lagen der
 * Schreib-Schnittstelle: Listen mit «und», Feld- und Tabellen-Namen in
 * Anführung, Platzhalter ohne Angabe samt Leerraum entfernt. 4T-001944: Die
 * Befund-Sätze der Konsistenz-Prüfung nutzen dieselbe Einsetzung, damit beide
 * Stellen Listen und Namen gleich schreiben.
 *
 * @param {string} text Der übersetzte Text mit Platzhaltern.
 * @param {object} angaben Die Angaben nach Platzhalter-Namen.
 * @param {object} umgebung Wie bei `loeseLageAuf`.
 * @returns {string}
 */
function setzeTextEin(text, angaben, umgebung) {
  return setzeEin(umgebungVon(umgebung), String(text == null ? '' : text), angaben || {});
}

module.exports = { loeseLageAuf, loeseErgebnisAuf, setzeTextEin, tabellenName };
