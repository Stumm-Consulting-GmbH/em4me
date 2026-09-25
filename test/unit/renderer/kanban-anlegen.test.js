// 4T-001852 (Epic 3E-000110): Prüffälle der beiden Wege zu einer Tafel — das
// neue Dokument, das bereits eine ist, und das Umwandeln eines leeren.
//
// **Gemessen wird am Dokument-Text und an der Einbettung**, nicht an einer
// gezeichneten Fläche: Beide Wege setzen an, wo es noch keine gibt. Der Editor
// ist deshalb eine Attrappe, die den Zeilen-Bereich wirklich anwendet; die
// **Zahl** der Anwendungen ist damit die Zahl der Transaktionen und der
// Rückgängig-Schritte (AK8).
//
// **Eigene Datei statt Anbau an `kanban-spalten-bedienung.test.js`**: Jene misst
// die Bedienung einer vorhandenen Tafel und ist nahe am Größen-Budget; der
// Gegenstand hier ist ihr Vorlauf.
//
// Der Menü-Baum wird zweifach geprüft, nach dem Vorbild `canvas-menü-ort.test.js`
// und aus demselben Grund: am Quelltext, weil menu.js Hauptprozess-Code ist und
// im E2E-Lauf kein Anwendungs-Menü existiert, und am gebauten Baum, weil sich
// nur dort zeigt, dass mit der abgeschalteten Erweiterung auch das Untermenü
// und sein Trenner verschwinden.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { erzeugeTafel, legeSpalteAn } from '../../../src/shared/kanban/kanban-operationen.js';
import {
  istTafelDokument,
  leseTafel,
  schreibeTafel,
  tafelUmfang,
} from '../../../src/shared/kanban/kanban-core.js';
import {
  availabilityContext,
  dokumentIstLeer,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import {
  initTafelAnlegen,
  legeNeueTafelAn,
  tafelStartInhalt,
  wandleInTafelUm,
} from '../../../src/renderer/modules/kanban/kanban-anlegen.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');

const cjs = createRequire(import.meta.url);
const { COMMANDS, commandAvailability } = cjs('../../../src/shared/commands/commands.js');

const DREI = ['Zu erledigen', 'In Arbeit', 'Erledigt'];

// --- Der Startinhalt im Format-Kern (AK3, AK4) --------------------------------

describe('Format-Kern: erzeugeTafel (4T-001852)', () => {
  it('AK4: das Erzeugnis wird als Tafel mit drei Spalten gelesen', () => {
    const { ok, text } = erzeugeTafel('', {
      spaltenTitel: DREI,
      erledigtSpalte: 2,
      erledigtWortlaut: 'Fertiggestellt',
    });
    expect(ok).toBe(true);
    expect(istTafelDokument(text)).toBe(true);
    const model = leseTafel(text);
    expect(model.befunde).toEqual([]);
    expect(model.spalten.map((s) => s.titel)).toEqual(DREI);
    expect(tafelUmfang(model)).toEqual({ spalten: 3, karten: 0, abgehakt: 0, befunde: 0 });
  });

  it('AK4: die dritte Spalte trägt die Erledigt-Einstellung, die beiden anderen nicht', () => {
    const { text } = erzeugeTafel('', {
      spaltenTitel: DREI,
      erledigtSpalte: 2,
      erledigtWortlaut: 'Fertiggestellt',
    });
    const model = leseTafel(text);
    expect(model.spalten.map((s) => s.erledigt)).toEqual([false, false, true]);
    expect(model.spalten[2].erledigtWortlaut).toBe('Fertiggestellt');
  });

  it('der Rundlauf ist byte-treu — ein ungelesenes Zeichen gibt es nicht', () => {
    const { text } = erzeugeTafel('', {
      spaltenTitel: DREI,
      erledigtSpalte: 2,
      erledigtWortlaut: 'Fertiggestellt',
    });
    expect(schreibeTafel(leseTafel(text))).toBe(text);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('CRLF: eine Quelle mit Wagenrücklauf bekommt ihn in jeder neuen Zeile', () => {
    const { ok, text } = erzeugeTafel('\r\n  \r\n', {
      spaltenTitel: DREI,
      erledigtSpalte: 2,
      erledigtWortlaut: 'Fertiggestellt',
    });
    expect(ok).toBe(true);
    expect(text.includes('\n')).toBe(true);
    // Kein nacktes LF: Jeder Umbruch trägt den Wagenrücklauf.
    expect(/[^\r]\n/.test(text)).toBe(false);
    const model = leseTafel(text);
    expect(model.spalten.map((s) => s.titel)).toEqual(DREI);
    expect(schreibeTafel(model)).toBe(text);
  });

  // Der Wächter über die Leerzeilen-Form (Nachtrag vom 2026-09-22): Die eine
  // gemessene Abweichung an den echten Tafeln des Product Owners war eine
  // fehlende Leerzeile hinter einer Spalte **ohne** Erledigt-Kennzeichen. Statt
  // die Form hier noch einmal in Erwartungs-Zeilen abzuschreiben — die Fassung,
  // die das Auseinanderlaufen gerade nicht bemerkt hat —, wird der zweite
  // Erzeuger des Kerns zum Maßstab: `legeSpalteAn` trifft die gemessene Form in
  // beiden Lagen. Laufen die beiden Wege je wieder auseinander, fällt es hier
  // auf, und zwar in jeder der vier Lagen (mit und ohne Kennzeichen, LF und
  // CRLF).
  describe.each([
    ['LF', '', '\n'],
    ['CRLF', '\r\n  \r\n', '\r\n'],
  ])('die Leerzeilen-Form gleicht der von legeSpalteAn (%s)', (_name, quelle, ende) => {
    const kopfText = ['---', 'kanban-plugin: board', '---', ''].join(ende);

    const ueberSpalten = (erledigtSpalte) => {
      let text = kopfText;
      DREI.forEach((titel, nr) => {
        const ergebnis = legeSpalteAn(text, {
          titel,
          erledigtWortlaut: nr === erledigtSpalte ? 'Fertiggestellt' : undefined,
        });
        expect(ergebnis.ok).toBe(true);
        text = ergebnis.text;
      });
      return text;
    };

    it('mit Erledigt-Kennzeichen an der dritten Spalte', () => {
      const { text } = erzeugeTafel(quelle, {
        spaltenTitel: DREI,
        erledigtSpalte: 2,
        erledigtWortlaut: 'Fertiggestellt',
      });
      expect(text).toBe(ueberSpalten(2));
    });

    it('ohne jedes Erledigt-Kennzeichen — die gemessene Abweichung', () => {
      const { text } = erzeugeTafel(quelle, { spaltenTitel: DREI });
      expect(text).toBe(ueberSpalten(null));
      // Drei Leerzeilen am Stück hinter einer leeren Spalte ohne Kennzeichen:
      // genau so steht sie in der echten Tafel des Vorbild-Werkzeugs.
      expect(text.split(ende).slice(4, 8)).toEqual([`## ${DREI[0]}`, '', '', '']);
    });
  });

  it('ein Dokument mit Inhalt wird nicht umgewandelt (AK5 im Kern)', () => {
    const ergebnis = erzeugeTafel('Eine Zeile Text\n', { spaltenTitel: DREI });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.befund.code).toBe('dokumentNichtLeer');
  });

  it('eine Tafel ist nie leer und fällt damit unter dieselbe Weigerung', () => {
    const { text } = erzeugeTafel('', {
      spaltenTitel: DREI,
      erledigtSpalte: 2,
      erledigtWortlaut: 'Fertiggestellt',
    });
    expect(erzeugeTafel(text, { spaltenTitel: DREI }).befund.code).toBe('dokumentNichtLeer');
  });

  it('fehlende Angaben sind ein Befund und keine Vermutung', () => {
    expect(erzeugeTafel('', { spaltenTitel: [] }).befund.code).toBe('ungueltigerTitel');
    expect(erzeugeTafel('', { spaltenTitel: ['A', '  '] }).befund.code).toBe('ungueltigerTitel');
    expect(erzeugeTafel('', { spaltenTitel: DREI, erledigtSpalte: 7 }).befund.code).toBe(
      'ungueltigePosition',
    );
    expect(erzeugeTafel('', { spaltenTitel: DREI, erledigtSpalte: 2 }).befund.code).toBe(
      'kennzeichenWortlautFehlt',
    );
  });
});

// --- Die Umgebung beider Wege --------------------------------------------------

function baueUmgebung(inhalt, optionen = {}) {
  const tab =
    inhalt === null
      ? null
      : {
          content: inhalt,
          viewMode: 'split',
          editMode: optionen.editMode !== false,
          systemPage: !!optionen.systemPage,
          manualPage: !!optionen.manualPage,
        };
  const protokoll = { schreibvorgaenge: [], hinweise: [], neueDokumente: [] };
  initTafelAnlegen({
    aktivesDokument: () => tab,
    neuesDokument: (angaben) => {
      protokoll.neueDokumente.push(angaben);
    },
    istAenderbar: () => optionen.aenderbar !== false,
    schreibeDokument: (_paneIdx, { vonZeile, bisZeile, text }) => {
      protokoll.schreibvorgaenge.push({ vonZeile, bisZeile, text });
      const zeilen = tab.content.split('\n');
      zeilen.splice(vonZeile - 1, bisZeile - vonZeile + 1, ...text.split('\n'));
      tab.content = zeilen.join('\n');
      return true;
    },
    hinweis: (schluessel) => protokoll.hinweise.push(schluessel),
  });
  return { tab, protokoll };
}

beforeEach(() => {
  initTafelAnlegen(null);
});

// --- Der Startinhalt der Bedienung (AK3) ---------------------------------------

describe('Startinhalt der Bedienung (4T-001852)', () => {
  it('AK3: er kommt aus dem Format-Kern und trägt die Katalog-Schlüssel', () => {
    // Ohne geladenes Wörterbuch ist der Schlüssel der Wortlaut; gemessen wird
    // hier der Weg über den Katalog, die Wortlaute selbst weiter unten.
    const text = tafelStartInhalt('');
    expect(text).toBe(
      erzeugeTafel('', {
        spaltenTitel: [
          'kanban.startSpalteZuErledigen',
          'kanban.startSpalteInArbeit',
          'kanban.startSpalteErledigt',
        ],
        erledigtSpalte: 2,
        erledigtWortlaut: 'kanban.erledigtKennzeichen',
      }).text,
    );
  });

  it('AK3: beide Wege erzeugen denselben Inhalt', () => {
    const { protokoll } = baueUmgebung('');
    legeNeueTafelAn();
    const neu = protokoll.neueDokumente[0].inhalt;
    const zweite = baueUmgebung('');
    wandleInTafelUm(0);
    expect(zweite.protokoll.schreibvorgaenge[0].text).toBe(neu);
  });
});

// --- Neue Kanban-Tafel (AK1) ----------------------------------------------------

describe('Kommando «Neue Kanban-Tafel» (4T-001852)', () => {
  it('AK1: es legt ein Dokument an, das eine Tafel ist, und öffnet die Tafel-Ansicht', () => {
    const { protokoll } = baueUmgebung('');
    expect(legeNeueTafelAn()).toBe(true);
    expect(protokoll.neueDokumente).toHaveLength(1);
    const { inhalt, viewMode } = protokoll.neueDokumente[0];
    expect(viewMode).toBe('kanban');
    expect(istTafelDokument(inhalt)).toBe(true);
    expect(leseTafel(inhalt).spalten).toHaveLength(3);
  });

  it('es braucht weder ein geöffnetes Dokument noch eine offene Tafel', () => {
    const { protokoll } = baueUmgebung(null);
    expect(legeNeueTafelAn()).toBe(true);
    expect(protokoll.neueDokumente).toHaveLength(1);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
  });
});

// --- Umwandeln (AK2, AK8, AK9) --------------------------------------------------

describe('Kommando «Leeres Dokument in Kanban-Tafel umwandeln» (4T-001852)', () => {
  it('AK2: Kopf-Kennzeichen und Startinhalt stehen danach im Dokument', () => {
    const { tab } = baueUmgebung('');
    expect(wandleInTafelUm(0)).toBe(true);
    expect(istTafelDokument(tab.content)).toBe(true);
    expect(leseTafel(tab.content).spalten).toHaveLength(3);
  });

  it('AK8: genau ein Schreibvorgang, und er ersetzt den ganzen Leerraum', () => {
    const { tab, protokoll } = baueUmgebung('\n\n');
    expect(wandleInTafelUm(0)).toBe(true);
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(protokoll.schreibvorgaenge[0]).toMatchObject({ vonZeile: 1, bisZeile: 3 });
    // Kein Leerraum-Rest zwischen Kopf und erster Spalte.
    expect(tab.content.startsWith('---\nkanban-plugin: board\n---\n\n## ')).toBe(true);
  });

  it('AK9: ein nicht änderbares Dokument wird nicht umgewandelt', () => {
    const { tab, protokoll } = baueUmgebung('', { aenderbar: false });
    expect(wandleInTafelUm(0)).toBe(false);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe('');
    expect(protokoll.hinweise).toEqual(['kanban.nurLesbar']);
  });

  it('AK5: ein Dokument mit Inhalt wird nicht angetastet, und es wird gesagt', () => {
    const { tab, protokoll } = baueUmgebung('Schon etwas Text\n');
    expect(wandleInTafelUm(0)).toBe(false);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe('Schon etwas Text\n');
    expect(protokoll.hinweise).toEqual(['kanban.nichtLeer']);
  });

  it('AK5: eine Tafel wird nicht ein zweites Mal umgewandelt', () => {
    const tafel = tafelStartInhalt('');
    const { tab, protokoll } = baueUmgebung(tafel);
    expect(wandleInTafelUm(0)).toBe(false);
    expect(tab.content).toBe(tafel);
    expect(protokoll.hinweise).toEqual(['kanban.nichtLeer']);
  });

  it('Handbuch- und System-Seiten bleiben außen vor', () => {
    for (const art of ['manualPage', 'systemPage']) {
      const { protokoll } = baueUmgebung('', { [art]: true });
      expect(wandleInTafelUm(0)).toBe(false);
      expect(protokoll.schreibvorgaenge).toHaveLength(0);
    }
  });

  it('ohne geöffnetes Dokument geschieht nichts', () => {
    const { protokoll } = baueUmgebung(null);
    expect(wandleInTafelUm(0)).toBe(false);
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
  });
});

// --- Verfügbarkeit beider Kommandos (AK5) ---------------------------------------

const DOKUMENT = { hasTab: true, manualTab: false, systemTab: false, viewMode: 'split' };

function verfuegbar(id, teil) {
  return isAvailable(commandAvailability(id), availabilityContext({ ...DOKUMENT, ...teil }));
}

describe('Verfügbarkeit der beiden Kommandos (4T-001852)', () => {
  it('die Herleitung des Feldes `leeresDokument` zieht die Grenze am Leerraum', () => {
    for (const leer of ['', ' ', '\n', '\r\n\r\n', '\t \n '])
      expect(dokumentIstLeer(leer)).toBe(true);
    for (const voll of ['x', ' a ', '\n#\n']) expect(dokumentIstLeer(voll)).toBe(false);
    // Ein Reiter ohne Text hat keinen, den eine Umwandlung überschreiben könnte.
    expect(dokumentIstLeer(null)).toBe(true);
  });

  it('AK5: «Umwandeln» ist nur am leeren Dokument verfügbar', () => {
    expect(verfuegbar('kanban.convertToBoard', { leeresDokument: true })).toBe(true);
    expect(verfuegbar('kanban.convertToBoard', { leeresDokument: false })).toBe(false);
    // Tafel-Dokument: ausdrücklich gesperrt, auch in der (unmöglichen) Lage
    // «leer und zugleich Tafel».
    expect(verfuegbar('kanban.convertToBoard', { leeresDokument: true, tafelTab: true })).toBe(
      false,
    );
    // Nicht änderbare Dokument-Arten und kein Dokument.
    expect(verfuegbar('kanban.convertToBoard', { leeresDokument: true, manualTab: true })).toBe(
      false,
    );
    expect(verfuegbar('kanban.convertToBoard', { leeresDokument: true, systemTab: true })).toBe(
      false,
    );
    expect(
      isAvailable(
        commandAvailability('kanban.convertToBoard'),
        availabilityContext({ leeresDokument: true }),
      ),
    ).toBe(false);
  });

  it('AK1: «Neue Kanban-Tafel» hängt an keinem Dokument-Zustand', () => {
    // Die Bedingung ist wörtlich die von «Datei → Neu»: Der Befehl legt genau
    // das an, und der Inhalt entsteht erst danach.
    expect(commandAvailability('kanban.newBoard')).toBe(commandAvailability('file.newTab'));
    expect(verfuegbar('kanban.newBoard', { leeresDokument: false })).toBe(true);
    expect(isAvailable(commandAvailability('kanban.newBoard'), availabilityContext(null))).toBe(
      true,
    );
  });

  it('beide Kommandos stehen ohne Vorgabe-Kürzel in der Palette', () => {
    for (const id of ['kanban.newBoard', 'kanban.convertToBoard']) {
      const cmd = COMMANDS.find((c) => c.id === id);
      expect(cmd, `${id} fehlt in der Registry`).toBeTruthy();
      expect(cmd.defaultBindings).toEqual([]);
      expect(cmd.menu).toBe(true);
      expect(cmd.editorScoped).toBe(false);
      expect(cmd.categoryKey).toBe('help.group.view');
    }
  });
});

// --- Der Menü-Ort (AK6, AK7) -----------------------------------------------------

const menuQuelle = lies('src/main/menu/menu.js');
const MARKE_UNTERMENUE = "submenuOrNull('menu.view.kanbanBoard', [";
const MARKE_MODUS = "unless('view.modeKanban', {";
// 4T-001854: Seit der Entscheidung des Product Owners vom 2026-09-22
// (Variante 1) traegt das Untermenue vier Kommandos in zwei Gruppen — erst die
// beiden Wege zu einer Tafel, dann hinter einem Trenner die beiden Befehle, die
// auf einer bestehenden Tafel wirken.
// 4T-001904 (Epic 3E-000318): dazu als dritte Gruppe hinter einem weiteren
// Trenner der Anzeige-Schalter «Tags am Kartenfuß».
// 4T-001903: in derselben Gruppe dahinter «Termine relativ anzeigen».
// 4T-001906: in der zweiten Gruppe direkt hinter der Karten-Anlage «Karte auf
// der Tafel archivieren».
const IM_UNTERMENUE = [
  'kanban.newBoard',
  'kanban.convertToBoard',
  'kanban.addCard',
  'kanban.archiveCard',
  'kanban.addColumn',
  'kanban.toggleTagsFooter',
  'kanban.toggleRelativeDates',
];
// Die Grenze zwischen den beiden Gruppen: Vor diesem Kommando steht der Trenner.
const ZWEITE_GRUPPE = 'kanban.addCard';

/**
 * Der Quelltext-Abschnitt des Untermenüs, von seinem Aufruf bis zur schließenden
 * Klammer seiner Item-Liste — über die Klammer-Zählung geschnitten wie beim
 * Vorbild, damit keine zweite Text-Marke still bricht.
 */
function untermenueAbschnitt(quelle) {
  const start = quelle.indexOf(MARKE_UNTERMENUE);
  if (start < 0) return null;
  let tiefe = 0;
  for (let i = start + MARKE_UNTERMENUE.length - 1; i < quelle.length; i++) {
    if (quelle[i] === '[') tiefe++;
    else if (quelle[i] === ']') {
      tiefe--;
      if (tiefe === 0) return quelle.slice(start, i + 1);
    }
  }
  return null;
}

function befunde(quelle) {
  const b = [];
  const abschnitt = untermenueAbschnitt(quelle);
  if (!abschnitt) return ['Untermenü «Kanban-Tafel» fehlt'];
  const davor = quelle.slice(0, quelle.indexOf(MARKE_UNTERMENUE));
  const ausserhalb = quelle.replace(abschnitt, '');

  // Der Modus-Eintrag steht auf oberster Ebene des Ansichtsmenüs, VOR dem
  // Untermenü — und nicht darin (Festlegung: die Modi bleiben als Block).
  if (!davor.includes(MARKE_MODUS)) b.push('view.modeKanban steht nicht vor dem Untermenü');
  if (abschnitt.includes('view.modeKanban')) b.push('view.modeKanban steht IM Untermenü');

  let letzte = -1;
  for (const id of IM_UNTERMENUE) {
    const marke = `unless('${id}', {`;
    const i = abschnitt.indexOf(marke);
    if (i < 0) b.push(`${id} steht nicht im Untermenü`);
    else if (i < letzte) b.push(`${id} steht in falscher Reihenfolge`);
    else letzte = i;
    if (ausserhalb.includes(marke)) b.push(`${id} steht zusätzlich außerhalb des Untermenüs`);
  }

  // 4T-001854: Zwischen den beiden Gruppen steht genau ein Trenner. Ohne ihn
  // stünden die vier Kommandos als eine Reihe da, und die Gliederung, die der
  // Product Owner entschieden hat, wäre still verschwunden.
  const iGrenze = abschnitt.indexOf(`unless('${ZWEITE_GRUPPE}', {`);
  const iVorGrenze = abschnitt.indexOf("unless('kanban.convertToBoard', {");
  if (iGrenze > -1 && iVorGrenze > -1) {
    const dazwischen = abschnitt.slice(iVorGrenze, iGrenze);
    if (!dazwischen.includes("type: 'separator'")) {
      b.push('Trenner zwischen den beiden Gruppen fehlt');
    }
  }
  return b;
}

describe('Kanban: Menü-Ort der Tafel-Befehle (4T-001852, 4T-001854)', () => {
  it('AK6: das Untermenü trägt alle vier Kommandos, der Modus steht davor', () => {
    expect(befunde(menuQuelle)).toEqual([]);
  });

  it('die Prüfung feuert an einem eingebauten Verstoß', () => {
    // Rot-Probe: Ein Eintrag zieht zurück auf die oberste Ebene.
    const abschnitt = untermenueAbschnitt(menuQuelle);
    const marke = "unless('kanban.convertToBoard', {";
    const verschoben = menuQuelle.replace(
      abschnitt,
      `${marke}\n}),\n${abschnitt.replace(marke, "unless('kanban.convertToBoardX', {")}`,
    );
    expect(befunde(verschoben).join(' | ')).toContain('kanban.convertToBoard');
  });
});

// --- Der gebaute Baum (AK6, AK7) --------------------------------------------------

const electronPfad = cjs.resolve('electron');
cjs.cache[electronPfad] = {
  id: electronPfad,
  filename: electronPfad,
  loaded: true,
  exports: { Menu: { buildFromTemplate: (template) => template } },
};
const { buildMenu, tForLocale } = cjs('../../../src/main/menu/menu.js');

const KANBAN_KOMMANDOS = extensionById('kanban').commands;

function baueAnsichtsMenue(disabledCommands, zustand = {}) {
  const template = buildMenu(
    null,
    {
      locale: 'de',
      viewMode: 'kanban',
      hasActiveTab: true,
      tafelTab: true,
      disabledCommands,
      ...zustand,
    },
    null,
  );
  const editLabel = tForLocale('de', 'menu.view.edit');
  const ansicht = template.find(
    (top) => Array.isArray(top.submenu) && top.submenu.some((i) => i && i.label === editLabel),
  );
  return ansicht ? ansicht.submenu : [];
}

function labels(items) {
  return items.map((i) => (i.type === 'separator' ? '—' : i.label));
}

function alleEbenen(items) {
  const out = [items];
  for (const i of items) if (i && Array.isArray(i.submenu)) out.push(...alleEbenen(i.submenu));
  return out;
}

describe('Kanban: das gebaute Untermenü und sein Aus-Zustand (4T-001852, 4T-001854)', () => {
  const TAFEL = tForLocale('de', 'menu.view.kanbanBoard');

  it('AK6: eingeschaltet trägt es alle vier Kommandos in zwei Gruppen', () => {
    const ansicht = baueAnsichtsMenue([]);
    const eintrag = ansicht.find((i) => i.label === TAFEL);
    expect(eintrag, 'Eintrag «Kanban-Tafel» fehlt im Ansichtsmenü').toBeTruthy();
    expect(labels(eintrag.submenu)).toEqual([
      tForLocale('de', 'command.kanban.newBoard'),
      tForLocale('de', 'command.kanban.convertToBoard'),
      '—',
      tForLocale('de', 'command.kanban.addCard'),
      tForLocale('de', 'command.kanban.archiveCard'),
      tForLocale('de', 'command.kanban.addColumn'),
      '—',
      tForLocale('de', 'menu.view.kanbanTagsFooter'),
      tForLocale('de', 'menu.view.kanbanRelativeDates'),
    ]);
    // Der Modus-Eintrag bleibt außerhalb und steht davor.
    const iModus = ansicht.findIndex((i) => i.label === tForLocale('de', 'menu.view.kanban'));
    expect(iModus).toBeGreaterThan(-1);
    expect(iModus).toBeLessThan(ansicht.indexOf(eintrag));
  });

  it('AK5: «Umwandeln» ist am Tafel-Dokument sichtbar, aber blass', () => {
    const ansicht = baueAnsichtsMenue([], { tafelTab: true, leeresDokument: false });
    const eintrag = ansicht.find((i) => i.label === TAFEL);
    const um = eintrag.submenu.find(
      (i) => i.label === tForLocale('de', 'command.kanban.convertToBoard'),
    );
    expect(um.enabled).toBe(false);
    // Am leeren Dokument dagegen aktiviert.
    const leer = baueAnsichtsMenue([], { tafelTab: false, leeresDokument: true })
      .find((i) => i.label === TAFEL)
      .submenu.find((i) => i.label === tForLocale('de', 'command.kanban.convertToBoard'));
    expect(leer.enabled).toBe(true);
  });

  it('AK7: abgeschaltet bleiben weder Eintrag noch leeres Untermenü noch Trenner stehen', () => {
    const ansicht = baueAnsichtsMenue(KANBAN_KOMMANDOS);
    for (const ebene of alleEbenen(ansicht)) {
      expect(ebene.some((i) => i.label === TAFEL)).toBe(false);
      expect(ebene.some((i) => Array.isArray(i.submenu) && i.submenu.length === 0)).toBe(false);
      expect(ebene[ebene.length - 1] && ebene[ebene.length - 1].type).not.toBe('separator');
      for (let i = 1; i < ebene.length; i++) {
        expect(ebene[i].type === 'separator' && ebene[i - 1].type === 'separator').toBe(false);
      }
    }
  });

  it('4T-001854: nur die erste Gruppe abgeschaltet — der Trenner bleibt nicht führend stehen', () => {
    // Der Fall, für den compactSubmenu da ist: Was übrig bleibt, beginnt mit
    // dem Karten-Befehl und nicht mit einer leeren Linie darüber.
    const ansicht = baueAnsichtsMenue(['kanban.newBoard', 'kanban.convertToBoard']);
    const eintrag = ansicht.find((i) => i.label === TAFEL);
    expect(eintrag, 'Eintrag «Kanban-Tafel» fehlt im Ansichtsmenü').toBeTruthy();
    expect(labels(eintrag.submenu)).toEqual([
      tForLocale('de', 'command.kanban.addCard'),
      tForLocale('de', 'command.kanban.archiveCard'),
      tForLocale('de', 'command.kanban.addColumn'),
      '—',
      tForLocale('de', 'menu.view.kanbanTagsFooter'),
      tForLocale('de', 'menu.view.kanbanRelativeDates'),
    ]);
  });

  it('4T-001854: nur die zweite Gruppe abgeschaltet — der Trenner bleibt nicht am Ende stehen', () => {
    // 4T-001904: Die dritte Gruppe (Anzeige-Schalter) ist mit abgeschaltet;
    // sonst stünde der Trenner zwischen erster und dritter Gruppe.
    const ansicht = baueAnsichtsMenue([
      'kanban.addCard',
      'kanban.archiveCard',
      'kanban.addColumn',
      'kanban.toggleTagsFooter',
      'kanban.toggleRelativeDates',
    ]);
    const eintrag = ansicht.find((i) => i.label === TAFEL);
    expect(eintrag, 'Eintrag «Kanban-Tafel» fehlt im Ansichtsmenü').toBeTruthy();
    expect(labels(eintrag.submenu)).toEqual([
      tForLocale('de', 'command.kanban.newBoard'),
      tForLocale('de', 'command.kanban.convertToBoard'),
    ]);
  });
});

// --- Verdrahtung und Wortlaute ------------------------------------------------------

describe('Verdrahtung der beiden Wege (4T-001852)', () => {
  it('Menü, Brücke, Bindung und Dispatcher nennen dieselben beiden Kommandos', () => {
    expect(menuQuelle).toContain("send('menu:kanbanNewBoard')");
    expect(menuQuelle).toContain("send('menu:kanbanConvertToBoard')");
    const preload = lies('src/main/preload.js');
    expect(preload).toContain("ipcRenderer.on('menu:kanbanNewBoard'");
    expect(preload).toContain("ipcRenderer.on('menu:kanbanConvertToBoard'");
    const bindings = lies('src/renderer/modules/app/app-menu-bindings.js');
    expect(bindings).toContain('api.onMenuKanbanNewBoard(');
    expect(bindings).toContain('api.onMenuKanbanConvertToBoard(');
    const dispatcher = lies('src/renderer/modules/app/app-commands.js');
    expect(dispatcher).toContain("'kanban.newBoard':");
    expect(dispatcher).toContain("'kanban.convertToBoard':");
  });

  it('das Anlege-Modul bleibt frei von Renderer-Zustand', () => {
    // Injektions-Bauweise wie die Nachbarn im Ordner: nur der prozessneutrale
    // Bestand und die Übersetzung, nichts vom Fenster-Zustand und nichts vom
    // Editor — sonst zöge der Ordner in den eingefrorenen Datei-Zyklus.
    const quelle = lies('src/renderer/modules/kanban/kanban-anlegen.js');
    const bezuege = [...quelle.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(bezuege.length).toBeGreaterThan(0);
    for (const bezug of bezuege) {
      expect(bezug, `unerlaubter Import ${bezug}`).toMatch(
        /^(?:\.\.\/\.\.\/\.\.\/shared\/|\.\.\/\.\.\/i18n\.js$|\.\/kanban-)/,
      );
    }
    // Und es baut keine zweite Text-Vorlage: Der Startinhalt kommt aus dem Kern.
    expect(quelle).toContain('erzeugeTafel(');
    expect(quelle).not.toContain('kanban-plugin');
  });

  it('die Beschriftungen stehen in allen fünf Sprachen', () => {
    const schluessel = [
      'menu.view.kanbanBoard',
      'command.kanban.newBoard',
      'command.kanban.convertToBoard',
      'kanban.startSpalteZuErledigen',
      'kanban.startSpalteInArbeit',
      'kanban.startSpalteErledigt',
      'kanban.nichtLeer',
    ];
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const woerterbuch = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of schluessel) {
        expect(woerterbuch[key], `${key} fehlt in ${sprache}`).toBeTruthy();
      }
    }
    const de = JSON.parse(lies('src/i18n/de.json'));
    expect(de['menu.view.kanbanBoard']).toBe('Kanban-Tafel');
    expect(de['command.kanban.newBoard']).toBe('Neue Kanban-Tafel');
    expect(de['kanban.startSpalteZuErledigen']).toBe('Zu erledigen');
    expect(de['kanban.startSpalteInArbeit']).toBe('In Arbeit');
    expect(de['kanban.startSpalteErledigt']).toBe('Erledigt');
  });
});
