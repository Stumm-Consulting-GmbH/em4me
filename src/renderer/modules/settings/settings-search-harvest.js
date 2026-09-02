// 4T-000761 (Epic 3E-000142), ausgezogen mit 4T-000988 (Epic 3E-000196):
// erntbarer Text der Einstellungs-Bereiche für die Suche.
//
// Einziger Verbraucher ist die Such-Sektion (settings-search.js); Ernte und
// Sprung teilen sich einen Selektor, damit Zeilen-Index und Sprung-Ziel nie
// auseinanderlaufen.
'use strict';

import { t } from '../../i18n.js';
import { sectionById, settingsSections } from './settings-page.js';
import { buildDraft } from './settings-draft.js';
import { activateSection, settingsPageEls } from './settings-mount.js';
import { pageState } from './settings-shared.js';

// 4T-000761 (Epic 3E-000142): Erntbarer Text aller Einstellungs-Bereiche fuer
// die Suche.
//
// Der Text entsteht, indem jeder Bereich einmal in einen ABGEKOPPELTEN
// Container gerendert und sein sichtbarer Text gelesen wird. Der Weg ist
// bewusst gewaehlt: Die Such-Quelle ist damit dieselbe Funktion wie die
// Anzeige und kann nicht divergieren. Eine parallel gepflegte Liste
// "diese Schluessel gehoeren zu Bereich X" veraltete beim ersten neuen
// Schalter, und die Bereiche registrieren sich zudem aus mehreren Modulen.
//
// Der Entwurf ist ein Wegwerf-Exemplar, sofern die Seite nicht offen ist;
// ein offener Entwurf des Nutzers wird nie angetastet. Die asynchrone
// Nachlade-Strecke laeuft dafuer NICHT: Beschriftungen haengen nicht an
// den geladenen Werten, und ein Nachladen haette Nebenwirkungen auf die
// geoeffnete Seite.
//
// Rueckgabe je Bereich: { id, titel, gruppe, zeilen: [Text, ...] }. Die
// Zeilen-Reihenfolge ist zugleich die Sprung-Adresse (Zeile 0 = Titel).
//
// 4T-000872 (PO-Befund vom 2026-08-04, Story 4S-000457 AK2): Ernte und Sprung
// teilen sich EINEN Selektor, damit Zeilen-Index und Sprung-Ziel nie
// auseinanderlaufen. Neben den drei Standard-Klassen erfasst er die
// Bereiche mit eigenem Markup: die Erweiterungs-Zeilen (interne und
// externe Liste — vorher fehlten ALLE Erweiterungs-Namen und
// -Beschreibungen im Suchraum), ihre Gruppen-Titel und Intro-Texte sowie
// die verbreiteten Gruppen-Ueberschriften (settings-export-group-title).
// Bewusst draussen bleiben dynamische Nutzer-Inhalte (Journal-Listen,
// Kalender-System-Editor, Woerterbuch-Woerter, Vorlagen-Regeln) und
// situative Leer-Hinweise: Sie sind keine Oberflaechen-Beschriftung, und
// der Vorrat-Cache der Suche wuerde sie veralten lassen.
const SUCH_ZEILEN_SELEKTOR = [
  '.settings-row',
  '.settings-hint',
  '.settings-subheading',
  '.settings-export-group-title',
  '.settings-extensions-intro',
  '.settings-extensions-group-title',
  '.settings-extension-row',
  '.settings-extension-external-row',
].join(', ');

export function erntbareBereiche() {
  const draft = pageState.draft || buildDraft();
  const ergebnis = [];
  for (const section of settingsSections()) {
    const body = document.createElement('div');
    try {
      section.render(body, draft);
    } catch {
      // Ein Bereich, der ohne montierte Seite nicht rendert, faellt aus der
      // Suche heraus statt sie scheitern zu lassen.
      continue;
    }
    const zeilen = [];
    for (const el of body.querySelectorAll(SUCH_ZEILEN_SELEKTOR)) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) zeilen.push(text);
    }
    // Bereiche ohne erfasste Zeile (reine Editor-Flaechen) bleiben ueber
    // ihren Titel auffindbar.
    ergebnis.push({
      id: section.id,
      titel: t(section.titleKey),
      gruppe: section.group === 'area' ? 'area' : 'general',
      zeilen,
    });
  }
  return ergebnis;
}

// 4T-000761: Bereich aktivieren und eine Zeile hervorheben (Sprung-Ziel der
// Suche). Der Entwurf bleibt unberuehrt; ein Bereichswechsel speichert
// nichts.
export function springeZuBereich(sectionId, zeilenIndex) {
  if (!sectionById(sectionId)) return false;
  activateSection(sectionId);
  const els = settingsPageEls();
  if (!els || !els.content) return true;
  const zeilen = els.content.querySelectorAll(SUCH_ZEILEN_SELEKTOR);
  // Zeile 0 ist der Bereichs-Titel; die erfassten Zeilen beginnen bei 1.
  const ziel = zeilenIndex > 0 ? zeilen[zeilenIndex - 1] : null;
  const el = ziel || els.content.querySelector('.settings-section-heading');
  if (!el) return true;
  el.scrollIntoView({ block: 'center', behavior: 'auto' });
  el.classList.add('settings-row-hervorgehoben');
  setTimeout(() => el.classList.remove('settings-row-hervorgehoben'), 1600);
  return true;
}
