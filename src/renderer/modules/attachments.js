// 4T-0642 / 4T-0789 (Epic 3E-0125): Gemeinsamer Renderer-Anteil der Anlagen.
// Beide Eingabewege (Einfuegen aus der Zwischenablage, Ziehen auf eine
// Dokument-Flaeche) enden hier: Anlagen aus einem DataTransfer einsammeln,
// ueber den Ablage-Kanal ablegen lassen und den Markdown-Verweis erzeugen.
//
// Der Ablage-Ort, die Namensvergabe und die Grenz-Pruefung liegen bewusst NICHT
// hier, sondern im Hauptprozess (src/main/documents/attachment-path.js). Dieses Modul
// kennt nur die Frage „was liegt an?" und „wie sieht der Verweis aus?".
import { api } from './app/api.js';
import { t } from '../i18n.js';
import { showStatusbarHint } from './views/views.js';

// Endungen, die im Markdown als Bild-Verweis erscheinen. Bewusst dieselbe
// Menge wie die Bild-Erkennung des Wiki-Embed-Plugins, damit ein eingefuegtes
// Bild in beiden Schreibweisen gleich behandelt wird.
const BILD_ENDUNGEN = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);

// Sammelt die Anlagen eines DataTransfer ein. Liefert je Eintrag das File-
// Objekt und, sofern ermittelbar, den Quell-Pfad.
//
// Der Pfad ist der bessere Weg, weil der Hauptprozess dann kopieren kann,
// statt Bytes durch die IPC-Grenze zu schicken. Ob `getPathForFile` fuer
// Dateien aus der ZWISCHENABLAGE traegt (fuer gezogene Dateien tut es das
// nachweislich), ist plattformabhaengig; deshalb wird der Pfad nur benutzt,
// wenn er tatsaechlich anfaellt, und sonst still auf die Bytes zurueckgefallen.
// Damit ist der Weg unabhaengig vom Ausgang dieser Frage.
export function anlagenAusDataTransfer(dataTransfer) {
  if (!dataTransfer || !dataTransfer.files || dataTransfer.files.length === 0) return [];
  const raus = [];
  for (const file of dataTransfer.files) {
    if (!file) continue;
    let pfad;
    try {
      pfad = typeof api.getPathForFile === 'function' ? api.getPathForFile(file) || '' : '';
    } catch {
      pfad = '';
    }
    raus.push({ file, pfad });
  }
  return raus;
}

// Endung eines Namens in Kleinschreibung, ohne Punkt.
function endungVon(name) {
  const m = typeof name === 'string' ? name.match(/\.([a-z0-9]+)$/i) : null;
  return m ? m[1].toLowerCase() : '';
}

// Markdown-Verweis auf eine abgelegte Anlage. Bilder als Bild-Verweis, alles
// uebrige als gewoehnlicher Link — beides in Standard-Syntax und damit
// unabhaengig von abschaltbaren Erweiterungen (Architekturentscheidung des
// Epics zur Verweis-Form).
//
// Alt- bzw. Linktext ist der Dateiname ohne Endung und damit nie leer; die
// Linter-Regel zum fehlenden Alt-Text trifft nur die leere Form `![]()`.
export function verweisMarkdown(name, verweisPfad) {
  const endung = endungVon(name);
  const anzeige = name.replace(/\.[a-z0-9]+$/i, '') || name;
  const ziel = encodeURI(verweisPfad).replace(/\(/g, '%28').replace(/\)/g, '%29');
  return BILD_ENDUNGEN.has(endung) ? `![${anzeige}](${ziel})` : `[${anzeige}](${ziel})`;
}

// Legt eine einzelne Anlage ueber den Hauptprozess ab. Liefert das Ergebnis des
// Kanals, ergaenzt um den fertigen Markdown-Verweis.
async function legeEineAb(eintrag, dokumentPfad) {
  const { file, pfad } = eintrag;
  const params = { dokumentPfad, name: file.name || '' };
  if (pfad) {
    params.quellPfad = pfad;
  } else {
    // Ohne Quell-Pfad gehen die Bytes durch die IPC-Grenze. Der Name eines
    // Bildschirmfotos ist dabei oft nichtssagend ('image.png'); der
    // Hauptprozess erzeugt in diesem Fall einen Namen aus Dokument und
    // Zeitstempel, wofuer er die Endung braucht.
    const puffer = await file.arrayBuffer();
    params.daten = new Uint8Array(puffer);
    params.endung = endungVon(file.name) || (file.type === 'image/jpeg' ? 'jpg' : 'png');
    if (!file.name || /^image\.[a-z0-9]+$/i.test(file.name)) params.name = '';
  }
  const ergebnis = await api.storeAttachment(params);
  if (!ergebnis || !ergebnis.ok) return ergebnis || { ok: false, error: 'unbekannt' };
  return { ...ergebnis, markdown: verweisMarkdown(ergebnis.name, ergebnis.verweis) };
}

// Uebersetzt die stabilen Fehler-Kennungen des Ablage-Kanals in Meldungen.
// Unbekannte Kennungen (etwa durchgereichte Dateisystem-Fehler) landen im
// allgemeinen Text, damit nie eine rohe Kennung in der Oberflaeche steht.
function fehlerText(error) {
  switch (error) {
    case 'kein-dokument':
      return t('attachments.error.unsavedDocument');
    case 'kein-bereich':
      return t('attachments.error.noArea');
    case 'ungueltiger-ordnername':
      return t('attachments.error.invalidFolder');
    case 'ausserhalb-der-wurzel':
      return t('attachments.error.outsideRoot');
    default:
      return t('attachments.error.generic');
  }
}

// Legt alle Anlagen ab und liefert den einzufuegenden Markdown-Block.
// Mehrere Anlagen ergeben mehrere Verweise, durch Leerzeilen getrennt, damit
// jeder fuer sich ein Absatz ist; der Aufrufer setzt sie in EINEM dispatch und
// damit als EINEN Undo-Schritt ein.
//
// Schlaegt eine Ablage fehl, erscheint eine Meldung in der Statusbar und der
// betroffene Verweis entfaellt; die uebrigen werden dennoch eingefuegt. Ein
// stiller Abbruch waere die schlechteste Variante, weil der Anwender sonst
// glaubt, die Anlage sei uebernommen.
export async function legeAnlagenAb(eintraege, dokumentPfad) {
  const verweise = [];
  let fehler = null;
  for (const eintrag of eintraege) {
    let ergebnis;
    try {
      ergebnis = await legeEineAb(eintrag, dokumentPfad);
    } catch (err) {
      ergebnis = { ok: false, error: (err && err.message) || String(err) };
    }
    if (ergebnis && ergebnis.ok) verweise.push(ergebnis.markdown);
    else if (!fehler) fehler = ergebnis && ergebnis.error;
  }
  if (fehler) showStatusbarHint(null, { text: fehlerText(fehler), error: true, duration: 4000 });
  // Leerzeilen zwischen mehreren Verweisen, damit jeder ein eigener Absatz ist.
  return verweise.join('\n\n');
}
