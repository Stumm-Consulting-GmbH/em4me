// Aufbau des Untermenues "Arbeitsbereiche" im Datei-Menue: die Liste aller
// Arbeitsbereiche (Farbpunkt-Icon traegt die Offen-Markierung, Klick oeffnet
// bzw. fokussiert ueber die Main-Action) und darunter die vier
// Lebenszyklus-Aktionen.
//
// 4T-001737 (Epic 3E-000308): aus menu.js herausgeloest, als die
// Bereichs-Zuordnung in die Beschriftung kam (Muster der Ausloesung von
// menu-icons.js und menu-recent.js). Zwei Gruende, und der zweite ist der
// tragende: Die Label-Bildung aus Name und Bereichs-Pfad ist Fach-Logik mit
// Randfaellen (keine Bindung, gemischte Pfad-Trenner, uebermaessige Laenge),
// und in menu.js war sie nicht pruefbar, weil dieses Modul Electron laedt.
// Dazu stand menu.js auf 770 von 770 Code-Zeilen seiner eingefrorenen
// Ausnahme; jede zusaetzliche Zeile dort waere ein roter Waechter gewesen.
//
// Electron-frei: die Icon-Bitmap kommt aus menu-icons.js, das seinerseits
// `nativeImage` laedt — deshalb wird sie hereingereicht und nicht hier
// erzeugt, damit die Label-Bildung ohne Electron messbar bleibt.
'use strict';

// 4T-001737 (E2): Trenner zwischen Arbeitsbereichs-Name und Ordnernamen. Er
// steht als Zeichen im Code und nicht in einem Sprach-Schluessel, weil der
// Bestand vergleichbare Zusammensetzungen ebenso baut (`${base} (${ordner})`
// in menu-recent.js, `${arbeitsbereich}, ${fenster}` in window-title.js): Die
// Bestandteile sind uebersetzt, ihre Verkettung ist Typografie.
const LABEL_TRENNER = ' — ';

// 4T-001737 (AK4): Kappungs-Grenze je Bestandteil der Beschriftung, nicht fuer
// die Beschriftung als Ganzes. Ein langer Arbeitsbereichs-Name darf dem
// Ordnernamen nicht den Platz nehmen und umgekehrt — sonst zeigt die
// Beschriftung genau die Haelfte, die man schon kennt. Gekappt wird am ENDE,
// weil sich Namen und Ordnernamen am Anfang unterscheiden.
const LABEL_TEIL_MAX = 40;

/**
 * Letzter Bestandteil eines Ordner-Pfades.
 *
 * Bewusst ohne `path.basename`: Dessen Ergebnis haengt an der Plattform, auf
 * der die Anwendung laeuft, waehrend ein abgelegter Pfad von einem anderen
 * Rechner stammen kann (die Ablage wandert mit dem Benutzerprofil). Beide
 * Trenner-Zeichen gelten deshalb immer, und abschliessende Trenner fallen weg,
 * damit `C:\Notizen\` denselben Namen liefert wie `C:\Notizen`.
 *
 * @param {string|null|undefined} rootPath Wurzel-Pfad der Bereichs-Bindung.
 * @returns {string|null} Ordnername oder null, wenn keiner ableitbar ist.
 */
function ordnerName(rootPath) {
  if (typeof rootPath !== 'string') return null;
  const ohneEndTrenner = rootPath.replace(/[\\/]+$/, '');
  if (ohneEndTrenner === '') return null;
  const teile = ohneEndTrenner.split(/[\\/]/);
  const letzter = teile[teile.length - 1];
  return letzter === '' ? null : letzter;
}

// Kappt auf `max` Zeichen und setzt ein Auslassungszeichen an die Stelle des
// Abgeschnittenen. Gezaehlt werden Code-Punkte und nicht Code-Einheiten, damit
// die Kappung kein Ersatz-Paar zerreisst (ein halbes Ersatz-Paar erscheint im
// Menue als Fragezeichen-Kaestchen).
function kuerze(text, max = LABEL_TEIL_MAX) {
  const zeichen = Array.from(String(text));
  if (zeichen.length <= max) return zeichen.join('');
  return `${zeichen.slice(0, max).join('')}…`;
}

/**
 * Beschriftung eines Listen-Eintrags des Untermenues (4T-001737, E2).
 *
 * Einzeilig «Name — Ordnername»; genannt wird allein der letzte Bestandteil
 * des Pfades, nicht der ganze Pfad (eine Menue-Beschriftung ist einzeilig, und
 * ein vollstaendiger Pfad sprengte jede brauchbare Menue-Breite). Ein
 * Arbeitsbereich ohne Bindung traegt allein seinen Namen — kein Trennstrich,
 * kein Platzhalter (AK3).
 *
 * Das Maskieren des kaufmaennischen Und geschieht ZULETZT, nach Kappung und
 * Verkettung: Windows liest ein einzelnes '&' als Mnemonic-Markierung, und
 * eine Kappung nach dem Maskieren koennte ein '&&'-Paar in der Mitte
 * auseinanderschneiden (M-12, 4T-000173).
 *
 * @param {{name: string, areaPath?: string|null}} w Arbeitsbereich der Menue-Liste.
 * @returns {string} Fertige Menue-Beschriftung.
 */
function workspaceMenuLabel(w) {
  const name = kuerze(String((w && w.name) || ''));
  const ordner = ordnerName(w && w.areaPath);
  const roh = ordner === null ? name : `${name}${LABEL_TRENNER}${kuerze(ordner)}`;
  return roh.replace(/&/g, '&&');
}

/**
 * Liefert die Bau-Funktion des Arbeitsbereiche-Untermenues fuer ein Fenster.
 *
 * @param {object} ctx Bau-Kontext der Menue-Fabrik.
 * @param {(key: string) => string} ctx.t Uebersetzung der Fenster-Sprache.
 * @param {(commandId: string) => string|undefined} ctx.acc Effektiver Accelerator.
 * @param {(commandId: string) => boolean} ctx.avail Freigabe des Eintrags.
 * @param {(channel: string) => Function} ctx.send Klick-Weiterleitung an den Renderer.
 * @param {object} ctx.actions Main-Aktionen des Fensters (openWorkspace).
 * @param {Array} ctx.workspaces Liste [{ id, name, color, open, areaPath }].
 * @param {(colorKey: string, open: boolean) => object|null} ctx.dotIcon Farbpunkt-Bitmap.
 * @returns {() => Array} Bau-Funktion der Untermenue-Items.
 */
function createWorkspacesSubmenuBuilder(ctx) {
  const { t, acc, avail, send, actions, workspaces, dotIcon } = ctx;
  return function buildWorkspacesSubmenu() {
    const liste = Array.isArray(workspaces) ? workspaces : [];
    const items = [];
    if (liste.length === 0) {
      items.push({ label: t('menu.file.workspacesEmpty'), enabled: false });
    } else {
      for (const w of liste) {
        const icon = dotIcon ? dotIcon(w.color, !!w.open) : null;
        items.push({
          label: workspaceMenuLabel(w),
          ...(icon ? { icon } : {}),
          click: () => {
            if (actions && actions.openWorkspace) actions.openWorkspace(w.id);
          },
        });
      }
    }
    items.push({ type: 'separator' });
    // 4T-001637 (Epic 3E-000295): Die Dimmung von "Als Arbeitsbereich
    // speichern" und die Freigabe von "Arbeitsbereich schliessen" haengen an
    // den Bedingungen workspaceOhne und workspaceMit des
    // Verfuegbarkeits-Modells; eine lokale Kopie des Zustands gibt es hier
    // deshalb nicht.
    //
    // 4T-001737: Die vier Bloecke stehen ausgeschrieben und NICHT als Tabelle
    // ueber eine Schleife, obwohl sie gleich gebaut sind. Grund ist der
    // Waechter test/unit/menu-accelerator.test.js: Er liest die
    // Accelerator-Aufrufe des Menue-Baums als LITERALE aus dem Quelltext, weil
    // der Baum Electron laedt und nicht importierbar ist. Ein `acc(variable)`
    // waere fuer ihn unsichtbar, und jedes Kuerzel dieser vier Eintraege
    // bliebe im Menue unangezeigt, ohne dass es auffiele — genau der Befund
    // L-06 aus 4T-000890. Eine handgepflegte Ausnahme im Waechter waere ein
    // zweites Register, das veralten kann.
    items.push({
      label: t('menu.file.workspaceSaveAs'),
      accelerator: acc('workspace.saveAs'),
      enabled: avail('workspace.saveAs'),
      click: send('menu:workspaceSaveAs'),
    });
    items.push({
      label: t('menu.file.workspaceCreate'),
      accelerator: acc('workspace.create'),
      enabled: avail('workspace.create'),
      click: send('menu:workspaceCreate'),
    });
    items.push({
      label: t('menu.file.workspaceClose'),
      accelerator: acc('workspace.close'),
      enabled: avail('workspace.close'),
      click: send('menu:workspaceClose'),
    });
    items.push({
      label: t('menu.file.workspaceManage'),
      accelerator: acc('workspace.manage'),
      enabled: avail('workspace.manage'),
      click: send('menu:workspaceManage'),
    });
    return items;
  };
}

module.exports = {
  LABEL_TEIL_MAX,
  LABEL_TRENNER,
  ordnerName,
  workspaceMenuLabel,
  createWorkspacesSubmenuBuilder,
};
