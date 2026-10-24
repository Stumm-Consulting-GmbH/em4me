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
// 4T-002173 (Epic 3E-000337): Zwei Angaben einer Form sind wahlfrei.
// `unsuitableReason(resultSet)` nennt bei fehlender Eignung einen Grund-Code,
// den der Verteiler als `reason` weiterreicht, damit der Hinweis den Grund
// nennt. `extension` ist die Kennung einer Erweiterung, an der die Form hängt;
// ist sie aus (Kontext-Funktion `isExtensionActive`), zeichnet die Form nicht,
// und der Verteiler nennt den eigenen Hinweis-Code `displayFormOff` statt «passt
// nicht» (Entscheidung S3). Der Kontext trägt dazu `isExtensionActive` und für
// die Diagramme die Zeichen-Funktion `drawChart` (Entscheidung S2); beide reicht
// die Befüllung, damit dieses Modul ohne Brücken-Bezug bleibt.
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
// Baum, seit 4T-002173 die Diagramme `bar` und `line`. Jede andere Angabe zeigt
// den Rückfall mit Hinweis. Formen aus Add-ons sind nicht vorgesehen, bevor die
// Add-on-Paketierung sie zusagt.
//
// Bewusst ohne Preload-Bezug, damit der jsdom-Unit-Test der Befüllung ohne
// Preload-Brücke läuft. Importiert werden allein die eingebauten Formen; sie
// kennen das Verzeichnis nicht.

// 4T-002044: der Baum, eingetragen unten im Abschnitt «Eingebaute Formen».
import { treeForm } from './display-tree.js';
// 4T-002173: die Diagramme, eingetragen unten im Abschnitt «Eingebaute Formen».
import { barForm, lineForm } from './display-chart.js';

/**
 * @typedef {object} DisplayContext
 * @property {(key: string) => string} translate  i18n-Funktion der Befüllung
 * @property {(id: string) => boolean} [isExtensionActive]  Schalt-Zustand; ohne
 *   Angabe gilt jede Erweiterung als an
 * @property {(input: object) => object} [drawChart]  Zeichen-Funktion der Diagramme
 */

/**
 * @typedef {object} DisplayForm
 * @property {(resultSet: object) => boolean} isSuitable  Passt die Form zu dieser Menge?
 * @property {(resultSet: object, context: DisplayContext) => Node} render
 *   Das DOM der Form; der Aufrufer hängt es unter den Hinweis des Zustands.
 * @property {(resultSet: object) => (string|null)} [unsuitableReason]  Grund-Code
 *   der fehlenden Eignung
 * @property {string} [extension]  Kennung der Erweiterung, an der die Form hängt
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
 * @param {DisplayContext} context
 * @returns {{ node: Node|null,
 *     hint: 'displayFormUnknown'|'displayFormUnsuitable'|'displayFormOff'|null,
 *     name: string|null, reason?: string }}
 *   `node` gesetzt: die Form ist gezeichnet. Sonst zeigt der Aufrufer die Ausgabe
 *   ohne Angabe und bei gesetztem `hint` den Hinweis mit `name`; `reason` nennt
 *   bei «passt nicht» den Grund-Code der Form, sofern sie einen kennt.
 */
export function drawDisplayForm(resultSet, context) {
  const wish = resultSet && resultSet.wishes ? resultSet.wishes.display : null;
  if (!wish || typeof wish.form !== 'string' || wish.form === '') {
    return { node: null, hint: null, name: null };
  }
  const name = wish.form;
  const fallback = (hint, reason) =>
    typeof reason === 'string' && reason !== ''
      ? { node: null, hint, name, reason }
      : { node: null, hint, name };
  const form = forms.get(name.toLowerCase());
  if (!form) return fallback('displayFormUnknown');
  try {
    // 4T-002173 (S3): Eine ausgeschaltete Form zeichnet nicht und sagt das,
    // vor jeder Eignungs-Prüfung.
    const aktiv = context && context.isExtensionActive;
    if (form.extension && typeof aktiv === 'function' && !aktiv(form.extension)) {
      return fallback('displayFormOff');
    }
    if (!form.isSuitable(resultSet)) {
      const reason =
        typeof form.unsuitableReason === 'function' ? form.unsuitableReason(resultSet) : null;
      return fallback('displayFormUnsuitable', reason);
    }
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
// Der Baum aus 4T-002044 (`DISPLAY tree BY <Verweis-Feld>`); seit 4T-002173 die
// Diagramme `bar` und `line` (Epic 3E-000337).
registerDisplayForm('tree', treeForm);
registerDisplayForm('bar', barForm);
registerDisplayForm('line', lineForm);
