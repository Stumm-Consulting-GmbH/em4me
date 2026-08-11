// 4T-0881: Menü-Zustand eines Fensters erfassen ({ label, enabled, checked } je
// Eintrag, flach über alle Untermenüs). Electron bietet keinen Getter für
// win.setMenu-Menüs; deshalb wird setMenu am Ziel-Fenster abgefangen und der
// nächste Neubau angestoßen (doppeltes Panel-Toggle lässt den Zustand
// unverändert, meldet den Menü-State aber neu — Muster armMenuCapture in
// buch.spec.js). Das Ziel-Fenster wird über einen Titel-Teil gewählt, nicht
// über getAllWindows()[0] (Z-Order, Stabilitätsregel 15).
'use strict';

const { expect } = require('@playwright/test');

async function menuZustand(app, titelTeil) {
  await app.evaluate(({ BrowserWindow }, teil) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.getTitle().includes(teil),
    );
    if (!win || win.__menuZustandArmed) return;
    win.__menuZustandArmed = true;
    const orig = win.setMenu.bind(win);
    win.setMenu = (menu) => {
      const collect = (items) => {
        const out = [];
        for (const it of items || []) {
          // 4T-0899: `checked` kommt hinzu, weil der Haken-Zustand die
          // eigentliche Kopplung traegt (Panel sichtbar <-> Haken gesetzt).
          // Rein additiv: Bestands-Aufrufer lesen nur `enabled`. Nicht-
          // ankreuzbare Eintraege liefern hier durchgaengig false.
          if (it.label)
            out.push({
              label: it.label,
              enabled: it.enabled !== false,
              checked: it.checked === true,
            });
          if (it.submenu) out.push(...collect(it.submenu.items));
        }
        return out;
      };
      globalThis.__menuZustand = globalThis.__menuZustand || {};
      globalThis.__menuZustand[teil] = collect(menu ? menu.items : []);
      return orig(menu);
    };
  }, titelTeil);

  let ergebnis = [];
  await expect
    .poll(async () => {
      await app.evaluate(({ BrowserWindow }, teil) => {
        const win = BrowserWindow.getAllWindows().find(
          (w) => !w.isDestroyed() && w.getTitle().includes(teil),
        );
        if (win && !win.isDestroyed()) {
          win.webContents.send('menu:togglePanel', 'notes');
          win.webContents.send('menu:togglePanel', 'notes');
        }
      }, titelTeil);
      ergebnis = await app.evaluate(
        (_electron, teil) => (globalThis.__menuZustand || {})[teil] || [],
        titelTeil,
      );
      return ergebnis.length;
    })
    .toBeGreaterThan(0);
  return ergebnis;
}

// Ersten Menü-Eintrag mit exakt diesem Label liefern (oder null).
function menuEintrag(zustand, label) {
  return zustand.find((e) => e.label === label) || null;
}

module.exports = { menuZustand, menuEintrag };
