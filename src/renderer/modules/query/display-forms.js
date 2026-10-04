'use strict';

// 4T-002043 (Epic 3E-000258, Entscheidungen F2 Option A und F3b): Verzeichnis
// der Darstellungsformen einer Abfrage und ihr Verteiler. Das Modul beantwortet
// eine Frage: welche Form das Ergebnis zeichnet, wenn der Autor mit
// `DISPLAY <Form> [BY <Feld>]` eine wählt (Wunsch `wishes.display` der
// Ergebnismenge, Vertrag in src/shared/query/result-set.js).
//
// **Eine Form** ist ein Eintrag unter ihrem Namen mit zwei Funktionen: der
// Eignungs-Prüfung `isSuitable(resultSet)`, die sagt, ob die Form zu Ebene,
// Ausgabe-Typ, Spalten oder Wünschen dieser Menge passt, und der
// Zeichen-Funktion `render(resultSet, context)`, die das DOM der Form liefert.
// Der Kontext trägt `translate` (die i18n-Funktion der Befüllung). Was eine Form
// an Wünschen nicht kennt, übergeht sie ohne Hinweis (E8.3).
//
// **Der Verteiler** (`drawDisplayForm`) sitzt am Einstieg der Befüllung
// (`frontmatter-query-view.js`) hinter Zustand, Abfrage-Fehler und Leer-Fall.
// Ohne Angabe liefert er nichts, und die Ausgabe bleibt byte-gleich wie zuvor.
// Eine bekannte und passende Form zeichnet. Eine unbekannte oder unpassende Form
// zeichnet nicht; der Aufrufer zeigt dann die Ausgabe ohne Angabe (Tabelle,
// Liste oder Aufgaben-Liste) mit dem Hinweis-Code, den der Verteiler nennt. Nie
// ein Fehler: Auch eine Form, die in Prüfung oder Zeichnung scheitert, fällt so
// zurück (Isolation von Teil-Fehlern), mit einer Warnung in der Konsole.
//
// **Wer einträgt:** Die eingebauten Formen trägt dieses Modul unten selbst ein,
// damit keine Lade-Reihenfolge entscheidet, ob es sie gibt; seit 4T-002044 der
// Baum, später die Diagramme (3E-000337). Jede andere Angabe zeigt den Rückfall
// mit Hinweis. Formen aus Add-ons sind nicht vorgesehen, bevor die
// Add-on-Paketierung sie zusagt.
//
// Bewusst ohne Preload-Bezug, damit der jsdom-Unit-Test der Befüllung ohne
// Preload-Brücke läuft. Importiert werden allein die eingebauten Formen; sie
// kennen das Verzeichnis nicht.

// 4T-002044: der Baum, eingetragen unten im Abschnitt «Eingebaute Formen».
import { treeForm } from './display-tree.js';

/**
 * @typedef {object} DisplayForm
 * @property {(resultSet: object) => boolean} isSuitable  Passt die Form zu dieser Menge?
 * @property {(resultSet: object, context: { translate: (key: string) => string }) => Node} render
 *   Das DOM der Form; der Aufrufer hängt es unter den Hinweis des Zustands.
 */

// Name der Form (klein geschrieben, wie der Parser das Wort liefert) -> Form.
const forms = new Map();

/**
 * Trägt eine Form ein. Ein Name gilt einmal; ein zweiter Eintrag desselben
 * Namens ist ein Programmierfehler und wirft, statt still zu ersetzen.
 * @param {string} name  Wort nach `DISPLAY`, ohne Rücksicht auf die Schreibung
 * @param {DisplayForm} form
 * @returns {() => void}  Nimmt den Eintrag wieder heraus (für Prüffälle).
 */
export function registerDisplayForm(name, form) {
  const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!key) throw new TypeError('display-forms: Name der Form fehlt');
  if (!form || typeof form.isSuitable !== 'function' || typeof form.render !== 'function') {
    throw new TypeError(`display-forms: Form '${key}' braucht isSuitable und render`);
  }
  if (forms.has(key)) throw new Error(`display-forms: Form '${key}' ist schon eingetragen`);
  forms.set(key, form);
  return () => {
    if (forms.get(key) === form) forms.delete(key);
  };
}

/**
 * Verteiler: zeichnet die gewählte Form oder nennt den Grund des Rückfalls.
 * @param {object} resultSet  Ergebnismenge im Zustand `ready` mit mindestens einer Zeile
 * @param {{ translate: (key: string) => string }} context
 * @returns {{ node: Node|null, hint: 'displayFormUnknown'|'displayFormUnsuitable'|null, name: string|null }}
 *   `node` gesetzt: die Form ist gezeichnet. Sonst zeigt der Aufrufer die Ausgabe
 *   ohne Angabe und bei gesetztem `hint` den Hinweis mit `name`.
 */
export function drawDisplayForm(resultSet, context) {
  const wish = resultSet && resultSet.wishes ? resultSet.wishes.display : null;
  if (!wish || typeof wish.form !== 'string' || wish.form === '') {
    return { node: null, hint: null, name: null };
  }
  const name = wish.form;
  const fallback = (hint) => ({ node: null, hint, name });
  const form = forms.get(name.toLowerCase());
  if (!form) return fallback('displayFormUnknown');
  try {
    if (!form.isSuitable(resultSet)) return fallback('displayFormUnsuitable');
    const node = form.render(resultSet, context);
    if (!node || typeof node.nodeType !== 'number') throw new TypeError('kein DOM-Knoten');
    return { node, hint: null, name };
  } catch (err) {
    console.warn(
      `display-forms: Darstellungsform '${name}' gescheitert, Rückfall ohne Angabe`,
      err,
    );
    return fallback('displayFormUnsuitable');
  }
}

// --- Eingebaute Formen ---------------------------------------------------------
// Der Baum aus 4T-002044 (`DISPLAY tree BY <Verweis-Feld>`); 3E-000337 trägt
// später `bar` und `line` ein.
registerDisplayForm('tree', treeForm);
