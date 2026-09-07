// 4T-001458 (Epic 3E-000190): Wächter für den Suchraum der Link-Nachführung.
//
// **Dieser Test behebt keinen Fehler — er hält eine Annahme fest.** Die
// Konzept-Stufe `4T-001368` hat mit Entscheidung E5 festgelegt, dass die
// Nachführung über Bereichs-Grenzen NICHT erweitert wird, und hat sich dabei
// auf eine Erhebung des Suchraums gestützt: Er ist die Bereichs-Wurzel bei
// einer Datei innerhalb des Bereichs und sonst der Ordner der Datei plus zwei
// Ebenen; der Bereich stammt aus dem absendenden Fenster.
//
// Nebenbei fiel auf, dass genau diese Verzweigung von keinem Test geprüft
// wurde. Eine Annahme ohne Wächter hält nur so lange, wie niemand daneben
// greift — und das ganze Epic der Bereichs-Verknüpfungen steht auf ihr.
//
// Gearbeitet wird an echten Temp-Verzeichnissen, weil der Suchraum ein
// Verzeichnis-Scan ist: Eine Attrappe des Dateisystems prüfte die Attrappe.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLinkUpdate } from '../../src/main/documents/link-update.js';

let tmpDirs = [];

function makeRoot(praefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), praefix));
  tmpDirs.push(dir);
  return dir;
}

function schreibe(root, rel) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '# Inhalt\n', 'utf8');
  return p;
}

// Nur die beiden Bezüge, die der Suchraum wirklich braucht: die Bereichs-
// Bindung des Fensters und die Markdown-Erkennung.
function makeLinkUpdate(areaFuerFenster) {
  return createLinkUpdate({
    areaOfWindow: (win) => areaFuerFenster(win),
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
  });
}

function relativZu(wurzel, treffer) {
  return treffer.map((p) => path.relative(wurzel, p).split(path.sep).join('/')).sort();
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe('Suchraum der Link-Nachführung (4T-001458, Absicherung von E5)', () => {
  it('nimmt bei einer Datei IM Bereich den ganzen Bereichs-Baum, ohne Tiefen-Grenze', async () => {
    const bereich = makeRoot('em4me-lu-bereich-');
    const anker = schreibe(bereich, 'Anker.md');
    schreibe(bereich, path.join('A', 'Eins.md'));
    schreibe(bereich, path.join('A', 'B', 'C', 'D', 'Tief.md'));

    const lu = makeLinkUpdate(() => ({ rootPath: bereich }));
    const treffer = await lu.collectMarkdownFilesInScope({}, anker);

    // Vier Ebenen tief — die Tiefen-Grenze von zwei gilt hier ausdruecklich NICHT.
    expect(relativZu(bereich, treffer)).toEqual(['A/B/C/D/Tief.md', 'A/Eins.md', 'Anker.md']);
  });

  it('nimmt bei einer Datei AUSSERHALB des Bereichs den Ordner plus zwei Ebenen', async () => {
    const bereich = makeRoot('em4me-lu-bereich2-');
    const draussen = makeRoot('em4me-lu-draussen-');
    const anker = schreibe(draussen, 'Anker.md');
    schreibe(draussen, path.join('E1', 'Eins.md'));
    schreibe(draussen, path.join('E1', 'E2', 'Zwei.md'));
    // Dritte Ebene: ausserhalb der Grenze und damit NICHT im Suchraum.
    schreibe(draussen, path.join('E1', 'E2', 'E3', 'Drei.md'));

    const lu = makeLinkUpdate(() => ({ rootPath: bereich }));
    const treffer = await lu.collectMarkdownFilesInScope({}, anker);

    expect(relativZu(draussen, treffer)).toEqual(['Anker.md', 'E1/E2/Zwei.md', 'E1/Eins.md']);
  });

  it('erreicht den Bereich NICHT von aussen — die Grenze wirkt in dieser Richtung (E5)', async () => {
    // Das ist die tragende Aussage: Ein verknuepfter oder benachbarter Bereich
    // wird von einer Umbenennung ausserhalb nie besucht.
    const bereich = makeRoot('em4me-lu-bereich3-');
    const draussen = makeRoot('em4me-lu-draussen2-');
    schreibe(bereich, 'ImBereich.md');
    const anker = schreibe(draussen, 'Anker.md');

    const lu = makeLinkUpdate(() => ({ rootPath: bereich }));
    const treffer = await lu.collectMarkdownFilesInScope({}, anker);

    expect(treffer.some((p) => p.startsWith(bereich))).toBe(false);
  });

  it('trägt umgekehrt nicht aus dem Bereich hinaus (E5, andere Richtung)', async () => {
    const bereich = makeRoot('em4me-lu-bereich4-');
    const fremd = makeRoot('em4me-lu-fremd-');
    const anker = schreibe(bereich, 'Anker.md');
    schreibe(fremd, 'Verweisend.md');

    const lu = makeLinkUpdate(() => ({ rootPath: bereich }));
    const treffer = await lu.collectMarkdownFilesInScope({}, anker);

    // Genau das ist der Grund, warum der Linter «das Netz» bleibt: Ein Verweis
    // aus einem verknuepften Bereich wird beim Umbenennen nicht einmal besucht.
    expect(treffer.some((p) => p.startsWith(fremd))).toBe(false);
  });

  it('nimmt den Bereich aus dem ABSENDENDEN Fenster (AK2)', async () => {
    const bereich = makeRoot('em4me-lu-fenster-');
    const anker = schreibe(bereich, 'Anker.md');
    schreibe(bereich, path.join('A', 'B', 'C', 'D', 'Tief.md'));

    // Dasselbe Anker-Dokument, zwei Fenster: eines mit Bereich, eines ohne.
    const mitBereich = makeLinkUpdate((win) =>
      win && win.id === 1 ? { rootPath: bereich } : null,
    );
    const imBereich = await mitBereich.collectMarkdownFilesInScope({ id: 1 }, anker);
    const ohneBereich = await mitBereich.collectMarkdownFilesInScope({ id: 2 }, anker);

    // Fenster 1 sieht den ganzen Baum, Fenster 2 nur zwei Ebenen — der
    // Unterschied kommt allein vom Fenster, nicht von der Datei.
    expect(relativZu(bereich, imBereich)).toContain('A/B/C/D/Tief.md');
    expect(relativZu(bereich, ohneBereich)).not.toContain('A/B/C/D/Tief.md');
  });

  it('ignoriert dieselben Ordner wie der Backlinks-Scan', async () => {
    const bereich = makeRoot('em4me-lu-ignore-');
    const anker = schreibe(bereich, 'Anker.md');
    schreibe(bereich, path.join('node_modules', 'Paket.md'));
    schreibe(bereich, path.join('.git', 'Intern.md'));
    schreibe(bereich, path.join('Echt', 'Datei.md'));

    const lu = makeLinkUpdate(() => ({ rootPath: bereich }));
    const treffer = await lu.collectMarkdownFilesInScope({}, anker);

    expect(relativZu(bereich, treffer)).toEqual(['Anker.md', 'Echt/Datei.md']);
  });

  it('bricht an einem nicht lesbaren oder fehlenden Ordner nicht ab', async () => {
    const draussen = makeRoot('em4me-lu-fehlt-');
    const anker = path.join(draussen, 'GibtEsNicht', 'Anker.md');

    const lu = makeLinkUpdate(() => null);
    await expect(lu.collectMarkdownFilesInScope({}, anker)).resolves.toEqual([]);
  });
});
