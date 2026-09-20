// 4T-001608 (Epic 3E-000278): Der Gleichheits-Nachweis, Abnahme-Bedingung des
// Epics.
//
// **Der Gegenstand.** Das Epic ersetzt fünf gewachsene Sprachdateien durch 39
// Fragmente je Sprache und einen Bau-Schritt, der daraus wieder
// `src/i18n/<code>.json` macht. Die tragende Zusage dieses Umbaus ist eine
// Gleichheit: Was die Anwendung nach der Umstellung liest, ist Schlüssel für
// Schlüssel und Wert für Wert dasselbe wie das, was sie davor gelesen hat.
// Dieses Modul belegt genau das — gegen den letzten Release-Stand, den die
// Git-Historie noch als versionierte Datei trägt.
//
// **Die Grenze des Nachweises.** Er belegt die Gleichheit des **Bestands**,
// nicht die Richtigkeit der **Zuordnung**. Ob ein Schlüssel im fachlich
// passenden Fragment liegt, ist eine Beurteilung und bleibt die Sichtprüfung
// aus 4T-001605; hier fiele sie nicht auf, weil das Erzeugnis dieselbe Menge
// trägt, egal aus welcher Datei ein Schlüssel kam. Ebenso ausdrücklich NICHT
// verglichen wird die Reihenfolge: Sie folgt jetzt der Zuordnungs-Tafel, das
// ist entschieden, und kein Leser des Erzeugnisses wertet sie aus.
//
// **Hinzugekommene Schlüssel sind erlaubt, fehlende und geänderte nicht.** Der
// Bezugsstand ist ein Release-Tag, und zwischen ihm und dem heutigen Stand
// liegen Vorgänge, die Texte hinzugefügt haben — 119 zum Stand des 2026-09-10.
// Sie werden gezählt und nicht bemängelt. Ein **fehlender** Schlüssel oder ein
// **geänderter Wert** ist dagegen ein Befund am Schnitt: Beides kann die
// Zerlegung verursacht haben, und beides sähe niemand, weil die Anwendung mit
// einem stillschweigend verlorenen Text weiterläuft.
//
// **Warum fail closed.** Ist `git` nicht aufrufbar oder der Baum kein
// Repositorium, wirft `bezugsstand` statt einen leeren Bezug zu liefern. Ein
// Nachweis, der still grün bleibt, weil er nichts lesen konnte, ist die
// Fehlerklasse `L11` in Reinform: eingerichtet, aber nicht scharf. Der Fall
// «kein Tag trägt die Datei» ist davon zu unterscheiden und ausdrücklich
// vorgesehen (siehe `bezugsstand`).
//
// **Der Ruhestand ist eingebaut.** Der Bezugsstand wandert mit jedem Release
// weiter. Sobald der erste Tag nach der Umstellung gesetzt ist, trägt kein von
// ihm erreichbarer Tag mehr eine versionierte `src/i18n/de.json` — spätestens
// dann liefert `bezugsstand` `{ tag: null }`, und der Nachweis hat seine
// Aufgabe erfüllt. Bis dahin läuft er bei jedem Lauf seines Prüf-Ausschnitts
// mit.
//
// **Der Ruhestand ist so nicht eingetreten** (gemessen am 2026-09-18,
// `4T-001778`): `bezugsstand` nimmt nicht den jüngsten Tag, sondern den
// jüngsten, der die Datei **trägt** — und die älteren Tags tragen sie weiter.
// Der Bezugsstand steht seit dem Release 1.133.0 unverrückbar auf `v1.132.0`.
// Folge: Jede Änderung an einem bestehenden Text braucht seither einen Eintrag
// in `ABWEICHUNGEN`. Die Auflösung ist ein eigener Vorgang, siehe dort.
//
// Aufruf von Hand: `node scripts/i18n-gleichheit.js` — druckt je Sprache die
// Zahlen und endet bei Abweichungen mit 1. Das ist der Beleg für die Abnahme.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { LOCALE_CODES } = require('./i18n-fragmente.js');

const REPO_WURZEL = path.resolve(__dirname, '..');

// Die Marke eines Releases: `v<major>.<minor>.<patch>`, nichts daneben. Ein
// Vorab- oder Arbeits-Tag darf den Bezugsstand nicht setzen.
const RELEASE_TAG_MUSTER = /^v\d+\.\d+\.\d+$/;

/** Repo-relativer Pfad der Sprachdatei einer Sprache, mit Schrägstrichen. */
function bezugsPfad(code) {
  return `src/i18n/${code}.json`;
}

/**
 * Bewusst geänderte Bestands-Texte seit dem Bezugsstand.
 *
 * Ein Eintrag hier nimmt einen Schlüssel aus dem Wert-Vergleich heraus und ist
 * damit genau die Stelle, an der ein Nachweis weich wird. Ein späteres
 * Vorhaben, das einen bestehenden Text ändert, hat zwei Wege — hier eintragen
 * mit Grund, oder auf den nächsten Release-Tag warten, mit dem der Bezugsstand
 * ohnehin weiterwandert.
 *
 * **Der zweite Weg steht seit dem Release 1.133.0 nicht mehr offen** (gemessen
 * am 2026-09-18, `4T-001778`): `bezugsstand()` nimmt die jüngste erreichbare
 * Marke, die `src/i18n/de.json` noch **trägt** — und seit jenem Release trägt
 * sie keine mehr. Der Bezugsstand steht damit dauerhaft auf `v1.132.0`, und der
 * im Kopf dieser Datei beschriebene Ruhestand tritt von selbst nicht mehr ein.
 * Bis das aufgelöst ist, bleibt der Eintrag hier der einzige Weg für jede
 * Änderung an einem bestehenden Text.
 *
 * @type {Array<{sprache: string, schluessel: string, grund: string}>}
 */
// 4T-001582 (Epic 3E-000283): Die erste Befüllung dieser Liste. Sechs
// Bestands-Texte sagen seit diesem Epic etwas Falsches — vier nennen einen
// Einstellungs-Abschnitt, der seinen Inhalt abgegeben hat, zwei ein Menü, das
// es nicht mehr gibt. Der zweite Weg aus dem Kommentar oben (auf den nächsten
// Release-Tag warten) trägt hier nicht: Es ist das eigene Release dieses Zuges,
// das die Texte falsch machen würde. Die Änderung betrifft je Schlüssel alle
// fünf Sprachen zugleich, weil ein Text nie in einer Sprache allein gepflegt
// wird; die Liste ist deshalb über die Sprach-Achse erzeugt und über die
// Schlüssel-Achse ausgeschrieben. Mit dem Release des Zuges geht der Nachweis
// in den Ruhestand, und die Liste entfällt mit ihm.
const GEAENDERTE_TEXTE = [
  {
    schluessel: 'help.featureAccess.statusbarCommandButtons',
    grund:
      'Die eigenen Kommando-Schaltflächen der Statusleiste liegen im Einstellungs-Abschnitt «Statusleiste» statt unter «Kommando-Platzierung» (4T-001581, Entscheidung E4a des Epics).',
  },
  {
    schluessel: 'help.featureAccess.statusbarHideList',
    grund:
      'Die Ausblend-Liste der Standard-Schaltflächen liegt im Einstellungs-Abschnitt «Statusleiste» statt unter «Kommando-Platzierung» (4T-001581, E4a).',
  },
  {
    schluessel: 'help.featureAccess.macros',
    grund:
      'Der Rest-Abschnitt der Erweiterung heißt «Kontextmenü und Makros»; der Name «Kommando-Platzierung» bezeichnet nur noch die Erweiterung selbst (4T-001581, E4a).',
  },
  {
    schluessel: 'help.featureAccess.contextMenuCommands',
    grund: 'Derselbe Abschnitts-Name wie bei den Makros (4T-001581, E4a).',
  },
  {
    schluessel: 'help.feature.statusbarCommandButtons',
    grund:
      'Das eigene Mehr-Menü des Kommando-Segments ist mit 4T-001579 entfallen; überzählige Schaltflächen wandern jetzt mit den übrigen Elementen der Leiste in deren beide Rand-Menüs.',
  },
  {
    schluessel: 'settings.commandPlacement.statusbarHint',
    grund: 'Dieselbe Aussage über das entfallene Mehr-Menü wie im Katalog-Text (4T-001579).',
  },
  {
    schluessel: 'help.feature.livePreview',
    grund:
      'Der Text sagte, Links erschienen in der Live-Ansicht wie in der Render-Pane; seit 4T-001719 (Epic 3E-000302, E1) sind sie dort dauerhaft unterstrichen statt erst beim Überfahren mit der Maus. Der Satz ist um diese Ausnahme ergänzt (4T-001720); der Bezugsstand liegt vor dem Release dieses Zuges, das den Text falsch machen würde.',
  },
  {
    schluessel: 'help.feature.tabs',
    grund:
      'Der Katalog-Text der Reiter und Spalten sagte nichts über die Beschriftung eines Reiters; seit 4T-001724 (Epic 3E-000304, E1 bis E4) trägt sie den Dateinamen ohne Markdown-Endung. Der Text ist um einen Satz dazu ergänzt (4T-001725) statt um einen eigenen Katalog-Eintrag, weil die Beschriftung Grundverhalten der Reiterleiste ist und in denselben Eintrag gehört; der Bezugsstand liegt vor dem Release dieses Zuges, das den Text unvollständig machen würde.',
  },
  {
    schluessel: 'help.feature.areaPanel',
    grund:
      'Der Katalog-Text des Bereichs-Panels sagte nichts über die Beschriftung einer Datei-Zeile; seit 4T-001775 (Epic 3E-000304) steht dort der Name ohne Markdown-Endung, nachdem der Product Owner am 2026-09-17 die Entscheidung E5 revidiert hat. Der Text ist um einen Satz dazu ergänzt, in denselben Eintrag wie bei den Reitern und aus demselben Grund; der Bezugsstand liegt vor dem Release dieses Zuges, das den Text unvollständig machen würde.',
  },
  {
    schluessel: 'help.feature.propertyProfiles',
    grund:
      'Zug 3E-000277 (4T-001507, 4T-001511): Katalog-Text der Eigenschafts-Profile um die beiden geteilten Spalten-Optionen erweitert, bevor der Bezugsstand entstand (Eintrag des Integrationsstands, beim Nachzug des Zuges 3E-000311 am 2026-09-18 in die erzeugte Liste uebernommen).',
  },
  // Beim Rebase auf das Release 1.137.0 angefügt: die Einträge des Zuges
  // 3E-000313 hinter denen des Integrationsstands. Beide Seiten bleiben nötig,
  // weil der Bezugsstand unverändert auf `v1.132.0` steht.
  ...['de', 'en', 'fr', 'es', 'it'].flatMap((sprache) => [
    {
      sprache,
      schluessel: 'help.feature.exportPortable',
      grund:
        '4T-001778 (Epic 3E-000291): Die Beschreibung zählt Konstrukt für Konstrukt auf, was der portable Export tut; mit der Teilnahme der Canvas-Fläche fehlte ihr ein Glied. Ein Satz ergänzt, der Schluss-Satz verweist seither auf beide Handbuch-Seiten.',
    },
    {
      sprache,
      schluessel: 'help.feature.canvas',
      grund:
        '4T-001778 (Epic 3E-000291): Die Beschreibung nennt, wo die Fläche außerhalb der Canvas-Ansicht erscheint; der portable Export ist der zweite dieser Orte und stand nicht darin. Ein Satz ergänzt.',
    },
  ]),
  // 4T-001797 (Epic 3E-000315): Die fünf Zugangs-Angaben der Flächen-Befehle
  // nennen den Menü-Weg wörtlich, und genau der hat sich geändert — aus
  // «Ansicht → <Befehl>» wird «Ansicht → Canvas-Fläche bearbeiten → <Befehl>». Ohne
  // diese 25 Einträge liefe das Gate rot, obwohl die Änderung gerade dafür
  // sorgt, dass der Text wieder stimmt.
  ...['de', 'en', 'fr', 'es', 'it'].flatMap((sprache) =>
    [
      ['canvasShapes', 'Form-Anlage'],
      ['canvasGroups', 'Gruppen-Anlage'],
      ['canvasStacking', 'Stapel-Reihenfolge'],
      ['canvasLinkCards', 'Verweis-Karten'],
      ['canvasImageCards', 'Bild-Karten'],
    ].map(([kurz, sache]) => ({
      sprache,
      schluessel: `help.featureAccess.${kurz}`,
      grund: `4T-001797 (Epic 3E-000315): Die Zugangs-Angabe der ${sache} nennt den Weg über das Ansichtsmenü; seit der Bündelung führt er über die Zwischenstufe «Canvas-Fläche bearbeiten». Nur diese eine Stelle des Wertes ist eingefügt, der Rest steht unverändert. In der italienischen Fassung der Verweis- und Bild-Karten ist zugleich der erste Schritt von «Vista» auf «Visualizza» berichtigt — so heißt das Menü dort.`,
    })),
  ),
  {
    schluessel: 'help.feature.workspaces',
    grund:
      'Der Katalog-Text der Arbeitsbereiche sagte nichts darueber, dass Untermenue und Verwaltung die Ordner-Bindung nennen und dass die Reihenfolge der Arbeitsbereiche in der Verwaltung gesetzt wird; beides ist mit 4T-001737 und 4T-001753 (Epic 3E-000308) hinzugekommen. Der Text ist um einen Satz dazu ergaenzt (4T-001740) statt um einen eigenen Katalog-Eintrag, weil beides Eigenschaften der bestehenden Verwaltung sind und keine eigene Funktion; der Bezugsstand liegt vor dem Release dieses Zuges, das den Text unvollstaendig machen wuerde.',
  },
  {
    schluessel: 'help.feature.myExtendedMemory',
    grund:
      'Der Katalog-Text von My Extended Memory nannte beim Arbeitsbereich nur, dass dort keine Kennzahlen stehen; seit 4T-001739 (Epic 3E-000308) fuehrt er neben der Zahl seiner Fenster die Zahl der darin geoeffneten Markdown-Dokumente. Der Text ist um einen Satz dazu ergaenzt (4T-001740), aus demselben Grund wie bei den Arbeitsbereichen: eine zweite Angabe an einer bestehenden Anzeige ist keine eigene Funktion.',
  },
];

const ABWEICHUNGEN = GEAENDERTE_TEXTE.flatMap(({ schluessel, grund }) =>
  LOCALE_CODES.map((sprache) => ({ sprache, schluessel, grund })),
);

/**
 * Vergleicht einen Bezugs-Katalog gegen den heutigen Ist-Katalog einer Sprache.
 *
 * Liefert Abweichungen UND die hinzugekommenen Schlüssel in einem Rutsch statt
 * in zwei Funktionen: Beides fällt in demselben Lauf über die Schlüssel an, und
 * ein zweiter Lauf über 3100 Schlüssel brächte nichts, was dieser nicht schon
 * gesehen hat.
 *
 * @param {Object<string,string>} bezug Katalog des Bezugsstands.
 * @param {Object<string,string>} ist Heutiger Katalog.
 * @param {{sprache?: string, abweichungen?: Array<{sprache: string, schluessel: string}>}} [optionen]
 *        Sprach-Code für die Meldungen und die Liste der bewusst geänderten
 *        Texte (Vorgabe: `ABWEICHUNGEN`).
 * @returns {{abweichungen: Array<{sprache: string, schluessel: string, art: string}>,
 *            hinzugekommen: string[]}} Befunde und die erlaubten Zugänge.
 */
function vergleicheKataloge(bezug, ist, { sprache = '', abweichungen = ABWEICHUNGEN } = {}) {
  const ausgenommen = new Set(
    (abweichungen || [])
      .filter((eintrag) => eintrag && eintrag.sprache === sprache)
      .map((eintrag) => eintrag.schluessel),
  );

  const befunde = [];
  for (const [schluessel, wert] of Object.entries(bezug)) {
    if (!Object.prototype.hasOwnProperty.call(ist, schluessel)) {
      befunde.push({ sprache, schluessel, art: 'fehlt' });
      continue;
    }
    if (ist[schluessel] !== wert && !ausgenommen.has(schluessel)) {
      befunde.push({ sprache, schluessel, art: 'wert' });
    }
  }

  const hinzugekommen = Object.keys(ist).filter(
    (schluessel) => !Object.prototype.hasOwnProperty.call(bezug, schluessel),
  );

  return { abweichungen: befunde, hinzugekommen };
}

/**
 * Vergleicht die fünf Sprachen untereinander gegen `de` als Referenz.
 *
 * Der Nachweis der Gleichheit über die Zeit deckt diesen Fall nicht ab: Ginge
 * ein Schlüssel in EINER Sprache verloren, während der Bezugsstand fehlt, bliebe
 * der Zeit-Vergleich stumm. Die Schlüsselgleichheit über die Sprachen ist
 * deshalb eine eigene Zusage.
 *
 * @param {Object<string,Object<string,string>>} dicts Kataloge je Sprach-Code.
 * @returns {Array<{sprache: string, schluessel: string, art: string}>}
 *          Befunde mit `art` «fehlt» oder «ueberzaehlig».
 */
function vergleicheSprachen(dicts) {
  const referenz = dicts.de;
  if (referenz == null) return [{ sprache: 'de', schluessel: '(alle)', art: 'fehlt' }];

  const referenzSchluessel = Object.keys(referenz);
  const referenzMenge = new Set(referenzSchluessel);
  const befunde = [];

  for (const sprache of Object.keys(dicts)) {
    if (sprache === 'de') continue;
    const dict = dicts[sprache];
    const menge = new Set(Object.keys(dict || {}));
    for (const schluessel of referenzSchluessel) {
      if (!menge.has(schluessel)) befunde.push({ sprache, schluessel, art: 'fehlt' });
    }
    for (const schluessel of menge) {
      if (!referenzMenge.has(schluessel)) {
        befunde.push({ sprache, schluessel, art: 'ueberzaehlig' });
      }
    }
  }
  return befunde;
}

/**
 * Der Bezugsstand: der jüngste Release-Tag, der vom aktuellen Stand erreichbar
 * ist UND die versionierte `src/i18n/de.json` noch trägt.
 *
 * Beide Bedingungen sind nötig. «Erreichbar» schließt Tags fremder Züge aus,
 * die den eigenen Stand nie gesehen haben; «trägt die Datei» ist der Schalter,
 * der den Nachweis nach der Umstellung in den Ruhestand schickt, statt ihn an
 * einem Tag scheitern zu lassen, der die Datei nicht mehr kennt.
 *
 * @param {{wurzel?: string}} [optionen] Arbeitsbaum, in dem `git` läuft.
 * @returns {{tag: string|null, dicts: Object<string,Object<string,string>>|null}}
 *          Tag und Kataloge, oder zweimal `null`, wenn kein Tag die Datei trägt.
 * @throws {Error} Wenn `git` nicht aufrufbar ist oder der Ordner kein
 *         Repositorium ist — fail closed, siehe Modulkopf.
 */
function bezugsstand({ wurzel = REPO_WURZEL } = {}) {
  // `stdio` mit gefangenem stderr: Sonst schreibt Git seine Meldung ungefragt
  // in die Ausgabe des Elternprozesses — und der Prüffall, der den Wurf
  // NACHWEIST, hinterließe in jedem grünen Suite-Lauf eine «fatal»-Zeile. Der
  // Text bleibt am geworfenen Fehler (`err.stderr`) erhalten.
  const tags = execFileSync('git', ['tag', '--merged', 'HEAD', '--sort=-v:refname'], {
    cwd: wurzel,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter((zeile) => RELEASE_TAG_MUSTER.test(zeile));

  for (const tag of tags) {
    // `git cat-file -e` endet mit 0 bei «vorhanden» und sonst mit einem
    // Fehler-Status; execFileSync würde den zweiten Fall als Wurf melden und
    // damit den Ruhestands-Fall mit dem fail-closed-Fall verwechseln.
    const vorhanden = spawnSync('git', ['cat-file', '-e', `${tag}:${bezugsPfad('de')}`], {
      cwd: wurzel,
      stdio: 'ignore',
    });
    if (vorhanden.status !== 0) continue;

    const dicts = {};
    for (const code of LOCALE_CODES) {
      const text = execFileSync('git', ['show', `${tag}:${bezugsPfad(code)}`], {
        cwd: wurzel,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
      dicts[code] = JSON.parse(text);
    }
    return { tag, dicts };
  }

  return { tag: null, dicts: null };
}

/**
 * Die heutigen Kataloge von der Platte — das Erzeugnis, das die Anwendung liest.
 *
 * @param {{wurzel?: string}} [optionen] Repo-Wurzel.
 * @returns {Object<string,Object<string,string>>} Kataloge je Sprach-Code.
 */
function istStand({ wurzel = REPO_WURZEL } = {}) {
  const dicts = {};
  for (const code of LOCALE_CODES) {
    dicts[code] = JSON.parse(
      fs.readFileSync(path.join(wurzel, 'src', 'i18n', `${code}.json`), 'utf8'),
    );
  }
  return dicts;
}

module.exports = {
  ABWEICHUNGEN,
  RELEASE_TAG_MUSTER,
  bezugsPfad,
  vergleicheKataloge,
  vergleicheSprachen,
  bezugsstand,
  istStand,
};

if (require.main === module) {
  const zeilen = [];
  let befunde = 0;

  const { tag, dicts } = bezugsstand();
  if (tag == null) {
    zeilen.push(
      'i18n-gleichheit: kein erreichbarer Release-Tag trägt src/i18n/de.json noch versioniert.',
      'Der Gleichheits-Nachweis ist damit im Ruhestand (Epic 3E-000278, 4T-001608).',
    );
  } else {
    const ist = istStand();
    zeilen.push(`i18n-gleichheit: Bezugsstand ${tag}`);
    for (const code of LOCALE_CODES) {
      const { abweichungen, hinzugekommen } = vergleicheKataloge(dicts[code], ist[code], {
        sprache: code,
      });
      befunde += abweichungen.length;
      zeilen.push(
        `  ${code}: Bezug ${Object.keys(dicts[code]).length}, ` +
          `Ist ${Object.keys(ist[code]).length}, ` +
          `hinzugekommen ${hinzugekommen.length}, Abweichungen ${abweichungen.length}`,
      );
      for (const a of abweichungen) {
        zeilen.push(
          `    ${a.art === 'fehlt' ? 'fehlt' : 'Wert geändert'}: ${a.sprache} / ${a.schluessel}`,
        );
      }
    }

    const quer = vergleicheSprachen(ist);
    befunde += quer.length;
    zeilen.push(`  Sprachen untereinander: ${quer.length} Abweichung(en)`);
    for (const a of quer) zeilen.push(`    ${a.art}: ${a.sprache} / ${a.schluessel}`);
  }

  process.stdout.write(`${zeilen.join('\n')}\n`);
  if (befunde > 0) process.exitCode = 1;
}
