// 4T-001814 (Epic 3E-000317): Erzeugt die Syntax-Referenz — die maschinenlesbare
// Fassung der Anwender-Dokumentation, gerichtet an ein Sprachmodell, das Dateien
// fuer diese Anwendung schreiben soll.
//
// Kern der Sache (Entscheidung A2 des Epics): Die Auswahl wird GEMESSEN, nicht
// gepflegt. Themen-Seiten des Handbuchs sind nach geltender Konvention
// selbst-demonstrierend — sie zeigen jede Schreibweise als Code-Block
// (Entwicklungsrichtlinien, Kapitel 13). Daraus folgt eine zweistufige Auswahl:
//
//   Stufe 1 (Seite):     eine Seite ohne einen einzigen Code-Zaun beschreibt
//                        keine Schreibweise und entfaellt.
//   Stufe 2 (Abschnitt): innerhalb der uebrigen Seiten bleibt ein Abschnitt,
//                        wenn er selbst einen Code-Block traegt oder einen
//                        Unterabschnitt mit Code-Block einschliesst.
//
// Damit entsteht keine dritte Pflege-Stelle neben Handbuch und Seiten-Registry.
// Der Preis ist die kurze, hier begruendete AUFNAHME-Liste fuer syntax-tragende
// Seiten ohne Code-Block.
//
// Die beiden ERZEUGTEN Handbuch-Seiten (Funktions-Tabelle, Tastenkuerzel) sind
// bewusst nicht dabei: Beide beschreiben Bedienung — wo eine Funktion im Menue
// liegt und welches Kuerzel sie hat — und nicht, was in einer Datei stehen darf.
//
//   node scripts/syntax-referenz.js [zielordner] [--sprache <code>]
//
// Ohne Zielordner wird nach src/i18n/llms/ geschrieben (Entscheidung A5: dieser
// Zweig ist in der Bau-Konfiguration bereits als unverpackt ausgewiesen, womit
// die Referenz ohne Aenderung an package.json lesbar neben dem Programm landet).
// Das Erzeugnis ist nicht versioniert; .gitignore haelt es aus dem Repositorium.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { MANUAL_PAGES } = require('../src/shared/manual/manual-pages.js');

const WURZEL = path.join(__dirname, '..');
const HELP_QUELLE = path.join(WURZEL, 'src', 'i18n', 'help');
const ZIEL_STANDARD = path.join(WURZEL, 'src', 'i18n', 'llms');
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];

// Seiten ohne Code-Block, die dennoch Schreibweisen tragen. Je Eintrag ein Satz
// Begruendung — die Liste ist bewusst kurz und keine zweite Seiten-Pflege.
const AUFNAHME = {
  // Die Emoji-Kurzformen (:name:) stehen als Fliesstext und nicht in einem
  // Code-Block, sind aber eine Schreibweise im Dokument.
  emoji: 'Kurzformen stehen im Fliesstext statt in einem Code-Block',
};

// Der Kopf der erzeugten Datei: die einzige von Hand geschriebene Stelle.
// Er sagt dem lesenden Modell in wenigen Saetzen, was es vor sich hat.
const KOPF = {
  de: {
    titel: 'EM4me — Syntax-Referenz',
    einleitung: [
      'Diese Datei beschreibt die Markdown-Sprache der Anwendung EM4me: alle',
      'Schreibweisen, die in einer EM4me-Datei stehen duerfen, einschliesslich der',
      'Erweiterungen ueber gewoehnliches Markdown hinaus.',
      '',
      'Sie ist fuer ein Sprachmodell geschrieben, das Dateien fuer diese Anwendung',
      'erzeugen soll. Wer eine Datei fuer EM4me schreibt, nutzt die hier gezeigten',
      'Konstrukte, statt sich auf gewoehnliches Markdown zu beschraenken.',
    ],
    hinweisUeberschrift: 'Zur Benutzung',
    hinweis: [
      'Jeder Abschnitt zeigt die Schreibweise als Code-Block, meist gefolgt von',
      'ihrer Wirkung. Die Code-Bloecke sind woertlich zu nehmen.',
      'Dateien sind gewoehnliche Markdown-Dateien mit der Endung .md.',
      'Bedienung, Menuewege und Tastenkuerzel sind hier bewusst weggelassen; sie',
      'stehen im vollstaendigen Handbuch.',
    ],
    erzeugt: 'Erzeugt aus dem Handbuch-Bestand — nicht von Hand pflegen.',
    version: 'Programm-Version',
    stand: 'Bau-Zeitpunkt',
    standVeroeffentlicht: 'Veroeffentlicht am',
    handbuch: 'Vollstaendiges Handbuch',
    seiteAus: 'Handbuch-Seite',
  },
  en: {
    titel: 'EM4me — Syntax Reference',
    einleitung: [
      'This file describes the Markdown language of the EM4me application: every',
      'construct that may appear in an EM4me file, including the extensions beyond',
      'ordinary Markdown.',
      '',
      'It is written for a language model that is asked to produce files for this',
      'application. When writing a file for EM4me, use the constructs shown here',
      'rather than limiting yourself to ordinary Markdown.',
    ],
    hinweisUeberschrift: 'How to use this',
    hinweis: [
      'Each section shows the syntax as a code block, usually followed by its',
      'effect. Take the code blocks literally.',
      'Files are ordinary Markdown files with the .md extension.',
      'Operation, menu paths and keyboard shortcuts are deliberately left out;',
      'they are in the full manual.',
    ],
    erzeugt: 'Generated from the manual — do not edit by hand.',
    version: 'Application version',
    stand: 'Build time',
    standVeroeffentlicht: 'Released',
    handbuch: 'Full manual',
    seiteAus: 'Manual page',
  },
  fr: {
    titel: 'EM4me — Reference de syntaxe',
    einleitung: [
      "Ce fichier decrit le langage Markdown de l'application EM4me : toutes les",
      'constructions autorisees dans un fichier EM4me, y compris les extensions',
      'qui depassent le Markdown ordinaire.',
      '',
      'Il est ecrit pour un modele de langage charge de produire des fichiers pour',
      'cette application. Pour ecrire un fichier EM4me, utilisez les constructions',
      'presentees ici plutot que de vous limiter au Markdown ordinaire.',
    ],
    hinweisUeberschrift: 'Mode d emploi',
    hinweis: [
      'Chaque section montre la syntaxe sous forme de bloc de code, suivi le plus',
      'souvent de son effet. Les blocs de code sont a prendre au pied de la lettre.',
      'Les fichiers sont des fichiers Markdown ordinaires avec extension .md.',
      "L'utilisation, les chemins de menu et les raccourcis clavier sont",
      'volontairement omis ; ils figurent dans le manuel complet.',
    ],
    erzeugt: 'Genere a partir du manuel — ne pas modifier a la main.',
    version: "Version de l'application",
    stand: 'Date de construction',
    standVeroeffentlicht: 'Publie le',
    handbuch: 'Manuel complet',
    seiteAus: 'Page du manuel',
  },
  es: {
    titel: 'EM4me — Referencia de sintaxis',
    einleitung: [
      'Este archivo describe el lenguaje Markdown de la aplicacion EM4me: todas las',
      'construcciones que pueden aparecer en un archivo de EM4me, incluidas las',
      'extensiones mas alla del Markdown corriente.',
      '',
      'Esta escrito para un modelo de lenguaje al que se le pide generar archivos',
      'para esta aplicacion. Al escribir un archivo para EM4me, emplee las',
      'construcciones aqui mostradas en lugar de limitarse al Markdown corriente.',
    ],
    hinweisUeberschrift: 'Como usarlo',
    hinweis: [
      'Cada seccion muestra la sintaxis como bloque de codigo, seguido casi siempre',
      'de su efecto. Los bloques de codigo deben tomarse al pie de la letra.',
      'Los archivos son archivos Markdown corrientes con la extension .md.',
      'El manejo, las rutas de menu y los atajos de teclado se omiten a proposito;',
      'estan en el manual completo.',
    ],
    erzeugt: 'Generado a partir del manual — no editar a mano.',
    version: 'Version de la aplicacion',
    stand: 'Momento de compilacion',
    standVeroeffentlicht: 'Publicado el',
    handbuch: 'Manual completo',
    seiteAus: 'Pagina del manual',
  },
  it: {
    titel: 'EM4me — Riferimento di sintassi',
    einleitung: [
      "Questo file descrive il linguaggio Markdown dell'applicazione EM4me: tutti i",
      'costrutti ammessi in un file EM4me, comprese le estensioni che vanno oltre',
      'il Markdown ordinario.',
      '',
      'E scritto per un modello linguistico a cui viene chiesto di produrre file per',
      'questa applicazione. Per scrivere un file EM4me, usare i costrutti qui',
      'mostrati invece di limitarsi al Markdown ordinario.',
    ],
    hinweisUeberschrift: 'Come usarlo',
    hinweis: [
      'Ogni sezione mostra la sintassi come blocco di codice, di solito seguito dal',
      'suo effetto. I blocchi di codice vanno presi alla lettera.',
      'I file sono normali file Markdown con estensione .md.',
      "L'uso, i percorsi di menu e le scorciatoie da tastiera sono volutamente",
      'omessi; si trovano nel manuale completo.',
    ],
    erzeugt: 'Generato dal manuale — non modificare a mano.',
    version: "Versione dell'applicazione",
    stand: 'Momento di compilazione',
    standVeroeffentlicht: 'Pubblicato il',
    handbuch: 'Manuale completo',
    seiteAus: 'Pagina del manuale',
  },
};

const HANDBUCH_ADRESSE = {
  de: 'https://em4me.ch/de/manual/',
  en: 'https://em4me.ch/manual/',
  fr: 'https://em4me.ch/fr/manual/',
  es: 'https://em4me.ch/es/manual/',
  it: 'https://em4me.ch/it/manual/',
};

// Die mitgelieferten Themen-Seiten in der Reihenfolge der Registry; die beiden
// erzeugten Seiten (source 'generated') bleiben aussen vor, siehe Kopf-Kommentar.
function themenSeiten() {
  return MANUAL_PAGES.filter((p) => p.source === 'bundled');
}

function seitenTitel(id, sprache) {
  const eintrag = MANUAL_PAGES.find((p) => p.id === id);
  if (!eintrag) return id;
  try {
    const frag = require(path.join(WURZEL, 'src', 'i18n', 'fragments', sprache, 'manual.json'));
    return frag[eintrag.titleKey] || id;
  } catch {
    return id;
  }
}

// Zerlegt eine Handbuch-Seite in Abschnitte. Ein Abschnitt ist eine Ueberschrift
// samt ihrem Text bis zur naechsten Ueberschrift gleicher oder hoeherer Ebene;
// der Text vor der ersten Ueberschrift unterhalb H1 bildet die Einleitung.
function zerlegeInAbschnitte(text) {
  const zeilen = text.split('\n');
  const abschnitte = [];
  let aktuell = { ebene: 0, titel: null, zeilen: [] };
  let imZaun = false;
  let zaun = null;

  for (const zeile of zeilen) {
    const zaunTreffer = zeile.match(/^(```+|~~~+)/);
    if (zaunTreffer) {
      if (!imZaun) {
        imZaun = true;
        zaun = zaunTreffer[1][0];
      } else if (zaunTreffer[1][0] === zaun) {
        imZaun = false;
        zaun = null;
      }
    }
    const ueberschrift = imZaun ? null : zeile.match(/^(#{1,6})\s+(.*)$/);
    if (ueberschrift) {
      abschnitte.push(aktuell);
      aktuell = {
        ebene: ueberschrift[1].length,
        titel: ueberschrift[2].trim(),
        zeilen: [],
      };
      continue;
    }
    aktuell.zeilen.push(zeile);
  }
  abschnitte.push(aktuell);
  return abschnitte;
}

function hatCodeBlock(zeilen) {
  return zeilen.some((z) => /^(```|~~~)/.test(z));
}

// Stufe 2 der Auswahl: Ein Abschnitt bleibt, wenn er selbst einen Code-Block
// traegt ODER einen Nachfahren mit Code-Block einschliesst. Die zweite Haelfte
// ist der Grund, warum hier vorwaerts geschaut wird statt Abschnitt fuer
// Abschnitt zu entscheiden: Eine H2 ohne eigenen Code-Block, unter der drei H3
// mit Beispielen haengen, muss bleiben, sonst verlieren die H3 ihren Ort.
function markiereBehalten(abschnitte) {
  const eigen = abschnitte.map((a) => hatCodeBlock(a.zeilen));
  const behalten = eigen.slice();
  for (let i = 0; i < abschnitte.length; i += 1) {
    if (behalten[i]) continue;
    const ebene = abschnitte[i].ebene;
    for (let j = i + 1; j < abschnitte.length; j += 1) {
      if (abschnitte[j].ebene <= ebene) break;
      if (eigen[j]) {
        behalten[i] = true;
        break;
      }
    }
  }
  return behalten;
}

// Interne Handbuch-Verweise zeigen in der Referenz ins Leere, weil die
// Zieldatei dort nicht existiert. Sie werden auf ihren Klartext zurueckgefuehrt
// und behalten den Seiten-Namen als Hinweis, damit die Aussage erhalten bleibt.
//
// Zwei Absicherungen, beide an einem realen Fehlschlag gelernt:
//
//  1. Code-Bloecke bleiben unberuehrt. Sonst schreibt die Aufloesung genau die
//     Verweis-Beispiele um, die sie lehren sollen — ein Modell lernte dann die
//     falsche Schreibweise. Dasselbe gilt fuer Code im Fliesstext.
//  2. Aufgeloest wird nur, was wirklich eine Handbuch-Seite ist: eine bekannte
//     Seiten-Kennung ohne Pfad-Anteil. `[Plan](unterordner/projektplan.md)` ist
//     ein Beispiel des Anwenders und bleibt, wie es ist.
const SEITEN_IDS = new Set(MANUAL_PAGES.map((p) => p.id));

// Textsichere Maskierungs-Marke. Bewusst gewoehnliche Zeichen und kein
// Steuerzeichen: Ein Steuerzeichen im Quelltext macht die Datei fuer Werkzeuge
// zu einer Binaerdatei — grep meldet dann nur noch «Binary file matches», und
// ein Diff ist nicht mehr lesbar. Genau das ist beim ersten Versuch passiert.
// Eine Kollision mit echtem Handbuch-Text ist unbedenklich: Zurueckgesetzt wird
// nur, was auf einen tatsaechlich gemerkten Abschnitt zeigt.
function loeseVerweiseInZeile(zeile, sprache) {
  const wort = KOPF[sprache].seiteAus;
  // Code im Fliesstext maskieren, damit die Ersetzung ihn nicht trifft.
  const spans = [];
  const maskiert = zeile.replace(/`[^`]*`/g, (treffer) => {
    spans.push(treffer);
    return `@@SPAN@@${spans.length - 1}@@SPAN@@`;
  });
  const ersetzt = maskiert.replace(
    /\[([^\]]+)\]\(([^)\s]+\.md)(#[^)]*)?\)/g,
    (treffer, beschriftung, ziel) => {
      if (ziel.includes('/') || ziel.includes('\\')) return treffer;
      const id = path.basename(ziel, '.md');
      if (!SEITEN_IDS.has(id)) return treffer;
      const titel = seitenTitel(id, sprache);
      if (titel.toLowerCase() === String(beschriftung).toLowerCase()) {
        return `${beschriftung} (${wort})`;
      }
      return `${beschriftung} (${wort} „${titel}")`;
    },
  );
  return ersetzt.replace(/@@SPAN@@(\d+)@@SPAN@@/g, (_t, i) => spans[Number(i)]);
}

function loeseVerweiseAuf(text, sprache) {
  const aus = [];
  let imZaun = false;
  let zaun = null;
  for (const zeile of text.split('\n')) {
    const treffer = zeile.match(/^(```+|~~~+)/);
    if (treffer) {
      if (!imZaun) {
        imZaun = true;
        zaun = treffer[1][0];
      } else if (treffer[1][0] === zaun) {
        imZaun = false;
        zaun = null;
      }
      aus.push(zeile);
      continue;
    }
    aus.push(imZaun ? zeile : loeseVerweiseInZeile(zeile, sprache));
  }
  return aus.join('\n');
}

// 4T-001836: Die Stand-Zeile traegt je nach Bau einen anderen WERT und braucht
// deshalb ein anderes Etikett. Der Bau neben dem Programm nennt seinen
// Bau-Zeitpunkt; der Web-Bau nennt das Veroeffentlichungs-Datum der Version,
// weil sein Erzeugnis byte-gleich wiederholbar sein muss und ein Uhrzeit-Wert
// das nicht ist. Ohne diese Wahl truege der eine Wert die Beschriftung des
// anderen.
//
// Die Zuordnung steht als Tafel und nicht als Bedingung mit Rueckfall: Eine
// unbekannte Stand-Art soll laut scheitern, statt still den Bau-Zeitpunkt zu
// beschriften (Entwicklungsrichtlinien, Kapitel 3, kein stiller Rueckfall).
const STAND_ETIKETT = { bau: 'stand', veroeffentlicht: 'standVeroeffentlicht' };

function bauKopf(sprache, version, stand, { standArt = 'bau' } = {}) {
  const k = KOPF[sprache];
  const etikettFeld = STAND_ETIKETT[standArt];
  if (!etikettFeld) {
    throw new Error(`syntax-referenz: unbekannte Stand-Art '${standArt}'`);
  }
  const zeilen = [`# ${k.titel}`, ''];
  zeilen.push(...k.einleitung, '');
  zeilen.push(`> ${k.erzeugt}`, '');
  zeilen.push(`- ${k.version}: ${version}`);
  zeilen.push(`- ${k[etikettFeld]}: ${stand}`);
  zeilen.push(`- ${k.handbuch}: ${HANDBUCH_ADRESSE[sprache]}`);
  zeilen.push('');
  zeilen.push(`## ${k.hinweisUeberschrift}`, '');
  zeilen.push(...k.hinweis, '');
  return zeilen.join('\n');
}

function erzeugeFuerSprache(sprache, version, stand, quelle = HELP_QUELLE, optionen = {}) {
  // Eine Sprache ohne Kopf-Text waere spaeter an einer unverstaendlichen Stelle
  // gescheitert ("Cannot read properties of undefined"); die Meldung hier sagt,
  // was fehlt.
  if (!KOPF[sprache]) {
    throw new Error(`syntax-referenz: kein Kopf-Text fuer die Sprache '${sprache}'`);
  }
  const teile = [bauKopf(sprache, version, stand, optionen)];
  const statistik = { seiten: 0, uebersprungen: 0, abschnitte: 0, aufnahme: 0 };

  for (const seite of themenSeiten()) {
    const datei = path.join(quelle, `${seite.id}.${sprache}.md`);
    // Eine fehlende Quelldatei ist ein Bestands-Fehler und kein Grund zum
    // Weitergehen: Jede gebuendelte Seite liegt in allen fuenf Sprachen vor,
    // gesichert durch test/unit/manual-pages.test.js. Stillschweigendes
    // Ueberspringen erzeugte eine unvollstaendige Referenz, die niemandem
    // auffiele — der Bau liefe durch und lieferte sie aus.
    if (!fs.existsSync(datei)) {
      throw new Error(
        `syntax-referenz: Handbuch-Seite '${seite.id}.${sprache}.md' fehlt im Bestand`,
      );
    }
    const roh = fs.readFileSync(datei, 'utf8');
    const zeilen = roh.split('\n');

    // Stufe 1: Seite ohne jeden Code-Block entfaellt, sofern sie nicht auf der
    // begruendeten Aufnahme-Liste steht.
    let ganzeSeite = false;
    if (!hatCodeBlock(zeilen)) {
      if (!AUFNAHME[seite.id]) {
        statistik.uebersprungen += 1;
        continue;
      }
      // Eine Seite der Aufnahme-Liste hat definitionsgemaess keinen Code-Block;
      // die Abschnitts-Stufe wuerde sie deshalb restlos leeren. Sie wird ganz
      // uebernommen — das ist die Aussage der Liste.
      ganzeSeite = true;
      statistik.aufnahme += 1;
    }

    const abschnitte = zerlegeInAbschnitte(roh);
    const behalten = ganzeSeite ? abschnitte.map(() => true) : markiereBehalten(abschnitte);
    const ausgabe = [];
    let uebernommen = 0;

    for (let i = 0; i < abschnitte.length; i += 1) {
      const a = abschnitte[i];
      // Die H1 der Seite traegt ihren Titel; sie wird zur H2 der Referenz,
      // damit die Referenz genau eine H1 behaelt. Ihr Text ist die Einleitung
      // der Seite und kommt immer mit: Sie sagt in zwei Saetzen, worum es geht,
      // und ist damit fuer einen maschinellen Leser der Ort, an dem er ein
      // Konstrukt einordnet. Bilder werden dabei fallen gelassen, weil ihre
      // Ziele in der Referenz nicht existieren.
      if (a.ebene === 1) {
        const einleitung = a.zeilen
          .filter((z) => !/^\s*!\[/.test(z))
          .join('\n')
          .trim();
        ausgabe.push(`## ${a.titel}`);
        ausgabe.push(einleitung);
        continue;
      }
      if (a.ebene === 0) {
        // Text vor der ersten Ueberschrift: nur mitnehmen, wenn er selbst
        // Code traegt; sonst ist es Frontmatter oder Vorspann.
        if (hatCodeBlock(a.zeilen)) ausgabe.push(a.zeilen.join('\n'));
        continue;
      }
      if (!behalten[i]) continue;
      ausgabe.push(`${'#'.repeat(Math.min(a.ebene + 1, 6))} ${a.titel}`);
      ausgabe.push(a.zeilen.join('\n').replace(/\n{3,}/g, '\n\n'));
      statistik.abschnitte += 1;
      uebernommen += 1;
    }

    // Eine Seite, von der nach der Abschnitts-Stufe kein Abschnitt uebrig
    // bliebe, wird ganz weggelassen — die Einleitung allein traegt nichts.
    if (uebernommen === 0 && !ganzeSeite) {
      statistik.uebersprungen += 1;
      continue;
    }
    statistik.seiten += 1;
    teile.push(ausgabe.filter((t) => String(t).trim() !== '').join('\n\n'));
  }

  // Zweite Haelfte derselben Absicherung: Eine Referenz ohne eine einzige Seite
  // ist kein duenner Auszug, sondern ein Fehlschlag. Sie waere als Datei
  // vorhanden, traege den Kopf und saehe damit unverdaechtig aus.
  if (statistik.seiten === 0) {
    throw new Error(`syntax-referenz: keine einzige Seite fuer '${sprache}' uebernommen`);
  }

  const text = loeseVerweiseAuf(teile.join('\n\n'), sprache)
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  return { text: `${text}\n`, statistik };
}

function erzeuge({ ziel = ZIEL_STANDARD, sprachen = SPRACHEN, still = false } = {}) {
  const version = require(path.join(WURZEL, 'package.json')).version;
  // 4T-001836: Hier bleibt der echte Bau-Zeitpunkt. Die Fassung neben dem
  // Programm steht unter keinem Byte-Gleichheits-Waechter, und ein temporaerer
  // Bau zwischen zwei Releases soll zeigen, wann er entstanden ist. Der
  // Web-Bau nennt statt dessen das Veroeffentlichungs-Datum der Version
  // (scripts/build-web-llms.js), weil sein Erzeugnis wiederholbar sein muss.
  const stand = new Date().toISOString().slice(0, 16).replace('T', ' ');
  fs.mkdirSync(ziel, { recursive: true });
  const ergebnis = [];

  for (const sprache of sprachen) {
    const { text, statistik } = erzeugeFuerSprache(sprache, version, stand);
    const datei = path.join(ziel, `em4me-syntax.${sprache}.md`);
    fs.writeFileSync(datei, text, 'utf8');
    const groesse = Buffer.byteLength(text, 'utf8');
    ergebnis.push({ sprache, datei, groesse, ...statistik });
    if (!still) {
      console.log(
        `  ${sprache}: ${statistik.seiten} Seiten, ${statistik.abschnitte} Abschnitte, ` +
          `${statistik.uebersprungen} ausgelassen, ${(groesse / 1024).toFixed(0)} KB`,
      );
    }
  }
  return ergebnis;
}

function main() {
  const argumente = process.argv.slice(2);
  let ziel = ZIEL_STANDARD;
  let sprachen = SPRACHEN;
  for (let i = 0; i < argumente.length; i += 1) {
    if (argumente[i] === '--sprache') {
      sprachen = [argumente[i + 1]];
      i += 1;
    } else if (!argumente[i].startsWith('--')) {
      ziel = path.resolve(argumente[i]);
    }
  }
  console.log(`Syntax-Referenz nach ${path.relative(WURZEL, ziel) || ziel}:`);
  erzeuge({ ziel, sprachen });
}

if (require.main === module) main();

module.exports = {
  erzeuge,
  HELP_QUELLE,
  erzeugeFuerSprache,
  zerlegeInAbschnitte,
  markiereBehalten,
  hatCodeBlock,
  themenSeiten,
  AUFNAHME,
  SPRACHEN,
  ZIEL_STANDARD,
};
