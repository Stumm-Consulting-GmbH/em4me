// 4T-001700 (Epic 3E-000288): Anlegen, Ändern, Löschen und Umordnen der
// Elemente einer Canvas-Fläche **im Modell** — die Gegenrichtung zum Leser und
// Schreiber in `canvas-core.js`.
//
// **Warum ein eigenes Modul neben canvas-core.js.** Der Kern beantwortet die
// Frage «wie steht die Fläche in der Datei»; dieses Modul beantwortet «wie
// ändert sich das Modell». Beides in einer Datei hätte den Kern über sein
// Datei-Budget getrieben (500 Zeilen für JavaScript unter `src/`), und der
// Schnitt läuft entlang der Fachlichkeit statt mitten durch die Grammatik.
//
// **Warum überhaupt hier und nicht in der Bedienung.** Die Stapel-Reihenfolge
// **ist** die Reihenfolge in der Fence (Festlegung G3, seit der Entscheidung
// des Product Owners vom 2026-09-12 über alle Element-Arten gemeinsam). Wer sie
// ändert, ändert das Speicherformat und nicht die Anzeige; dieselbe Regel muss
// deshalb für Formen (4T-001701), Gruppen (4T-001702) und Karten dieselbe sein.
// Prozessneutral wie der Kern: CJS, reine Funktionen, kein DOM, kein Electron,
// kein Datei-Zugriff.
//
// **Der Rohtext bleibt unangetastet, wo er kann** (G2): Eine Umordnung setzt
// **kein** `geaendert` — das Element wandert in der Liste, sein Text ist
// derselbe, und der Schreiber gibt ihn weiterhin wörtlich aus. Nur wer ein Feld
// ändert oder ein Element neu anlegt, bekommt die kanonische Form.
'use strict';

const {
  FORM_ARTEN,
  FORM_ART_VORGABE,
  FUELLUNG_KEINE,
  LAGE_ZAHLEN,
  LINIEN_FARBEN,
  STAPEL_ARTEN,
} = require('./canvas-core.js');
const { MIN_BREITE, MIN_HOEHE } = require('./canvas-geometrie.js');

// Die vier Befehle des gewählten Elements (Story 4S-000932, Entscheidung
// «Weg 2» vom 2026-09-12). Sie stehen hier und nicht in der Bedienung, damit
// Kontextmenü und Kommando-Palette dieselbe Folge nehmen — Muster
// LINIEN_RICHTUNGEN im Kern.
const STAPEL_BEFEHLE = ['ganzNachVorn', 'eineStufeVor', 'eineStufeZurueck', 'ganzNachHinten'];

// Anfangsbuchstabe der erzeugten Kennungen je Element-Art, wie im Beispiel des
// Konzept-Dokuments (`k1`, `e1`, `g1`, `s1`). `s` für die Form, weil `f` schon
// nach «Fläche» aussieht und das Beispiel der Fence seit 2026-09-09 `s1` zeigt.
const KENNUNGS_PRAEFIXE = { karte: 'k', linie: 'e', form: 's', gruppe: 'g' };

/**
 * Erste freie Kennung für ein neues Element der gegebenen Art.
 *
 * Geprüft wird gegen **alle** Kennungen der Fläche und nicht nur gegen die der
 * eigenen Art: Eine Verbindung darf `s2` heißen, und eine doppelte Kennung wäre
 * ein Befund des Kerns (`doppelteKennung`).
 *
 * Die Karten-Fassung `freieKartenKennung` in `canvas-bedienung.js` ist der
 * Sonderfall dieser Funktion; sie geht mit dem Umbau der Zeichnung in
 * 4T-001701 darin auf, statt hier eine zweite Regel zu eröffnen.
 *
 * @param {object} model Modell einer Fläche (`parseCanvasFence`).
 * @param {string} art Element-Art (`karte`, `form`, `gruppe`, `linie`).
 * @returns {string}
 */
function freieKennung(model, art) {
  const praefix = KENNUNGS_PRAEFIXE[art] || 'x';
  const belegt = new Set();
  const elemente = model && Array.isArray(model.elemente) ? model.elemente : [];
  for (const el of elemente) {
    if (el && el.id) belegt.add(String(el.id));
  }
  for (let i = 1; ; i++) {
    if (!belegt.has(`${praefix}${i}`)) return `${praefix}${i}`;
  }
}

// Gerüst eines neuen Elements in genau der Form, die `parseCanvasFence`
// liefert. `geaendert` steht von Anfang an auf `true`, weil ein neues Element
// keinen Rohtext hat, den der Schreiber wörtlich übernehmen könnte.
//
// Die vier Lage-Namen stehen von Anfang an in `attrFolge`, damit die
// geschriebene Zeile mit `x= y= b= h=` beginnt und danach die Angaben der Art
// folgen — die Reihenfolge, in der G5 und G6 sie aufschreiben.
function geruest(art, id, { x, y, b, h }) {
  return {
    art,
    id,
    attrs: {},
    attrFolge: [...LAGE_ZAHLEN],
    inhalt: '',
    roh: { marker: '', inhalt: [] },
    geaendert: true,
    zeile: 0,
    x: Math.round(x) || 0,
    y: Math.round(y) || 0,
    b: Math.max(MIN_BREITE, Math.round(b) || 0),
    h: Math.max(MIN_HOEHE, Math.round(h) || 0),
  };
}

// Setzt oder streicht eine Angabe der Marker-Zeile. Ein `null` streicht sie,
// statt einen Wert zu erfinden: Die Abwesenheit **ist** die Vorgabe (G5/G6).
function setzeAngabe(el, name, wert) {
  if (wert == null) {
    delete el.attrs[name];
    el.attrFolge = el.attrFolge.filter((n) => n !== name);
    return;
  }
  if (!el.attrFolge.includes(name)) el.attrFolge.push(name);
  el.attrs[name] = wert;
}

/**
 * Neue Karte. Sie trägt keine eigenen Angaben außer Lage und Größe; ihr Text
 * sind die Inhalts-Zeilen.
 *
 * 4T-001701: Hierher gezogen aus `canvas-bedienung.js`, wie es die Übergabe
 * von 4T-001700 vorsah. Der Grund ist derselbe wie bei Form und Gruppe: Wo ein
 * Element in die Liste kommt, ist eine Aussage des Speicherformats (G3), und
 * eine zweite Fabrik in der Oberfläche wäre ein zweiter Ort für dieselbe Regel.
 *
 * @param {{id: string, x: number, y: number, b: number, h: number}} felder
 * @returns {object} Element im Modell-Format des Kerns.
 */
function erzeugeKarte({ id, x, y, b, h }) {
  return geruest('karte', id, { x, y, b, h });
}

/**
 * Neue Form (G5). Ohne Art gilt das Rechteck, ohne Rand die Standardfarbe,
 * ohne Füllung bleibt sie ungefüllt — und «ohne» heißt im Modell wie in der
 * Datei: die Angabe fehlt.
 *
 * @param {{id: string, x: number, y: number, b: number, h: number,
 *   formArt?: string, rand?: string, fuellung?: string}} felder
 * @returns {object} Element im Modell-Format des Kerns.
 */
function erzeugeForm({ id, x, y, b, h, formArt, rand, fuellung }) {
  const el = geruest('form', id, { x, y, b, h });
  el.artUnbekannt = false;
  el.formArt = FORM_ARTEN.includes(formArt) ? formArt : FORM_ART_VORGABE;
  if (el.formArt !== FORM_ART_VORGABE) setzeAngabe(el, 'art', el.formArt);
  setzeFormRand(el, rand == null ? null : rand);
  setzeFormFuellung(el, fuellung == null ? null : fuellung);
  return el;
}

/**
 * Neue Gruppe (G6): ein beschriftetes Rechteck mit optionaler Farbe. Eine
 * Mitglieder-Liste entsteht nicht — Mitglied ist, was geometrisch darin liegt.
 *
 * @param {{id: string, x: number, y: number, b: number, h: number,
 *   farbe?: string}} felder
 * @returns {object} Element im Modell-Format des Kerns.
 */
function erzeugeGruppe({ id, x, y, b, h, farbe }) {
  const el = geruest('gruppe', id, { x, y, b, h });
  setzeGruppenFarbe(el, farbe == null ? null : farbe);
  return el;
}

/**
 * Fügt ein Element an seinem festgelegten Platz in die Liste ein (AK11 des
 * Tasks, AK8 der Story 4S-000932): eine **Gruppe ganz hinten**, eine Form und
 * eine Karte **ganz vorn**.
 *
 * Vorn im Stapel ist das **Ende** der Liste, weil später Gezeichnetes oben
 * liegt. Eine Gruppe verdeckt damit von sich aus nichts, und ein gerade
 * angelegtes Element ist sichtbar.
 *
 * Eine Verbindung hat keinen Platz im Stapel und wird angehängt; sie liegt in
 * einer eigenen Ebene unter den Elementen.
 *
 * @returns {object|null} das eingefügte Element.
 */
function fuegeElementEin(model, el) {
  const elemente = model && Array.isArray(model.elemente) ? model.elemente : null;
  if (!elemente || !el) return null;
  if (el.art === 'gruppe') elemente.unshift(el);
  else elemente.push(el);
  return el;
}

/**
 * Entfernt ein Element samt aller Verbindungen, die auf es zeigen.
 *
 * Der zweite Teil greift nur bei Karten — an eine Form oder Gruppe schließt
 * keine Verbindung an (Abgrenzung des Epics). Er steht trotzdem hier, damit es
 * **eine** Lösch-Regel gibt: Eine Verbindung ohne ihre Karte wäre ein Befund
 * des Kerns (`unbekanntesEnde`) und stünde als Rest in der Datei.
 *
 * @returns {boolean} `true`, wenn etwas entfernt wurde.
 */
function entferneElement(model, id) {
  const elemente = model && Array.isArray(model.elemente) ? model.elemente : null;
  if (!elemente || !id) return false;
  const uebrig = elemente.filter(
    (el) =>
      !(el.id === id && el.art !== 'linie') &&
      !(el.art === 'linie' && (el.von === id || el.nach === id)),
  );
  if (uebrig.length === elemente.length) return false;
  // An Ort und Stelle ersetzen: Die Ansicht hält dieselbe Liste in der Hand.
  elemente.splice(0, elemente.length, ...uebrig);
  return true;
}

// Stellen der Stapel-Elemente in der Gesamt-Liste, von hinten nach vorn.
// Verbindungen und unbekannte Marker bleiben, wo sie sind: Die einen liegen in
// einer eigenen Ebene, die anderen führt G1 bloß mit — was man nicht kennt,
// ordnet man nicht um.
function stapelStellen(elemente) {
  const stellen = [];
  for (let i = 0; i < elemente.length; i++) {
    if (STAPEL_ARTEN.has(elemente[i].art)) stellen.push(i);
  }
  return stellen;
}

/**
 * Verschiebt ein Element im Stapel (Story 4S-000932).
 *
 * Die vier Befehle wirken auf die **Reihenfolge in der Fence** und damit auf
 * das Dokument; ein eigenes Ordnungs-Attribut entsteht nicht (G3). Das
 * verschobene Element wird **nicht** als geändert vermerkt: Sein Text ist
 * derselbe, nur seine Stelle ist eine andere, und der Schreiber gibt ihn
 * weiterhin wörtlich aus (G2).
 *
 * @param {object} model Modell einer Fläche.
 * @param {string} id Kennung des Elements.
 * @param {string} befehl einer aus `STAPEL_BEFEHLE`.
 * @returns {boolean} `true`, wenn sich die Reihenfolge geändert hat.
 */
function verschiebeImStapel(model, id, befehl) {
  const elemente = model && Array.isArray(model.elemente) ? model.elemente : null;
  if (!elemente || !id || !STAPEL_BEFEHLE.includes(befehl)) return false;
  const stellen = stapelStellen(elemente);
  const platz = stellen.findIndex((i) => elemente[i].id === id);
  if (platz < 0) return false;
  const vorn = stellen.length - 1;

  if (befehl === 'eineStufeVor' || befehl === 'eineStufeZurueck') {
    const nachbar = befehl === 'eineStufeVor' ? platz + 1 : platz - 1;
    if (nachbar < 0 || nachbar > vorn) return false;
    // Tausch statt Umhängen: Alles zwischen beiden — eine Verbindung, ein
    // unbekannter Marker — behält seine Stelle in der Datei.
    const [a, b] = [stellen[platz], stellen[nachbar]];
    [elemente[a], elemente[b]] = [elemente[b], elemente[a]];
    return true;
  }

  const ziel = befehl === 'ganzNachVorn' ? vorn : 0;
  if (platz === ziel) return false;
  const [el] = elemente.splice(stellen[platz], 1);
  // Die Einfüge-Stelle stimmt in beide Richtungen: Beim Weg nach vorn ist alles
  // hinter der entnommenen Stelle um eins nachgerückt, beim Weg nach hinten
  // liegt das Ziel davor und ist unberührt.
  elemente.splice(stellen[ziel], 0, el);
  return true;
}

// Gemeinsamer Rumpf der drei Farb-Setzer: Angabe und Modell-Feld bleiben im
// Gleichlauf, und ein Name außerhalb des Satzes wird gar nicht erst gesetzt —
// die Bedienung bietet nur die acht an, und ein neunter käme aus einem Irrtum.
function setzeFarbAngabe(el, angabe, feld, name) {
  if (!el) return false;
  if (name != null && !Object.prototype.hasOwnProperty.call(LINIEN_FARBEN, name)) return false;
  const neu = name == null ? undefined : name;
  if (el[feld] === neu && (neu !== undefined || el.attrs[angabe] == null)) return false;
  setzeAngabe(el, angabe, neu === undefined ? null : neu);
  el[feld] = neu;
  el.geaendert = true;
  return true;
}

/** Setzt die Art einer Form; ein unbekannter Wert wird nicht gesetzt. */
function setzeFormArt(el, art) {
  if (!el || el.art !== 'form' || !FORM_ARTEN.includes(art)) return false;
  if (el.formArt === art && !el.artUnbekannt) return false;
  // Die Vorgabe wird ausgeschrieben, sobald sie eine Wahl war: Wer eine
  // unbekannte Art auf das Rechteck zurücksetzt, soll das in der Datei sehen.
  setzeAngabe(el, 'art', art);
  el.formArt = art;
  el.artUnbekannt = false;
  el.geaendert = true;
  return true;
}

/** Randfarbe einer Form; `null` bedeutet die Standardfarbe des Farbschemas. */
function setzeFormRand(el, name) {
  return setzeFarbAngabe(el, 'rand', 'rand', name);
}

/**
 * Füllfarbe einer Form; `null` und `keine` bedeuten dasselbe — ungefüllt.
 * Geschrieben wird dann **nichts**, weil die Abwesenheit die Vorgabe ist.
 */
function setzeFormFuellung(el, name) {
  return setzeFarbAngabe(el, 'füllung', 'fuellung', name === FUELLUNG_KEINE ? null : name);
}

/** Farbe einer Gruppe; `null` bedeutet die Standardfarbe des Farbschemas. */
function setzeGruppenFarbe(el, name) {
  return setzeFarbAngabe(el, 'farbe', 'farbe', name);
}

module.exports = {
  STAPEL_BEFEHLE,
  KENNUNGS_PRAEFIXE,
  freieKennung,
  erzeugeKarte,
  erzeugeForm,
  erzeugeGruppe,
  fuegeElementEin,
  entferneElement,
  verschiebeImStapel,
  setzeFormArt,
  setzeFormRand,
  setzeFormFuellung,
  setzeGruppenFarbe,
};
