// 4T-001506 (Epic 3E-000250): Behälter der Tabellen-Definition im Frontmatter
// und das interne Profil, das seine Gestalt beschreibt und prüft.
//
// Der erste Baustein der Datenbank-Funktionalität: Eine Markdown-Datei sagt
// über einen eigenen Frontmatter-Schlüssel, dass sie eine Datenbank-Tabelle
// ist, und trägt dort ihre Feld-Definitionen. Die Datensätze derselben Datei
// (`perspective-records`-Fence) und der Katalog, der die Definitionen
// bereitstellt, folgen in eigenen Vorgängen.
//
// Drei Entscheidungen des Konzept-Dokuments «Datenbank-Anwendungen als
// Markdown» (Kapitel 6) tragen dieses Modul:
//
//   E1  Die Definition liegt im Frontmatter DERSELBEN Datei, die später die
//       Datensätze trägt — nicht in einer Begleitdatei. Eine Begleitdatei
//       bliebe beim Umbenennen außerhalb der Anwendung zurück, und was
//       zurückbliebe, wäre eine Datei mit tausenden Datenzeilen, die niemand
//       mehr deuten kann.
//   E24 Eine Tabellen-Definition ist KEIN Eigenschafts-Profil, sondern ein
//       eigener Behälter, dessen GESTALT ein internes Profil beschreibt. Das
//       Profil setzt damit eine Ebene höher an: Es beschreibt nicht die
//       Daten, sondern die Definition. Das Tabellen-Dokument bleibt ein
//       gewöhnliches Dokument und steht nie im Profil-Katalog.
//   E19 Es entsteht kein zweites Definitions-Format: Ein Definitions-Eintrag
//       nutzt das Feld-Format der Eigenschafts-Profile, und seine einzige
//       Pflichtangabe bleibt der Name.
//
// **Warum das interne Profil hier prüft und nicht nur beschreibt.** Die
// Auflage aus E24 lautet wörtlich, es ziehe seinen Typ-Wertevorrat aus
// derselben Konstante wie der Parser; ein von Hand gepflegtes Profil wäre
// beim nächsten neuen Spalten-Typ falsch, ohne dass es jemand bemerkt. Der
// Parser unten geht deshalb nicht an einer eigenen Liste von Schlüsseln
// entlang, sondern an den Feldern des Profils: Welche Angaben ein
// Definitions-Eintrag tragen darf, welchen Typ sie haben und welche Werte am
// Typ zulässig sind, steht genau einmal, nämlich in `dbFieldProfileFields()`.
// Geprüft wird mit `fieldDefinitionHint` der Profil-Maschinerie, also mit
// demselben Werkzeug, mit dem die Anwendung einen Eigenschafts-Wert gegen
// seine Definition prüft.
//
// **Das interne Profil wird NICHT in den Profil-Katalog eingespeist**, anders
// als das Ereignis-Profil, dessen Vorbild E24 sonst nennt. Das Ereignis-Profil
// beschreibt Dokumente und wird deshalb zugewiesen; dieses hier beschreibt
// einen Definitions-Eintrag. Eingespeist böte es sich als Profil für beliebige
// Dokumente an, und das wäre gegenstandslos. Übernommen ist vom Vorbild, was
// E24 meint: ein internes Profil im Code statt einer Datei im Profil-Ordner.
//
// **Weiche Linie wie im ganzen Haus** (Fehler-Isolations-Muster der
// Eigenschafts-Profile): Eine defekte Einzel-Angabe entfällt und wird als
// Hinweis gemeldet, der Eintrag bleibt wirksam; ein defekter Eintrag entfällt,
// die übrigen bleiben. Nie ein Wurf, und das Dokument bleibt in jedem Fall
// benutzbar. Nur der Typ ist die Ausnahme, aus dem Grund, aus dem das
// Format-Modul der Profile ebenso verfährt: Eine Spalte ohne deutbaren Typ ist
// keine Spalte.
//
// Prozess-neutral (kein Electron, kein DOM): Main (Katalog, Datenpfad) und
// Renderer (Anzeige, Masken) laden dasselbe Modul.
'use strict';

// Alle Verbraucher der Profil-Maschinerie laden ihre Fassade — sie ist der
// eine Ort, an dem geladen wird, und reicht alles Öffentliche weiter.
const {
  fieldDefinitionHint,
  isEmptyPropertyValue,
  // 4T-001507 (E5, AK3): Wertebereich und Vorgabewert einer Spalte laufen durch
  // dieselben Normalisierer wie die einer Dokument-Eigenschaft. E19 verlangt EIN
  // Definitions-Format, und ein zweiter Normalisierer wäre der Anfang eines
  // zweiten Formats.
  normalizeValuesList,
  normalizeDefault,
} = require('../property-profiles.js');

// --- Der Behälter ------------------------------------------------------------------

// Frontmatter-Schlüssel des Definitions-Behälters. Er liegt seit 4T-001510 im
// Blatt-Modul `behaelter.js`, weil der Link-Index ihn braucht und dabei nicht
// die ganze Profil-Maschinerie laden soll; die Begründung der Benennung steht
// dort. Hier bleibt der Weiterreicher, damit sich für die Verbraucher dieses
// Moduls nichts ändert.
const { DB_TABLE_KEY } = require('./behaelter.js');

// Schlüssel der Feld-Definitionen INNERHALB des Behälters. Der Behälter ist
// bewusst eine Zuordnung und keine bloße Liste: Auf seiner oberen Ebene stehen
// die Angaben zur Tabelle als Ganzes (Hochwasserstand der internen Kennung,
// fachlicher Schlüssel, Anzeige-Form), die in eigenen Vorgängen folgen.
const DB_FIELDS_KEY = 'fields';

// --- Der Spalten-Typ-Satz ----------------------------------------------------------

// 4T-001507: Der Typ-Satz samt seinen begründeten Ausschlüssen und den
// typ-eigenen Angaben einer Spalte liegt seit dem Typ-Ausbau im Blatt-Modul
// `table-columns.js` (Begründung dort). Hier wird er nur gelesen und für die
// Verbraucher weitergereicht — die eine Konstante, aus der sowohl das interne
// Profil als auch der Parser ihren Wertevorrat ziehen (Auflage aus E24).
const {
  DB_COLUMN_TYPES,
  DB_DEFAULT_COLUMN_TYPE,
  normalisiereSpaltenOptionen,
  spaltenTyp,
} = require('./table-columns.js');
// 4T-001508: Hinweis-Katalog und Bauplan (Gestalt der Diagnose).
const { HINWEIS_META, baueHinweis } = require('./table-hinweise.js');
// 4T-001508 (E5.1 bis E5.3): Kennung, Hochwasserstand, fachlicher Schlüssel und
// Anzeige-Form. Die Identität entsteht in der Definition und nicht in den Daten;
// das Modul trägt die Regeln, dieses hier liest sie aus dem Behälter.
const {
  normalisiereHochwasserstand,
  normalisiereSchluessel,
  normalisiereAnzeigeForm,
} = require('./record-identity.js');
// 4T-001509 (E21.2): Die Beschriftung eines Datenbank-Objekts liegt seit dem
// Steckbrief im Blatt-Modul `beschriftung.js`, weil sie nicht der Tabelle
// gehört, sondern jedem übersetzbaren Objekt (Begründung dort). Die beiden
// kleinen Normalisierer reisen mit ihr, weil sie ihre Bausteine sind.
const { istEinfachesObjekt, alsText, normalisiereBeschriftung } = require('./beschriftung.js');

// --- Das interne Profil ------------------------------------------------------------

// Name des internen Profils. Fest und nicht lokalisiert wie EVENT_PROFILE_NAME;
// die Begriffs-Trennung aus E18.1 gilt: «Feld» ist der Begriff der Definition,
// «Spalte» die Erscheinungsform eines Feldes in der Tabellen-Form.
const DB_FIELD_PROFILE_NAME = 'Datenbank-Feld';

// Die Gestalt EINES Definitions-Eintrags, im Feld-Format der Profil-Auflösung
// ({ name, type, values, multiple, default }).
//
// **Was hier steht und was nicht.** Beschrieben sind die Angaben, die der
// Definitions-Eintrag als eigene trägt: sein Name, sein Spalten-Typ, seine
// Beschriftung und die Pflicht-Angabe. Nicht beschrieben sind `values`,
// `default` und `options` — sie gehören dem Feld-Format der Eigenschafts-
// Profile, das nach E19 seine eigene Beschreibung ist und kein zweites Mal
// beschrieben wird; ihre Gestalt hängt zudem am Typ der Spalte und ist in
// einem festen Profil gar nicht ausdrückbar. Der Parser liest sie seit
// 4T-001507 und lässt sie durch die Normalisierer des Feld-Formats laufen.
//
// `label` ist die eine benannte Ausnahme der Profil-Prüfung: Nach E21.2 ist es
// entweder Text ODER eine Zuordnung von Sprache zu Text, und beide Formen
// bleiben gültig, weil die weit überwiegende Zahl der Datenbanken einsprachig
// ist und eine erzwungene Sprach-Zuordnung eine Zeremonie ohne Gegenwert wäre.
// Ein Profil-Feld trägt genau einen Typ; die zweite Form prüft deshalb
// `normalisiereBeschriftung` unten, sichtbar neben dem Profil statt versteckt
// in ihm.
//
// `required` ist die Pflicht-Angabe aus E22.1: ein Wahrheitswert auf der oberen
// Ebene der Definition, nicht in `options` und nicht als Prüfregel. Ein
// Ausdruck statt des Wahrheitswerts ist nicht gewählt, aber nicht verbaut.
function dbFieldProfileFields() {
  return [
    { name: 'name', type: 'string', values: null, multiple: false, default: null },
    {
      name: 'type',
      type: 'string',
      // Der Wertevorrat kommt aus derselben Konstante wie der Parser (Auflage
      // aus E24). Kopiert, damit ein Aufrufer die Konstante nicht verändern
      // kann.
      values: [...DB_COLUMN_TYPES],
      multiple: false,
      default: DB_DEFAULT_COLUMN_TYPE,
    },
    { name: 'label', type: 'string', values: null, multiple: false, default: null },
    { name: 'required', type: 'boolean', values: null, multiple: false, default: null },
  ];
}

// Katalog-förmiger Profil-Eintrag, in der Gestalt, die die Profil-Auflösung
// kennt (`internal` = nicht änderbar und nicht löschbar, `fileName` null, weil
// keine Datei dahintersteht). Er wird bewusst nicht eingespeist (siehe
// Datei-Kopf); die Gestalt bleibt trotzdem die des Hauses, damit eine spätere
// Anzeige der Definition dieselben Bausteine verwenden kann.
function dbFieldProfile() {
  return {
    name: DB_FIELD_PROFILE_NAME,
    fileName: null,
    internal: true,
    fields: dbFieldProfileFields(),
    errors: [],
  };
}

// Einmal gebildet: Der Parser geht an diesen Feldern entlang, statt eine
// eigene Liste von Schlüsseln zu führen.
const PROFIL_FELDER = dbFieldProfileFields();
const TYP_FELD = PROFIL_FELDER.find((feld) => feld.name === 'type');
// Die optionalen Zusatz-Angaben: alles außer den beiden, die der Parser
// gesondert behandelt (Name als einzige Pflichtangabe, Typ als einzige Angabe,
// deren Fehlschlag den ganzen Eintrag entfallen lässt).
const ZUSATZ_FELDER = PROFIL_FELDER.filter((feld) => feld.name !== 'name' && feld.name !== 'type');

// --- Hinweise ----------------------------------------------------------------------

// 4T-001508: Katalog und Bauplan der Hinweise liegen seit der Identitäts-Stufe
// im Blatt-Modul `table-hinweise.js` (Begründung dort); hier wird nur gebaut.
// Die beiden Schlüssel des Behälters stehen dort als Zeichenketten; ein
// Prüffall hält sie gegen die Konstanten dieses Moduls.

// --- Normalisierung ----------------------------------------------------------------

// Eine Zusatz-Angabe gegen ihr Profil-Feld normalisieren. Liefert den Wert
// oder null (= Angabe nicht bildbar, entfällt einzeln mit Hinweis).
//
// Die Fallunterscheidung läuft über den TYP des Profil-Felds und nicht über
// seinen Namen: Was das Profil als Wahrheitswert beschreibt, muss einer sein;
// alles Übrige ist Text. Die Beschriftung ist die eine benannte Ausnahme
// (E21.2, siehe `dbFieldProfileFields`).
function normalisiereAngabe(profilFeld, roh) {
  if (profilFeld.name === 'label') return normalisiereBeschriftung(roh);
  const wert = profilFeld.type === 'boolean' ? roh : alsText(roh);
  if (wert === null) return null;
  return fieldDefinitionHint(profilFeld, wert) === null ? wert : null;
}

// Erwartung für die Meldung: der Wertevorrat, wo es einen gibt, sonst die
// festgehaltene Erwartung des Katalogs.
function erwartungFuer(profilFeld) {
  return Array.isArray(profilFeld.values) && profilFeld.values.length > 0
    ? [...profilFeld.values]
    : undefined;
}

// --- Der Parser --------------------------------------------------------------------

// Eine Liste von Definitions-Einträgen mit Fehler-Isolation je Eintrag.
function parseDefinitionsListe(rohListe, hinweise) {
  const fields = [];
  const gesehen = new Set();
  rohListe.forEach((eintrag, index) => {
    const melde = (code, name, expected) => {
      hinweise.push(baueHinweis(code, index, name, expected));
    };
    if (!istEinfachesObjekt(eintrag)) return melde('entry');
    const name = alsText(eintrag.name);
    if (name === null) return melde('name');
    if (gesehen.has(name.toLowerCase())) return melde('duplicate', name);

    // Der Typ ist die einzige Angabe, deren Fehlschlag den ganzen Eintrag
    // entfallen lässt: Eine Spalte ohne deutbaren Typ ist keine Spalte. Das
    // Format-Modul der Eigenschafts-Profile verfährt an derselben Stelle
    // ebenso. Ohne Angabe gilt die Vorgabe des Profils.
    let type = DB_DEFAULT_COLUMN_TYPE;
    if (eintrag.type !== undefined && !isEmptyPropertyValue(eintrag.type)) {
      const gelesen = normalisiereAngabe(TYP_FELD, eintrag.type);
      if (gelesen === null) {
        // 4T-001507: Das Profil entscheidet, OB der Typ zulässig ist; der
        // Typ-Befund sagt, WARUM nicht. Beide lesen denselben Typ-Satz, der
        // Befund kann hier also keinen gültigen Typ mehr liefern — der Rückfall
        // steht trotzdem da, weil eine Meldung ohne Code nichts aussagte.
        const befund = spaltenTyp(eintrag.type);
        return melde(befund.code || 'type', name, [...DB_COLUMN_TYPES]);
      }
      type = gelesen;
    }

    const definition = { name, type };
    for (const profilFeld of ZUSATZ_FELDER) {
      const roh = eintrag[profilFeld.name];
      // Eine nicht gesetzte Angabe ist kein Verstoß: Die einzige Pflichtangabe
      // eines Definitions-Eintrags ist der Name (E19).
      if (roh === undefined || isEmptyPropertyValue(roh)) continue;
      const wert = normalisiereAngabe(profilFeld, roh);
      if (wert === null) {
        melde(profilFeld.name, name, erwartungFuer(profilFeld));
        continue;
      }
      definition[profilFeld.name] = wert;
    }

    // 4T-001507 (E5): Die mehrwertige Spalte ist eine 1:n-Beziehung, die sich
    // als Spalte tarnt, und gibt es nicht. Anders als bei `type: multistring`
    // bleibt die Spalte hier bestehen: Ein deutbarer Typ steht da, allein die
    // Vielzahl entfällt — die weiche Linie, wie bei jeder anderen Angabe.
    if (eintrag.multiple === true) melde('multipleColumn', name, [...DB_COLUMN_TYPES]);

    // Der Wertebereich ist eine Angabe AM Typ und wird kein eigener Typ (E5);
    // ein Wahrheitswert hat seine zwei Werte per Konstruktion, ein Langtext ist
    // Freitext. Beide Regeln sind die des Feld-Formats, hier auf den
    // Spalten-Typ-Satz angewandt.
    let values = null;
    if (eintrag.values !== undefined && eintrag.values !== null) {
      if (!Array.isArray(eintrag.values) || type === 'boolean' || type === 'multiline') {
        melde('values', name);
      } else {
        values = normalizeValuesList(eintrag.values, type);
        if (values === null) melde('values', name);
        else definition.values = values;
      }
    }

    if (eintrag.default !== undefined && eintrag.default !== null) {
      const norm = normalizeDefault(eintrag.default, type);
      if (!norm.ok) {
        melde('default', name, type);
      } else {
        definition.default = norm.value;
        const werte = Array.isArray(norm.value) ? norm.value : [norm.value];
        // Ein Vorgabewert außerhalb des Wertebereichs BLEIBT stehen und trägt
        // einen Hinweis für die Definitions-Pflege — die weiche Haltung des
        // Feld-Formats, hier unverändert übernommen.
        if (values !== null && !werte.every((v) => values.includes(v)))
          melde('defaultOutsideValues', name, values);
      }
    }

    if (eintrag.options !== undefined && eintrag.options !== null) {
      const geprueft = normalisiereSpaltenOptionen(eintrag.options, type, values !== null);
      if (geprueft === null) {
        melde('options', name);
      } else {
        for (const hinweis of geprueft.hints) melde(hinweis.code, name, hinweis.expected);
        definition.options = geprueft.options;
      }
    }

    gesehen.add(name.toLowerCase());
    fields.push(definition);
  });
  return fields;
}

// Trägt der Metadaten-Block den Definitions-Behälter? Die bloße ANWESENHEIT
// des Schlüssels weist die Datei als Datenbank-Tabelle aus, unabhängig davon,
// ob sein Inhalt brauchbar ist: Ein defekter Behälter ist eine Tabelle mit
// einem Fehler und nicht plötzlich ein gewöhnliches Dokument. Sonst
// verschwände eine Tabelle mit einem Tippfehler still aus der Datenbank,
// mitsamt ihren Datensätzen.
function istTabellenDokument(data) {
  return istEinfachesObjekt(data) && data[DB_TABLE_KEY] !== undefined;
}

// Liest den Definitions-Behälter aus dem Frontmatter-Objekt eines Dokuments.
//
// Liefert { istTabelle, fields, hints } plus — nur wenn die Datei sie trägt —
// { lastId, key, display }: `fields` sind die gültigen, normalisierten
// Definitionen { name, type } samt ihren optionalen Angaben, `hints` die
// gesammelten Hinweise in der Gestalt oben. Fehler-Codes:
//   container            Behälter ist kein einfaches Objekt (keine Definitionen)
//   fieldsNotList        `fields` im Behälter ist keine Liste
//   entry                Definitions-Eintrag ist kein Objekt
//   name                 Feldname fehlt oder ist leer
//   duplicate            Feldname doppelt (case-insensitiv)
//   type                 Typ im Feld-Format unbekannt (Eintrag entfällt)
//   typeComputed         berechnetes Feld, an einer Spalte ausgeschlossen (Eintrag entfällt)
//   typeStructured       strukturierter Wert, an einer Spalte ausgeschlossen (Eintrag entfällt)
//   multipleColumn       mehrwertige Spalte (bei `multiple` entfällt die Angabe,
//                        bei `type: multistring` der Eintrag)
//   label                Beschriftung weder Text noch Sprach-Zuordnung (entfällt)
//   required             Pflicht-Angabe ist kein Wahrheitswert (entfällt)
//   values               Wertebereich nicht bildbar oder Typ ohne Wertebereich (entfällt)
//   default              Vorgabewert passt nicht zum Typ (entfällt)
//   defaultOutsideValues Vorgabewert außerhalb des Wertebereichs (bleibt, Hinweis)
//   options              Options-Objekt nicht bildbar (entfällt)
//   optionUnknown        Options-Schlüssel am erklärten Typ nicht vorgesehen (entfällt einzeln)
//   optionValue          Options-Schlüssel vorgesehen, Wert nicht bildbar (entfällt einzeln)
//   lastId               Hochwasserstand ist keine nicht-negative Ganzzahl (entfällt)
//   key                  fachlicher Schlüssel nicht bildbar (entfällt ganz)
//   keyUnknown           ein Schlüssel-Teil nennt kein vorhandenes Feld (entfällt ganz)
//   display              Anzeige-Form ist kein Feld-Name (entfällt)
//   displayUnknown       Anzeige-Form nennt kein vorhandenes Feld (entfällt)
//
// Angaben, die dieses Modul (noch) nicht beschreibt, bleiben unangetastet und
// hinweisfrei — dieselbe Zusage, die das Feld-Format der Eigenschafts-Profile
// über alle seine Stufen gehalten hat: Eine Datei, die für eine spätere Stufe
// geschrieben wurde, darf heute schon dastehen, ohne Schaden anzurichten. Das
// betrifft heute vor allem `valuesFrom`: Ob eine Spalte ihren Wertevorrat aus
// einer Quelle zieht, ist nicht entschieden und bleibt additiv nachrüstbar.
function parseTableDefinition(data) {
  const hints = [];
  if (!istTabellenDokument(data)) return { istTabelle: false, fields: [], hints };
  const behaelter = data[DB_TABLE_KEY];
  // Ein leerer Behälter ist eine Tabelle, die ihre Felder noch nicht kennt —
  // kein Fehler, sondern der Zustand unmittelbar nach dem Anlegen.
  if (behaelter === null) return { istTabelle: true, fields: [], hints };
  if (!istEinfachesObjekt(behaelter)) {
    hints.push(baueHinweis('container', -1, null));
    return { istTabelle: true, fields: [], hints };
  }

  const roh = behaelter[DB_FIELDS_KEY];
  let fields = [];
  if (roh !== undefined && roh !== null) {
    if (!Array.isArray(roh)) hints.push(baueHinweis('fieldsNotList', -1, null));
    else fields = parseDefinitionsListe(roh, hints);
  }

  const ergebnis = { istTabelle: true, fields, hints };
  leseIdentitaet(behaelter, fields, ergebnis, hints);
  return ergebnis;
}

// 4T-001508 (E5.1 bis E5.3): Die Angaben zur Identität stehen auf der oberen
// Ebene des Behälters und nicht an einem Feld — sie betreffen die Tabelle als
// Ganzes. Sie erscheinen am Ergebnis nur, wenn die Datei sie trägt; das ist
// dieselbe Regel wie bei den optionalen Angaben eines Definitions-Eintrags und
// hält den Unterschied zwischen «keine Angabe» und «Angabe, die verworfen
// wurde» sichtbar.
//
// **Der Hochwasserstand wird auch ohne Felder gelesen.** Eine Tabelle, deren
// Definition noch keine Spalte kennt, kann bereits Kennungen vergeben haben,
// und ein übersehener Stand wäre die Wiederverwendung, die E5.1 ausschließt.
// Schlüssel und Anzeige-Form dagegen nennen Feld-Namen und werden gegen die
// gelesenen Felder geprüft.
function leseIdentitaet(behaelter, fields, ergebnis, hints) {
  if (behaelter.lastId !== undefined && behaelter.lastId !== null) {
    const stand = normalisiereHochwasserstand(behaelter.lastId);
    if (stand === null) hints.push(baueHinweis('lastId', -1, null));
    else ergebnis.lastId = stand;
  }

  const { schluessel, code: schluesselCode } = normalisiereSchluessel(behaelter.key, fields);
  if (schluesselCode)
    hints.push(baueHinweis(schluesselCode, -1, null, erwartung(schluesselCode, fields)));
  else if (schluessel !== null) ergebnis.key = schluessel;

  const { anzeige, code: anzeigeCode } = normalisiereAnzeigeForm(behaelter.display, fields);
  if (anzeigeCode) hints.push(baueHinweis(anzeigeCode, -1, null, erwartung(anzeigeCode, fields)));
  else if (anzeige !== null) ergebnis.display = anzeige;
}

// Bei einem Namen, den keine Definition kennt, ist die Liste der **wirklichen**
// Feld-Namen die Auskunft, die weiterhilft: Wer einen Schlüssel auf ein Feld
// legt, das es nicht gibt, hat sich meist vertippt. Bei einer unbrauchbaren
// Angabe dagegen bleibt die feste Erwartung des Katalogs stehen, weil dort die
// Form das Problem ist und nicht der Name.
function erwartung(code, fields) {
  return code.endsWith('Unknown') ? fields.map((feld) => feld.name) : undefined;
}

module.exports = {
  DB_TABLE_KEY,
  DB_FIELDS_KEY,
  DB_COLUMN_TYPES,
  DB_DEFAULT_COLUMN_TYPE,
  DB_FIELD_PROFILE_NAME,
  HINWEIS_META,
  dbFieldProfileFields,
  dbFieldProfile,
  istTabellenDokument,
  parseTableDefinition,
};
