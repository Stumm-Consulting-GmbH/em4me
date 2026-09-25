// @vitest-environment jsdom
// 4T-001851 (Epic 3E-000110): Prüffälle der Spalten-Bedienung — Anlegen,
// Umbenennen, Löschen samt Rückfrage und die Spalten-Einstellung «hakt
// hineingezogene Karten ab».
//
// **Gemessen wird an der Einbettung, nicht am Bedien-Modul allein** — dieselbe
// Überlegung wie bei der Karten-Bedienung nebenan: Die Zusagen dieses Vorgangs
// (eine Handlung ist eine Transaktion, Tafel und Dokument stimmen überein, ein
// abweichender Ausgangsstand verwirft) hängen am Zusammenspiel aus Bedienung,
// Zeichnung und Schreibweg.
//
// **Eigene Datei statt Anbau an `kanban-bedienung.test.js`**: Jene trägt die
// Karten und ist mit 44 Fällen nahe am Größen-Budget der Prüfdateien; der
// Gegenstand hier ist ein anderer.
//
// Der Editor der Spalte ist eine Attrappe, die den Zeilen-Bereich wirklich
// anwendet; die **Zahl** der Anwendungen ist damit die Zahl der Transaktionen.
// Der Rückfrage-Dialog ist ebenfalls eine Attrappe: Sie protokolliert, was
// gefragt wurde, und antwortet, was der Prüffall vorgibt.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { KARTE_KLASSE, SPALTE_KLASSE } from '../../../src/renderer/modules/kanban/kanban-tafel.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));

// Die Prozess-Brücke der Render-Kette, gestellt wie im Programm; sie muss VOR
// dem Laden der Einbettung stehen.
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  configureTaskMarkers: () => {},
  configureTaskStates: () => {},
};
const { initKanbanPane, legeKanbanSpalteAn, renderKanban } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');

const KOPF = '---\nkanban-plugin: board\n---\n';

// Der Aufbau der echten Tafeln des Product Owners: Leerzeile nach jeder
// Überschrift, fett gesetztes Erledigt-Kennzeichen in der Sprache des Vorbilds,
// zwei Leerzeilen zwischen den Spalten.
const TAFEL = [
  KOPF,
  '## Offen',
  '',
  '- [ ] Erste Karte',
  '- [ ] Zweite Karte',
  '',
  '## Erledigt',
  '',
  '**Fertiggestellt**',
  '- [x] Dritte Karte',
  '',
].join('\n');

// Eine Tafel mit einer leeren Spalte in der Mitte — sie wird ohne Rückfrage
// gelöscht (AK3).
const MIT_LEERER_SPALTE = [
  KOPF,
  '## Offen',
  '',
  '- [ ] Erste Karte',
  '',
  '## Wartet',
  '',
  '## Erledigt',
  '',
  '- [x] Dritte Karte',
  '',
].join('\n');

// --- Die Umgebung einer Spalte -------------------------------------------------

function baueSpalte(text, optionen = {}) {
  const tab = {
    content: text,
    viewMode: 'kanban',
    path: 'C:/Notizen/Tafel.md',
    editMode: true,
  };
  const container = document.createElement('section');
  document.body.appendChild(container);
  const protokoll = { schreibvorgaenge: [], menues: [], hinweise: [], rueckfragen: [] };
  // 4T-001905: Die Historie als Stapel voller Stände (Muster kanban-termin.test.js),
  // damit ein Rückgängig-Schritt byte-genau messbar ist.
  const zurueck = [];
  initKanbanPane({
    getPaneEls: () => ({ kanbanEl: container }),
    aktivesDokument: () => tab,
    istAenderbar: () => optionen.aenderbar !== false,
    rueckgaengig: () => {
      if (zurueck.length === 0) return false;
      tab.content = zurueck.pop();
      renderKanban(0);
      return true;
    },
    schreibeDokument: (_paneIdx, { vonZeile, bisZeile, text: neu }) => {
      protokoll.schreibvorgaenge.push({ vonZeile, bisZeile, text: neu });
      zurueck.push(tab.content);
      const zeilen = tab.content.split('\n');
      tab.content = [
        ...zeilen.slice(0, vonZeile - 1),
        ...neu.split('\n'),
        ...zeilen.slice(bisZeile),
      ].join('\n');
      return true;
    },
    statusUmschalten: () => true,
    zeigeKontextmenue: (_paneIdx, daten) => protokoll.menues.push(daten),
    schliesseKontextmenue: () => {},
    // Die Rückfrage-Attrappe: Sie hält fest, wonach gefragt wurde, und
    // antwortet, was der Prüffall vorgibt. `undefined` heißt «kein Rückruf».
    bestaetigeSpaltenLoeschung: (_paneIdx, angaben) => {
      protokoll.rueckfragen.push(angaben);
      return Promise.resolve(optionen.zusage !== false);
    },
  });
  renderKanban(0);
  return { tab, container, protokoll };
}

function spalten(container) {
  return [...container.querySelectorAll(`.${SPALTE_KLASSE}`)];
}

function titelTexte(container) {
  return spalten(container).map((el) => el.querySelector('.kanban-spalte-titel').textContent);
}

function eingabe(container) {
  return container.querySelector('.kanban-spalte-eingabe');
}

function neuKnopf(container) {
  return container.querySelector('.kanban-spalte-hinzufuegen');
}

function taste(el, key) {
  el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
}

function tippe(feld, wert) {
  feld.value = wert;
  taste(feld, 'Enter');
}

function klick(el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

/** Das Kontextmenü am Kopf einer Spalte, als Eintrags-Liste. */
function kopfMenue(container, protokoll, nr) {
  const kopf = spalten(container)[nr].querySelector('.kanban-spalte-kopf');
  kopf.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
  return protokoll.menues.length ? protokoll.menues[protokoll.menues.length - 1].eintraege : null;
}

/** Ein Eintrag des Menüs über seine Kennung statt über seinen Platz. */
function eintrag(eintraege, dataId) {
  return eintraege.find((e) => e.dataId === dataId);
}

function rueckgaengig(container) {
  container.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// --- Anlegen ---------------------------------------------------------------------

describe('Spalte anlegen (AK1)', () => {
  it('AK1: die Schaltflaeche am Ende des Streifens oeffnet sofort die Eingabe', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const knopf = neuKnopf(container);
    // Die Beschriftung kommt aus dem Katalog. Ohne geladenes Wörterbuch liefert
    // die Übersetzung ihren Schlüssel zurück; dass er in allen fünf Sprachen
    // einen Text hat, misst der Katalog-Prüffall weiter unten.
    expect(knopf.textContent).toBe('kanban.spalteHinzufuegen');
    expect(de['kanban.spalteHinzufuegen']).toBe('Spalte hinzufügen');
    klick(knopf);
    expect(eingabe(container), 'die neue Spalte ist sofort benennbar').not.toBeNull();
    // Noch ist nichts geschrieben: Die Spalte entsteht erst mit der Übernahme.
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    tippe(eingabe(container), 'In Arbeit');
    expect(protokoll.schreibvorgaenge, 'genau eine Transaktion (AK7)').toHaveLength(1);
    expect(tab.content).toContain('## In Arbeit');
    // AK7: Die Tafel zeigt danach, was im Dokument steht.
    expect(titelTexte(container)).toEqual(['Offen', 'Erledigt', 'In Arbeit']);
  });

  it('AK1: die neue Spalte steht am ENDE der Tafel', () => {
    const { container, tab } = baueSpalte(TAFEL);
    klick(neuKnopf(container));
    tippe(eingabe(container), 'Ganz hinten');
    expect(tab.content.indexOf('## Ganz hinten')).toBeGreaterThan(
      tab.content.indexOf('## Erledigt'),
    );
  });

  it('AK1: auch eine Tafel OHNE Spalten bietet den Weg zur ersten Spalte', () => {
    // Eine Tafel nur aus dem Kopf ist ein gültiger Bestand (F3 des
    // Format-Kerns, belegt an einer echten Tafel). Ohne die Schaltfläche gäbe
    // es für ihre erste Spalte keinen Weg.
    const { container, tab } = baueSpalte(KOPF);
    expect(container.querySelector('.kanban-keine-spalten')).not.toBeNull();
    klick(neuKnopf(container));
    tippe(eingabe(container), 'Erste Spalte');
    expect(tab.content).toContain('## Erste Spalte');
    expect(titelTexte(container)).toEqual(['Erste Spalte']);
  });

  it('eine leer uebernommene neue Spalte erzeugt nichts', () => {
    // Weder Schreibvorgang noch Rückgängig-Schritt: Eine angelegte und sofort
    // wieder gelöschte Spalte wären zwei Schritte für nichts (Regel der leeren
    // Neu-Karte).
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    klick(neuKnopf(container));
    tippe(eingabe(container), '   ');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
    expect(eingabe(container)).toBeNull();
    expect(spalten(container)).toHaveLength(2);
  });

  it('eine verworfene neue Spalte erzeugt nichts', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    klick(neuKnopf(container));
    const feld = eingabe(container);
    feld.value = 'Doch nicht';
    taste(feld, 'Escape');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
    expect(spalten(container)).toHaveLength(2);
    expect(container.querySelector('.kanban-spalte-entwurf')).toBeNull();
  });

  it('das Kommando legt am Ende der Tafel an', () => {
    const { container, tab } = baueSpalte(TAFEL);
    expect(legeKanbanSpalteAn(0)).toBe(true);
    tippe(eingabe(container), 'Aus dem Kommando');
    expect(tab.content).toContain('## Aus dem Kommando');
  });

  it('AK8: ein Titel mit Sonderzeichen wird unveraendert abgelegt und gelesen', () => {
    const { container, tab } = baueSpalte(TAFEL);
    const titel = 'Warten auf «Kund*innen» & Co. — 50 % / #dringend';
    klick(neuKnopf(container));
    tippe(eingabe(container), titel);
    expect(tab.content).toContain(`## ${titel}`);
    expect(titelTexte(container)[2]).toBe(titel);
  });
});

// --- Umbenennen -------------------------------------------------------------------

describe('Spalte umbenennen (AK2)', () => {
  it('AK2: der Doppelklick auf den Titel oeffnet die Eingabe mit dem Titel', () => {
    const { container } = baueSpalte(TAFEL);
    const titel = spalten(container)[0].querySelector('.kanban-spalte-titel');
    titel.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    expect(eingabe(container).value).toBe('Offen');
  });

  it('AK2: Enter uebernimmt; die Karten der Spalte bleiben unberuehrt', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const titel = spalten(container)[0].querySelector('.kanban-spalte-titel');
    titel.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    tippe(eingabe(container), 'Zu tun');
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).toContain('## Zu tun');
    expect(tab.content).not.toContain('## Offen');
    expect(tab.content).toContain('- [ ] Erste Karte\n- [ ] Zweite Karte');
    expect(container.querySelectorAll(`.${KARTE_KLASSE}`)).toHaveLength(3);
  });

  it('AK2: Escape verwirft, der gezeichnete Titel kommt zurueck', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    const titel = spalten(container)[0].querySelector('.kanban-spalte-titel');
    titel.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    const feld = eingabe(container);
    feld.value = 'Etwas ganz anderes';
    taste(feld, 'Escape');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
    expect(titelTexte(container)[0]).toBe('Offen');
  });

  it('der Klick ausserhalb der Eingabe uebernimmt', () => {
    const { container, tab } = baueSpalte(TAFEL);
    const titel = spalten(container)[1].querySelector('.kanban-spalte-titel');
    titel.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    eingabe(container).value = 'Per Klick daneben';
    klick(container.querySelector('.kanban-spalten'));
    expect(tab.content).toContain('## Per Klick daneben');
  });

  it('ein unveraenderter Titel erzeugt keinen Schreibvorgang', () => {
    // Eine Übernahme ohne Wirkung wäre ein leerer Rückgängig-Schritt.
    const { container, protokoll } = baueSpalte(TAFEL);
    const titel = spalten(container)[0].querySelector('.kanban-spalte-titel');
    titel.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    tippe(eingabe(container), 'Offen');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
  });

  it('ein eingefuegter Zeilenumbruch erzeugt keine zweite Ueberschrift', () => {
    // Die Eingabe ist einzeilig: Ein Umbruch im Titel zerrisse die Tafel.
    const { container, tab } = baueSpalte(TAFEL);
    const titel = spalten(container)[0].querySelector('.kanban-spalte-titel');
    titel.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    const feld = eingabe(container);
    feld.value = 'Erste Zeile\nZweite Zeile';
    // Das einzeilige Eingabe-Feld verschluckt den Umbruch schon beim Setzen des
    // Werts; die Übernahme räumt zusätzlich auf. Gemessen wird beides zusammen:
    // Wie auch immer der Umbruch verschwindet — er darf keine zweite
    // Überschrift erzeugen.
    taste(feld, 'Enter');
    expect(tab.content.split('\n').filter((z) => z.startsWith('## '))).toHaveLength(2);
    expect(tab.content).toMatch(/^## Erste Zeile ?Zweite Zeile$/m);
  });
});

// --- Löschen ---------------------------------------------------------------------

describe('Spalte loeschen (AK3, AK4)', () => {
  it('AK3: eine LEERE Spalte verschwindet ohne Rueckfrage', async () => {
    const { container, tab, protokoll } = baueSpalte(MIT_LEERER_SPALTE);
    const eintraege = kopfMenue(container, protokoll, 1);
    await eintrag(eintraege, 'kanban-column-delete').action();
    expect(protokoll.rueckfragen, 'keine Rueckfrage bei leerer Spalte').toHaveLength(0);
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).not.toContain('## Wartet');
    expect(titelTexte(container)).toEqual(['Offen', 'Erledigt']);
  });

  it('AK4: eine Spalte MIT Karten fragt zurueck und nennt Titel und Zahl', async () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const eintraege = kopfMenue(container, protokoll, 0);
    await eintrag(eintraege, 'kanban-column-delete').action();
    expect(protokoll.rueckfragen).toEqual([{ titel: 'Offen', anzahl: 2 }]);
    expect(tab.content).not.toContain('## Offen');
    expect(tab.content).not.toContain('Erste Karte');
    expect(titelTexte(container)).toEqual(['Erledigt']);
  });

  it('AK4: ein Abbruch laesst das Dokument unveraendert', async () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL, { zusage: false });
    const vorher = tab.content;
    const eintraege = kopfMenue(container, protokoll, 0);
    await eintrag(eintraege, 'kanban-column-delete').action();
    expect(protokoll.rueckfragen).toHaveLength(1);
    expect(protokoll.schreibvorgaenge, 'nach dem Abbruch wird nichts geschrieben').toHaveLength(0);
    expect(tab.content).toBe(vorher);
    expect(titelTexte(container)).toEqual(['Offen', 'Erledigt']);
  });

  it('die Karten der uebrigen Spalten bleiben stehen', async () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const eintraege = kopfMenue(container, protokoll, 0);
    await eintrag(eintraege, 'kanban-column-delete').action();
    expect(tab.content).toContain('- [x] Dritte Karte');
    expect(tab.content).toContain('**Fertiggestellt**');
    expect(container.querySelectorAll(`.${KARTE_KLASSE}`)).toHaveLength(1);
  });
});

// --- Die Spalten-Einstellung ------------------------------------------------------

describe('Einstellung «hakt hineingezogene Karten ab» (AK5, AK6)', () => {
  it('AK5: der Kontextmenue-Eintrag zeigt den Zustand als Haekchen', () => {
    const { container, protokoll } = baueSpalte(TAFEL);
    expect(eintrag(kopfMenue(container, protokoll, 0), 'kanban-column-complete').checked).toBe(
      false,
    );
    expect(eintrag(kopfMenue(container, protokoll, 1), 'kanban-column-complete').checked).toBe(
      true,
    );
  });

  it('AK5: setzen schreibt das Kennzeichen und zeichnet die Spalte neu', async () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    expect(spalten(container)[0].querySelector('.kanban-spalte-erledigt')).toBeNull();
    eintrag(kopfMenue(container, protokoll, 0), 'kanban-column-complete').action();
    expect(protokoll.schreibvorgaenge, 'genau eine Transaktion (AK7)').toHaveLength(1);
    expect(tab.content).toContain('## Offen\n\n**Fertiggestellt**\n');
    // Die Wirkung ist an der Spalte sichtbar — und zwar nach der Zeichnung, die
    // die Handlung selbst ausgelöst hat.
    expect(spalten(container)[0].querySelector('.kanban-spalte-erledigt')).not.toBeNull();
    expect(spalten(container)[0].dataset.erledigt).toBe('true');
  });

  it('AK5: entfernen nimmt das Kennzeichen wieder weg', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    eintrag(kopfMenue(container, protokoll, 1), 'kanban-column-complete').action();
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).not.toContain('**Fertiggestellt**');
    expect(spalten(container)[1].querySelector('.kanban-spalte-erledigt')).toBeNull();
    expect(spalten(container)[1].dataset.erledigt).toBeUndefined();
  });

  it('AK6: eine uebernommene Tafel behaelt ihren eigenen Wortlaut', () => {
    // Das Vorbild schreibt das Kennzeichen in SEINER Oberflächen-Sprache. Steht
    // in der Tafel bereits einer, hat er Vorrang vor dem Katalog-Wortlaut —
    // sonst trüge dieselbe Tafel zwei Schreibweisen, und das Vorbild läse eine
    // davon nicht zurück.
    const fremd = TAFEL.replace('**Fertiggestellt**', '**Done and dusted**');
    const { container, tab, protokoll } = baueSpalte(fremd);
    eintrag(kopfMenue(container, protokoll, 0), 'kanban-column-complete').action();
    expect(tab.content).toContain('## Offen\n\n**Done and dusted**\n');
    expect(tab.content).not.toContain('**Fertiggestellt**');
  });

  it('AK6: der Wortlaut des Katalogs ist der des Vorbilds', () => {
    // Belegt am Quelltext des Vorbild-Werkzeugs (src/lang/locale/*.ts, gelesen
    // am 2026-09-22) und an der echten Tafel des Product Owners: de
    // «Fertiggestellt», it «Completato», en «Complete»; fr und es führen dort
    // keine eigene Übersetzung und fallen auf das englische Wort zurück.
    expect(de['kanban.erledigtKennzeichen']).toBe('Fertiggestellt');
    const erwartet = { en: 'Complete', fr: 'Complete', es: 'Complete', it: 'Completato' };
    for (const sprache of Object.keys(erwartet)) {
      const woerterbuch = JSON.parse(lies(`src/i18n/${sprache}.json`));
      expect(woerterbuch['kanban.erledigtKennzeichen']).toBe(erwartet[sprache]);
    }
  });

  it('AK6: eine Tafel ohne Kennzeichen bekommt es in Katalog-Schreibweise', () => {
    const { container, tab, protokoll } = baueSpalte(MIT_LEERER_SPALTE);
    eintrag(kopfMenue(container, protokoll, 2), 'kanban-column-complete').action();
    // Ohne geladenes Wörterbuch ist der Schlüssel der Wortlaut; gemessen wird
    // hier der Weg über den Katalog, der Wortlaut selbst im Prüffall darüber.
    expect(tab.content).toContain('## Erledigt\n\n**kanban.erledigtKennzeichen**\n');
  });

  it('AK6: alles Uebrige bleibt zeichengleich', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    eintrag(kopfMenue(container, protokoll, 0), 'kanban-column-complete').action();
    const wieder = tab.content.replace(
      '\n**Fertiggestellt**\n- [ ] Erste Karte',
      '\n- [ ] Erste Karte',
    );
    expect(wieder).toBe(TAFEL);
  });
});

// --- Die Obergrenze der Spalte (4T-001905) ------------------------------------------

// Spalte 0 über ihrer Obergrenze (3 von 2), Spalte 1 mit fremder Obergrenze
// ohne Leerzeichen, Spalte 2 mit einer Nicht-Zahl in Klammern.
const MIT_LIMIT = [
  KOPF,
  '## Offen (2)',
  '',
  '- [ ] Erste Karte',
  '- [ ] Zweite Karte',
  '- [ ] Dritte Karte',
  '',
  '## In Arbeit(1)',
  '',
  '- [ ] Vierte Karte',
  '',
  '## Später (bald)',
  '',
].join('\n');

describe('Obergrenze der Spalte (4T-001905, AK2/AK5/AK6/AK8)', () => {
  const zaehler = (container, nr) =>
    spalten(container)[nr].querySelector('.kanban-spalte-zaehler').textContent;
  const limitEingabe = (container) => container.querySelector('.kanban-spalte-limit-eingabe');

  function oeffneLimit(container, protokoll, nr) {
    eintrag(kopfMenue(container, protokoll, nr), 'kanban-column-set-limit').action();
    return limitEingabe(container);
  }

  it('AK2: «Obergrenze entfernen» steht nur an einer Spalte mit Obergrenze', () => {
    const { container, protokoll } = baueSpalte(MIT_LIMIT);
    const ids = (nr) => kopfMenue(container, protokoll, nr).map((e) => e.dataId);
    expect(ids(0)).toContain('kanban-column-remove-limit');
    expect(ids(1)).toContain('kanban-column-remove-limit');
    expect(ids(2), 'eine Nicht-Zahl ist keine Obergrenze').not.toContain(
      'kanban-column-remove-limit',
    );
    expect(ids(2)).toContain('kanban-column-set-limit');
  });

  it('AK2: setzen schreibt die Obergrenze in einem Schritt; Rückgängig nimmt ihn zurück', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const feld = oeffneLimit(container, protokoll, 0);
    expect(feld, 'die Eingabe steht an der Stelle des Zählers').not.toBeNull();
    expect(feld.value).toBe('');
    expect(spalten(container)[0].querySelector('.kanban-spalte-zaehler')).toBeNull();
    tippe(feld, '3');
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).toContain('## Offen (3)\n');
    expect(zaehler(container, 0)).toBe('2/3');
    rueckgaengig(container);
    expect(tab.content).toBe(TAFEL);
    expect(zaehler(container, 0)).toBe('2');
  });

  it('AK2: ändern — die Eingabe ist mit der bestehenden Obergrenze vorbelegt', () => {
    const { container, tab, protokoll } = baueSpalte(MIT_LIMIT);
    const feld = oeffneLimit(container, protokoll, 0);
    expect(feld.value).toBe('2');
    tippe(feld, '5');
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).toBe(MIT_LIMIT.replace('## Offen (2)', '## Offen (5)'));
    expect(zaehler(container, 0)).toBe('3/5');
    expect(spalten(container)[0].classList.contains('kanban-spalte-ueberschritten')).toBe(false);
  });

  it('AK2: entfernen über das Menü, über eine leere Eingabe und über 0', () => {
    const erwartet = MIT_LIMIT.replace('## Offen (2)', '## Offen');
    const menue = baueSpalte(MIT_LIMIT);
    eintrag(kopfMenue(menue.container, menue.protokoll, 0), 'kanban-column-remove-limit').action();
    expect(menue.protokoll.schreibvorgaenge).toHaveLength(1);
    expect(menue.tab.content).toBe(erwartet);
    expect(zaehler(menue.container, 0)).toBe('3');
    rueckgaengig(menue.container);
    expect(menue.tab.content).toBe(MIT_LIMIT);
    for (const wert of ['', '0', ' 0 ']) {
      document.body.innerHTML = '';
      const { container, tab, protokoll } = baueSpalte(MIT_LIMIT);
      tippe(oeffneLimit(container, protokoll, 0), wert);
      expect(tab.content, JSON.stringify(wert)).toBe(erwartet);
    }
  });

  it('eine ungültige, eine unveränderte und eine verworfene Eingabe schreiben nichts', () => {
    for (const wert of ['abc', '2.5', '-1', '3 Karten', '2']) {
      document.body.innerHTML = '';
      const { container, tab, protokoll } = baueSpalte(MIT_LIMIT);
      tippe(oeffneLimit(container, protokoll, 0), wert);
      expect(protokoll.schreibvorgaenge, wert).toHaveLength(0);
      expect(tab.content).toBe(MIT_LIMIT);
      expect(limitEingabe(container)).toBeNull();
      expect(zaehler(container, 0), 'der Zähler kommt zurück').toBe('3/2');
    }
    const { container, tab, protokoll } = baueSpalte(MIT_LIMIT);
    const feld = oeffneLimit(container, protokoll, 0);
    feld.value = '7';
    taste(feld, 'Escape');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(MIT_LIMIT);
    expect(zaehler(container, 0)).toBe('3/2');
  });

  it('AK6: umbenennen zeigt den Titel ohne Obergrenze und erhält sie zeichengenau', () => {
    const { container, tab, protokoll } = baueSpalte(MIT_LIMIT);
    const titel = spalten(container)[1].querySelector('.kanban-spalte-titel');
    titel.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    expect(eingabe(container).value).toBe('In Arbeit');
    tippe(eingabe(container), 'Läuft');
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    // Die fremde Schreibweise ohne Leerzeichen bleibt, wie sie war.
    expect(tab.content).toBe(MIT_LIMIT.replace('## In Arbeit(1)', '## Läuft(1)'));
    expect(titelTexte(container)[1]).toBe('Läuft');
    expect(zaehler(container, 1)).toBe('1/1');
    rueckgaengig(container);
    expect(tab.content).toBe(MIT_LIMIT);
  });

  it('AK6: ein unveränderter Titel einer Spalte mit Obergrenze schreibt nichts', () => {
    const { container, protokoll } = baueSpalte(MIT_LIMIT);
    eintrag(kopfMenue(container, protokoll, 0), 'kanban-column-rename').action();
    tippe(eingabe(container), 'Offen');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
  });

  it('AK5: keine Sperre — eine überfüllte Spalte nimmt eine neue Karte auf', () => {
    const { container, tab, protokoll } = baueSpalte(MIT_LIMIT);
    klick(spalten(container)[0].querySelector('.kanban-spalte-neu'));
    tippe(container.querySelector('.kanban-karte-eingabe'), 'Vierte hier');
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).toContain('- [ ] Dritte Karte\n- [ ] Vierte hier\n');
    expect(zaehler(container, 0)).toBe('4/2');
    expect(spalten(container)[0].classList.contains('kanban-spalte-ueberschritten')).toBe(true);
  });

  it('AK8: im nicht änderbaren Dokument kein Menü, die Anzeige bleibt', () => {
    const { container, protokoll } = baueSpalte(MIT_LIMIT, { aenderbar: false });
    kopfMenue(container, protokoll, 0);
    expect(protokoll.menues).toHaveLength(0);
    expect(zaehler(container, 0)).toBe('3/2');
    expect(spalten(container)[0].classList.contains('kanban-spalte-ueberschritten')).toBe(true);
  });
});

// --- Transaktions-Körnung, Ausgangsstand und Änderbarkeit ---------------------------

describe('Koernung und Ausgangsstand (AK7)', () => {
  it('AK7: geschrieben wird der kleinste Zeilen-Bereich, nicht das Dokument', () => {
    const { container, protokoll } = baueSpalte(TAFEL);
    const titel = spalten(container)[0].querySelector('.kanban-spalte-titel');
    titel.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    tippe(eingabe(container), 'Zu tun');
    expect(protokoll.schreibvorgaenge).toEqual([{ vonZeile: 5, bisZeile: 5, text: '## Zu tun' }]);
  });

  it('AK7: das Zeilenenden-Artefakt einer CRLF-Tafel bleibt erhalten', () => {
    // Rot-Probe des Befunds aus diesem Vorgang: Die letzte Spalte dieser Tafel
    // reicht bis ans Dateiende, und dort steht als letztes Element der Rest
    // hinter dem Schluss-Umbruch. Wurde die neue Spalte dahinter gesetzt, stand
    // ein nackter LF in einer CRLF-Datei (behoben in `endeEinfuegeIndex`).
    const crlf = TAFEL.replace(/\n/g, '\r\n');
    const { container, tab } = baueSpalte(crlf);
    klick(neuKnopf(container));
    tippe(eingabe(container), 'Neu');
    expect(tab.content).toContain('## Neu\r\n');
    expect(/[^\r]\n/.test(tab.content), 'kein nackter LF in einer CRLF-Tafel').toBe(false);
    expect(tab.content.endsWith('\r\n'), 'der Schluss-Umbruch bleibt').toBe(true);
  });

  it('eine Aenderung an einem abweichenden Stand wird verworfen', () => {
    // Rot-Probe: Das Dokument ist zwischen Zeichnung und Übernahme fremd
    // geändert worden. Geschrieben wird dann nichts — die Spalten-Nummern der
    // Zeichnung zeigen auf einen Stand, den es nicht mehr gibt.
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const titel = spalten(container)[0].querySelector('.kanban-spalte-titel');
    titel.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    const feld = eingabe(container);
    feld.value = 'Zu tun';
    tab.content = TAFEL.replace('## Offen', '## Ganz anders');
    const fremd = tab.content;
    taste(feld, 'Enter');
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content, 'fremde Arbeit bleibt unberührt').toBe(fremd);
  });
});

describe('Nicht aenderbares Dokument (AK9)', () => {
  it('AK9: keine Schaltflaeche, kein Kommando, keine Eingabe', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL, { aenderbar: false });
    const vorher = tab.content;
    expect(neuKnopf(container)).toBeNull();
    expect(legeKanbanSpalteAn(0)).toBe(false);
    const titel = spalten(container)[0].querySelector('.kanban-spalte-titel');
    titel.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    expect(eingabe(container)).toBeNull();
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
  });

  it('AK9: das Kontextmenue der Spalte erscheint gar nicht', () => {
    const { container, protokoll } = baueSpalte(TAFEL, { aenderbar: false });
    kopfMenue(container, protokoll, 0);
    expect(protokoll.menues).toHaveLength(0);
  });

  it('AK9: der Erledigt-Zustand bleibt trotzdem sichtbar', () => {
    // Ansehen schreibt nichts und bleibt erlaubt — wie das Auswählen einer Karte.
    const { container } = baueSpalte(TAFEL, { aenderbar: false });
    expect(spalten(container)[1].querySelector('.kanban-spalte-erledigt')).not.toBeNull();
  });
});

// --- Kontextmenü -------------------------------------------------------------------

describe('Kontextmenue am Spalten-Kopf', () => {
  it('es bietet die Handlungen und ruft dieselben Griffe', () => {
    // 4T-001905: dazwischen «Obergrenze setzen…» — «Obergrenze entfernen» nur
    // an einer Spalte mit Obergrenze (eigener Prüffall unten).
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const eintraege = kopfMenue(container, protokoll, 0);
    expect(eintraege.map((e) => e.dataId)).toEqual([
      'kanban-column-rename',
      'kanban-column-set-limit',
      'kanban-column-delete',
      'kanban-column-complete',
    ]);
    expect(eintraege.map((e) => e.label)).toEqual([
      'kanban.spalteUmbenennen',
      'kanban.spalteLimitSetzen',
      'kanban.spalteLoeschen',
      'kanban.spalteHaktAb',
    ]);
    eintraege[0].action();
    expect(eingabe(container).value).toBe('Offen');
    tippe(eingabe(container), 'Aus dem Menue');
    expect(tab.content).toContain('## Aus dem Menue');
  });

  it('auf einer Karte erscheint kein Spalten-Menue', () => {
    const { container, protokoll } = baueSpalte(TAFEL);
    container
      .querySelector(`.${KARTE_KLASSE}`)
      .dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    const eintraege = protokoll.menues[0].eintraege;
    // 4T-001903: dazwischen «Termin setzen…» der Karte; 4T-001906: «Karte
    // archivieren».
    expect(eintraege.map((e) => e.dataId)).toEqual([
      'kanban-card-edit',
      'kanban-card-set-date',
      'kanban-card-archive',
      'kanban-card-delete',
    ]);
  });
});

// --- Verdrahtung über alle Zugänge -------------------------------------------------------

describe('Kommando „Spalte auf der Tafel anlegen" ueber alle Zugaenge (4T-001851)', () => {
  it('das Kommando steht in der Registry, ohne Vorgabe-Kuerzel', () => {
    const quelle = lies('src/shared/commands/commands.js');
    const block = /id: 'kanban\.addColumn',[\s\S]{0,700}?\n {2}\},/.exec(quelle);
    expect(block, 'Kommando kanban.addColumn fehlt').not.toBeNull();
    expect(block[0]).toContain('defaultBindings: [],');
    expect(block[0]).toContain("labelKey: 'command.kanban.addColumn'");
    expect(block[0]).toContain('menu: true');
    expect(block[0]).toContain("availability: 'tafelKarte'");
  });

  it('Menue, Bruecke und Dispatcher tragen es durchgaengig', () => {
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toContain("send('menu:kanbanAddColumn')");
    expect(menu).toContain("acc('kanban.addColumn')");
    expect(menu).toContain("enabled: avail('kanban.addColumn')");
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.on('menu:kanbanAddColumn'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuKanbanAddColumn(',
    );
    const dispatcher = lies('src/renderer/modules/app/app-commands.js');
    expect(dispatcher).toContain("'kanban.addColumn'");
    expect(dispatcher).toContain('legeKanbanSpalteAn(state.activePaneIndex)');
  });

  it('die Erweiterung Kanban nimmt es im Aus-Zustand mit', () => {
    // 4T-001852: Die Liste steht seit den beiden Wegen zu einer Tafel
    // mehrzeilig; gemessen wird deshalb der Eintrag und nicht mehr die Zeile.
    expect(extensionById('kanban').commands).toContain('kanban.addColumn');
  });

  it('die Rueckfrage laeuft ueber den Dialog-Weg des Bestands', () => {
    // Kein eigener Dialog der Tafel: derselbe Kanal, dieselbe Vorbelegung
    // (Abbrechen) wie bei den übrigen Lösch-Rückfragen des Bestands.
    const dialoge = lies('src/main/ipc/dialogs.js');
    expect(dialoge).toContain("handle('kanban:confirmDeleteColumn'");
    expect(dialoge).toContain("t('kanban.spalteLoeschenFrage')");
    expect(lies('src/main/preload.js')).toContain(
      "ipcRenderer.invoke('kanban:confirmDeleteColumn'",
    );
    expect(lies('src/renderer/modules/app-init.js')).toContain('bestaetigeSpaltenLoeschung');
  });

  it('die Texte stehen im Katalog, in allen fuenf Sprachen', () => {
    const schluessel = [
      'command.kanban.addColumn',
      'kanban.spalteHinzufuegen',
      'kanban.neueSpalte',
      'kanban.spalteUmbenennen',
      'kanban.spalteLoeschen',
      'kanban.spalteHaktAb',
      'kanban.spalteLimitSetzen',
      'kanban.spalteLimitEntfernen',
      'kanban.spalteLimitPlatzhalter',
      'kanban.kartenZahlLimit',
      'kanban.kartenZahlUeberschritten',
      'kanban.erledigtKennzeichen',
      'kanban.spalteLoeschenTitel',
      'kanban.spalteLoeschenFrage',
      'kanban.spalteLoeschenDetail',
      'kanban.spalteLoeschenOk',
      'kanban.spalteLoeschenAbbrechen',
    ];
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const woerterbuch = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of schluessel) {
        expect(woerterbuch[key], `${key} fehlt in ${sprache}`).toBeTruthy();
      }
      expect(woerterbuch['kanban.spalteLoeschenFrage']).toContain('{titel}');
      expect(woerterbuch['kanban.spalteLoeschenFrage']).toContain('{anzahl}');
    }
  });
});

describe('Bauweise der Spalten-Bedienung (4T-001851)', () => {
  it('sie bleibt frei von Renderer-Zustand', () => {
    // Injektions-Bauweise wie die Nachbarn: weder api noch i18n noch app-state
    // — nur der prozessneutrale Kern und die Nachbarn im Kanban-Ordner.
    const quelle = lies('src/renderer/modules/kanban/kanban-spalten.js');
    const bezuege = [...quelle.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(bezuege.length).toBeGreaterThan(0);
    for (const bezug of bezuege) {
      expect(bezug, `unerlaubter Import ${bezug}`).toMatch(
        /^(?:\.\.\/\.\.\/\.\.\/shared\/kanban\/|\.\/kanban-)/,
      );
    }
  });

  it('sie baut keinen zweiten Schreibweg und keine eigene Text-Rechnung', () => {
    // Der Schreibweg ist `wendeAn` der Karten-Bedienung, hereingereicht; die
    // Text-Operationen kommen aus dem Format-Kern. Beides zusammen ist die
    // Zusage «eine Handlung, eine Transaktion, ein Rückgängig-Schritt».
    const quelle = lies('src/renderer/modules/kanban/kanban-spalten.js');
    expect(quelle).toContain('ctx.wendeAn(operation, angaben)');
    expect(quelle).not.toMatch(/\.split\('\\n'\)/);
    const pane = lies('src/renderer/modules/kanban/kanban-pane.js');
    expect(pane).toContain('bedienungen[paneIdx].wendeAn(operation, angaben)');
  });
});
