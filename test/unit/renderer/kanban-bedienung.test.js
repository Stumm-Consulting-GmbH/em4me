// @vitest-environment jsdom
// 4T-001849 (Epic 3E-000110): Prüffälle der Karten-Bedienung — Anlegen,
// Bearbeiten, Löschen, Statuswechsel, die Körnung des Schreibwegs und der
// Abgleich des Ausgangsstands.
//
// **Gemessen wird an der Einbettung, nicht am Bedien-Modul allein.** Die
// Zusagen dieses Vorgangs — eine Handlung ist eine Transaktion (AK5), Tafel und
// Dokument stimmen überein (AK7), ein abweichender Ausgangsstand verwirft
// (AK6) — hängen am Zusammenspiel aus Bedienung, Zeichnung und Schreibweg. Ein
// Prüffall gegen das Modul allein könnte sie nicht tragen.
//
// Der Editor der Spalte ist eine Attrappe, die den Zeilen-Bereich wirklich
// anwendet: Damit ist der geschriebene Dokument-Text messbar, und die **Zahl**
// der Anwendungen ist die Zahl der Transaktionen. Dass eine Anwendung im
// Programm genau ein `view.dispatch` mit `userEvent: 'input'` ist, misst der
// Quelltext-Prüffall am Ende dieser Datei.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { KARTE_KLASSE } from '../../../src/renderer/modules/kanban/kanban-tafel.js';
import { zeilenAenderung } from '../../../src/renderer/modules/kanban/kanban-bedienung.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));

// Die Prozess-Brücke der Render-Kette, gestellt wie im Programm (Muster
// kanban-tafel.test.js): Sie muss VOR dem Laden der Einbettung stehen.
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  // Die Preload-Hälfte der Aufgaben-Konfiguration. Sie gehört zum Prüffall der
  // Status-Kette weiter unten und ist hier eine leere Zusage: Gemessen wird die
  // Kette im Anzeige-Prozess, nicht ihr Abgleich über die Brücke.
  configureTaskMarkers: () => {},
  configureTaskStates: () => {},
};
const { initKanbanPane, legeKanbanKarteAn, renderKanban } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');

const KOPF = '---\nkanban-plugin: board\n---\n';

const TAFEL = [
  KOPF,
  '## Offen',
  '',
  '- [ ] Erste Karte',
  '\tEine eingerückte Folgezeile',
  '- [ ] Zweite Karte 📅 2099-01-01',
  '',
  '## Erledigt',
  '',
  '**Complete**',
  '- [x] Dritte Karte',
  '',
].join('\n');

// --- Die Umgebung einer Spalte -------------------------------------------------

/**
 * Baut eine Tafel-Ansicht samt Editor-Attrappe und zeichnet sie.
 *
 * `schreibeDokument` wendet den Zeilen-Bereich wirklich an — genau wie die
 * Transaktion im Programm — und zählt seine Aufrufe. Der Dokument-Text danach
 * ist damit der, den der Anwender im Editor sähe.
 */
function baueSpalte(text, optionen = {}) {
  const tab = {
    content: text,
    viewMode: 'kanban',
    path: 'C:/Notizen/Tafel.md',
    editMode: true,
  };
  const container = document.createElement('section');
  document.body.appendChild(container);
  const protokoll = { schreibvorgaenge: [], status: [], menues: [], hinweise: [] };
  // Die Historie der Spalte als Attrappe: ein Stapel voller Dokument-Stände,
  // wie ihn CodeMirror je Transaktion führt. Damit ist der Text nach einem
  // Rückgängig-Schritt messbar — und zwar byte-genau.
  const zurueck = [];
  const vor = [];
  initKanbanPane({
    rueckgaengig: () => {
      if (zurueck.length === 0) return false;
      vor.push(tab.content);
      tab.content = zurueck.pop();
      renderKanban(0);
      return true;
    },
    wiederholen: () => {
      if (vor.length === 0) return false;
      zurueck.push(tab.content);
      tab.content = vor.pop();
      renderKanban(0);
      return true;
    },
    getPaneEls: () => ({ kanbanEl: container }),
    aktivesDokument: () => tab,
    istAenderbar: () => optionen.aenderbar !== false,
    schreibeDokument: (_paneIdx, { vonZeile, bisZeile, text: neu }) => {
      protokoll.schreibvorgaenge.push({ vonZeile, bisZeile, text: neu });
      zurueck.push(tab.content);
      vor.length = 0;
      const zeilen = tab.content.split('\n');
      tab.content = [
        ...zeilen.slice(0, vonZeile - 1),
        ...neu.split('\n'),
        ...zeilen.slice(bisZeile),
      ].join('\n');
      return true;
    },
    statusUmschalten: (_paneIdx, zeilenNummer) => {
      protokoll.status.push(zeilenNummer);
      if (optionen.statusSchreibt === false) return true;
      // Die Attrappe der Status-Kette schaltet das Zeichen, damit sich der
      // Dokument-Text wie im Programm ändert; die Kette selbst ist eigens
      // geprüft (siehe unten).
      const zeilen = tab.content.split('\n');
      zeilen[zeilenNummer - 1] = zeilen[zeilenNummer - 1].replace('- [ ]', '- [x]');
      tab.content = zeilen.join('\n');
      return true;
    },
    zeigeKontextmenue: (_paneIdx, daten) => protokoll.menues.push(daten),
    schliesseKontextmenue: () => {},
  });
  renderKanban(0);
  return { tab, container, protokoll };
}

function karten(container) {
  return [...container.querySelectorAll(`.${KARTE_KLASSE}`)];
}

function eingabe(container) {
  return container.querySelector('.kanban-karte-eingabe');
}

function tippe(feld, wert) {
  feld.value = wert;
  feld.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

function taste(el, key) {
  el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
}

function tasteMit(el, key, zusatz) {
  el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...zusatz }));
}

function klick(el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// --- Der Zeilen-Bereich des Schreibwegs -----------------------------------------

describe('zeilenAenderung: der kleinste geschriebene Bereich (4T-001849, AK5)', () => {
  it('zwei gleiche Fassungen ergeben keinen Schreibvorgang', () => {
    expect(zeilenAenderung('a\nb\n', 'a\nb\n')).toBeNull();
  });

  it('eine geänderte Zeile wird allein ersetzt', () => {
    // Nicht das ganze Dokument: Eine Transaktion über alles setzte Schreibmarke
    // und Faltungen des Editors zurück.
    expect(zeilenAenderung('a\nb\nc', 'a\nB\nc')).toEqual({
      vonZeile: 2,
      bisZeile: 2,
      text: 'B',
    });
  });

  it('eine eingefügte Zeile ersetzt nichts und fügt nur ein', () => {
    const aenderung = zeilenAenderung('a\nc', 'a\nb\nc');
    expect(aenderung.bisZeile).toBeLessThan(aenderung.vonZeile);
    expect(aenderung.text).toBe('b');
  });

  it('eine entfernte Zeile ergibt einen leeren Ersatz-Text', () => {
    expect(zeilenAenderung('a\nb\nc', 'a\nc')).toEqual({ vonZeile: 2, bisZeile: 2, text: '' });
  });

  it('das Zeilenenden-Artefakt einer CRLF-Datei bleibt an seiner Zeile', () => {
    // Getrennt wird ausschließlich an \n; das \r gehört zur Zeile und reist
    // mit ihr (Regel des Format-Kerns).
    const aenderung = zeilenAenderung('a\r\nb\r\nc', 'a\r\nB\r\nc');
    expect(aenderung).toEqual({ vonZeile: 2, bisZeile: 2, text: 'B\r' });
  });
});

// --- Anlegen ---------------------------------------------------------------------

describe('Karte anlegen (AK1)', () => {
  it('AK1: die Schaltflaeche am Fuss der Spalte oeffnet sofort die Eingabe', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const knopf = container.querySelector('.kanban-spalte-neu');
    // Die Beschriftung kommt aus dem Katalog. Ohne geladenes Wörterbuch liefert
    // die Übersetzung ihren Schlüssel zurück; gemessen wird deshalb hier der
    // Weg über den Katalog und weiter unten, dass der Schlüssel in allen fünf
    // Sprachfassungen einen Text hat.
    expect(knopf.textContent).toBe('kanban.karteHinzufuegen');
    expect(de['kanban.karteHinzufuegen']).toBe('Karte hinzufügen');
    klick(knopf);
    expect(eingabe(container), 'die neue Karte ist sofort beschriftbar').not.toBeNull();
    // Noch ist nichts geschrieben: Die Karte entsteht erst mit der Übernahme.
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    tippe(eingabe(container), 'Vierte Karte');
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).toContain('- [ ] Zweite Karte 📅 2099-01-01\n- [ ] Vierte Karte\n');
    // AK7: Die Tafel zeigt danach, was im Dokument steht.
    expect(karten(container)).toHaveLength(4);
  });

  it('AK1: die neue Karte landet am Ende IHRER Spalte', () => {
    const { container, tab } = baueSpalte(TAFEL);
    const spalten = [...container.querySelectorAll('.kanban-spalte')];
    klick(spalten[1].querySelector('.kanban-spalte-neu'));
    tippe(eingabe(container), 'Auch erledigt');
    expect(tab.content).toContain('- [x] Dritte Karte\n- [ ] Auch erledigt\n');
  });

  it('eine leer uebernommene Neu-Karte erzeugt nichts', () => {
    // Weder Schreibvorgang noch Rückgängig-Schritt: Eine angelegte und sofort
    // wieder gelöschte Karte wären zwei Schritte für nichts.
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    klick(container.querySelector('.kanban-spalte-neu'));
    tippe(eingabe(container), '   ');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
    expect(eingabe(container)).toBeNull();
    expect(karten(container)).toHaveLength(3);
  });

  it('eine verworfene Neu-Karte erzeugt nichts', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    klick(container.querySelector('.kanban-spalte-neu'));
    const feld = eingabe(container);
    feld.value = 'Doch nicht';
    taste(feld, 'Escape');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
    expect(karten(container)).toHaveLength(3);
  });

  it('das Kommando legt in der Spalte der gewaehlten Karte an', () => {
    const { container, tab } = baueSpalte(TAFEL);
    karten(container)[2].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    expect(legeKanbanKarteAn(0)).toBe(true);
    tippe(eingabe(container), 'Aus dem Kommando');
    expect(tab.content).toContain('- [x] Dritte Karte\n- [ ] Aus dem Kommando\n');
  });

  it('das Kommando legt ohne gewaehlte Karte in der ersten Spalte an', () => {
    const { container, tab } = baueSpalte(TAFEL);
    expect(legeKanbanKarteAn(0)).toBe(true);
    tippe(eingabe(container), 'Ohne Auswahl');
    expect(tab.content).toContain('- [ ] Zweite Karte 📅 2099-01-01\n- [ ] Ohne Auswahl\n');
  });
});

// --- Bearbeiten -------------------------------------------------------------------

describe('Karte bearbeiten (AK2, AK8)', () => {
  it('AK2: der Doppelklick oeffnet den ROHEN Karten-Text', () => {
    const { container } = baueSpalte(TAFEL);
    karten(container)[1].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    // Der Termin-Marker gehört der Zeile und nicht dem Text; er steht deshalb
    // nicht im Feld und bleibt beim Schreiben unangetastet.
    expect(eingabe(container).value).toBe('Zweite Karte');
  });

  it('AK2: Enter uebernimmt, die Marker-Segmente der Zeile bleiben', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    karten(container)[1].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    tippe(eingabe(container), 'Zweite Karte, neu benannt');
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).toContain('- [ ] Zweite Karte, neu benannt 📅 2099-01-01');
  });

  it('AK2: Escape verwirft, der gezeichnete Inhalt kommt zurueck', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    karten(container)[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    const feld = eingabe(container);
    feld.value = 'Etwas ganz anderes';
    taste(feld, 'Escape');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
    expect(karten(container)[0].querySelector('.kanban-karte-inhalt').textContent).toContain(
      'Erste Karte',
    );
  });

  it('der Klick ausserhalb der Karte uebernimmt', () => {
    const { container, tab } = baueSpalte(TAFEL);
    karten(container)[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    eingabe(container).value = 'Per Klick daneben';
    klick(container.querySelector('.kanban-spalte-kopf'));
    expect(tab.content).toContain('- [ ] Per Klick daneben');
  });

  it('unveraenderter Text erzeugt keinen Schreibvorgang', () => {
    // Eine Übernahme ohne Wirkung wäre ein leerer Rückgängig-Schritt.
    const { container, protokoll } = baueSpalte(TAFEL);
    karten(container)[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    tippe(eingabe(container), 'Erste Karte');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
  });

  it('ein eingefuegter Zeilenumbruch erzeugt keine zweite Aufgaben-Zeile', () => {
    // Die Eingabe ist einzeilig: Das Eingabe-Feld verschluckt einen Umbruch
    // bereits beim Setzen des Werts, und die Übernahme räumt zusätzlich auf.
    // Beides zusammen ist die Zusage, dass aus einer Karte nie zwei
    // Aufgaben-Zeilen oder eine zerrissene Struktur werden.
    const { container, tab } = baueSpalte(TAFEL);
    karten(container)[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    tippe(eingabe(container), 'Erste Karte\n- [ ] Geschmuggelt');
    const aufgabenZeilen = tab.content.split('\n').filter((z) => z.startsWith('- ['));
    expect(aufgabenZeilen).toHaveLength(3);
    expect(aufgabenZeilen[0]).toContain('Geschmuggelt');
    // Und die Folgezeile hängt weiterhin an genau dieser einen Karte.
    expect(tab.content).toContain('Geschmuggelt\n\tEine eingerückte Folgezeile\n');
  });

  it('AK8: die eingerueckten Folgezeilen bleiben beim Bearbeiten stehen', () => {
    const { container, tab } = baueSpalte(TAFEL);
    karten(container)[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    tippe(eingabe(container), 'Erste Karte, neu');
    expect(tab.content).toContain('- [ ] Erste Karte, neu\n\tEine eingerückte Folgezeile\n');
  });

  it('Enter und F2 auf der gewaehlten Karte oeffnen dieselbe Eingabe', () => {
    for (const key of ['Enter', 'F2']) {
      document.body.innerHTML = '';
      const { container } = baueSpalte(TAFEL);
      karten(container)[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
      taste(karten(container)[0], key);
      expect(eingabe(container), `${key} öffnet die Eingabe`).not.toBeNull();
      expect(eingabe(container).value).toBe('Erste Karte');
    }
  });

  it('der Nachzug beim Tippen nimmt die offene Eingabe nicht weg', () => {
    const { container, tab } = baueSpalte(TAFEL);
    karten(container)[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    eingabe(container).value = 'Halb geschrieben';
    // Ein fremder Takt der Zeichnung, wie ihn der verzögerte Nachzug auslöst.
    tab.content = `${tab.content}\n`;
    renderKanban(0);
    expect(eingabe(container).value).toBe('Halb geschrieben');
  });
});

// --- Löschen ------------------------------------------------------------------------

describe('Karte loeschen (AK3, AK8)', () => {
  it('AK3: Entf auf der gewaehlten Karte loescht sie ohne Rueckfrage', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    karten(container)[1].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    taste(karten(container)[1], 'Delete');
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).not.toContain('Zweite Karte');
    expect(karten(container)).toHaveLength(2);
  });

  it('AK8: die Folgezeilen der Karte verschwinden mit ihr, fremde bleiben', () => {
    const { container, tab } = baueSpalte(TAFEL);
    karten(container)[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    taste(karten(container)[0], 'Delete');
    expect(tab.content).not.toContain('Eine eingerückte Folgezeile');
    expect(tab.content).toContain('- [ ] Zweite Karte 📅 2099-01-01');
    expect(tab.content).toContain('**Complete**');
  });

  it('die Auswahl wandert auf die naechste Karte der Spalte', () => {
    const { container } = baueSpalte(TAFEL);
    karten(container)[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    taste(karten(container)[0], 'Delete');
    const gewaehlt = container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`);
    expect(gewaehlt, 'nach dem Löschen steht die Tafel nicht ohne Auswahl da').not.toBeNull();
    expect(gewaehlt.textContent).toContain('Zweite Karte');
  });

  it('war es die letzte Karte der Spalte, bleibt die vorige gewaehlt', () => {
    const { container } = baueSpalte(TAFEL);
    karten(container)[1].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    taste(karten(container)[1], 'Delete');
    const gewaehlt = container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`);
    expect(gewaehlt.textContent).toContain('Erste Karte');
  });

  it('war sie die einzige Karte der Spalte, bleibt die Tafel ohne Auswahl', () => {
    const { container } = baueSpalte(TAFEL);
    karten(container)[2].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    taste(karten(container)[2], 'Delete');
    expect(container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`)).toBeNull();
  });
});

// --- Rückgängig und Wiederholen auf der Fläche -------------------------------------

describe('Rueckgaengig und Wiederholen auf der Tafel-Flaeche (Nachtrag 2026-09-21)', () => {
  // Das Löschen ist bewusst ohne Rückfrage, weil der eine Rückgängig-Schritt
  // es sichert. Der Tafel-Modus blendet den Editor aus wie der Canvas-Modus,
  // sein Tastenkürzel-Verzeichnis ist damit unerreichbar — ohne eigenen Weg
  // liefe die Sicherung ins Leere. Gemessen wird deshalb die Wirkung im
  // Dokument, nicht nur der weitergereichte Ruf.
  it('Strg+Z auf der Tafel holt die geloeschte Karte zurueck, byte-gleich', () => {
    const { container, tab } = baueSpalte(TAFEL);
    const ausgang = tab.content;
    karten(container)[1].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    // Der echte Klick fokussiert die Karte, weil sie `tabindex` trägt; ein
    // erzeugtes Maus-Ereignis tut das nicht. Der Fokus wird deshalb gesetzt,
    // sonst misst der Fall die Lage des Programms gar nicht.
    karten(container)[1].focus();
    taste(karten(container)[1], 'Delete');
    expect(tab.content).not.toContain('Zweite Karte');
    // Der Fokus liegt nach dem Löschen wieder auf der Tafel — die gelöschte
    // Karte trug ihn und ist aus dem Baum verschwunden.
    expect(container.contains(document.activeElement)).toBe(true);
    tasteMit(document.activeElement, 'z', { ctrlKey: true });
    expect(tab.content, 'zeichengenau der Ausgangsstand').toBe(ausgang);
    expect(karten(container)).toHaveLength(3);
    tasteMit(document.activeElement, 'y', { ctrlKey: true });
    expect(tab.content).not.toContain('Zweite Karte');
    expect(karten(container)).toHaveLength(2);
  });

  it('Strg+Z greift auch ohne gewaehlte Karte', () => {
    // War es die letzte Karte ihrer Spalte, bleibt die Tafel ohne Auswahl.
    // Rückgängig gilt der Fläche und nicht einer Karte.
    const { container, tab } = baueSpalte(TAFEL);
    const ausgang = tab.content;
    karten(container)[2].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    taste(karten(container)[2], 'Delete');
    expect(container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`)).toBeNull();
    tasteMit(container, 'z', { ctrlKey: true });
    expect(tab.content).toBe(ausgang);
  });

  it('Strg+Umschalt+Z und Cmd+Z sind dieselben Wege', () => {
    const { container, tab } = baueSpalte(TAFEL);
    const ausgang = tab.content;
    karten(container)[1].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    taste(karten(container)[1], 'Delete');
    const geloescht = tab.content;
    tasteMit(container, 'z', { metaKey: true });
    expect(tab.content).toBe(ausgang);
    tasteMit(container, 'Z', { ctrlKey: true, shiftKey: true });
    expect(tab.content).toBe(geloescht);
  });

  it('in der offenen Eingabe bleibt Strg+Z das native Rueckgaengig des Feldes', () => {
    // Die Eingabe hält jeden Tastendruck an; die Tafel bekommt ihn nicht zu
    // sehen und nimmt deshalb auch nicht die vorige Handlung zurück.
    const { container, tab } = baueSpalte(TAFEL);
    karten(container)[1].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    taste(karten(container)[1], 'Delete');
    const geloescht = tab.content;
    karten(container)[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    tasteMit(eingabe(container), 'z', { ctrlKey: true });
    expect(tab.content).toBe(geloescht);
  });

  it('der Weg in die Historie der Spalte wird hereingereicht, nicht nachgebaut', () => {
    // Dieselbe Historie wie im Editor und dieselben beiden Griffe wie bei der
    // räumlichen Arbeitsfläche: eine zweite Undo-Logik entsteht nicht.
    const bedienung = lies('src/renderer/modules/kanban/kanban-bedienung.js');
    expect(bedienung).toContain('ctx.beiRueckgaengig');
    expect(bedienung).toContain('ctx.beiWiederholen');
    const pane = lies('src/renderer/modules/kanban/kanban-pane.js');
    expect(pane).toContain("rufeZugang('rueckgaengig', paneIdx)");
    expect(pane).toContain("rufeZugang('wiederholen', paneIdx)");
    // Gemessen wird der Block der Tafel-Einbettung und nicht irgendeine Stelle
    // der Datei: Die Canvas darüber trägt dieselben beiden Zeilen.
    const init = lies('src/renderer/modules/app-init.js');
    const block = /initKanbanPane\(\{[\s\S]*?\n {2}\}\);/.exec(init);
    expect(block, 'Einbettung der Tafel-Ansicht fehlt').not.toBeNull();
    expect(block[0]).toContain(
      'rueckgaengig: (paneIdx) => rueckgaengigInSpalte(paneEditors[paneIdx])',
    );
    expect(block[0]).toContain(
      'wiederholen: (paneIdx) => wiederholenInSpalte(paneEditors[paneIdx])',
    );
    // Und der Tafel-Modus blendet den Editor wirklich aus — das ist der Grund,
    // warum es den eigenen Weg braucht.
    expect(lies('src/renderer/styles/kanban.css')).toContain('.content.view-kanban .pane-source');
  });
});

// --- Statuswechsel --------------------------------------------------------------------

describe('Status der Karte wechseln (AK4)', () => {
  it('AK4: der Klick auf das Kaestchen geht ueber die Status-Kette der Anwendung', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    klick(karten(container)[0].querySelector('.kanban-karte-kasten'));
    // Gemeldet wird die Zeilen-Nummer des Editors (1-basiert) zu der Zeile, in
    // der die Karte steht (0-basiert im Modell).
    expect(protokoll.status).toEqual([7]);
    expect(protokoll.schreibvorgaenge, 'nicht über den Format-Kern').toHaveLength(0);
    expect(tab.content).toContain('- [x] Erste Karte');
  });

  it('AK4: die Leertaste auf der gewaehlten Karte tut dasselbe', () => {
    const { container, protokoll } = baueSpalte(TAFEL);
    karten(container)[1].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    taste(karten(container)[1], ' ');
    expect(protokoll.status).toEqual([9]);
  });

  it('AK8: die Folgezeilen bleiben beim Statuswechsel stehen', () => {
    const { container, tab } = baueSpalte(TAFEL);
    klick(karten(container)[0].querySelector('.kanban-karte-kasten'));
    expect(tab.content).toContain('- [x] Erste Karte\n\tEine eingerückte Folgezeile\n');
  });

  it('der Doppelklick auf das Kaestchen oeffnet keine Eingabe', () => {
    const { container } = baueSpalte(TAFEL);
    karten(container)[0]
      .querySelector('.kanban-karte-kasten')
      .dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    expect(eingabe(container)).toBeNull();
  });
});

// --- Die Status-Kette selbst ------------------------------------------------------------

describe('Statuswechsel ueber die Kette der Anwendung (AK4, Pflichtfall)', () => {
  // Hier laeuft die ECHTE Kette: computeStatusToggle, der Augmenter der
  // Erweiterung «Aufgaben» und der Zusammenbau der Zeile. Eine Attrappe koennte
  // die Zusage nicht tragen, dass eine auf der Tafel abgehakte Aufgabe genauso
  // behandelt wird wie eine in der Lese-Ansicht abgehakte.
  function attrappe(text) {
    const zustand = { text };
    return {
      state: {
        get doc() {
          const zeilen = zustand.text.split('\n');
          let start = 0;
          const grenzen = zeilen.map((z) => {
            const eintrag = { from: start, to: start + z.length, number: 0 };
            start += z.length + 1;
            return eintrag;
          });
          return {
            lines: zeilen.length,
            length: zustand.text.length,
            line: (nr) => ({ ...grenzen[nr - 1], number: nr }),
            sliceString: (von, bis) => zustand.text.slice(von, bis),
          };
        },
      },
      dispatch: ({ changes }) => {
        const liste = Array.isArray(changes) ? changes : [changes];
        // Von hinten nach vorn, damit die Offsets der vorderen gültig bleiben.
        for (const c of [...liste].sort((a, b) => b.from - a.from)) {
          zustand.text =
            zustand.text.slice(0, c.from) +
            c.insert +
            zustand.text.slice(c.to == null ? c.from : c.to);
        }
      },
      text: () => zustand.text,
    };
  }

  it('Pflichtfall: ein Erledigt-Zeichen IM Wiki-Verweis bleibt unberuehrt', async () => {
    await import('./api-stub.js');
    const lifecycle =
      await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
    const tasks = await import('../../../src/renderer/modules/tasks.js');
    const taskStates = await import('../../../src/renderer/modules/task-states.js');
    lifecycle.resetExtensionStateForTests();
    tasks.applyTasksConfig(null);
    taskStates.applyTaskStates(taskStates.resolveStoredTaskStates(null));
    taskStates.setStatusToggleAugmenter(tasks.taskToggleAugmenter);

    const view = attrappe('- [ ] [[N2 ✅ 2026-01-06 Zweite Beispiel-Notiz]]');
    expect(taskStates.performStatusToggle(view, 1)).not.toBeNull();
    const heute = tasks.todayIsoDate();
    // Das Datum steht am Zeilenende; der Verweis samt seinem Zeichen ist
    // zeichengleich geblieben.
    expect(view.text()).toBe(`- [x] [[N2 ✅ 2026-01-06 Zweite Beispiel-Notiz]] ✅ ${heute}`);
  });

  it('der Wechsel laeuft in EINER Transaktion, auch mit Automatik-Datum', async () => {
    await import('./api-stub.js');
    const tasks = await import('../../../src/renderer/modules/tasks.js');
    const taskStates = await import('../../../src/renderer/modules/task-states.js');
    tasks.applyTasksConfig(null);
    taskStates.setStatusToggleAugmenter(tasks.taskToggleAugmenter);
    const view = attrappe('- [ ] Mit Termin 📅 2099-01-01');
    const dispatch = vi.spyOn(view, 'dispatch');
    taskStates.performStatusToggle(view, 1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});

// --- Ausgangsstand und Änderbarkeit ---------------------------------------------------

describe('Abgleich des Ausgangsstands (AK6)', () => {
  it('AK6: eine Aenderung an einem abweichenden Stand wird verworfen', () => {
    // Rot-Probe: Das Dokument ist zwischen Zeichnung und Übernahme fremd
    // geändert worden. Geschrieben wird dann nichts — die Zeilen-Nummern der
    // Zeichnung zeigen auf einen Stand, den es nicht mehr gibt.
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    karten(container)[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    const feld = eingabe(container);
    feld.value = 'Erste Karte, neu';
    tab.content = TAFEL.replace('## Offen', '## Ganz anders');
    const fremd = tab.content;
    taste(feld, 'Enter');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content, 'fremde Arbeit bleibt unberührt').toBe(fremd);
  });

  it('AK6: auch der Statuswechsel misst gegen den Ausgangsstand', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const kasten = karten(container)[0].querySelector('.kanban-karte-kasten');
    tab.content = `${KOPF}\n## Offen\n\n- [ ] Eine ganz andere Karte\n`;
    const fremd = tab.content;
    klick(kasten);
    expect(protokoll.status).toHaveLength(0);
    expect(tab.content).toBe(fremd);
  });
});

describe('Nicht aenderbares Dokument (AK9)', () => {
  it('AK9: keine Schaltflaeche, keine Eingabe, kein Loeschen, kein Statuswechsel', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL, { aenderbar: false });
    const vorher = tab.content;
    expect(container.querySelector('.kanban-spalte-neu')).toBeNull();
    expect(legeKanbanKarteAn(0)).toBe(false);
    karten(container)[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    expect(eingabe(container)).toBeNull();
    karten(container)[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    taste(karten(container)[0], 'Delete');
    klick(karten(container)[0].querySelector('.kanban-karte-kasten'));
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(protokoll.status).toHaveLength(0);
    expect(tab.content).toBe(vorher);
  });

  it('AK9: das Kontextmenue erscheint gar nicht', () => {
    const { container, protokoll } = baueSpalte(TAFEL, { aenderbar: false });
    karten(container)[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    expect(protokoll.menues).toHaveLength(0);
  });

  it('AK9: Ansehen und Auswaehlen bleiben moeglich', () => {
    const { container } = baueSpalte(TAFEL, { aenderbar: false });
    karten(container)[1].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    expect(karten(container)[1].getAttribute('aria-selected')).toBe('true');
  });
});

// --- Kontextmenü -----------------------------------------------------------------------

describe('Kontextmenue der Karte', () => {
  it('es bietet Bearbeiten und Loeschen und ruft dieselben Griffe', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    karten(container)[1].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    expect(protokoll.menues).toHaveLength(1);
    const eintraege = protokoll.menues[0].eintraege;
    // Wie beim Knopf oben: ohne geladenes Wörterbuch ist der Schlüssel die
    // Beschriftung. Dass er in allen fünf Sprachen einen Text hat, misst der
    // Katalog-Prüffall weiter unten.
    // 4T-001903: dazwischen «Termin setzen…» und, weil die Karte einen Termin
    // trägt, «Termin entfernen» (kanban-termin.test.js misst beide Griffe).
    // 4T-001906: dahinter «Karte archivieren» (kanban-archivieren.test.js).
    expect(eintraege.map((e) => e.dataId)).toEqual([
      'kanban-card-edit',
      'kanban-card-set-date',
      'kanban-card-remove-date',
      'kanban-card-archive',
      'kanban-card-delete',
    ]);
    expect(eintraege.map((e) => e.label)).toEqual([
      'kanban.karteBearbeiten',
      'kanban.terminSetzen',
      'kanban.terminEntfernen',
      'kanban.karteArchivieren',
      'kanban.karteLoeschen',
    ]);
    // Der Rechtsklick wählt die Karte, auf die er zeigt.
    expect(karten(container)[1].getAttribute('aria-selected')).toBe('true');
    eintraege[0].action();
    expect(eingabe(container).value).toBe('Zweite Karte');
    taste(eingabe(container), 'Escape');
    eintraege.find((e) => e.dataId === 'kanban-card-delete').action();
    expect(tab.content).not.toContain('Zweite Karte');
  });

  it('am Spalten-Kopf erscheint kein KARTEN-Menue', () => {
    // Seit 4T-001851 trägt der Spalten-Kopf sein eigenes Menü; gemessen wird
    // hier deshalb, dass die Einträge der Karte dort **nicht** erscheinen. Die
    // Einträge der Spalte prüft `kanban-spalten-bedienung.test.js`.
    const { container, protokoll } = baueSpalte(TAFEL);
    container
      .querySelector('.kanban-spalte-kopf')
      .dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    for (const menue of protokoll.menues) {
      expect(menue.eintraege.map((e) => e.dataId)).not.toContain('kanban-card-edit');
      expect(menue.eintraege.map((e) => e.dataId)).not.toContain('kanban-card-delete');
    }
  });
});

// --- Verdrahtung über alle Zugänge -------------------------------------------------------

describe('Kommando „Karte auf der Tafel anlegen" ueber alle Zugaenge (4T-001849)', () => {
  // Dieselbe Sorgfalt wie beim Modus und bei der Canvas-Karte: Ein Kommando,
  // das in Registry, Menü, Brücke und Dispatcher nicht durchgängig verdrahtet
  // ist, fällt sonst erst im Struktur-Prüfschritt auf.
  it('das Kommando steht in der Registry, ohne Vorgabe-Kuerzel', () => {
    const quelle = lies('src/shared/commands/commands.js');
    const block = /id: 'kanban\.addCard',[\s\S]{0,400}?\},/.exec(quelle);
    expect(block, 'Kommando kanban.addCard fehlt').not.toBeNull();
    expect(block[0]).toContain('defaultBindings: [],');
    expect(block[0]).toContain("labelKey: 'command.kanban.addCard'");
    expect(block[0]).toContain('menu: true');
    expect(block[0]).toContain("availability: 'tafelKarte'");
  });

  it('Menue, Bruecke und Dispatcher tragen es durchgaengig', () => {
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toContain("send('menu:kanbanAddCard')");
    expect(menu).toContain("acc('kanban.addCard')");
    expect(menu).toContain("enabled: avail('kanban.addCard')");
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.on('menu:kanbanAddCard'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuKanbanAddCard(',
    );
    const dispatcher = lies('src/renderer/modules/app/app-commands.js');
    expect(dispatcher).toContain("'kanban.addCard'");
    expect(dispatcher).toContain('legeKanbanKarteAn(state.activePaneIndex)');
  });

  it('die Erweiterung Kanban nimmt es im Aus-Zustand mit', () => {
    // Die Liste ist mit 4T-001851 um das Spalten-Kommando gewachsen; gemessen
    // wird hier weiterhin allein, dass das Karten-Kommando darin steht.
    expect(lies('src/shared/extensions/extensions.js')).toMatch(
      /commands: \[[^\]]*'kanban\.addCard'[^\]]*\]/,
    );
  });

  it('die Texte stehen im Katalog, in allen fuenf Sprachen', () => {
    const schluessel = [
      'command.kanban.addCard',
      'kanban.karteHinzufuegen',
      'kanban.neueKarte',
      'kanban.karteBearbeiten',
      'kanban.karteLoeschen',
      'kanban.verworfen',
      'kanban.nurInAnsicht',
      'kanban.nurLesbar',
    ];
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const woerterbuch = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of schluessel) {
        expect(woerterbuch[key], `${key} fehlt in ${sprache}`).toBeTruthy();
      }
    }
  });
});

describe('Bauweise der Karten-Bedienung (4T-001849)', () => {
  it('sie bleibt frei von Renderer-Zustand', () => {
    // Injektions-Bauweise wie die Zeichnung: Die Bedien-Logik kennt weder api
    // noch i18n noch app-state — nur den prozessneutralen Kern und ihre
    // Nachbarn im Kanban-Ordner. Der Ordner-Import-Wächter hält den Ordner
    // damit weiterhin ausserhalb des Renderer-Zyklus.
    const quelle = lies('src/renderer/modules/kanban/kanban-bedienung.js');
    const bezuege = [...quelle.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(bezuege.length).toBeGreaterThan(0);
    for (const bezug of bezuege) {
      expect(bezug, `unerlaubter Import ${bezug}`).toMatch(
        /^(?:\.\.\/\.\.\/\.\.\/shared\/kanban\/|\.\/kanban-)/,
      );
    }
  });

  it('der Schreibweg und die Status-Kette werden hereingereicht, nicht importiert', () => {
    // Ein Import von editor.js bildete den Zyklus editor -> kanban-pane ->
    // editor; EditorView und Status-Kette kommen deshalb aus app-init.js.
    const pane = lies('src/renderer/modules/kanban/kanban-pane.js');
    expect(pane).not.toMatch(/from '\.\.\/editor\/editor\.js'/);
    expect(pane).not.toMatch(/from '\.\.\/task-states\.js'/);
    expect(pane).toContain('umgebung.schreibeDokument');
    expect(pane).toContain('umgebung.statusUmschalten');
    const init = lies('src/renderer/modules/app-init.js');
    expect(init).toContain('statusUmschalten: (paneIdx, zeilenNummer)');
    expect(init).toContain('performStatusToggle(view, zeilenNummer)');
    // AK5: Eine Bedien-Handlung ist genau eine Transaktion; die
    // userEvent-Anmerkung hält sie in der Historie getrennt.
    expect(init).toMatch(/view\.dispatch\(\{ changes, userEvent: 'input' \}\)/);
  });
});
