// 4T-001351 (Epic 3E-000170): Der Lösch-Weg des Bereichs-Panels am ECHTEN
// Handler.
//
// Der tragende Test ist der über den Fehlschlag. Entscheidung E2 des Epics
// (Product Owner, 2026-09-01) verlangt den Papierkorb OHNE stillen Rückfall:
// Steht er nicht zur Verfügung, wird gemeldet und **nicht** ersatzweise
// endgültig gelöscht. Ein Test, der nur den Erfolgsfall prüft, sähe genau das
// nicht — er wäre auch dann grün, wenn der Handler bei einem Fehlschlag
// heimlich `fs.unlink` nachschöbe. Deshalb liegt die Datei hier in jedem
// Fehlerfall nach dem Aufruf noch auf der Platte, und genau das wird gemessen.
//
// Der Papierkorb selbst ist gestubbt; sein Ergebnis im Betriebssystem ist
// nicht automatisiert prüfbar und gehört auf die manuelle Ebene (Prüf-Block
// des Tasks).
import { afterEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerAreasIpc } = require('../../src/main/ipc/areas.js');
// 4T-001800 (Epic 3E-000255): Die Rückfrage liegt in der Dialog-Gruppe und
// wird hier am ECHTEN Handler geprüft, weil sie zum Lösch-Weg gehört.
const { registerDialogsIpc } = require('../../src/main/ipc/dialogs.js');

const tempOrdner = [];

afterEach(async () => {
  while (tempOrdner.length) {
    const dir = tempOrdner.pop();
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function bereich() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'em4me-loeschen-'));
  tempOrdner.push(dir);
  const wurzel = path.join(dir, 'bereich');
  await fsp.mkdir(wurzel);
  await fsp.mkdir(path.join(dir, 'daneben'));
  await fsp.writeFile(path.join(wurzel, 'Notiz.md'), '# Notiz\n', 'utf8');
  await fsp.writeFile(path.join(wurzel, 'Bild.png'), 'kein Dokument', 'utf8');
  await fsp.writeFile(path.join(dir, 'daneben', 'Fremd.md'), '# Fremd\n', 'utf8');
  return { dir, wurzel };
}

// Papierkorb-Stub: merkt sich die Aufrufe und kann einen Fehlschlag spielen.
function baueShell(fehler) {
  const aufrufe = [];
  return {
    aufrufe,
    shell: {
      trashItem: async (p) => {
        aufrufe.push(p);
        if (fehler) throw new Error(fehler);
      },
    },
  };
}

// 4T-001800 (Epic 3E-000255): Papierkorb-Attrappe, die je Pfad entscheidet.
// Gebraucht wird sie für die beiden Fehlschlag-Hälften: Die Reihenfolge des
// Lösch-Wegs ist nur zu messen, wenn genau EINER der beiden Aufrufe scheitert.
function baueShellJePfad(fehlerFuer) {
  const aufrufe = [];
  return {
    aufrufe,
    shell: {
      trashItem: async (p) => {
        aufrufe.push(p);
        const fehler = fehlerFuer(p);
        if (fehler) throw new Error(fehler);
      },
    },
  };
}

function registriere(rootPath, shell) {
  const handler = new Map();
  registerAreasIpc((kanal, fn) => handler.set(kanal, fn), {
    dialog: {},
    shell,
    senderWindow: () => ({}),
    areaOfWindow: () => (rootPath ? { rootPath, name: path.basename(rootPath) } : null),
    tForWindow: (_w, key) => key,
    appRegistry: {},
    openAreaPath: (p) => ({ ok: true, rootPath: p }),
    closeAreaApp: async () => ({ ok: true }),
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    getStore: () => null,
    workspacesState: [],
    setWorkspacesState: () => {},
    workspacesChanged: () => {},
    resolveAreaStartPage: async () => null,
    writeAreaStartPage: async () => ({ ok: true }),
    startPageRelative: () => null,
  });
  return handler;
}

describe('area:trashFile (4T-001351)', () => {
  it('reicht die Datei an den Papierkorb des Betriebssystems', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);
    const ziel = path.join(wurzel, 'Notiz.md');

    const ergebnis = await handler.get('area:trashFile')({}, ziel);

    expect(ergebnis).toEqual({ ok: true, path: ziel });
    expect(aufrufe).toEqual([path.resolve(ziel)]);
  });

  it('loescht bei fehlendem Papierkorb NICHT ersatzweise endgueltig (E2)', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell('kein Papierkorb auf diesem Laufwerk');
    const handler = registriere(wurzel, shell);
    const ziel = path.join(wurzel, 'Notiz.md');

    const ergebnis = await handler.get('area:trashFile')({}, ziel);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.error).toContain('kein Papierkorb');
    // Der eigentliche Nachweis: Der Papierkorb wurde versucht, und die Datei
    // liegt danach unveraendert da. Ein Rueckfall auf endgueltiges Loeschen
    // haette sie hier entfernt.
    expect(aufrufe).toHaveLength(1);
    expect(fs.existsSync(ziel)).toBe(true);
    expect(await fsp.readFile(ziel, 'utf8')).toBe('# Notiz\n');
  });

  it('meldet einen sonstigen Fehlschlag und laesst die Datei stehen', async () => {
    const { wurzel } = await bereich();
    const { shell } = baueShell('EBUSY: resource busy or locked');
    const handler = registriere(wurzel, shell);
    const ziel = path.join(wurzel, 'Notiz.md');

    const ergebnis = await handler.get('area:trashFile')({}, ziel);

    expect(ergebnis.ok).toBe(false);
    expect(fs.existsSync(ziel)).toBe(true);
  });

  it('weist einen Pfad ausserhalb des Bereichs ab, ohne den Papierkorb zu rufen', async () => {
    const { dir, wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);
    const fremd = path.join(dir, 'daneben', 'Fremd.md');

    const ergebnis = await handler.get('area:trashFile')({}, fremd);

    expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    expect(aufrufe).toEqual([]);
    expect(fs.existsSync(fremd)).toBe(true);
  });

  it('weist einen Ausbruch ueber .. ab', async () => {
    const { dir, wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);
    const fremd = path.join(wurzel, '..', 'daneben', 'Fremd.md');

    const ergebnis = await handler.get('area:trashFile')({}, fremd);

    expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    expect(aufrufe).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'daneben', 'Fremd.md'))).toBe(true);
  });

  it('weist eine Datei ab, die kein Dokument ist', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);

    const ergebnis = await handler.get('area:trashFile')({}, path.join(wurzel, 'Bild.png'));

    expect(ergebnis).toEqual({ ok: false, error: 'not a document' });
    expect(aufrufe).toEqual([]);
  });

  it('loescht ohne Bereich nichts', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(null, shell);

    const ergebnis = await handler.get('area:trashFile')({}, path.join(wurzel, 'Notiz.md'));

    expect(ergebnis).toEqual({ ok: false, error: 'no area' });
    expect(aufrufe).toEqual([]);
  });

  it('weist leere und untypisierte Angaben ab', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);

    for (const eingabe of ['', null, undefined, 42]) {
      const ergebnis = await handler.get('area:trashFile')({}, eingabe);
      expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    }
    expect(aufrufe).toEqual([]);
  });
});

// 4T-001800 (Epic 3E-000255): Die Änderungsbelege gehen mit in den Papierkorb.
//
// Der Gegenstand dieser Gruppe ist die REIHENFOLGE und ihr Verhalten an den
// beiden Bruchstellen. Sie ist die eigentliche Entscheidung des Wegs: Zuerst
// die Tabellen-Datei, dann ihre Beleg-Datei. Gedreht wäre bei einem Fehlschlag
// eine Tabelle ohne ihre Spur übrig, und genau das soll nicht eintreten
// können. Gemessen wird deshalb nicht nur, DASS beide Aufrufe kommen, sondern
// in welcher Folge und was nach einem halben Vorgang dasteht.
describe('area:trashFile nimmt die Änderungsbelege mit (4T-001800)', () => {
  // Legt eine Tabellen-Datei mit oder ohne Begleit-Dateien an und liefert die
  // erwarteten absoluten Pfade. Der Aufbau schreibt die Dateien direkt und
  // nimmt damit einen anderen Weg als die geprüfte Funktion.
  async function tabelle(wurzel, { beleg = false, historie = false } = {}) {
    const md = path.join(wurzel, 'Kunden.md');
    const mddl = path.resolve(path.join(wurzel, 'Kunden.mddl'));
    const mdd = path.resolve(path.join(wurzel, 'Kunden.mdd'));
    await fsp.writeFile(md, '# Kunden\n', 'utf8');
    if (beleg) await fsp.writeFile(mddl, '## Belege\n', 'utf8');
    if (historie) await fsp.writeFile(mdd, '{}\n', 'utf8');
    expect(fs.existsSync(mddl)).toBe(beleg);
    expect(fs.existsSync(mdd)).toBe(historie);
    return { md, mddl, mdd };
  }

  it('reicht zuerst die Tabellen-Datei und danach die Beleg-Datei ein (AK1, AK3)', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);
    const { md, mddl } = await tabelle(wurzel, { beleg: true });

    const ergebnis = await handler.get('area:trashFile')({}, md);

    expect(ergebnis).toEqual({ ok: true, path: md });
    // Die Folge, nicht die Menge: Ein `toContain` je Pfad wäre auch bei
    // gedrehter Reihenfolge grün.
    expect(aufrufe).toEqual([path.resolve(md), mddl]);
  });

  it('bleibt ohne Beleg-Datei beim einen Aufruf — der Normalfall ist kein Fehler', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);
    const { md } = await tabelle(wurzel);

    const ergebnis = await handler.get('area:trashFile')({}, md);

    expect(ergebnis).toEqual({ ok: true, path: md });
    expect(aufrufe).toEqual([path.resolve(md)]);
  });

  it('lässt die Begleitdatei der Dokument-Historie liegen (AK5)', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);
    const { md, mddl, mdd } = await tabelle(wurzel, { beleg: true, historie: true });

    const ergebnis = await handler.get('area:trashFile')({}, md);

    expect(ergebnis).toEqual({ ok: true, path: md });
    // Genau zwei Aufrufe, und die Historien-Datei ist keiner von ihnen; sie
    // liegt danach unverändert da. Ihr Verhalten gehört nicht zu diesem Epic.
    expect(aufrufe).toEqual([path.resolve(md), mddl]);
    expect(fs.existsSync(mdd)).toBe(true);
    expect(await fsp.readFile(mdd, 'utf8')).toBe('{}\n');
  });

  it('versucht nach einem Fehlschlag an der Tabellen-Datei NICHTS weiter (AK3)', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShellJePfad((p) =>
      p.endsWith('.md') ? 'kein Papierkorb auf diesem Laufwerk' : null,
    );
    const handler = registriere(wurzel, shell);
    const { md, mddl } = await tabelle(wurzel, { beleg: true });

    const ergebnis = await handler.get('area:trashFile')({}, md);

    // Antwort-Form wie bisher: kein `companionLeft`, kein Teil-Erfolg.
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.error).toContain('kein Papierkorb');
    expect(Object.keys(ergebnis).sort()).toEqual(['error', 'ok']);
    // Der tragende Nachweis: genau ein Aufruf, und beide Dateien liegen noch da.
    expect(aufrufe).toEqual([path.resolve(md)]);
    expect(fs.existsSync(md)).toBe(true);
    expect(fs.existsSync(mddl)).toBe(true);
  });

  it('meldet eine liegen gebliebene Beleg-Datei samt Pfad, bleibt aber erfolgreich (AK4)', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShellJePfad((p) =>
      p.endsWith('.mddl') ? 'EBUSY: resource busy or locked' : null,
    );
    const handler = registriere(wurzel, shell);
    const { md, mddl } = await tabelle(wurzel, { beleg: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const ergebnis = await handler.get('area:trashFile')({}, md);

      // Die Tabelle ist im Papierkorb; das ist der Erfolg, den `ok: true`
      // meldet. Die Beleg-Datei liegt noch da, und der Anwender erfährt es.
      expect(ergebnis).toEqual({ ok: true, path: md, companionLeft: [mddl] });
      expect(aufrufe).toEqual([path.resolve(md), mddl]);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

// 4T-001800 (Epic 3E-000255): Die Rückfrage nennt die Änderungsbelege nur dort,
// wo es welche gibt (AK2).
//
// Der Bezugswert ist nicht ein abgeschriebener Text, sondern der Dialog OHNE
// Pfad: Er ist per Definition der heutige. Jeder andere Fall wird gegen ihn
// gemessen, zeichengleich oder um genau einen Satz ergänzt. Ein Abschreiben des
// Textes prüfte die Kopie und nicht den Handler.
describe('area:confirmTrashFile mit dem Pfad der Datei (4T-001800)', () => {
  function registriereDialoge(rootPath, antwort = 0) {
    const gezeigt = [];
    const handler = new Map();
    registerDialogsIpc((kanal, fn) => handler.set(kanal, fn), {
      app: { getPath: () => os.tmpdir() },
      dialog: {
        showMessageBox: async (_owner, optionen) => {
          gezeigt.push(optionen);
          return { response: antwort };
        },
      },
      shell: {},
      session: {},
      senderWindow: () => ({}),
      tForWindow: (_w, key) => key,
      getStore: () => null,
      areaOfWindow: () => (rootPath ? { rootPath, name: path.basename(rootPath) } : null),
      isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    });
    return { handler, gezeigt };
  }

  async function detailVon(rootPath, ...args) {
    const { handler, gezeigt } = registriereDialoge(rootPath);
    const zustimmung = await handler.get('area:confirmTrashFile')({}, ...args);
    expect(zustimmung).toBe(true);
    expect(gezeigt).toHaveLength(1);
    return gezeigt[0];
  }

  it('nennt die Änderungsbelege, wenn eine Beleg-Datei daneben liegt (AK2)', async () => {
    const { wurzel } = await bereich();
    const ziel = path.join(wurzel, 'Kunden.md');
    await fsp.writeFile(ziel, '# Kunden\n', 'utf8');
    await fsp.writeFile(path.join(wurzel, 'Kunden.mddl'), '## Belege\n', 'utf8');

    const heute = await detailVon(wurzel, 'Kunden.md');
    const mitBeleg = await detailVon(wurzel, 'Kunden.md', ziel);

    // Genau ein Satz mehr, angehängt an den heutigen Text, nichts umgestellt.
    expect(mitBeleg.detail).toBe(`${heute.detail} areaPanel.deleteConfirmCompanion`);
    // Der Rest des Dialogs bleibt unberührt: Titel, Frage mit dem Namen und
    // die Vorbelegung des Abbrechens.
    expect(mitBeleg.title).toBe(heute.title);
    expect(mitBeleg.message).toBe(heute.message);
    expect(mitBeleg.defaultId).toBe(1);
    expect(mitBeleg.cancelId).toBe(1);
  });

  it('bleibt ohne Beleg-Datei zeichengleich zur heutigen Rückfrage (AK2)', async () => {
    const { wurzel } = await bereich();
    const ziel = path.join(wurzel, 'Notiz.md');

    const heute = await detailVon(wurzel, 'Notiz.md');
    const mitPfad = await detailVon(wurzel, 'Notiz.md', ziel);

    expect(mitPfad.detail).toBe(heute.detail);
    expect(mitPfad.detail).not.toContain('Companion');
  });

  it('bleibt bei einem Pfad ausserhalb des Bereichs zeichengleich', async () => {
    const { dir, wurzel } = await bereich();
    const fremd = path.join(dir, 'daneben', 'Fremd.md');
    await fsp.writeFile(path.join(dir, 'daneben', 'Fremd.mddl'), '## Belege\n', 'utf8');

    const heute = await detailVon(wurzel, 'Fremd.md');
    const ausserhalb = await detailVon(wurzel, 'Fremd.md', fremd);

    // Die Beleg-Datei liegt da, der Pfad gehört aber nicht zum gebundenen
    // Bereich; der Dialog sagt über sie nichts.
    expect(ausserhalb.detail).toBe(heute.detail);
  });

  it('bleibt ohne Bereich und bei einem Pfad ohne Markdown-Endung zeichengleich', async () => {
    const { wurzel } = await bereich();
    const ziel = path.join(wurzel, 'Kunden.md');
    await fsp.writeFile(ziel, '# Kunden\n', 'utf8');
    await fsp.writeFile(path.join(wurzel, 'Kunden.mddl'), '## Belege\n', 'utf8');

    const heute = await detailVon(wurzel, 'Kunden.md');
    const ohneBereich = await detailVon(null, 'Kunden.md', ziel);
    const keinDokument = await detailVon(wurzel, 'Bild.png', path.join(wurzel, 'Bild.png'));

    expect(ohneBereich.detail).toBe(heute.detail);
    expect(keinDokument.detail).toBe(heute.detail);
  });

  it('gibt die Ablehnung unverändert weiter', async () => {
    const { wurzel } = await bereich();
    const ziel = path.join(wurzel, 'Kunden.md');
    await fsp.writeFile(ziel, '# Kunden\n', 'utf8');
    await fsp.writeFile(path.join(wurzel, 'Kunden.mddl'), '## Belege\n', 'utf8');
    const { handler } = registriereDialoge(wurzel, 1);

    expect(await handler.get('area:confirmTrashFile')({}, 'Kunden.md', ziel)).toBe(false);
  });
});

// Der Handler kennt genau EINEN Loesch-Aufruf. Das ist keine Stil-Frage,
// sondern die Bauart, die E2 traegt: Solange `shell.trashItem` die einzige
// Stelle ist, KANN kein Fehlschlag auf endgueltiges Loeschen ausweichen. Der
// Wächter liest den Quelltext, weil ein Verhaltens-Test einen kuenftig
// eingebauten Rueckfall nur in genau der Konstellation faende, die er
// zufaellig spielt.
describe('Bauart des Lösch-Wegs (4T-001351)', () => {
  it('src/main/ipc/areas.js kennt keinen endgueltigen Loesch-Aufruf', () => {
    const roh = fs.readFileSync(path.join(process.cwd(), 'src', 'main', 'ipc', 'areas.js'), 'utf8');
    // Kommentare heraus, bevor gemessen wird: Der Kopf des Handlers ERKLAERT,
    // dass es keinen fs.unlink-Zweig gibt, und eine Suche ueber den rohen Text
    // fände genau diese Erklärung. Geprüft wird der Code, nicht die Prosa.
    const quelle = roh
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((zeile) => !zeile.trim().startsWith('//'))
      .join('\n');
    expect(quelle).toContain('shell.trashItem');
    // 4T-001800: `rmdir` kommt hinzu. Der Weg nimmt seit diesem Vorgang eine
    // zweite Datei mit, und damit wächst die Versuchung, für den Rest des
    // Bestands einer Datei einen anderen Weg zu nehmen.
    for (const verboten of ['fs.unlink', 'fs.rm(', 'rmSync', 'unlinkSync', 'rmdir']) {
      expect(quelle.includes(verboten), `unerwarteter Loesch-Aufruf: ${verboten}`).toBe(false);
    }
  });

  // 4T-001800 (Epic 3E-000255): Der Lösch-Weg kennt die Endung nicht (AK5).
  //
  // Das ist die Zusage, die den Vorgang trägt: Welche Datei mitgeht, sagt die
  // Liste der Begleit-Datei-Arten. Stünde die Endung hier ein zweites Mal, käme
  // die nächste Pflicht-Art an einem von zwei Orten an, und der vergessene Ort
  // meldet sich nicht, er verhält sich nur anders.
  it('src/main/ipc/areas.js nennt keine Begleit-Endung, sondern fragt die Liste', () => {
    const roh = fs.readFileSync(path.join(process.cwd(), 'src', 'main', 'ipc', 'areas.js'), 'utf8');
    const quelle = roh
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((zeile) => !zeile.trim().startsWith('//'))
      .join('\n');
    expect(quelle).toContain('pflichtBegleitPfade');
    for (const endung of ['mddl', 'mdd', 'companionPathFor']) {
      expect(quelle.includes(endung), `Begleit-Wissen im Lösch-Weg: ${endung}`).toBe(false);
    }
  });
});
