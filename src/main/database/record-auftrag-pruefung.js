// 4T-001821 (Epic 3E-000254, Bauplan B1, B2, B5; E22.3): Der Lage-Katalog der
// Schreib-Schnittstelle und die Prüfungen, die allein Auftrag und Definition
// brauchen — Form, Typ und Pflicht-Angabe.
//
// **Warum eine eigene Datei.** Der Gegenstand ist die Prüfung VOR jedem
// Dateizugriff: Sie kennt weder Sperre noch Datei noch Vorgang, sondern allein
// den übergebenen Auftrag und die Definition der berührten Tabellen. Das ist
// dieselbe Naht, an der `record-values.js` vom Format-Modul getrennt wurde, und
// sie hält die Ablauf-Datei daneben auf ihre eine Aufgabe zusammengezogen.
//
// **Der Katalog der Lagen steht hier und nur hier** (B5, AK12). Jede Lage, die
// die Schreib-Schnittstelle liefern kann, trägt einen sprachneutralen Code mit
// Parametern; die Anwender-Texte entstehen nach AK12 erst im Vorgang zu Kanal
// und Brücke, in allen fünf Sprachfassungen. Der Text hier ist
// **Entwickler-Text** nach dem Muster von `record-write.js`: Er erklärt die
// Lage demjenigen, der den Code liest, und erreicht nie einen Anwender.
//
// **Typ und Pflicht-Angabe sind hart** (E22.3 in der Fassung der Revision vom
// 2026-09-04): Auf den Datenbank-Schreibwegen wird abgewiesen, nichts wird
// geschrieben. Gesammelt werden deshalb **alle** Befunde eines Auftrags und
// nicht nur der erste — wer zehn Positionen speichert, soll nicht zehnmal
// nacheinander je einen Fehler erfahren.
//
// Prozess-neutral in der Sache (kein Dateizugriff, keine Sperre); es liegt
// trotzdem unter `src/main/`, weil es ausschließlich der Schreib-Schnittstelle
// dient und mit ihr zusammen gelesen wird.
'use strict';

const { zellWert } = require('../../shared/database/record-values.js');
// Die drei Arten tragen dieselben Wörter wie das Zurückschreiben und wie das
// Beleg-Format; ein zweites Vokabular für dieselben drei Vorgänge wäre eine
// Übersetzungs-Schicht ohne Gegenwert (Begründung im Kopf von record-write.js).
const {
  ARTEN,
  ART_ANLEGEN,
  ART_AENDERN,
  ART_LOESCHEN,
} = require('../../shared/database/record-write.js');
const { kennungFuer, nummerAus } = require('../../shared/database/record-identity.js');

// --- Der Katalog der Lagen (B5, AK12) --------------------------------------------------

// Wenige Codes mit Parametern, je fachlicher Lage einer. Die Einzelheit steht
// als Parameter am Befund (Feld, Typ, Tabelle, Kennung, Halter) und nicht als
// eigener Code; sonst wüchse der Katalog mit jeder Spalten-Art.
//
// Die Namen tragen das Präfix `auftrag`, weil sie neben den Codes der Sperre
// (`sperr…`), des Belegs (`beleg…`) und des Zählers (`vorgang…`) stehen und ein
// Aufrufer sie ohne Nachschlagen auseinanderhalten soll.
const LAGEN = Object.freeze({
  // Das Tor. Fail-closed: Auch eine fehlende Naht führt hierher.
  erweiterungAus: 'auftragErweiterungAus',
  wurzelFehlt: 'auftragWurzelFehlt',
  // Ein Auftrag ohne Anweisung ist keine Störung der Anwendung, sondern eine
  // eigene, benannte Lage: Es gibt nichts zu tun, und geschrieben wird nichts.
  leer: 'auftragLeer',
  form: 'auftragFormUngueltig',
  tabelleAusserhalb: 'auftragTabelleAusserhalbBereich',
  tabelleUnbekannt: 'auftragTabelleUnbekannt',
  // Ein Wert für ein Feld, das die Definition nicht kennt. Die Lage steht nicht
  // in der Mindest-Liste aus B5 und ist trotzdem zwingend: Die Zellen eines
  // Datensatzes sind POSITIONSBASIERT (E3.3), und ein Feld ohne Position hat
  // keine Zelle, in die sein Wert geschrieben werden könnte. Ein stilles
  // Weglassen wäre der eine Fehler, den ein Datenspeicher nicht machen darf.
  feldUnbekannt: 'auftragFeldUnbekannt',
  typVerletzt: 'auftragTypVerletzt',
  pflichtFehlt: 'auftragPflichtAngabeFehlt',
  datensatzUnbekannt: 'auftragDatensatzUnbekannt',
  // Dieselbe Kennung liegt in zwei Dateien derselben Tabelle. Innerhalb EINER
  // Datei meldet das Zurückschreiben den Fall selbst; über die Segmente hinweg
  // sieht ihn nur, wer sie alle gelesen hat, also diese Schnittstelle.
  datensatzMehrdeutig: 'auftragDatensatzMehrdeutig',
  // 4T-001822 (Epic 3E-000254, Nachschärfung): Derselbe Datensatz steht in zwei
  // Anweisungen eines Auftrags. Die Lage nennt die zweite Nennung als Position
  // und die erste als `erstePosition`.
  datensatzMehrfach: 'auftragDatensatzMehrfach',
  kennungVergeben: 'auftragKennungVergeben',
  pruefBefund: 'auftragPruefBefund',
  gesperrt: 'auftragSperreNichtErlangt',
  vorgangFehlt: 'auftragVorgangNichtGezogen',
  lesenFehlgeschlagen: 'auftragLesenFehlgeschlagen',
  schreibenFehlgeschlagen: 'auftragSchreibenFehlgeschlagen',
  belegFehlgeschlagen: 'auftragBelegFehlgeschlagen',
  // 4T-001822 (Epic 3E-000254, B1): Eine Anweisung zum Ändern oder Löschen nennt
  // keinen zuletzt gelesenen Stand. Ohne ihn wäre der Auftrag ein stilles
  // Überschreiben ohne Beleg, also genau die Lücke, die der Vergleich schließt.
  erwartungFehlt: 'auftragErwartungFehlt',
  // 4T-001822 (Epic 3E-000254, B8, E9.3): Der unter der Sperre frisch gelesene
  // Datensatz weicht vom zuletzt gelesenen Stand ab, oder er ist fort
  // (`geloescht`). Die Lage nennt je abweichendem Feld den erwarteten und den
  // vorgefundenen Wert; der Anwender entscheidet danach über das Erzwingen.
  standWeichtAb: 'auftragStandWeichtAb',
  // 4T-001823 (Epic 3E-000254): Der Auftrag ist NACH der Marke des
  // Absichts-Protokolls gescheitert. Er wird nicht zurückgerollt, sondern im
  // Wiederanlauf vorwärts fertiggestellt; die Lage nennt, was bereits steht
  // (`geschriebeneDateien`, `angefuegteBelege`), den Grund (`grundCode`) und
  // den Pfad des stehen gebliebenen Protokolls (`protokoll`).
  teilweiseGeschrieben: 'auftragTeilweiseGeschrieben',
  // 4T-001824 (Epic 3E-000254, B4, B5): Ein früherer Auftrag liegt als Protokoll
  // im Sperr-Ordner, und sein Wiederanlauf ist nicht gelungen. Die Tabellen, die
  // das Protokoll nennt, nehmen bis dahin keine neuen Aufträge an (Entscheidung
  // des Product Owners vom 2026-09-20). Die Lage nennt die betroffenen Tabellen
  // (`tabellen`, wurzel-relativ), die Vorgangs-Kennung (`vorgang`), den Pfad des
  // Protokolls (`protokoll`) und die Lage des Wiederanlaufs (`lage`).
  haengt: 'auftragHaengt',
  // Ein Bruch, den keine der benannten Lagen beschreibt. Er bekommt einen
  // eigenen Code, statt als Sperr-Konflikt oder als Schreibfehler zu erscheinen:
  // Eine falsch benannte Lage führt die Fehlersuche in die falsche Richtung, und
  // der Katalog wäre nicht mehr vollständig (AK12).
  unerwartet: 'auftragUnerwarteterFehler',
});

// Entwickler-Text je Code. Er sagt, WAS die Lage ist; was der Anwender liest,
// entscheidet der Bedienort über einen Sprach-Schlüssel (AK12).
const LAGE_TEXTE = Object.freeze({
  [LAGEN.erweiterungAus]: 'Die Erweiterung «database» ist ausgeschaltet.',
  [LAGEN.wurzelFehlt]: 'Keine Bereichs-Wurzel übergeben.',
  [LAGEN.leer]: 'Der Auftrag nennt keine Anweisung.',
  [LAGEN.form]: 'Der Auftrag ist unbrauchbar geformt.',
  [LAGEN.tabelleAusserhalb]: 'Die Tabelle liegt außerhalb des Bereichs.',
  [LAGEN.tabelleUnbekannt]: 'Die Tabelle ist nicht lesbar oder trägt keine Definition.',
  [LAGEN.feldUnbekannt]: 'Die Definition der Tabelle kennt dieses Feld nicht.',
  [LAGEN.typVerletzt]: 'Der Wert passt nicht zum Typ seines Feldes.',
  [LAGEN.pflichtFehlt]: 'Ein Feld mit Pflicht-Angabe bleibt ohne Wert.',
  [LAGEN.datensatzUnbekannt]: 'Die Tabelle trägt keinen Datensatz mit dieser Kennung.',
  [LAGEN.datensatzMehrdeutig]: 'Die Kennung kommt in mehreren Dateien der Tabelle vor.',
  [LAGEN.datensatzMehrfach]: 'Der Auftrag nennt denselben Datensatz mehr als einmal.',
  [LAGEN.kennungVergeben]: 'Die Kennung ist in dieser Tabelle bereits vergeben.',
  [LAGEN.pruefBefund]: 'Die Prüf-Naht hat den Auftrag abgewiesen.',
  [LAGEN.gesperrt]: 'Eine benötigte Sperre war nicht zu bekommen.',
  [LAGEN.vorgangFehlt]: 'Die Vorgangs-Kennung ließ sich nicht ziehen.',
  [LAGEN.lesenFehlgeschlagen]: 'Eine Datei der Tabelle ließ sich nicht lesen.',
  [LAGEN.schreibenFehlgeschlagen]: 'Eine Datei der Tabelle ließ sich nicht bilden oder ersetzen.',
  [LAGEN.belegFehlgeschlagen]: 'Ein Änderungsbeleg ließ sich nicht anfügen.',
  [LAGEN.erwartungFehlt]: 'Die Anweisung nennt keinen zuletzt gelesenen Stand.',
  [LAGEN.standWeichtAb]: 'Der vorgefundene Stand des Datensatzes weicht vom zuletzt gelesenen ab.',
  [LAGEN.teilweiseGeschrieben]:
    'Der Auftrag ist nach der Marke des Absichts-Protokolls gescheitert; er wird vorwärts fertiggestellt.',
  // 4T-001824: Entwickler-Text; der Anwender-Text entsteht mit Kanal und Brücke.
  [LAGEN.haengt]:
    'Ein früherer Auftrag ist unterbrochen worden und wird beim nächsten Versuch zu Ende geschrieben; bis dahin nehmen die betroffenen Tabellen keine neuen Aufträge an.',
  [LAGEN.unerwartet]: 'Der Auftrag ist an einer unerwarteten Stelle gescheitert.',
});

/**
 * Baut einen Befund in der Meldungs-Form der Schnittstelle.
 *
 * @param {string} code Ein Code aus `LAGEN`.
 * @param {object} [mehr] Parameter der Lage (Position, Tabelle, Kennung, Feld …).
 * @returns {object} `{code, error, …mehr}`.
 */
function befund(code, mehr) {
  return { code, error: LAGE_TEXTE[code], ...(mehr || {}) };
}

// --- Form-Prüfung des Auftrags (B1) ----------------------------------------------------

function istEinfachesObjekt(wert) {
  return !!wert && typeof wert === 'object' && !Array.isArray(wert);
}

// Ein Wert ist ein Zell-TEXT und nichts anderes. `null` heißt «leeren» und wird
// zur leeren Zeichenkette; alles Übrige wäre eine stille Umwandlung, und wer
// eine Zahl als Zahl übergibt, meint vielleicht ein anderes Format, als diese
// Schnittstelle schriebe.
function alsZellText(roh) {
  if (roh === null) return '';
  return typeof roh === 'string' ? roh : null;
}

// Eine einzelne Anweisung lesen. Geprüft wird die GESTALT, nicht der Bestand:
// Ob es die Tabelle gibt und ob der Wert zum Typ passt, entscheiden die
// Stufen danach.
function leseAnweisung(roh, position) {
  const stelle = { position };
  if (!istEinfachesObjekt(roh)) return { ok: false, befund: befund(LAGEN.form, stelle) };
  const tabelle = typeof roh.tabelle === 'string' ? roh.tabelle.trim() : '';
  if (tabelle === '')
    return { ok: false, befund: befund(LAGEN.form, { ...stelle, feld: 'tabelle' }) };
  if (!ARTEN.includes(roh.art))
    return { ok: false, befund: befund(LAGEN.form, { ...stelle, tabelle, art: roh.art }) };

  // Beim Anlegen darf die Kennung fehlen (B1): Dann zieht die Schnittstelle sie
  // innerhalb des Auftrags selbst. Bei Ändern und Löschen ist sie das Ziel und
  // deshalb Pflicht.
  const kennungRoh = roh.id === undefined || roh.id === null || roh.id === '' ? null : roh.id;
  let id = null;
  if (kennungRoh !== null) {
    id = kennungFuer(nummerAus(kennungRoh));
    if (id === null)
      return { ok: false, befund: befund(LAGEN.form, { ...stelle, tabelle, id: kennungRoh }) };
  } else if (roh.art !== ART_ANLEGEN) {
    return { ok: false, befund: befund(LAGEN.form, { ...stelle, tabelle, art: roh.art }) };
  }

  const werte = {};
  if (roh.art !== ART_LOESCHEN) {
    if (roh.werte !== undefined && roh.werte !== null && !istEinfachesObjekt(roh.werte))
      return { ok: false, befund: befund(LAGEN.form, { ...stelle, tabelle, id }) };
    for (const [name, wert] of Object.entries(roh.werte || {})) {
      const text = alsZellText(wert);
      if (text === null)
        return { ok: false, befund: befund(LAGEN.form, { ...stelle, tabelle, id, feld: name }) };
      werte[name] = text;
    }
  }

  const erwartung = leseErwartung(roh, { ...stelle, tabelle, id });
  if (!erwartung.ok) return erwartung;

  // 4T-001822 (Epic 3E-000254, B6): Erzwingen ist eine Angabe an der einzelnen
  // Anweisung. Ein Wahrheitswert und nichts anderes, aus demselben Grund wie bei
  // den Werten: Wer `'ja'` übergibt, meint vielleicht etwas anderes, als diese
  // Schnittstelle daraus machte, und eine stille Umwandlung entschiede an seiner
  // Stelle über das Überschreiben einer fremden Fassung.
  const erzwingenRoh =
    roh.erzwingen === undefined || roh.erzwingen === null ? false : roh.erzwingen;
  if (typeof erzwingenRoh !== 'boolean')
    return {
      ok: false,
      befund: befund(LAGEN.form, { ...stelle, tabelle, id, feld: 'erzwingen' }),
    };

  return {
    ok: true,
    anweisung: {
      position,
      tabelle,
      art: roh.art,
      id,
      werte,
      erwartet: erwartung.erwartet,
      erzwingen: erzwingenRoh,
    },
  };
}

// 4T-001822 (Epic 3E-000254, B1): Der zuletzt gelesene Stand, den der Aufrufer
// je Anweisung mitgibt, als Zell-Texte nach Feld-Namen.
//
// **Beim Ändern und Löschen ist er Pflicht**, beim Anlegen wird er übergangen:
// Einen neuen Datensatz hat niemand gelesen, und eine mitgegebene Angabe dort
// ist folgenlos, nicht falsch. Ein leeres Objekt ist zulässig; dann vergleicht
// die Schnittstelle nichts, und das ist die Verantwortung des Aufrufers, der
// weiß, welche Werte er gezeigt hat.
function leseErwartung(roh, stelle) {
  if (roh.art === ART_ANLEGEN) return { ok: true, erwartet: {} };
  if (!istEinfachesObjekt(roh.erwartet))
    return { ok: false, befund: befund(LAGEN.erwartungFehlt, stelle) };
  const erwartet = {};
  for (const [name, wert] of Object.entries(roh.erwartet)) {
    const text = alsZellText(wert);
    if (text === null) return { ok: false, befund: befund(LAGEN.form, { ...stelle, feld: name }) };
    erwartet[name] = text;
  }
  return { ok: true, erwartet };
}

// 4T-001822 (Epic 3E-000254, Nachschärfung): Ein Auftrag nennt einen Datensatz
// höchstens einmal. Jede Anweisung wird am gelesenen und nicht am fortgeschriebenen
// Datensatz gemessen; zwei Anweisungen an denselben Datensatz bekämen deshalb
// je einen `stand`, von denen keiner der Stand nach dem Auftrag ist, und der
// Aufrufer führte eine falsche Erwartung weiter. Geprüft werden Ändern und
// Löschen; beim Anlegen greift bereits `kennungVergeben`. Verglichen wird die
// Tabellen-Angabe, wie die Anweisung sie nennt, weil die Form-Prüfung die
// Bereichs-Wurzel nicht kennt.
function mehrfachGenannte(anweisungen) {
  const erste = new Map();
  const lagen = [];
  for (const anweisung of anweisungen) {
    if (anweisung.art === ART_ANLEGEN || anweisung.id === null) continue;
    const schluessel = `${anweisung.tabelle}\u0000${anweisung.id}`;
    if (!erste.has(schluessel)) {
      erste.set(schluessel, anweisung.position);
      continue;
    }
    lagen.push(
      befund(LAGEN.datensatzMehrfach, {
        position: anweisung.position,
        tabelle: anweisung.tabelle,
        id: anweisung.id,
        erstePosition: erste.get(schluessel),
      }),
    );
  }
  return lagen;
}

/**
 * Prüft die Gestalt eines Auftrags und normalisiert seine Anweisungen (B1).
 *
 * @param {{anweisungen: Array<object>}} auftrag Der übergebene Auftrag.
 * @returns {{ok: true, anweisungen: Array<object>}|{ok: false, lagen: Array<object>}}
 *   Die normalisierte Anweisung trägt `{position, tabelle, art, id, werte,
 *   erwartet, erzwingen}`; `id` ist beim Anlegen ohne vorheriges Eröffnen null,
 *   `erwartet` ist beim Anlegen leer (4T-001822).
 */
function pruefeAuftragForm(auftrag) {
  if (!istEinfachesObjekt(auftrag)) return { ok: false, lagen: [befund(LAGEN.form)] };
  const roh = auftrag.anweisungen;
  if (!Array.isArray(roh)) return { ok: false, lagen: [befund(LAGEN.form)] };
  if (roh.length === 0) return { ok: false, lagen: [befund(LAGEN.leer)] };

  const anweisungen = [];
  const lagen = [];
  roh.forEach((eintrag, position) => {
    const gelesen = leseAnweisung(eintrag, position);
    if (gelesen.ok) anweisungen.push(gelesen.anweisung);
    else lagen.push(gelesen.befund);
  });
  lagen.push(...mehrfachGenannte(anweisungen));
  // Alle Form-Befunde auf einmal, aus demselben Grund wie bei Typ und Pflicht:
  // Ein Aufrufer soll seinen Auftrag in einem Zug in Ordnung bringen können.
  if (lagen.length > 0) return { ok: false, lagen };
  return { ok: true, anweisungen };
}

// --- Die Felder der Definition ---------------------------------------------------------

/**
 * Die Felder einer Definition auf ihre Positionen, nach Namen ansprechbar.
 *
 * Verglichen wird ohne Groß-Kleinschreibung, weil die Definition ihre Namen
 * nach derselben Regel gegen Doppelte prüft (`parseDefinitionsListe`); zwei
 * Felder, die sich nur in der Schreibung unterscheiden, gibt es damit nicht.
 *
 * @param {Array<{name: string, type?: string, required?: boolean}>} fields
 * @returns {Map<string, {index: number, feld: object}>}
 */
function feldKarte(fields) {
  const karte = new Map();
  (Array.isArray(fields) ? fields : []).forEach((feld, index) => {
    if (!feld || typeof feld.name !== 'string') return;
    const schluessel = feld.name.toLowerCase();
    if (!karte.has(schluessel)) karte.set(schluessel, { index, feld });
  });
  return karte;
}

/**
 * Die Zellen einer Anweisung in der Reihenfolge der Felder (E3.3).
 *
 * **Die Liste ist bewusst LÜCKENHAFT.** `zellenNach` in `record-write.js` geht
 * mit `forEach` über die übergebenen Werte, und `forEach` überspringt die
 * Lücken einer dünn besetzten Liste; genau dadurch bleibt eine Zelle, die die
 * Anweisung nicht nennt, unangetastet stehen. Eine dicht besetzte Liste mit
 * leeren Zeichenketten leerte dagegen jedes nicht genannte Feld.
 *
 * @param {object} werte Zell-Texte nach Feld-Namen.
 * @param {Map} karte Die Feld-Karte der Tabelle.
 * @returns {Array<string>} Dünn besetzte Liste, Position = Feld-Position.
 */
function zellenAus(werte, karte) {
  const zellen = [];
  for (const [name, text] of Object.entries(werte || {})) {
    const treffer = karte.get(name.toLowerCase());
    if (treffer) zellen[treffer.index] = text;
  }
  return zellen;
}

// --- Typ und Pflicht-Angabe, hart (E22.3, AK3) -----------------------------------------

// «Nicht gesetzt» heißt: leerer getrimmter Zell-Text (Entscheidung des Product
// Owners vom 2026-09-20).
//
// **Mit einer am Format abgelesenen Ausnahme, dem Wahrheitswert.** Sein
// Wertevorrat besteht aus genau zwei Texten: `x` beziehungsweise `X` für wahr
// und die **leere Zelle** für falsch (`zellWert` in `record-values.js`; die
// leere Zelle liefert dort `value: false` und keinen Befund, während sie bei
// jedem anderen Typ `null`, also «nicht gesetzt», bedeutet). Die leere Zelle ist
// hier also ein ausdrücklich geschriebener Wert und kein fehlender. Ein
// Pflicht-Wahrheitswert fehlt damit allein dort, wo die Anweisung ihn beim
// Anlegen gar nicht nennt — diesen Fall prüft `pruefeAnweisung` unten über die
// genannten Feld-Namen und nicht über den Text.
function istNichtGesetzt(text, typ) {
  if (typ === 'boolean') return false;
  return typeof text !== 'string' || text.trim() === '';
}

// Die Prüfung EINER Anweisung gegen die Definition ihrer Tabelle.
function pruefeAnweisung(anweisung, felder, karte, lagen) {
  const stelle = { position: anweisung.position, tabelle: anweisung.tabelle, id: anweisung.id };
  // Gelöscht wird ein ganzer Datensatz; es gibt keinen Wert, der zu prüfen wäre.
  if (anweisung.art === ART_LOESCHEN) return;

  for (const [name, text] of Object.entries(anweisung.werte)) {
    const treffer = karte.get(name.toLowerCase());
    if (!treffer) {
      // 4T-001822: `angabe` sagt, ob der Name aus den Werten oder aus der
      // Erwartung stammt; der Bedienort braucht das für seine Meldung.
      lagen.push(befund(LAGEN.feldUnbekannt, { ...stelle, feld: name, angabe: 'werte' }));
      continue;
    }
    const typ = treffer.feld.type;
    const { error } = zellWert(typ, text);
    if (error !== null) {
      lagen.push(
        befund(LAGEN.typVerletzt, { ...stelle, feld: treffer.feld.name, typ, wert: text }),
      );
      continue;
    }
    // Ein ausdrücklich geleertes Pflicht-Feld ist eine fehlende Pflicht-Angabe,
    // beim Ändern wie beim Anlegen. Ob der Datensatz NACH der Änderung noch ein
    // anderes Pflicht-Feld leer lässt, prüft `pruefePflichtAmErgebnis` unter den
    // Sperren, weil es dafür den vorgefundenen Stand braucht.
    if (treffer.feld.required === true && istNichtGesetzt(text, typ))
      lagen.push(befund(LAGEN.pflichtFehlt, { ...stelle, feld: treffer.feld.name }));
  }

  // Beim Anlegen ist der ganze Datensatz bekannt: Ein Pflicht-Feld, das die
  // Anweisung gar nicht nennt, bleibt leer und fehlt damit.
  if (anweisung.art !== ART_ANLEGEN) return;
  const genannt = new Set(Object.keys(anweisung.werte).map((name) => name.toLowerCase()));
  for (const feld of felder) {
    if (feld.required !== true) continue;
    if (!genannt.has(String(feld.name).toLowerCase()))
      lagen.push(befund(LAGEN.pflichtFehlt, { ...stelle, feld: feld.name }));
  }
}

/**
 * Prüft Typ und Pflicht-Angabe aller Anweisungen eines Auftrags (AK3).
 *
 * **Hart und vollständig:** Bei irgendeinem Befund wird nichts geschrieben, und
 * gemeldet werden ALLE Befunde des Auftrags, nicht nur der erste.
 *
 * @param {Array<object>} anweisungen Die normalisierten Anweisungen.
 * @param {Map<string, {fields: Array<object>, karte: Map}>} tabellen Definition
 *   je Tabellen-Angabe der Anweisung.
 * @returns {Array<object>} Die Befunde; leer heißt «keine Beanstandung».
 */
function pruefeWerte(anweisungen, tabellen) {
  const lagen = [];
  for (const anweisung of anweisungen) {
    const tabelle = tabellen.get(anweisung.tabelle);
    // Eine Tabelle, die gar nicht aufgelöst werden konnte, hat ihre eigene Lage
    // bereits bekommen; hier gibt es nichts zu prüfen.
    if (!tabelle) continue;
    pruefeAnweisung(anweisung, tabelle.fields, tabelle.karte, lagen);
    pruefeErwartungsFelder(anweisung, tabelle.karte, lagen);
  }
  return lagen;
}

// 4T-001822 (Epic 3E-000254, B1): Ein Feld-Name im zuletzt gelesenen Stand, den
// die Definition nicht kennt, wird abgewiesen wie in den Werten. Stillschweigend
// übergangen, verglich der Auftrag weniger, als der Aufrufer zu vergleichen
// glaubt, und eine Fremd-Änderung an diesem Feld bliebe unbemerkt. Geprüft wird
// vor den Sperren, weil dafür die Definition genügt.
function pruefeErwartungsFelder(anweisung, karte, lagen) {
  const stelle = { position: anweisung.position, tabelle: anweisung.tabelle, id: anweisung.id };
  for (const name of Object.keys(anweisung.erwartet || {})) {
    if (!karte.has(name.toLowerCase()))
      lagen.push(befund(LAGEN.feldUnbekannt, { ...stelle, feld: name, angabe: 'erwartet' }));
  }
}

module.exports = {
  LAGEN,
  LAGE_TEXTE,
  ART_ANLEGEN,
  ART_AENDERN,
  ART_LOESCHEN,
  ARTEN,
  befund,
  pruefeAuftragForm,
  feldKarte,
  zellenAus,
  istNichtGesetzt,
  pruefeWerte,
};
