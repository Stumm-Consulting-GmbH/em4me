// @vitest-environment jsdom
// 4T-002349 (Epic 3E-000184): Die Texte am Ende eines Workflow-Laufs
// (src/renderer/modules/workflows/workflow-lauf-texte.js).
//
// Zwei Aufgaben: die Form des Hinweises «Workflow ‹Name› abgebrochen in Zeile N:
// Grund» (AK7 des Tasks, Story 4S-001105) und ein Durchlauf-Wächter, dass jeder
// Fehlschlag-Code einen Text in fünf Sprachen hat. Die Codes des Hauptprozesses
// und des Fensters stehen als Literale in ihren Modulen; der Wächter zieht sie
// mit einem Muster aus den Quellen (`fehlschlag('…'`, `code: '…'`, Liste der
// Begleitdatei-Codes) statt aus einer Abschrift, und eine untere Schranke hält
// fest, dass die Ernte nicht still schrumpft.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import en from '../../../src/i18n/en.json';
import fr from '../../../src/i18n/fr.json';
import es from '../../../src/i18n/es.json';
import it_ from '../../../src/i18n/it.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const {
  abbruchText,
  einsetzen,
  ereignisHerkunft,
  ereignisInWorten,
  fehlschlagSchluessel,
  grundText,
} = await import('../../../src/renderer/modules/workflows/workflow-lauf-texte.js');
const { EVENT_TYPES } = await import('../../../src/shared/workflows/workflow-event.js');
const { RUNNER_CODES } = await import('../../../src/shared/workflows/workflow-runner.js');
const { BEGLEIT_CODES } = await import('../../../src/main/documents/companion-files.js');
// 4T-002545: die Abweisung der Schreib-Schnittstelle als Code des Schritt-Moduls.
const { DB_REJECTED } = await import('../../../src/main/workflows/workflow-db-steps.js');

const QUELLEN = [
  'src/main/ipc/workflows.js',
  'src/main/workflows/workflow-file-steps.js',
  'src/main/workflows/workflow-content-steps.js',
  // 4T-002689: der Schreibweg geteilter Dokumente (partsMissing).
  'src/main/workflows/workflow-platten-schreibweg.js',
  // 4T-002690: das Urteil der Datenbank vor den Schreibwegen der Text-Befehle.
  'src/main/workflows/workflow-db-urteil.js',
  // 4T-002424: die Pflege-Befehle delete und complete-task.
  'src/main/workflows/workflow-maintenance-steps.js',
  'src/main/workflows/workflow-buffer-requests.js',
  'src/main/workflows/workflow-run-state.js',
  // 4T-002545: die Schreib-Schritte der Datenbank.
  'src/main/workflows/workflow-db-steps.js',
  // 4T-002546: die Abfrage in eine Datei.
  'src/main/workflows/workflow-db-query.js',
  'src/shared/workflows/workflow-edit.js',
  'src/renderer/modules/workflows/workflow-window.js',
];
const MUSTER = /(?:fehlschlag\(\s*|code:\s*)'([a-z][A-Za-z]+)'/g;

function geernteteCodes() {
  const codes = new Set();
  for (const datei of QUELLEN) {
    const text = fs.readFileSync(path.resolve(datei), 'utf8');
    for (const m of text.matchAll(MUSTER)) codes.add(m[1]);
  }
  return codes;
}

describe('Durchlauf-Wächter: jeder Fehlschlag-Code hat einen Text', () => {
  const codes = [
    ...new Set([
      ...geernteteCodes(),
      ...RUNNER_CODES,
      ...BEGLEIT_CODES,
      DB_REJECTED,
      'partial',
      'notWorkflow',
      'fileMissing',
      'workflowFailedOhneZeile',
    ]),
  ].sort();

  it('erntet mindestens 30 Codes', () => {
    expect(codes.length).toBeGreaterThanOrEqual(30);
  });

  it.each([
    ['de', de],
    ['en', en],
    ['fr', fr],
    ['es', es],
    ['it', it_],
  ])('jeder Code steht in der Sprachfassung %s', (_, katalog) => {
    const fehlend = codes
      .map(fehlschlagSchluessel)
      .filter((k) => typeof katalog[k] !== 'string' || katalog[k] === '');
    expect(fehlend).toEqual([]);
  });
});

// 4T-002545 (Df, De, AK3): Eine Abweisung der Schreib-Schnittstelle trägt den
// Satz der Maske, gebildet aus ihren Lagen über `auftrag-text.js`.
describe('Abweisung der Datenbank (4T-002545)', () => {
  it('ein fehlendes Recht nennt Rolle, Tabelle und Handgriff', () => {
    const lage = {
      code: 'auftragPruefBefund',
      naht: {
        code: 'regelNichtErlaubt',
        rolle: 'assistant',
        tabelle: 'Daten/Library.md',
        operation: 'delete',
      },
    };
    const text = grundText({ code: DB_REJECTED, detail: { table: 'Library', lagen: [lage] } });
    expect(text).toContain('assistant');
    expect(text).toContain('Library');
    expect(text).toContain(de['database.overview.allow.delete']);
    expect(text).not.toContain('Daten/');
  });

  it('eine Prüfregel nennt Feld, Wert und Meldung wie die Maske', () => {
    const lage = {
      code: 'auftragPruefBefund',
      naht: {
        code: 'regelPruefregelVerletzt',
        feld: 'pages',
        wert: '0',
        regel: 'value > 0',
        meldung: 'Ein Buch hat Seiten.',
      },
    };
    expect(grundText({ code: DB_REJECTED, detail: { lagen: [lage] } })).toBe(
      de['database.auftrag.regelPruefregelVerletzt']
        .replace('{wert}', '0')
        .replace('{feld}', 'pages')
        .replace('{regel}', 'value > 0')
        .replace('{meldung}', 'Ein Buch hat Seiten.'),
    );
  });

  it('ohne Lagen der allgemeine Text des Codes; die eigenen Fehlschläge mit Tabelle und Datensatz', () => {
    expect(grundText({ code: DB_REJECTED, detail: {} })).toBe(de['workflow.fehlschlag.dbRejected']);
    expect(
      grundText({ code: 'dbRecordLocked', detail: { table: 'Library', record: 'Solaris' } }),
    ).toBe(
      einsetzen(de['workflow.fehlschlag.dbRecordLocked'], { table: 'Library', record: 'Solaris' }),
    );
    expect(
      grundText({ code: 'dbRecordLocked', detail: { table: 'Library', record: 'Solaris' } }),
    ).toContain("'Solaris'");
  });
});

describe('Texte des Hinweises (AK7)', () => {
  it('Abbruch mit Zeile und Grund', () => {
    const e = {
      status: 'failed',
      workflow: 'Wochenrückblick',
      line: 9,
      code: 'targetExists',
      detail: { path: 'a.md' },
    };
    expect(abbruchText(e)).toBe(
      "Workflow ‹Wochenrückblick› abgebrochen in Zeile 9: Das Ziel 'a.md' gibt es schon",
    );
  });

  // 4T-002689 (AK7): Fehlt ein Teil eines geteilten Dokuments, nennt der Halt
  // Pfad und Position und sagt, dass nichts geschrieben wurde.
  it('fehlender Teil mit Pfad und Position', () => {
    const e = {
      status: 'failed',
      workflow: 'Teil-Probe',
      line: 2,
      code: 'partsMissing',
      detail: { path: 'Notizen.md', teile: '2' },
    };
    // 4T-002692 (Teil c): für einen und für mehrere Teile derselbe Satz.
    expect(abbruchText(e)).toBe(
      "Workflow ‹Teil-Probe› abgebrochen in Zeile 2: 'Notizen.md' besteht aus mehreren Teilen, von denen nicht alle vorhanden sind (fehlend: 2); nichts geschrieben",
    );
    expect(grundText({ code: 'partsMissing', detail: { path: 'Notizen.md', teile: '2, 3' } })).toBe(
      "'Notizen.md' besteht aus mehreren Teilen, von denen nicht alle vorhanden sind (fehlend: 2, 3); nichts geschrieben",
    );
  });

  it('Abbruch ohne Zeile', () => {
    expect(abbruchText({ status: 'failed', workflow: 'X', line: null, code: 'notWorkflow' })).toBe(
      'Workflow ‹X› abgebrochen: Kein Workflow; im Dateikopf fehlt workflow: true',
    );
  });

  it('Befund der Prüfung als Grund', () => {
    const e = {
      status: 'failed',
      befund: true,
      workflow: 'X',
      line: 7,
      code: 'workflowAmbiguous',
      detail: { name: 'B' },
    };
    expect(abbruchText(e)).toBe(
      "Workflow ‹X› abgebrochen in Zeile 7: Mehrdeutig: mehrere Workflows heißen 'B'",
    );
  });

  it('verschachtelter Abbruch als Kette', () => {
    const inner = { status: 'failed', workflow: 'B', line: 3, code: 'textNotFound', detail: {} };
    const e = {
      status: 'failed',
      workflow: 'A',
      line: 5,
      code: 'workflowFailed',
      detail: { name: 'B', inner },
    };
    expect(abbruchText(e)).toBe(
      'Workflow ‹A› abgebrochen in Zeile 5: Workflow ‹B› abgebrochen in Zeile 3: Text nicht gefunden',
    );
  });

  it('stop mit eigenem Rahmen', () => {
    expect(abbruchText({ status: 'stopped', workflow: 'A', line: 4, text: 'Nichts zu tun' })).toBe(
      'Workflow ‹A› beendet in Zeile 4: Nichts zu tun',
    );
  });

  it('confirm mit «Nein» endet wie stop und nennt die Frage (4T-002424, P4)', () => {
    expect(
      abbruchText({ status: 'stopped', workflow: 'A', line: 6, text: 'Weiter?', declined: true }),
    ).toBe('Workflow ‹A› beendet in Zeile 6: «Weiter?» mit Nein beantwortet');
  });

  it('die neuen Fehlschläge der Pflege-Befehle haben Texte mit Pfad und Suchtext', () => {
    expect(
      grundText({ code: 'taskNotFound', detail: { path: 'Plan.md', text: 'Rückblick' } }),
    ).toBe("Keine offene Aufgabe mit 'Rückblick' in 'Plan.md'");
    expect(grundText({ code: 'trashFailed', detail: { path: 'Alt.md' } })).toBe(
      "'Alt.md' ließ sich nicht in den Papierkorb legen",
    );
  });

  it('ein Code ohne Text meldet sich und erscheint als Code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(grundText({ code: 'gibtEsNicht' })).toBe('gibtEsNicht');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('einsetzen lässt fehlende Werte leer', () => {
    expect(einsetzen('{a}-{b}', { a: 1 })).toBe('1-');
  });
});

// 4T-002463 (Epic 3E-000367, Story 4S-001146, Entscheidung 3c).
describe('Ereignis in Worten und Herkunft «Ereignis»', () => {
  it.each([
    ['de', de],
    ['en', en],
    ['fr', fr],
    ['es', es],
    ['it', it_],
  ])('jedes Ereignis des Katalogs hat beide Texte in der Sprachfassung %s', (_, katalog) => {
    const fehlend = EVENT_TYPES.flatMap((e) => [
      `workflow.ereignis.bei.${e}`,
      `workflow.ereignis.name.${e}`,
    ]).filter((k) => typeof katalog[k] !== 'string' || katalog[k] === '');
    expect(fehlend).toEqual([]);
  });

  it.each([
    [{ event: 'file-created', in: 'Eingang', matching: null }, 'bei neuer Datei in ‹Eingang›'],
    [
      { event: 'file-changed', in: null, matching: '*.md' },
      'bei geänderter Datei, Name passend zu ‹*.md›',
    ],
    [
      { event: 'file-moved', in: 'Archiv/2026', matching: 'Rechnung-*' },
      'bei verschobener Datei in ‹Archiv/2026›, Name passend zu ‹Rechnung-*›',
    ],
    [{ event: 'task-done', in: null, matching: null }, 'bei erledigter Aufgabe'],
    [{ event: 'area-opened', in: null, matching: null }, 'beim Öffnen des Bereichs'],
    [{ event: 'reminder-due', in: null, matching: null }, 'bei fälliger Erinnerung'],
  ])('ereignisInWorten(%o)', (regel, text) => {
    expect(ereignisInWorten(regel)).toBe(text);
  });

  it('ohne Regel leer, ein unbekanntes Ereignis erscheint als Name und meldet sich', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(ereignisInWorten(null)).toBe('');
      expect(ereignisInWorten({ event: 'webhook', in: 'X' })).toBe('webhook in ‹X›');
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('die Herkunft nennt Ereignis und Datei, ohne Datei nur das Ereignis', () => {
    expect(ereignisHerkunft({ type: 'file-created', file: 'Eingang/Brief.md' })).toBe(
      'Ereignis: neue Datei ‹Eingang/Brief.md›',
    );
    expect(ereignisHerkunft({ type: 'area-opened' })).toBe('Ereignis: Bereich geöffnet');
    expect(ereignisHerkunft(null)).toBe('Ereignis');
    expect(ereignisHerkunft({ type: 'unbekannt', file: 'a.md' })).toBe('Ereignis');
  });
});

// 4T-002692 (Teil c, Te der Konzept-Runde 4T-002673): die Halt-Sätze der
// Text- und Datei-Befehle in Dateien der Datenbank, gegengelesen in allen fünf
// Sprachen. Die Sätze zu Datensätzen und Feldern nennen Tabelle bzw. Feld und
// den Befehl, der zum Ziel führt; der Aufbau-Satz verweist auf die Änderung von
// Hand und nennt kein Recht.
describe('Halt-Sätze der Datenbank-Regeln (4T-002692)', () => {
  const SPRACHEN = [
    ['de', de],
    ['en', en],
    ['fr', fr],
    ['es', es],
    ['it', it_],
  ];
  const satz = (katalog, code) => katalog[`workflow.fehlschlag.${code}`];

  it('Datensätze: Tabelle, die drei Datenbank-Befehle und der auslösende Befehl', () => {
    expect(
      grundText({ code: 'dbRecordsByText', detail: { table: 'Library', command: 'append' } }),
    ).toBe(
      "Die Datensätze der Tabelle 'Library' ändert ein Workflow mit den Datenbank-Befehlen db-create, db-update und db-delete, nicht mit append",
    );
  });

  it('Feld und Kennung einer Karteikarte: Feld bzw. Tabelle und der passende Befehl', () => {
    expect(
      grundText({ code: 'dbFieldByText', detail: { field: 'born', command: 'set-property' } }),
    ).toBe(
      "Das Feld 'born' der Karteikarte ändert ein Workflow mit db-update, nicht mit set-property",
    );
    expect(
      grundText({ code: 'dbRecordIdByText', detail: { table: 'Authors', command: 'replace' } }),
    ).toContain("Tabelle 'Authors'");
  });

  it.each(SPRACHEN)('%s: jeder Satz trägt seine Platzhalter und seinen Befehl', (_, k) => {
    const erwartet = {
      dbRecordsByText: ['{table}', '{command}', 'db-create', 'db-update', 'db-delete'],
      dbFieldByText: ['{field}', '{command}', 'db-update'],
      dbRecordIdByText: ['{table}', '{command}', 'db-create', 'db-delete'],
      dbStructureByText: ['{table}'],
      dbCardLeavesTable: ['{path}', '{table}', 'db-delete', 'db-create'],
      dbRecordIntoTable: ['{path}', '{table}', 'db-create'],
      dbCardRenamedAway: ['{path}', '{table}', '{name}', 'db-delete'],
      dbRecordRenamedIn: ['{path}', '{table}', '{name}', 'db-create'],
      partsMissing: ['{path}', '{teile}'],
    };
    for (const [code, teile] of Object.entries(erwartet)) {
      for (const teil of teile) expect(satz(k, code), `${code}: ${teil}`).toContain(teil);
      // Namen in einfachen Anführungszeichen, ohne Punkt am Ende wie die Nachbarn.
      expect(satz(k, code), code).not.toMatch(/"|\.$/);
    }
  });

  it.each(SPRACHEN)(
    '%s: Aufbau und Steckbrief verweisen auf Hand, ohne Rolle und Recht',
    (l, k) => {
      const HAND = { de: 'von Hand', en: 'by hand', fr: 'à la main', es: 'a mano', it: 'a mano' };
      const RECHT = {
        de: /Rolle|Recht|Erlaubnis/,
        en: /role|permission|right/i,
        fr: /rôle|autorisation|droit/i,
        es: /rol|permiso|derecho/i,
        it: /ruolo|autorizzazione|diritto/i,
      };
      for (const code of ['dbStructureByText', 'dbProfileByText']) {
        expect(satz(k, code), code).toContain(HAND[l]);
        expect(satz(k, code), code).not.toMatch(RECHT[l]);
      }
    },
  );

  // Zweitblick Runde 1, Nr. 1, und Runde 2, Nr. 1: Der Hinweis zur Karteikarte
  // nennt db-update für die Felder und sagt in jeder Sprache, dass ein Workflow
  // die Kennung gar nicht ändert, wie der Halt-Satz dbRecordIdByText.
  const KENNUNG_NICHT = {
    de: 'ihre Datensatz-Kennung gar nicht',
    en: 'does not change its record identifier at all',
    fr: 'ne modifie pas du tout son identifiant',
    es: 'no cambia en absoluto su identificador',
    it: "non ne modifica affatto l'identificativo",
  };
  const stimmtMitKennung = (l, satz) =>
    typeof satz === 'string' && satz.includes('db-update') && satz.includes(KENNUNG_NICHT[l]);
  // Rot-Probe: der Wortlaut der Runde 1 («Felder und Kennung mit db-update»).
  const ALT_RUNDE_1 = {
    de: "Diese Datei ist eine Karteikarte der Tabelle '{table}': Ihre Felder und ihre Kennung ändert ein Workflow mit db-update statt mit einem Text-Befehl; freier Text bleibt möglich",
    en: "This file is a card of the table '{table}': a workflow changes its fields and its identifier with db-update instead of a text command; free text remains possible",
    fr: "Ce fichier est une fiche de la table '{table}' : un workflow modifie ses champs et son identifiant avec db-update plutôt qu'avec une commande de texte ; le texte libre reste possible",
    es: "Este archivo es una ficha de la tabla '{table}': un workflow cambia sus campos y su identificador con db-update en lugar de con un comando de texto; el texto libre sigue siendo posible",
    it: "Questo file è una scheda della tabella '{table}': un workflow ne modifica campi e identificativo con db-update invece che con un comando di testo; il testo libero resta possibile",
  };

  it.each(SPRACHEN)('%s: die Hinweise stimmen mit den Halt-Sätzen überein', (l, k) => {
    const karte = k['workflow.hinweis.recordCard'];
    expect(stimmtMitKennung(l, karte), karte).toBe(true);
    expect(stimmtMitKennung(l, ALT_RUNDE_1[l]), 'Rot-Probe Runde 1').toBe(false);
    const tabelle = k['workflow.hinweis.tableFile'];
    for (const teil of ['{table}', 'db-create', 'db-update', 'db-delete']) {
      expect(tabelle, teil).toContain(teil);
    }
    for (const satz of [karte, tabelle]) expect(satz).not.toMatch(/"|\.$/);
  });
});
