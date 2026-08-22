// 4T-1045 (Epic 3E-0151): Mindmap-Kern — Knoten-Baum aus einem Markdown-
// Dokument.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM, Muster
// src/shared/graph-core.js). Die Markdown-Instanz wird **injiziert** statt
// importiert: markdown.js lebt im Preload und ist im Renderer-Bundle nicht
// importierbar (fs-abhängige markdown-it-Plugins). Dadurch bleibt dieser
// Kern in Preload, Renderer-Bundle und Unit-Tests gleichermaßen ladbar,
// und der Aufrufer bestimmt, woher der Token-Strom kommt.
//
// Abbildungs-Modell (Konzept-Entscheidung des Product Owners vom 2026-08-14,
// Herleitung in 4T-0725): Überschriften und Listen werden Knoten, Fließtext
// und Blöcke werden **Notiz** ihres übergeordneten Knotens. Das ist der
// bewusste Unterschied zur Referenz markmap, die jeden Absatz zum eigenen
// Blatt-Knoten macht. Nebeneffekt: Deren Sonderregel «Blöcke verdrängen
// Listen derselben Ebene» entfällt ersatzlos, weil die Konkurrenz zwischen
// Absatz-Knoten und Listen-Knoten hier nicht besteht.
//
// Die **Anordnung** liegt seit 4T-1049 in der Nachbardatei
// mindmap-anordnung.js; dieser Kern trägt die Baum-Abbildung und reicht sie
// durch.
'use strict';

// Einziger Import: der Kopfbereich-Helfer. Electron-frei und im
// Renderer-Bundle nutzbar (belegt durch panel-outline.js), also ohne Wirkung
// auf die Ladbarkeit dieses Moduls.
const { extractFrontmatter } = require('./markdown/frontmatter.js');
// Die Anordnung liegt seit 4T-1049 in einer eigenen Datei. Sie wird hier
// durchgereicht, damit Aufrufer weiterhin **einen** Einstieg haben.
const { layoutMindmap, teileWurzelKinder, LAYOUT_VORGABEN } = require('./mindmap-anordnung.js');

// Obergrenze der Knoten-Zahl. Oberhalb liefert der Kern einen gekappten Baum
// mit gesetztem `gekappt`-Vermerk, damit die Ansicht einen Hinweis zeigen
// kann, statt an einem unbedienbaren Bild zu hängen (Muster der
// Knoten-Obergrenze des Graph-Renderers). Der Wert ist die in 4T-1045
// gemessene Grenze und steht als Konstante an genau einer Stelle.
const KNOTEN_OBERGRENZE = 3000;

// --- Baum-Aufbau ------------------------------------------------------------

function neuerKnoten(titel, opts) {
  return {
    titel: titel == null ? '' : String(titel),
    titelHtml: opts && opts.titelHtml != null ? opts.titelHtml : null,
    ebene: opts && opts.ebene != null ? opts.ebene : 0,
    zeile: opts && opts.zeile != null ? opts.zeile : null,
    art: opts && opts.art ? opts.art : 'wurzel',
    notizen: [],
    kinder: [],
  };
}

// Inline-Auszeichnungen eines Tokens als HTML. Ohne Renderer-Instanz bleibt
// der Klartext übrig; der Kern ist dann immer noch vollständig brauchbar,
// nur ohne Fett, Kursiv und Verweise im Knoten.
function inlineHtml(token, md) {
  if (!md || !md.renderer || !token || !Array.isArray(token.children)) return null;
  try {
    return md.renderer.renderInline(token.children, md.options || {}, {});
  } catch {
    return null;
  }
}

// Notiz-Art eines Block-Tokens. Alles, was kein Struktur-Element ist, wird
// Notiz seines Knotens; die Art trägt die Ansicht, damit sie ein Bild anders
// darstellen kann als einen Absatz.
function notizArt(typ) {
  if (typ === 'fence' || typ === 'code_block') return 'code';
  if (typ === 'table_open') return 'tabelle';
  if (typ === 'html_block') return 'html';
  return 'absatz';
}

// Erste Zeile eines Tokens (markdown-it liefert map als [von, bis)).
function zeileVon(token, versatz) {
  if (!token || !Array.isArray(token.map) || token.map.length === 0) return null;
  return token.map[0] + (versatz || 0);
}

/**
 * Baut den Knoten-Baum aus einem markdown-it-Token-Strom.
 *
 * @param {Array} tokens Token-Strom aus md.parse (Block-Ebene).
 * @param {object} [opts]
 * @param {string} [opts.wurzelTitel] Titel der Wurzel, wenn das Dokument nicht
 *   genau eine Überschrift erster Ebene trägt (üblich: der Dateiname).
 * @param {object} [opts.md] markdown-it-Instanz für die Inline-Darstellung.
 * @param {number} [opts.zeilenVersatz] Zeilen des übersprungenen Kopfbereichs.
 * @returns {{root: object, knotenZahl: number, gekappt: boolean}}
 */
function buildMindmapTree(tokens, opts = {}) {
  const md = opts.md || null;
  const versatz = opts.zeilenVersatz || 0;
  const liste = Array.isArray(tokens) ? tokens : [];

  // Überschriften erster Ebene zählen: Genau eine wird selbst zur Wurzel,
  // sonst trägt der Dateiname die Wurzel und alle H1 werden ihre Kinder
  // (Wurzel-Regel der Story 4S-0802, AK5).
  const h1Zahl = liste.filter((t) => t.type === 'heading_open' && t.tag === 'h1').length;
  const h1IstWurzel = h1Zahl === 1;

  const wurzel = neuerKnoten(opts.wurzelTitel || '', { ebene: 0, art: 'wurzel' });
  let knotenZahl = 1;
  let gekappt = false;

  // Offene Überschriften-Knoten, aufsteigend nach Ebene. Ein neuer Knoten
  // hängt am nächsthöheren **vorhandenen** Vorfahren, damit eine
  // übersprungene Ebene keinen Leerknoten erzeugt (AK9).
  const ueberschriften = [];
  // Offene Listenpunkte. Der oberste ist der aktuelle Knoten.
  const punkte = [];

  let wartetAufUeberschrift = null; // {ebene, zeile}
  let wartetAufPunktTitel = false;

  const aktuellerKnoten = () => {
    if (punkte.length > 0) return punkte[punkte.length - 1];
    if (ueberschriften.length > 0) return ueberschriften[ueberschriften.length - 1].knoten;
    return wurzel;
  };

  const anhaengen = (knoten, ebene) => {
    if (knotenZahl >= KNOTEN_OBERGRENZE) {
      gekappt = true;
      return false;
    }
    // Elternteil bestimmen: bei Überschriften der nächsthöhere Vorfahre,
    // bei Listenpunkten der umgebende Punkt bzw. die offene Überschrift.
    let eltern;
    if (ebene != null) {
      while (
        ueberschriften.length > 0 &&
        ueberschriften[ueberschriften.length - 1].ebene >= ebene
      ) {
        ueberschriften.pop();
      }
      eltern =
        ueberschriften.length > 0 ? ueberschriften[ueberschriften.length - 1].knoten : wurzel;
    } else {
      eltern = aktuellerKnoten();
    }
    eltern.kinder.push(knoten);
    knotenZahl += 1;
    return true;
  };

  for (let i = 0; i < liste.length; i++) {
    const token = liste[i];
    if (!token || !token.type) continue;

    switch (token.type) {
      case 'heading_open': {
        const ebene = Number(String(token.tag).slice(1)) || 1;
        wartetAufUeberschrift = { ebene, zeile: zeileVon(token, versatz) };
        break;
      }

      case 'list_item_open': {
        const knoten = neuerKnoten('', {
          ebene: null,
          zeile: zeileVon(token, versatz),
          art: 'listenpunkt',
        });
        if (anhaengen(knoten, null)) {
          punkte.push(knoten);
          wartetAufPunktTitel = true;
        } else {
          // Obergrenze erreicht: Der Punkt wird nicht Teil des Baums, seine
          // Klammer muss aber trotzdem geschlossen werden. Ein Platzhalter
          // hält den Stapel im Gleichgewicht.
          punkte.push(neuerKnoten('', { art: 'verworfen' }));
          wartetAufPunktTitel = true;
        }
        break;
      }

      case 'list_item_close':
        punkte.pop();
        wartetAufPunktTitel = false;
        break;

      case 'inline': {
        if (wartetAufUeberschrift) {
          const knoten = neuerKnoten(token.content, {
            ebene: wartetAufUeberschrift.ebene,
            zeile: wartetAufUeberschrift.zeile,
            art: 'ueberschrift',
            titelHtml: inlineHtml(token, md),
          });
          const eigeneEbene = wartetAufUeberschrift.ebene;
          wartetAufUeberschrift = null;
          // Genau eine H1: Sie ist die Wurzel selbst, statt ihr Kind zu sein.
          if (h1IstWurzel && eigeneEbene === 1) {
            wurzel.titel = knoten.titel;
            wurzel.titelHtml = knoten.titelHtml;
            wurzel.zeile = knoten.zeile;
            wurzel.art = 'ueberschrift';
            ueberschriften.length = 0;
            ueberschriften.push({ ebene: 1, knoten: wurzel });
          } else if (anhaengen(knoten, eigeneEbene)) {
            ueberschriften.push({ ebene: eigeneEbene, knoten });
          }
          break;
        }
        if (wartetAufPunktTitel && punkte.length > 0) {
          const knoten = punkte[punkte.length - 1];
          knoten.titel = String(token.content || '');
          knoten.titelHtml = inlineHtml(token, md);
          wartetAufPunktTitel = false;
          break;
        }
        // Jeder weitere Inline-Inhalt ist Fließtext und damit Notiz.
        aktuellerKnoten().notizen.push({
          art: 'absatz',
          text: String(token.content || ''),
          html: inlineHtml(token, md),
          zeile: zeileVon(token, versatz),
        });
        break;
      }

      case 'fence':
      case 'code_block':
      case 'html_block': {
        aktuellerKnoten().notizen.push({
          art: notizArt(token.type),
          text: String(token.content || ''),
          html: null,
          zeile: zeileVon(token, versatz),
        });
        break;
      }

      case 'table_open': {
        // Die Tabelle wird als **eine** Notiz geführt; ihr Inhalt steckt in
        // den folgenden inline-Token, die dadurch nicht einzeln als Absätze
        // erscheinen. Der Sprung überspringt sie bis table_close.
        const knoten = aktuellerKnoten();
        const teile = [];
        let j = i + 1;
        for (; j < liste.length && liste[j].type !== 'table_close'; j++) {
          if (liste[j].type === 'inline') teile.push(String(liste[j].content || ''));
        }
        knoten.notizen.push({
          art: 'tabelle',
          text: teile.join(' | '),
          html: null,
          zeile: zeileVon(token, versatz),
        });
        i = j;
        break;
      }

      default:
        break;
    }
  }

  return { root: wurzel, knotenZahl, gekappt };
}

// --- Bequemlichkeit für den Aufrufer ---------------------------------------

/**
 * Baum aus Markdown-Quelltext. Der Aufrufer liefert die markdown-it-Instanz
 * und, sofern vorhanden, den bereits abgetrennten Kopfbereich.
 *
 * @param {string} text Quelltext **ohne** Kopfbereich.
 * @param {object} md markdown-it-Instanz.
 * @param {object} [opts] wie buildMindmapTree.
 */
function mindmapAusMarkdown(text, md, opts = {}) {
  const tokens = md && typeof md.parse === 'function' ? md.parse(String(text || ''), {}) : [];
  return buildMindmapTree(tokens, { ...opts, md });
}

/**
 * Baum aus einem **vollständigen** Dokument, also einschließlich Kopfbereich.
 *
 * Trennt den Kopfbereich ab und verrechnet seinen Zeilen-Umfang als Versatz,
 * damit die Quellzeile eines Knotens auf die echte Datei zeigt und nicht auf
 * den Rumpf (Story 4S-0802, AK6). Die Rechnung liegt hier statt in der
 * Preload-Brücke, weil sie so unmittelbar geprüft wird statt im Test nur
 * nachgebildet zu werden.
 *
 * @param {string} text Quelltext mit Kopfbereich.
 * @param {object} md markdown-it-Instanz.
 * @param {object} [opts] wie buildMindmapTree.
 */
function mindmapAusDokument(text, md, opts = {}) {
  const quelle = text == null ? '' : String(text);
  const fm = extractFrontmatter(quelle);
  const zeilenVersatz = fm.raw ? fm.raw.split('\n').length - 1 : 0;
  return mindmapAusMarkdown(fm.body, md, { ...opts, zeilenVersatz });
}

module.exports = {
  buildMindmapTree,
  layoutMindmap,
  teileWurzelKinder,
  mindmapAusMarkdown,
  mindmapAusDokument,
  LAYOUT_VORGABEN,
  KNOTEN_OBERGRENZE,
};
