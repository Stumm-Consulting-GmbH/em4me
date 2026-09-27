// 4T-001942 (Epic 3E-000257, Bauplan B2 und B3): Die Ziel-Listen der
// Verweis-Felder einer Einzel-Maske — geholt über den Kanal
// `database:datensaetze`, gehalten je Ziel-Tabelle.
//
// **Wofür die Seite sie braucht.** Lesend zeigt ein Verweis-Feld «Anzeige-Form
// (Kennung)»; dafür löst die Seite beim Aufbau jeden Verweis gegen die Liste
// seiner Ziel-Tabelle auf. Bearbeitend schöpft die Wertehilfe aus derselben
// Liste. Beides nimmt dieselbe Antwort, damit Anzeige und Auswahl denselben
// Stand zeigen.
//
// **Gehalten für die Dauer der Bearbeitung, verworfen mit jedem frischen Lesen**
// (B3). `aufloesen` beginnt mit dem Verwerfen und holt neu; die Seite ruft es,
// wenn sie den Datensatz liest, also beim Öffnen, nach dem Speichern und beim
// Neu-Laden. Eine Neuanlage in der Ziel-Tabelle erscheint damit nach dem
// nächsten Lesen, ohne dass die Liste bei jedem Tastendruck neu geholt wird.
//
// **Geholt wird je Ziel-Tabelle einmal**, auch wenn mehrere Felder auf dieselbe
// zeigen, und für jedes Verweis-Feld mit Ziel-Tabelle, nicht nur für gefüllte:
// Ob die Ziel-Tabelle überhaupt existiert, entscheidet, ob das Feld bearbeitbar
// ist (Lage `ohneZiel` im Feld-Modul), und das muss beim Zeichnen feststehen.
//
// Ohne Fenster-Zustand: Der Kanal kommt als Funktion herein, damit das Modul in
// jsdom prüfbar bleibt (Muster `masken-felder.js`).
'use strict';

// Die Ziel-Tabelle eines Verweis-Feldes, oder null.
function zielTabelle(feld) {
  if (!feld || feld.type !== 'record' || !feld.options) return null;
  const tabelle = feld.options.table;
  return typeof tabelle === 'string' && tabelle.trim() !== '' ? tabelle.trim() : null;
}

/**
 * Erzeugt die Ziel-Listen einer Maske.
 *
 * @param {(tabelle: string) => Promise<object>} lade Der Kanal
 *   `database:datensaetze` für eine Ziel-Tabelle (Name oder Pfad).
 * @returns {{aufloesen: Function, ladeZiele: Function, optionen: Function, vergiss: Function}}
 */
export function erzeugeVerweisHilfe(lade) {
  // Ziel-Tabelle → Promise der Antwort, solange sie läuft, danach die Antwort.
  let laufend = new Map();
  let fertig = new Map();

  function hole(tabelle) {
    if (fertig.has(tabelle)) return Promise.resolve(fertig.get(tabelle));
    if (laufend.has(tabelle)) return laufend.get(tabelle);
    const karte = fertig;
    const anfrage = Promise.resolve()
      .then(() => lade(tabelle))
      .catch(() => null)
      .then((antwort) => {
        const ergebnis =
          antwort && typeof antwort === 'object' ? antwort : { status: 'unavailable' };
        // Nach einem Verwerfen gehört die Antwort zu einem alten Stand.
        if (karte === fertig) fertig.set(tabelle, ergebnis);
        return ergebnis;
      });
    laufend.set(tabelle, anfrage);
    return anfrage;
  }

  function vergiss() {
    laufend = new Map();
    fertig = new Map();
  }

  // Die Ziel-Liste eines Feldes für die Wertehilfe, gehalten oder frisch geholt.
  function ladeZiele(feld) {
    const tabelle = zielTabelle(feld);
    return tabelle === null ? Promise.resolve(null) : hole(tabelle);
  }

  return {
    vergiss,
    /**
     * Verwirft die gehaltenen Listen und holt die aller Verweis-Felder der
     * Antwort neu. Wirft nie; ein gescheiterter Abruf ergibt eine Lage ohne
     * Liste, und das Feld zeigt den Rohtext.
     *
     * @param {object|null} daten Die Antwort von `database:datensatz`.
     * @returns {Promise<void>}
     */
    async aufloesen(daten) {
      vergiss();
      const felder = daten && Array.isArray(daten.fields) ? daten.fields : [];
      const tabellen = new Set(felder.map(zielTabelle).filter((t) => t !== null));
      await Promise.all([...tabellen].map(hole));
    },
    /**
     * Die Ziel-Liste eines Feldes für die Wertehilfe, gehalten oder frisch geholt.
     *
     * @param {object} feld Feld der Definition.
     * @returns {Promise<object|null>}
     */
    ladeZiele,
    /**
     * Die Optionen, die das Feld-Element eines Feldes braucht: die Lade-Funktion
     * und die bereits vorliegende Antwort. Für andere Typen leer.
     *
     * @param {object} feld Feld der Definition.
     * @returns {{ladeZiele?: Function, ziele?: object}}
     */
    optionen(feld) {
      if (!feld || feld.type !== 'record') return {};
      const tabelle = zielTabelle(feld);
      return { ladeZiele, ziele: tabelle ? fertig.get(tabelle) : undefined };
    },
  };
}
