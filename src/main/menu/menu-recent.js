// Aufbau der "Zuletzt geoeffnet"-Untermenues des Datei-Menues.
//
// 4T-000888 (Epic 3E-000168): aus menu.js herausgeloest, als die Buch- und die
// Regal-Liste dazukamen (Muster der Ausloesung von menu-icons.js im selben
// Epic). Vier Aufrufer teilen sich diesen einen Aufbau: Dateien, Bereiche,
// Buecher und Buecherregale unterscheiden sich nur in Liste, Leer-Text und
// den beiden Main-Aktionen. Die Handler dahinter liegen in recent-lists.js.
'use strict';

const path = require('node:path');

// Liefert die Bau-Funktion fuer ein Fenster-Menue. `t` ist die Uebersetzung
// der Fenster-Sprache, `actions` sind die Main-Aktionen des Fensters.
function createRecentListBuilder(t, actions) {
  // Bei leerer Liste ein disabled Platzhalter, sonst je Eintrag ein MenuItem
  // (Basisname, bei Gleichnamigkeit um den Eltern-Ordner ergaenzt), gefolgt
  // von Trenner und "Liste loeschen".
  // M-11 (4T-000188): Das toolTip-Property wirkt nur auf macOS und ist auf
  // Windows wirkungslos (harmlos, bleibt fuer einen etwaigen macOS-Port);
  // die Unterscheidung gleichnamiger Eintraege leistet auf Windows allein
  // der Ordner-Disambiguator im Label.
  return function buildRecentList(paths, emptyKey, openAction, clearAction) {
    if (paths.length === 0) return [{ label: t(emptyKey), enabled: false }];
    const basenameCount = new Map();
    for (const p of paths) {
      const b = path.basename(p);
      basenameCount.set(b, (basenameCount.get(b) || 0) + 1);
    }
    const items = paths.map((fullPath) => {
      const base = path.basename(fullPath);
      const label =
        basenameCount.get(base) > 1 ? `${base} (${path.basename(path.dirname(fullPath))})` : base;
      return {
        // M-12 (4T-000173): '&' im Namen wuerde Windows als Mnemonic
        // interpretieren (unterstrichener Buchstabe statt '&'); nur fuer
        // das Anzeige-Label escapen.
        label: label.replace(/&/g, '&&'),
        toolTip: fullPath,
        click: () => {
          if (actions && actions[openAction]) actions[openAction](fullPath);
        },
      };
    });
    items.push({ type: 'separator' });
    items.push({
      label: t('menu.file.recentClear'),
      click: () => {
        if (actions && actions[clearAction]) actions[clearAction]();
      },
    });
    return items;
  };
}

module.exports = { createRecentListBuilder };
