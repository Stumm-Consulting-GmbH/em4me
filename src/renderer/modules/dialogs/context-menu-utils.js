// Generische Kontextmenue-Helfer: Aufbau der Eintraege, viewport-feste
// Platzierung von Menue und Submenue, Schliessen.
// 4T-000978 (Epic 3E-000196): aus modules/dialogs/dialogs.js ausgezogen (reiner
// Struktur-Schnitt, Funktions-Ruempfe unveraendert). Das Modul ist bewusst
// frei von Fach-Bezuegen — es kennt weder Reiter noch Lesezeichen und darf
// deshalb von jedem Bereich importiert werden, ohne Zyklen zu erzeugen.
'use strict';

import { t } from '../../i18n.js';

import { contextMenu } from '../app/app-state.js';

// Schließ-Haken: Wer eigenen Zustand an das gemeinsame #context-menu bindet,
// meldet hier eine Aufräum-Funktion an, die hideContextMenu mitruft.
// 4T-000978: Vorher setzte hideContextMenu die Gruppen-Menü-Besitzkennung
// direkt zurück. Nach dem Schnitt liegt dieser Zustand in tabs/, weshalb der
// generische Helfer ihn nicht mehr sehen darf; die Anmeldung dreht die
// Abhängigkeit um (tabs meldet sich bei dialogs an) und hält den
// Import-Graphen zyklenfrei.
const schliessHaken = [];

export function registerContextMenuCloseHook(fn) {
  if (typeof fn === 'function') schliessHaken.push(fn);
}

// R3-10 (4T-000187): gemeinsame Viewport-Klemmung fuer alle Kontextmenues
// (Tab-Menue und Bookmark-Menue) — vorher klemmte nur das Tab-Menue und
// das Bookmark-Menue konnte unten/rechts aus dem Fenster ragen.
export function placeContextMenuAt(menu, clientX, clientY) {
  menu.style.left = '0px';
  menu.style.top = '0px';
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  let x = clientX;
  let y = clientY;
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

// 4T-000012: Baut ein Kontextmenue-Item (oder Submenu-Item). Unterstuetzt drei
// Formen: Separator (`{separator: true}`), normaler Eintrag (`{key|label, action}`),
// Submenu-Eintrag (`{key|label, submenu: [...]}`). Submenus sind DOM-Kinder
// des Wrappers, damit der globale Outside-Click-Handler sie nicht abwuergt.
export function appendContextMenuItem(parent, item) {
  if (item.separator) {
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    parent.appendChild(sep);
    return;
  }
  const label = item.label != null ? item.label : t(item.key);
  if (Array.isArray(item.submenu) && item.submenu.length > 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'context-menu-item context-menu-item-submenu';
    // 4T-000378: optionale Selektor-Kennung auch am Submenü-Wrapper (z.B. Format).
    if (item.dataId) wrapper.dataset.menuId = item.dataId;
    const lbl = document.createElement('span');
    lbl.className = 'context-menu-item-label';
    lbl.textContent = label;
    wrapper.appendChild(lbl);
    const arrow = document.createElement('span');
    arrow.className = 'context-menu-submenu-arrow';
    arrow.textContent = '▸';
    wrapper.appendChild(arrow);

    const sub = document.createElement('div');
    sub.className = 'context-menu context-menu-submenu';
    sub.hidden = true;
    for (const subItem of item.submenu) appendContextMenuItem(sub, subItem);
    wrapper.appendChild(sub);

    let closeTimer = null;
    const open = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      sub.hidden = false;
      placeSubmenu(wrapper, sub);
    };
    const scheduleClose = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        sub.hidden = true;
        closeTimer = null;
      }, 250);
    };
    wrapper.addEventListener('mouseenter', open);
    wrapper.addEventListener('mouseleave', scheduleClose);
    sub.addEventListener('mouseenter', open);
    sub.addEventListener('mouseleave', scheduleClose);
    parent.appendChild(wrapper);
    return;
  }
  const div = document.createElement('div');
  div.className = 'context-menu-item';
  div.textContent = label;
  // 4T-000377: optionale Test-/Selektor-Kennung (z.B. Klipboard-Aktionen).
  if (item.dataId) div.dataset.menuId = item.dataId;
  // 4T-000379: optionales Zustands-Häkchen (Absatz-Submenü). checked === false
  // reserviert die Häkchen-Spalte fürs Alignment, checked === true zeigt ✓.
  if (item.checked !== undefined) {
    div.classList.add('context-menu-item-checkable');
    if (item.checked) div.classList.add('context-menu-item-checked');
    const check = document.createElement('span');
    check.className = 'context-menu-check';
    check.textContent = item.checked ? '✓' : '';
    div.prepend(check);
  }
  if (item.tooltip) div.title = item.tooltip;
  // 4T-000521 (Epic 3E-000094): optionales Icon (Inline-SVG-String aus dem
  // kuratierten Set) vor dem Label — genutzt von der nutzerdefinierten
  // Kontextmenü-Sektion der Kommando-Platzierung.
  if (item.icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'context-menu-icon';
    iconSpan.innerHTML = item.icon;
    div.prepend(iconSpan);
  }
  // 4T-000377: deaktivierter Eintrag (z.B. Ausschneiden ohne Selektion) — grau
  // über die bestehende CSS-Klasse .disabled, ohne Click-Handler.
  if (item.disabled) {
    div.classList.add('disabled');
  } else {
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      hideContextMenu();
      item.action();
    });
  }
  // 4T-001308 (Epic 3E-000235): optionale Nachlauf-Schaltflaeche am Zeilenende
  // ({ text, tooltip, action }). Sie traegt eine zweite Handlung am selben
  // Eintrag und loest die Haupt-Aktion ausdruecklich NICHT aus; das Menue
  // bleibt dabei offen, weil ihr Zweck gerade die Folge mehrerer Griffe ist
  // (im Mitglieder-Menue einer Reiter-Gruppe: mehrere Dateien schliessen).
  // Wer danach schliessen will, ruft hideContextMenu in seiner Aktion selbst.
  if (item.trailing && typeof item.trailing.action === 'function') {
    div.classList.add('context-menu-item-trailing');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'context-menu-trailing';
    btn.textContent = item.trailing.text != null ? item.trailing.text : '×';
    if (item.trailing.tooltip) {
      btn.title = item.trailing.tooltip;
      btn.setAttribute('aria-label', item.trailing.tooltip);
    }
    if (item.trailing.dataId) btn.dataset.menuId = item.trailing.dataId;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      item.trailing.action();
    });
    div.appendChild(btn);
  }
  parent.appendChild(div);
}

// 4T-000315 (Epic 3E-000056): viewport-feste Platzierung der Submenues. Die
// Submenues oeffnen per CSS rechts vom Eintrag (left: 100%); bei Tabs nahe
// dem rechten Fensterrand lag das Submenue damit ausserhalb des Fensters
// und war nicht bedienbar (nur das Hauptmenue wird seit R3-10 geklemmt).
// Beim Oeffnen wird gemessen: laeuft das Submenue rechts ueber, oeffnet es
// links vom Eintrag (Klasse); laeuft es unten ueber, wird es per Inline-top
// nach oben verschoben. Vor jeder Messung wird der Vorzustand
// zurueckgesetzt, damit erneutes Oeffnen frisch rechnet.
export function placeSubmenu(wrapper, sub) {
  sub.classList.remove('context-menu-submenu-left');
  sub.style.top = '';
  const rect = sub.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    sub.classList.add('context-menu-submenu-left');
  }
  const clamped = sub.getBoundingClientRect();
  if (clamped.bottom > window.innerHeight) {
    const wrapperTop = wrapper.getBoundingClientRect().top;
    // Basis-Offset -5px (CSS); zusaetzlich so weit nach oben schieben,
    // dass die Unterkante 4px Abstand zum Fensterrand haelt. Nicht ueber
    // die Fenster-Oberkante hinaus.
    const overflow = clamped.bottom - window.innerHeight + 4;
    const top = Math.max(-wrapperTop, -5 - overflow);
    sub.style.top = `${top}px`;
  }
}

export function hideContextMenu() {
  contextMenu.hidden = true;
  contextMenu.innerHTML = '';
  // 4T-000768 (Epic 3E-000158): Das Aufklapp-Menue der Gruppen teilt sich dieses
  // Element. Wer es schliesst (Klick auf einen Eintrag, Klick ausserhalb,
  // Escape), beendet damit auch dessen Besitz — sonst zoege eine spaetere
  // Schliess-Verzoegerung ein inzwischen fremdes Menue weg.
  for (const fn of schliessHaken) fn();
}
