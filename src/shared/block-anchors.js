// 4T-000363 (Epic 3E-000067): Gemeinsame, prozess-neutrale Quelle fuer die Block-
// Anker-Erkennung (`^id` am Blockende). Single Source of Truth fuer die Anker-
// Regex und die Extraktion aus einem Dokument-Text: der Backlinks-Index
// (src/main/backlinks.js, `blockIds`) UND der Renderer-Abgleich des Block-
// Metadaten-Panels (Epic 3E-000067) lesen hieraus, damit "welche Zeichenfolge ist
// ein Block-Anker" an genau einer Stelle definiert ist. Ohne gemeinsame Quelle
// divergieren Index und Panel-Abgleich (aktive vs. verwaiste Anker).
//
// Electron-frei, rein auf Strings (Vorbild: src/shared/markdown/link-scan.js,
// src/shared/markdown/slug.js).
//
// 4T-002072 (Epic 3E-000192): **Eine zweite Form der Kennung.** Eine
// Datentabelle trägt ihren Namen in ihrer Kopf-Angabe `table: Name`; dieser Name
// ist eine Block-Kennung wie ein Anker und wird hier und nur hier als solche
// erkannt. Jede Kennung hat deshalb einen Träger (`traegerById`): die Zeile mit
// dem Anker oder den Zaun der Datentabelle. Für beide Formen gilt dieselbe
// Dubletten-Regel, das erste Vorkommen im Dokument zählt. Dazu kommt der
// Schreibort einer neuen Kennung (`ankerZielFuerZeile`), damit das Anlegen im
// Panel in einer Datentabelle die Kopf-Angabe schreibt statt den Zaun zu
// zerstören. Die Parser-Regel der Kopf-Angabe steht in
// markdown/perspective-datatable.js; beide prüfen den Namen mit
// `isValidBlockAnchorId` und beenden den Kopf an der ersten Datenzeile.
//
// 4T-002072, Nachbesserung nach der Durchsicht vom 2026-10-03: Der Schreibort
// und die Cursor-Folge kennen die Code-Blöcke auch im Zitat und tief
// eingerückt (`zaeuneMitPraefix`); an eine Zaun-Zeile wird nie angehängt, und
// eine Zeile im Zaun folgt allein der Anker-Zeile darunter (F1, F3). Eine
// Anker-Zeile mit dem Kopf-Namen direkt unter der Tabelle ist dieselbe
// Kennung, kein Doppel (F5). Ein Diagramm im Zitat zieht beim Umbenennen mit
// (F6), und ein Aufrufer ohne Frontmatter sagt das (F7).
'use strict';

const { frontmatterBodyStart } = require('./markdown/link-scan.js');
// 4T-002024 (Epic 3E-000192), Durchsicht vom 2026-09-30: Ob eine Zeile in einem
// Code-Block steht, entscheidet die Zaun-Regel der Anwendung, nicht mehr das
// Umschalten an jeder Zeile, die mit drei Backticks beginnt. Das Blatt ohne
// eigene Abhängigkeiten; ein Zyklus entsteht nicht.
const { schliesstZaun, zaunOeffnung } = require('./markdown/fence-level.js');
// 4T-002023 (Epic 3E-000192): die Angabe `table:` eines Diagramm-Blocks, aus dem
// Blatt ohne eigene Abhängigkeiten — der Diagramm-Kern lädt dieses Modul, ein
// Bezug auf ihn wäre ein Zyklus. 4T-002072: ebenso die Zeichen-Ebene der
// Kopf-Angabe `table:` einer Datentabelle (`angabeWert`).
const {
  angabeWert,
  istDiagrammFenceInfo,
  scanneTabellenAngabe,
} = require('./markdown/perspective-chart-ref.js');

// 4T-002072: Info-Wort des Zauns der Datentabelle (erstes Wort, wie
// `zaunOeffnung` die Sprache liest).
const DATENTABELLE_SPRACHE = 'perspective-datatable';

// Block-Anker am Zeilenende: `^id` als letztes Element einer Zeile (mit
// optionalem fuehrenden Whitespace) oder als einziger Zeileninhalt. \p{L}/\p{N}
// lassen Umlaute und Unicode-Buchstaben in der ID zu. IDENTISCH zur frueheren
// lokalen Definition in backlinks.js (dorthin jetzt importiert).
const BLOCK_ANCHOR_RE = /(?:^|\s)\^([\p{L}\p{N}_-]+)\s*$/u;

// Validierung einer nackten Anker-ID (ohne '^'): dieselbe Zeichenklasse wie in
// der Zeilen-Regex. Genutzt beim Anlegen und Umbenennen von Ankern.
const BLOCK_ANCHOR_ID_RE = /^[\p{L}\p{N}_-]+$/u;

function isValidBlockAnchorId(id) {
  return typeof id === 'string' && BLOCK_ANCHOR_ID_RE.test(id);
}

// 4T-002048 (Epic 3E-000192): Besteht die Zeile allein aus einem Anker, ist sie
// eine Anker-Zeile, die zum Block davor gehört (Namens-Zeile einer
// Datentabelle, Kennung unter einem Code-Block). Liefert die Kennung, sonst
// null. Nach demselben Muster wie extractBlockAnchors, damit Anzeige, Live-
// Modus und Diagramm-Kern dieselbe Zeile als Anker-Zeile sehen.
function ankerZeileAllein(zeile) {
  const text = String(zeile ?? '').trim();
  const treffer = text.match(BLOCK_ANCHOR_RE);
  return treffer && treffer.index === 0 && text.startsWith('^') ? treffer[1] : null;
}

// 4T-002048: Dieselbe Frage für eine Zeile in einem Zitat oder Hinweisblock,
// deren Quelltext die Zitat-Präfixe trägt (`> > ^name`, beliebig tief; je
// Ebene bis drei Leerzeichen davor und eines danach, wie markdown-it sie
// liest). Gezählt wird nur, was auch extractBlockAnchors an der rohen Zeile
// als Anker sieht, damit Anzeige und Index gleich bleiben.
function ankerZeileAlleinImZitat(zeile) {
  const roh = String(zeile ?? '');
  const id = ankerZeileAllein(zitatTeile(roh).kern);
  const treffer = roh.match(BLOCK_ANCHOR_RE);
  return id && treffer && treffer[1] === id ? id : null;
}

// 4T-002072, Nachbesserung F1: Eine Zeile, zerlegt in ihre Zitat-Präfixe (je
// Ebene bis drei Leerzeichen davor und eines danach, wie oben), die Einrückung
// dahinter und den Kern. `praefix` ist alles vor dem Kern, `tiefe` die Zahl
// der Zitat-Ebenen, `einrueckung` die Zahl der Leerraum-Zeichen nach dem
// letzten Präfix.
function zitatTeile(zeile) {
  const roh = String(zeile ?? '');
  let rest = roh;
  let tiefe = 0;
  while (/^ {0,3}>/.test(rest)) {
    rest = rest.replace(/^ {0,3}> ?/, '');
    tiefe++;
  }
  const kern = rest.replace(/^[ \t]+/, '');
  const einrueckung = rest.length - kern.length;
  return { tiefe, einrueckung, kern, praefix: roh.slice(0, roh.length - kern.length) };
}

// 4T-002072, Nachbesserung F1: Die Code-Blöcke eines Textes für den Schreibort
// und die Cursor-Folge, auch in einem Zitat oder tiefer als drei Leerzeichen
// eingerückt (Listen-Inhalt). Die Erkennung ist die Zaun-Regel aus
// fence-level.js: auf der obersten Ebene bis drei Leerzeichen an der rohen
// Zeile wie in extractBlockAnchors, sonst am Kern hinter Präfix und
// Einrückung. Ein Zaun im Zitat endet an seiner Schluss-Zeile derselben
// Zitat-Tiefe oder mit dem Zitat (dann ohne Schluss-Zeile); ein tief
// eingerückter Öffner ohne Schluss-Zeile ist keiner (ein Absatz oder ein
// eingerückter Code-Block, der Backticks zeigt), damit er den Rest des Textes
// nicht verschluckt. Je Zaun: `von`, `bis` (Schluss-Zeile, null ohne), `ende`
// (letzte Zeile im Zaun), `tiefe`, `sprache`, `praefix` der Schluss-Zeile und
// `oben` (ein Zaun der obersten Ebene, den auch extractBlockAnchors sieht);
// Zeilen 1-basiert.
function zaeuneMitPraefix(lines, start) {
  const zaeune = [];
  for (let i = start; i < lines.length; i++) {
    const teile = zitatTeile(lines[i]);
    const oben = teile.tiefe === 0 && teile.einrueckung <= 3;
    const oeffnung = zaunOeffnung(oben ? lines[i] : teile.kern);
    if (!oeffnung) continue;
    let j = i + 1;
    let bis = null;
    for (; j < lines.length; j++) {
      const t = zitatTeile(lines[j]);
      if (t.tiefe < teile.tiefe) break;
      const schluss = oben ? schliesstZaun(lines[j], oeffnung) : schliesstZaun(t.kern, oeffnung);
      if (t.tiefe === teile.tiefe && schluss) {
        bis = j + 1;
        break;
      }
    }
    if (bis == null && !oben && teile.tiefe === 0) continue;
    const praefix = bis == null ? teile.praefix : zitatTeile(lines[bis - 1]).praefix;
    const { sprache } = oeffnung;
    zaeune.push({ von: i + 1, bis, ende: bis ?? j, tiefe: teile.tiefe, sprache, praefix, oben });
    i = (bis ?? j) - 1;
  }
  return zaeune;
}

function zaunAnZeile(zaeune, line) {
  return zaeune.find((z) => line >= z.von && line <= z.ende) || null;
}

// 4T-002072, Nachbesserung F1: Eine Leerzeile im Container der Zitat-Tiefe
// `tiefe` (auf der obersten Ebene: eine Zeile aus Leerraum; im Zitat: nur die
// Präfixe derselben Tiefe).
function leerImContainer(zeile, tiefe) {
  const teile = zitatTeile(zeile);
  return teile.tiefe === tiefe && teile.kern.trim() === '';
}

// 4T-002072: Die Kopf-Angabe `table:` einer Zeile im Zaun einer Datentabelle.
// `name` ist der Wert, wenn er eine gültige Kennung ist, sonst null; `wert`,
// `wertStart` und `wertLen` beschreiben den Rohwert und seine Spanne in der
// Zeile (ohne abschließendes CR), auch wenn er leer oder ungültig ist. null,
// wenn die Zeile keine Angabe `table:` ist.
function namensAngabe(zeile) {
  const angabe = angabeWert(zeile, 'table');
  if (!angabe) return null;
  const { wert, wertStart } = angabe;
  return { name: isValidBlockAnchorId(wert) ? wert : null, wert, wertStart, wertLen: wert.length };
}

// 4T-002072: Ein Schritt durch den Kopf einer Datentabelle, nach der Regel des
// Parsers: Der Kopf endet an der ersten Datenzeile (getrimmt mit `|` am
// Anfang), und es zählt die erste Angabe `table:`. Liefert KOPF_ENDE an der
// Datenzeile, die Namens-Angabe an der Zeile, die sie trägt, sonst null
// (Leerzeile oder andere Kopf-Angabe; der Kopf geht weiter).
const KOPF_ENDE = Object.freeze({ ende: true });

function kopfSchritt(zeile) {
  if (String(zeile).trim().startsWith('|')) return KOPF_ENDE;
  return namensAngabe(zeile);
}

// Extrahiert die Block-Anker eines Dokument-Textes in Textreihenfolge.
// Ueberspringt YAML-Frontmatter und Fenced-Code-Bloecke, damit Anker in
// Code-Beispielen nicht als echte Anker zaehlen. Duplikate: das erste Vorkommen
// zaehlt (wie die Link-Aufloesung), weitere Vorkommen werden in `duplicates`
// gemeldet.
//
// Seit der Durchsicht vom 2026-09-30 nach der Zaun-Regel aus fence-level.js:
// Ein Block schliesst nur an einer Zeile aus demselben Zeichen, mindestens so
// lang, ohne Info-Wort; eine Zeile wie ```inline``` im Fliesstext oeffnet
// keinen. Vorher schaltete jede Zeile mit drei Backticks um, und hinter einer
// solchen Zeile sah die Erkennung keinen Anker mehr. Der Verweis-Parser des
// Index (src/main/index/parse.js) traegt die alte Fassung noch; ihr Abbau steht
// unter 4T-001912 aus.
//
// 4T-002072: Dazu der Name aus der Kopf-Angabe `table:` jeder Datentabelle der
// obersten Ebene (Zaun nach der Zaun-Regel, bis drei Leerzeichen eingerückt;
// im Zitat, tiefer eingerückt oder in einem umschließenden Zaun gilt er nicht).
// Seine Zeile ist die Zeile der Angabe; ein Anker und ein Kopf-Name derselben
// Kennung sind ein Doppel, das erste Vorkommen zählt.
//
// Rueckgabe:
//   order:       string[]         — eindeutige IDs in Reihenfolge des ersten Vorkommens
//   lineById:    Map<id, number>  — 1-basierte Zeile des ersten Vorkommens
//   duplicates:  Set<id>          — IDs, die mehr als einmal vorkommen
//   traegerById: Map<id, object>  — 4T-002072: Träger des ersten Vorkommens,
//                { art: 'zeile' } für einen Anker oder
//                { art: 'datentabelle', zaunVon, zaunBis } für einen Kopf-Namen;
//                Zaun-Zeilen 1-basiert, zaunBis null bei offenem Zaun
//   datentabellen: Array         — 4T-002072: jede Datentabelle der obersten
//                Ebene in Textfolge, auch ohne Namen:
//                { zaunVon, zaunBis, name, nameZeile }; name ist der gültige
//                Name der ersten Angabe `table:` (auch wenn er als Doppel nicht
//                zählt; ob er gilt, sagt traegerById), sonst null; nameZeile die
//                Zeile dieser Angabe, auch bei leerem oder ungültigem Wert, null
//                ohne Angabe; 4T-002072, Nachbesserung F5: dazu
//                ankerZeile, die Zeile einer Anker-Zeile `^name` desselben
//                Namens unter der Tabelle (siehe unten), sonst null
//
// 4T-002072, Nachbesserung F5: Eine alleinstehende Anker-Zeile `^X` als erste
// nicht leere Zeile unter einer Datentabelle, deren Kopf-Name `X` hier zählt,
// ist dieselbe Kennung und kein Doppel: Sie zählt nicht in `duplicates`, und
// `lineById`/`traegerById` bleiben bei der Kopf-Angabe. Dieselbe Bereichs-Regel
// wie blockAnchorForLine (Leerzeilen dazwischen erlaubt).
//
// 4T-002072, Nachbesserung F7: `optionen.frontmatter === false` sagt, dass der
// Text kein Frontmatter trägt (der Render-Weg übergibt den Körper ohne ihn);
// eine Linie `---` an seinem Anfang ist dann eine Linie und kein Vorspann.
// Voreinstellung wie bisher: Frontmatter wird erkannt und übersprungen.
function extractBlockAnchors(text, optionen) {
  const lines = String(text ?? '').split(/\r?\n/);
  const start = optionen && optionen.frontmatter === false ? 0 : frontmatterBodyStart(lines);
  const order = [];
  const lineById = new Map();
  const duplicates = new Set();
  const traegerById = new Map();
  const datentabellen = [];
  const registriere = (id, zeile, traeger) => {
    if (lineById.has(id)) {
      duplicates.add(id);
      return;
    }
    order.push(id);
    lineById.set(id, zeile);
    traegerById.set(id, traeger);
  };
  let offen = null;
  // Die offene Datentabelle, ihr Träger-Eintrag und ob ihr Kopf noch läuft.
  let tabelle = null;
  let traeger = null;
  let imKopf = false;
  // F5: die eben geschlossene Datentabelle, deren Kopf-Name hier zählt, bis zur
  // ersten nicht leeren Zeile unter ihr.
  let darunter = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (darunter && !offen) {
      if (line.trim() === '') continue;
      const gleich = ankerZeileAllein(line) === darunter.name;
      if (gleich) darunter.ankerZeile = i + 1;
      darunter = null;
      if (gleich) continue;
    }
    if (offen) {
      if (schliesstZaun(line, offen)) {
        offen = null;
        if (tabelle) {
          tabelle.zaunBis = i + 1;
          traeger.zaunBis = i + 1;
          if (tabelle.name && traegerById.get(tabelle.name) === traeger) darunter = tabelle;
        }
        tabelle = null;
      } else if (tabelle && imKopf) {
        const schritt = kopfSchritt(line);
        if (schritt) imKopf = false;
        if (schritt && schritt !== KOPF_ENDE) {
          tabelle.nameZeile = i + 1;
          if (schritt.name) {
            tabelle.name = schritt.name;
            registriere(schritt.name, i + 1, traeger);
          }
        }
      }
      continue;
    }
    offen = zaunOeffnung(line);
    if (offen) {
      if (offen.sprache === DATENTABELLE_SPRACHE) {
        tabelle = { zaunVon: i + 1, zaunBis: null, name: null, nameZeile: null, ankerZeile: null };
        traeger = { art: 'datentabelle', zaunVon: i + 1, zaunBis: null };
        datentabellen.push(tabelle);
        imKopf = true;
      }
      continue;
    }
    const m = line.match(BLOCK_ANCHOR_RE);
    if (m) registriere(m[1], i + 1, { art: 'zeile' });
  }
  return { order, lineById, duplicates, traegerById, datentabellen };
}

// 4T-002072: Die Datentabelle, in deren Zaun (Öffner- bis Schluss-Zeile, bei
// offenem Zaun bis zum Textende) die 1-basierte Zeile `line` steht, oder null.
function datentabelleAnZeile(datentabellen, line, zeilenzahl) {
  return datentabellen.find((t) => line >= t.zaunVon && line <= (t.zaunBis ?? zeilenzahl)) || null;
}

// Schreibt einen Block-Anker im gesamten Dokument-Text um: die Anker-Definition
// (`^oldId` am Blockende) UND die eingehenden Verweise im selben Dokument
// (`[[Datei#^oldId]]`, `[[#^oldId]]`, `[[Datei#^oldId|Label]]`) auf `newId`.
// Grundlage des Umbenennen-Kommandos im Panel (Konzept-Entscheidung 3: Text-
// Anker und Verweise werden synchron mitgezogen). Frontmatter und Fenced-Code
// bleiben unberuehrt (dieselbe Bereinigung wie extractBlockAnchors). Bei
// ungueltigen oder gleichen IDs bleibt der Text unveraendert. Rein auf Strings.
//
// 4T-002023 (Epic 3E-000192): Eine Ausnahme im Fenced-Code — die Angabe
// `table: ^oldId` eines Diagramm-Blocks nennt die Tabelle im selben Dokument
// und zieht nach wie ein Verweis. Nur die wirksame, also die erste Angabe der
// Fence; ersetzt wird allein der Name, die Zeile bleibt sonst Byte fuer Byte.
// `table: [[Datei#^oldId]]` bleibt unberuehrt, auch wenn `Datei` das eigene
// Dokument ist: Ob sie es ist, weiss dieses Modul nicht, und ein Verweis aus
// einem anderen Dokument zieht beim Umbenennen des Ankers ebenso nicht nach.
//
// 4T-002072: Zwei weitere Stellen im Fenced-Code. Im Kopf einer Datentabelle
// der obersten Ebene ersetzt die Funktion den Wert der ersten Angabe `table:`,
// wenn er `oldId` ist — Schreibweise des Schlüssels, Leerraum und Einrückung
// bleiben. Und im Diagramm-Block zieht `table: oldId` ohne Dach-Zeichen mit,
// weil die Erkennung der Angabe sie als Form «selbes Dokument» liefert.
function rewriteAnchorReferences(text, oldId, newId) {
  const src = String(text ?? '');
  if (!isValidBlockAnchorId(oldId) || !isValidBlockAnchorId(newId) || oldId === newId) {
    return src;
  }
  const esc = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Anker-Definition: `^oldId` als letztes Zeilenelement (mit fuehrendem
  // Zeilenanfang oder Whitespace, optionalem Trailing-Whitespace).
  const defRe = new RegExp('(^|\\s)\\^' + esc + '(\\s*)$', 'u');
  // Verweise: `#^oldId` unmittelbar vor `]` (Ziel-Ende) oder `|` (Label-Trenner).
  const linkRe = new RegExp('#\\^' + esc + '(?=[\\]|])', 'gu');
  const lines = src.split(/\r?\n/);
  const start = frontmatterBodyStart(lines);
  // Die offene Fence nach der Zaun-Regel (Durchsicht vom 2026-09-30, wie in
  // extractBlockAnchors). 4T-002023: Steht sie unter der Diagramm-Marke, und
  // ist ihre wirksame Angabe `table:` schon vorbei?
  let offen = null;
  let inChartFence = false;
  let tabelleGesehen = false;
  // 4T-002072: Läuft der Kopf einer Datentabelle noch?
  let imTabellenKopf = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!offen) {
      offen = zaunOeffnung(line);
      if (offen) {
        inChartFence = istDiagrammFenceInfo(offen.sprache);
        imTabellenKopf = offen.sprache === DATENTABELLE_SPRACHE;
        tabelleGesehen = false;
        continue;
      }
    } else if (schliesstZaun(line, offen)) {
      offen = null;
      inChartFence = false;
      imTabellenKopf = false;
      continue;
    }
    if (offen) {
      if (imTabellenKopf) {
        const schritt = kopfSchritt(line);
        if (schritt) imTabellenKopf = false;
        if (schritt && schritt !== KOPF_ENDE && schritt.wert === oldId) {
          lines[i] =
            line.slice(0, schritt.wertStart) +
            newId +
            line.slice(schritt.wertStart + schritt.wertLen);
        }
        continue;
      }
      if (!inChartFence || tabelleGesehen) continue;
      const angabe = scanneTabellenAngabe(line);
      if (!angabe) continue;
      tabelleGesehen = true;
      if (angabe.form === 'same' && angabe.name === oldId) {
        lines[i] =
          line.slice(0, angabe.nameStart) + newId + line.slice(angabe.nameStart + angabe.nameLen);
      }
      continue;
    }
    lines[i] = line.replace(defRe, '$1^' + newId + '$2').replace(linkRe, '#^' + newId);
  }
  zitatDiagrammeNachziehen(lines, start, oldId, newId);
  return lines.join('\n');
}

// 4T-002072, Nachbesserung F6: Ein Diagramm-Block in einem Zitat oder tief
// eingerückt wird gezeichnet und findet seine Tabelle (gemessen am 2026-10-03).
// Die Schleife oben sieht seinen Zaun nicht und behandelt seine Zeilen als
// Text; `table: ^alt` zieht dort über die Anker-Definition schon mit, `table:
// alt` ohne Dach-Zeichen nicht. Hier wird die erste Angabe `table:` derselben
// Zitat-Tiefe nachgezogen, an ihrer Spanne hinter dem Präfix.
function zitatDiagrammeNachziehen(lines, start, oldId, newId) {
  for (const zaun of zaeuneMitPraefix(lines, start)) {
    if (zaun.oben || !istDiagrammFenceInfo(zaun.sprache)) continue;
    const schluss = zaun.bis != null ? zaun.bis - 1 : zaun.ende;
    for (let k = zaun.von; k < schluss; k++) {
      const teile = zitatTeile(lines[k]);
      const angabe = teile.tiefe === zaun.tiefe ? scanneTabellenAngabe(teile.kern) : null;
      if (!angabe) continue;
      if (angabe.form === 'same' && angabe.name === oldId) {
        const von = teile.praefix.length + angabe.nameStart;
        lines[k] = lines[k].slice(0, von) + newId + lines[k].slice(von + angabe.nameLen);
      }
      break;
    }
  }
}

// Zeichen-Vorrat der generierten Anker-IDs: Kleinbuchstaben und Ziffern
// (Teilmenge der erlaubten Zeichenklasse; gut lesbar, keine Sonderzeichen).
const GEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const GEN_LENGTH = 6;

// Erzeugt eine kurze, kollisionsfreie Zufalls-ID (6 Zeichen aus [a-z0-9]).
// `existing` ist ein Set/Array bereits vergebener IDs derselben Datei; die
// Rueckgabe ist garantiert nicht darin enthalten (Konzept-Entscheidung 5:
// kurze Zufalls-ID statt sprechendem Slug). Die ID-Laenge waechst nach sehr
// vielen Kollisionen als (praktisch unerreichbare) Terminierungs-Sicherung.
function generateBlockAnchorId(existing) {
  const taken = existing instanceof Set ? existing : new Set(existing || []);
  let length = GEN_LENGTH;
  for (let attempt = 0; ; attempt++) {
    let id = '';
    for (let i = 0; i < length; i++) {
      id += GEN_ALPHABET.charAt(Math.floor(Math.random() * GEN_ALPHABET.length));
    }
    if (!taken.has(id)) return id;
    if (attempt > 0 && attempt % 1000 === 0) length++;
  }
}

// Ermittelt den Block-Anker des Absatzes, in dem `line` (1-basiert) steht —
// die Grundlage der Cursor-Folge des Block-Eigenschaften-Panels (Konzept-
// Entscheidung 5: das Panel folgt dem Block unter dem Cursor). Ein "Absatz" ist
// hier der durch Leerzeilen begrenzte Bereich zusammenhaengender nicht-leerer
// Zeilen um die Cursor-Zeile; enthaelt er einen (Fence-/Frontmatter-bereinigten)
// Anker, wird dessen ID geliefert, sonst null. Auf einer Leerzeile gibt es
// keinen Block (null). Nutzt extractBlockAnchors als Anker-Quelle, damit Cursor-
// Folge und Index dieselben Anker sehen.
//
// 4T-002072: Steht `line` im Zaun einer Datentabelle (jede Zeile von der
// Öffner- bis zur Schluss-Zeile, auch eine Leerzeile im Kopf), gilt zuerst ihr
// Kopf-Name, sofern er dort zählt (erstes Vorkommen der Kennung). Trägt sie
// keinen, gilt die erste Anker-Zeile unter dem Zaun, Leerzeilen dazwischen
// übersprungen — die Bereichs-Regel des Diagramm-Kerns, die auch eine Zeile
// `^name` nach einer Leerzeile der Tabelle zuordnet. Erst danach die
// Absatz-Regel; ein Kopf-Name zählt dort nicht, sonst bekäme ein Absatz direkt
// über dem Zaun den Namen der Tabelle.
//
// 4T-002072, Nachbesserung F3: Für jede Zeile in einem Code-Block (auch einer
// Datentabelle ohne Kopf-Namen, einem Diagramm, einem Block im Zitat) zählt
// allein die Anker-Zeile unter dem Zaun; fehlt sie, ist das Ergebnis null und
// nicht der Anker eines Absatzes darunter. Wie im Render-Weg
// (plugins/block-anker.js, `ankerAbsatz`): Dort wird nur ein Absatz aus
// Anker-Zeilen direkt nach dem Zaun zu dessen Kennung. Und der Absatz der
// Absatz-Regel endet an Zaun-Grenzen, wie beim Schreibort unten.
function blockAnchorForLine(text, line) {
  const lines = String(text ?? '').split(/\r?\n/);
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  // Nachtrag zur Nachbesserung: Eine Zeile im Frontmatter gehört zu keinem Block.
  const koerper = frontmatterBodyStart(lines);
  if (idx < koerper) return null;
  const { lineById, traegerById, datentabellen } = extractBlockAnchors(text);
  const tabelle = datentabelleAnZeile(datentabellen, line, lines.length);
  if (tabelle) {
    const t = tabelle.name ? traegerById.get(tabelle.name) : null;
    if (t && t.art === 'datentabelle' && t.zaunVon === tabelle.zaunVon) return tabelle.name;
  }
  const zaeune = zaeuneMitPraefix(lines, koerper);
  const zaun = zaunAnZeile(zaeune, line);
  if (zaun) return ankerZeileUnterZaun(lines, zaun, lineById);
  if (lines[idx].trim() === '') return null;
  const { start, end } = absatzUm(lines, idx, zaeune);
  for (const [id, ln] of lineById) {
    if (traegerById.get(id).art === 'datentabelle') continue;
    const li = ln - 1;
    if (li >= start && li <= end) return id;
  }
  return null;
}

// 4T-002072, Nachbesserung F1/F3: Der Absatz um die 0-basierte Zeile `idx`:
// zusammenhängende nicht leere Zeilen, die in keinem Zaun stehen. Er reicht nie
// über eine Zeile, die einen Code-Block öffnet oder schließt.
function absatzUm(lines, idx, zaeune) {
  const frei = (k) => lines[k].trim() !== '' && !zaunAnZeile(zaeune, k + 1);
  let start = idx;
  while (start > 0 && frei(start - 1)) start--;
  let end = idx;
  while (end < lines.length - 1 && frei(end + 1)) end++;
  return { start, end };
}

// 4T-002072: Die Kennung der ersten Anker-Zeile unter einem Zaun (aus
// `zaeuneMitPraefix`), Leerzeilen desselben Containers übersprungen, sofern
// sie dort zählt (erstes Vorkommen); null bei offenem Zaun oder ohne
// Anker-Zeile. Im Zitat zählt nur eine Anker-Zeile derselben Zitat-Tiefe.
function ankerZeileUnterZaun(lines, zaun, lineById) {
  if (zaun.bis == null) return null;
  let j = zaun.bis;
  while (j < lines.length && leerImContainer(lines[j], zaun.tiefe)) j++;
  if (j >= lines.length || zitatTeile(lines[j]).tiefe !== zaun.tiefe) return null;
  const id = ankerZeileAlleinImZitat(lines[j]);
  return id && lineById.get(id) === j + 1 ? id : null;
}

// 4T-002072: Wohin schreibt das Anlegen einer Kennung für den Block, in dem die
// 1-basierte Zeile `line` steht? Die Grundlage von «Anker anlegen» im Panel.
//   { art: 'zeilenende', zeile }        ` ^id` an das Ende dieser Zeile, der
//                                       letzten nicht leeren des Absatzes;
//                                       nie eine Zeile, die einen Code-Block
//                                       öffnet oder schließt (Nachbesserung F1)
//   { art: 'zeile-neu', nachZeile, praefix, leerzeile }
//                                       Nachbesserung F1: Schreibmarke in
//                                       einem Code-Block, der keine
//                                       Datentabelle der obersten Ebene ist:
//                                       neue Zeile `praefix + '^' + id` nach
//                                       der Schluss-Zeile `nachZeile`, mit dem
//                                       Zitat- und Einrückungs-Präfix der
//                                       Schluss-Zeile; `leerzeile` sagt, dass
//                                       danach eine Leerzeile `praefix.trimEnd()`
//                                       folgen muss, weil die nächste Zeile
//                                       nicht leer ist (sonst gehörte die
//                                       Anker-Zeile zu deren Absatz). Bei
//                                       offenem Zaun null.
//   { art: 'kopf-neu', nachZeile, einrueckung }
//                                       Datentabelle ohne Angabe `table:`:
//                                       neue Zeile `einrueckung + 'table: ' + id`
//                                       nach der Öffner-Zeile `nachZeile`
//   { art: 'kopf-wert', zeile, von, bis }
//                                       Datentabelle mit Angabe `table:`: den
//                                       Wert in dieser Zeile zwischen den
//                                       Zeichen-Positionen `von` und `bis`
//                                       ersetzen (bei leerem Wert ist von ===
//                                       bis unmittelbar hinter dem
//                                       Doppelpunkt; ein Leerzeichen vor der
//                                       Kennung setzt der Aufrufer)
//   null                                Zeile außerhalb des Textes, eine
//                                       Leerzeile außerhalb eines Code-Blocks,
//                                       ein offener Code-Block oder eine
//                                       Zeile im Frontmatter
// Eine Datentabelle mit Angabe bekommt `kopf-wert` auch bei gültigem Namen: Er
// kann ein Doppel sein, das nicht zählt; ersetzt wird dann dieser Wert.
function ankerZielFuerZeile(text, line) {
  const lines = String(text ?? '').split(/\r?\n/);
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const { datentabellen } = extractBlockAnchors(text);
  const tabelle = datentabelleAnZeile(datentabellen, line, lines.length);
  if (tabelle && tabelle.nameZeile == null) {
    const einrueckung = /^ */.exec(lines[tabelle.zaunVon - 1])[0];
    return { art: 'kopf-neu', nachZeile: tabelle.zaunVon, einrueckung };
  }
  if (tabelle) {
    const angabe = namensAngabe(lines[tabelle.nameZeile - 1]);
    const von = angabe.wertStart;
    return { art: 'kopf-wert', zeile: tabelle.nameZeile, von, bis: von + angabe.wertLen };
  }
  // Nachtrag zur Nachbesserung: Im Frontmatter wird nichts angelegt; die
  // Absatz-Regel hängte die Kennung sonst an seine Schluss-Zeile `---`.
  const koerper = frontmatterBodyStart(lines);
  if (idx < koerper) return null;
  const zaeune = zaeuneMitPraefix(lines, koerper);
  const zaun = zaunAnZeile(zaeune, line);
  if (zaun) {
    if (zaun.bis == null) return null;
    const naechste = lines[zaun.bis];
    const leerzeile = naechste != null && zitatTeile(naechste).kern.trim() !== '';
    return { art: 'zeile-neu', nachZeile: zaun.bis, praefix: zaun.praefix, leerzeile };
  }
  if (lines[idx].trim() === '') return null;
  return { art: 'zeilenende', zeile: absatzUm(lines, idx, zaeune).end + 1 };
}

module.exports = {
  BLOCK_ANCHOR_RE,
  BLOCK_ANCHOR_ID_RE,
  isValidBlockAnchorId,
  ankerZeileAllein,
  ankerZeileAlleinImZitat,
  namensAngabe,
  extractBlockAnchors,
  blockAnchorForLine,
  ankerZielFuerZeile,
  rewriteAnchorReferences,
  generateBlockAnchorId,
};
