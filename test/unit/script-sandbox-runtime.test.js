// 4T-000412 (Epic 3E-000078): Laufzeit der Skript-Sandbox (Inline-Skript in
// src/renderer/script-sandbox.html). Der Test extrahiert das Skript aus dem
// Trägerdokument und führt es gegen Stubs aus (window plus Worker/Blob/URL —
// die Ausführung lebt seit dem 4T-000416-Befund in einem Blob-Worker, der
// Fake-Worker evaluiert dessen Quelltext im Test-Prozess) — geprüft werden
// Protokoll-Validierung (Schema, Port-Pflicht, Einmaligkeit), Ausführung,
// pq-Ausgabe-Normalisierung und der Fehler-Pfad mit Zeilennummer. Die echte
// Isolation (CSP, opake Origin, Worker-Thread) weist die E2E-Suite nach
// (test/e2e/funktionen/skript-bloecke.spec.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(dir, '../../src/renderer/script-sandbox.html'), 'utf8');

function extractRuntimeSource() {
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Inline-Skript in script-sandbox.html nicht gefunden');
  return m[1];
}

// Worker-Stub: URL.createObjectURL reicht den Blob-Quelltext durch; der
// Fake-Worker evaluiert ihn mit einem self-Stub und stellt postMessage in
// beide Richtungen asynchron zu (queueMicrotask, wie echte Worker-Kanäle).
class FakeBlob {
  constructor(parts) {
    this.source = (parts || []).join('');
  }
}

const fakeURL = { createObjectURL: (blob) => blob.source };

class FakeWorker {
  constructor(source) {
    this.onmessage = null;
    this.onerror = null;
    this._self = {
      onmessage: null,
      postMessage: (msg) => {
        queueMicrotask(() => {
          if (typeof this.onmessage === 'function') this.onmessage({ data: msg });
        });
      },
    };
    // Quelltext ist '(function workerMain(){…})();' — mit self-Stub ausführen.
    new Function('self', source)(this._self);
  }
  postMessage(msg) {
    queueMicrotask(() => {
      if (typeof this._self.onmessage === 'function') this._self.onmessage({ data: msg });
    });
  }
  terminate() {}
}

// Baut eine frische Laufzeit-Instanz: window-Stub fängt den message-Listener,
// der Port-Stub sammelt die Antworten.
function createRuntime() {
  const listeners = [];
  const fakeWindow = {
    addEventListener: (type, fn) => listeners.push({ type, fn }),
  };
  new Function('window', 'Worker', 'Blob', 'URL', extractRuntimeSource())(
    fakeWindow,
    FakeWorker,
    FakeBlob,
    fakeURL,
  );
  const messageListeners = listeners.filter((l) => l.type === 'message');
  expect(messageListeners.length).toBe(1);
  const received = [];
  const port = { postMessage: (msg) => received.push(msg) };
  const deliver = (data, ports) => messageListeners[0].fn({ data, ports });
  return { deliver, port, received };
}

// Ausführung ist Promise-basiert; kurz auf die Microtask-Queue warten.
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('script-sandbox Laufzeit — Protokoll-Validierung (4T-000412)', () => {
  it('führt einen gültigen Run-Auftrag aus und liefert die Ausgabe über den Port', async () => {
    const { deliver, port, received } = createRuntime();
    deliver({ type: 'pm-script-run', script: 'pq.out("Hallo " + (1 + 2));', data: null }, [port]);
    await settle();
    expect(received).toEqual([{ type: 'result', output: [{ kind: 'text', text: 'Hallo 3' }] }]);
  });

  it('ignoriert Nachrichten ohne erwartetes Schema (Typ, Skript-String, Port)', async () => {
    const { deliver, port, received } = createRuntime();
    deliver(null, [port]);
    deliver({ type: 'anderer-typ', script: 'pq.out(1);' }, [port]);
    deliver({ type: 'pm-script-run', script: 42 }, [port]);
    deliver({ type: 'pm-script-run', script: 'pq.out(1);' }, []); // kein Port
    deliver({ type: 'pm-script-run', script: 'pq.out(1);' }, undefined);
    await settle();
    expect(received).toEqual([]);
    // Nach den ungültigen Nachrichten akzeptiert die Laufzeit weiterhin den
    // ersten gültigen Auftrag (started wurde nie gesetzt).
    deliver({ type: 'pm-script-run', script: 'pq.out("ok");', data: null }, [port]);
    await settle();
    expect(received.length).toBe(1);
    expect(received[0].type).toBe('result');
  });

  it('verarbeitet nur den ersten gültigen Auftrag (eine Instanz = ein Lauf)', async () => {
    const { deliver, port, received } = createRuntime();
    deliver({ type: 'pm-script-run', script: 'pq.out("eins");', data: null }, [port]);
    deliver({ type: 'pm-script-run', script: 'pq.out("zwei");', data: null }, [port]);
    await settle();
    expect(received.length).toBe(1);
    expect(received[0].output).toEqual([{ kind: 'text', text: 'eins' }]);
  });

  it('meldet Syntax-Fehler des Skripts als error-Nachricht', async () => {
    const { deliver, port, received } = createRuntime();
    deliver({ type: 'pm-script-run', script: 'das ist kein JavaScript(', data: null }, [port]);
    await settle();
    expect(received.length).toBe(1);
    expect(received[0].type).toBe('error');
    expect(typeof received[0].message).toBe('string');
    expect(received[0].message.length).toBeGreaterThan(0);
  });

  it('meldet Laufzeit-Fehler mit Meldung und Skript-Zeile', async () => {
    const { deliver, port, received } = createRuntime();
    const script = 'const a = 1;\nthrow new Error("kaputt");';
    deliver({ type: 'pm-script-run', script, data: null }, [port]);
    await settle();
    expect(received.length).toBe(1);
    expect(received[0].type).toBe('error');
    expect(received[0].message).toBe('kaputt');
    expect(received[0].line).toBe(2);
  });

  it('Nutzer-Skripte laufen strikt (implizite Globals werfen)', async () => {
    const { deliver, port, received } = createRuntime();
    deliver({ type: 'pm-script-run', script: 'undeklariert = 1;', data: null }, [port]);
    await settle();
    expect(received.length).toBe(1);
    expect(received[0].type).toBe('error');
  });

  it('wartet auf ein zurückgegebenes Promise, bevor das Ergebnis gemeldet wird', async () => {
    const { deliver, port, received } = createRuntime();
    const script = 'return Promise.resolve().then(function () { pq.out("später"); });';
    deliver({ type: 'pm-script-run', script, data: null }, [port]);
    await settle();
    expect(received).toEqual([{ type: 'result', output: [{ kind: 'text', text: 'später' }] }]);
  });
});

describe('script-sandbox Laufzeit — pq-Ausgabe-Normalisierung (4T-000412)', () => {
  async function runScript(script) {
    const { deliver, port, received } = createRuntime();
    deliver({ type: 'pm-script-run', script, data: null }, [port]);
    await settle();
    expect(received.length).toBe(1);
    expect(received[0].type).toBe('result');
    return received[0].output;
  }

  it('pq.out normalisiert Strings, Zahlen und Arrays zu Text-Knoten', async () => {
    const output = await runScript('pq.out("a", 1, [true, "b"]);');
    expect(output).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'text', text: '1' },
      { kind: 'text', text: 'true' },
      { kind: 'text', text: 'b' },
    ]);
  });

  it('pq.el baut ohne Emit; Attribute werden zu Strings', async () => {
    const output = await runScript(
      'pq.out(pq.el("p", ["Hallo ", pq.el("strong", "Welt")], { class: "k", num: 5 }));',
    );
    expect(output).toEqual([
      {
        kind: 'el',
        tag: 'p',
        attrs: { class: 'k', num: '5' },
        children: [
          { kind: 'text', text: 'Hallo ' },
          { kind: 'el', tag: 'strong', attrs: {}, children: [{ kind: 'text', text: 'Welt' }] },
        ],
      },
    ]);
  });

  it('pq.list emittiert und normalisiert verschachtelte Einträge', async () => {
    const output = await runScript(
      'pq.list(["flach", { content: "Wurzel", children: ["Kind"] }]);',
    );
    expect(output).toEqual([
      {
        kind: 'list',
        items: [
          { content: [{ kind: 'text', text: 'flach' }], children: [] },
          {
            content: [{ kind: 'text', text: 'Wurzel' }],
            children: [{ content: [{ kind: 'text', text: 'Kind' }], children: [] }],
          },
        ],
      },
    ]);
  });

  it('pq.table emittiert Kopf und Zeilen als Segment-Zellen', async () => {
    const output = await runScript('pq.table(["A"], [["1"], ["2"]]);');
    expect(output).toEqual([
      {
        kind: 'table',
        headers: [[{ kind: 'text', text: 'A' }]],
        rows: [[[{ kind: 'text', text: '1' }]], [[{ kind: 'text', text: '2' }]]],
      },
    ]);
  });

  it('pq.link und pq.md bauen serialisierbare Knoten', async () => {
    const output = await runScript('pq.out(pq.link("/p/A.md", "A"), pq.md("**fett**"));');
    expect(output).toEqual([
      { kind: 'link', path: '/p/A.md', label: 'A' },
      { kind: 'md', text: '**fett**' },
    ]);
  });
});

// 4T-000413 (Epic 3E-000078): Daten-Seite der pq-API gegen einen fixen Snapshot
// (Form wie backlinks.scriptDataFor: pages mit props/file, blocks, current).
describe('script-sandbox Laufzeit — pq-Daten-API (4T-000413)', () => {
  const SNAPSHOT = {
    status: 'ready',
    current: 'C:/raum/Start.md',
    pages: [
      {
        props: { bereich: 'Privat', prio: '2' },
        file: {
          name: 'Start',
          folder: '',
          path: 'Start.md',
          absPath: 'C:/raum/Start.md',
          tags: ['projekt/alpha'],
          aliases: [],
          inlinks: [],
          outlinks: [{ path: 'C:/raum/Ordner/Alpha.md', name: 'Alpha' }],
        },
      },
      {
        props: { bereich: 'Privat', prio: '1' },
        file: {
          name: 'Alpha',
          folder: 'Ordner',
          path: 'Ordner/Alpha.md',
          absPath: 'C:/raum/Ordner/Alpha.md',
          tags: [],
          aliases: [],
          inlinks: [{ path: 'C:/raum/Start.md', name: 'Start' }],
          outlinks: [],
        },
      },
    ],
    blocks: [
      {
        file: { path: 'Ordner/Alpha.md', absPath: 'C:/raum/Ordner/Alpha.md', name: 'Alpha' },
        anchor: 'abc',
        values: { status: 'offen' },
        updatedMs: 1000,
      },
    ],
  };

  async function runScript(script, data) {
    const { deliver, port, received } = createRuntime();
    deliver({ type: 'pm-script-run', script, data: data === undefined ? SNAPSHOT : data }, [port]);
    await settle();
    expect(received.length).toBe(1);
    expect(received[0].type).toBe('result');
    return received[0].output;
  }

  function texts(output) {
    return output.map((n) => n.text);
  }

  it('pq.pages(): alle Seiten; Frontmatter-Felder flach, file.* implizit', async () => {
    const output = await runScript(
      'var p = pq.pages(); pq.out(p.length, p[0].bereich, p[0].file.name);',
    );
    expect(texts(output)).toEqual(['2', 'Privat', 'Start']);
  });

  it('pq.pages("#tag"): Tag-Quelle inklusive Hierarchie-Präfix', async () => {
    const output = await runScript(
      'pq.out(pq.pages("#projekt").length, pq.pages("#projekt/alpha").length, pq.pages("#anderes").length);',
    );
    expect(texts(output)).toEqual(['1', '1', '0']);
  });

  it('pq.pages("Ordner"): Ordner-Quelle relativ zur Wurzel', async () => {
    const output = await runScript(
      'pq.out(pq.pages("Ordner").map(function (p) { return p.file.name; }).join(","));',
    );
    expect(texts(output)).toEqual(['Alpha']);
  });

  it('pq.pages("[[Alpha]]"): Seiten mit ausgehendem Link auf das Ziel', async () => {
    const output = await runScript(
      'pq.out(pq.pages("[[Alpha]]").map(function (p) { return p.file.name; }).join(","), pq.pages("[[Start]]").length);',
    );
    expect(texts(output)).toEqual(['Start', '0']);
  });

  it('pq.current() und pq.file() lösen über Pfad und Namen auf', async () => {
    const output = await runScript(
      'pq.out(pq.current().file.name, pq.file("Ordner/Alpha.md").file.name, pq.file("alpha").file.name, pq.file("Fehlt") === null);',
    );
    expect(texts(output)).toEqual(['Start', 'Alpha', 'Alpha', 'true']);
  });

  it('pq.blocks(): aktive Block-Metadaten, Quelle filtert über die Seite', async () => {
    const output = await runScript(
      'var b = pq.blocks(); pq.out(b.length, b[0].anchor, b[0].values.status, pq.blocks("Ordner").length, pq.blocks("#projekt").length);',
    );
    expect(texts(output)).toEqual(['1', 'abc', 'offen', '1', '0']);
  });

  it('pq.link() löst Seiten-Objekte, Namen und Block-Ziele auf', async () => {
    const output = await runScript(
      'pq.out(pq.link(pq.file("Alpha")), pq.link("alpha", "Anzeige"), pq.link(pq.blocks()[0]));',
    );
    expect(output).toEqual([
      { kind: 'link', path: 'C:/raum/Ordner/Alpha.md', label: 'Alpha' },
      { kind: 'link', path: 'C:/raum/Ordner/Alpha.md', label: 'Anzeige' },
      { kind: 'link', path: 'C:/raum/Ordner/Alpha.md', label: 'Alpha#^abc', anchor: 'abc' },
    ]);
  });

  it('ohne Snapshot (data null): Datenfunktionen liefern leer, indexStatus none', async () => {
    const output = await runScript(
      'pq.out(pq.pages().length, pq.blocks().length, pq.current() === null, pq.indexStatus);',
      null,
    );
    expect(texts(output)).toEqual(['0', '0', 'true', 'none']);
  });

  it('pq.date: ISO-Formen lokal, ungültige Werte null', async () => {
    const output = await runScript(
      'pq.out(pq.date("2026-07-09").getFullYear(), pq.date("2026-07-09 14:30").getHours(), pq.date("kein datum") === null);',
    );
    expect(texts(output)).toEqual(['2026', '14', 'true']);
  });

  it('pq.dur: Einheiten der Abfrage-Sprache, ungültige Werte null', async () => {
    const output = await runScript(
      'pq.out(pq.dur("7 days"), pq.dur("1h 30min"), pq.dur("3 blubb") === null);',
    );
    expect(texts(output)).toEqual([String(7 * 86400000), String(5400000), 'true']);
  });

  it('pq.sort: Selektor-String mit Pfad, typ-gerecht, desc-Schalter', async () => {
    const output = await runScript(
      'var byPrio = pq.sort(pq.pages(), "prio");' +
        'var byNameDesc = pq.sort(pq.pages(), function (p) { return p.file.name; }, true);' +
        'pq.out(byPrio.map(function (p) { return p.file.name; }).join(","), byNameDesc.map(function (p) { return p.file.name; }).join(","));',
    );
    expect(texts(output)).toEqual(['Alpha,Start', 'Start,Alpha']);
  });

  it('Referenz-Fall des PO: rekursiver Link-Baum über outlinks als verschachtelte Liste', async () => {
    const script = [
      'function baum(page, gesehen) {',
      '  return {',
      '    content: pq.link(page),',
      '    children: page.file.outlinks',
      '      .map(function (l) { return pq.file(l.path); })',
      '      .filter(function (p) { return p && gesehen.indexOf(p.file.absPath) < 0; })',
      '      .map(function (p) { return baum(p, gesehen.concat([p.file.absPath])); }),',
      '  };',
      '}',
      'var start = pq.current();',
      'pq.list([baum(start, [start.file.absPath])]);',
    ].join('\n');
    const output = await runScript(script);
    expect(output.length).toBe(1);
    const root = output[0];
    expect(root.kind).toBe('list');
    expect(root.items[0].content[0]).toEqual({
      kind: 'link',
      path: 'C:/raum/Start.md',
      label: 'Start',
    });
    expect(root.items[0].children[0].content[0]).toEqual({
      kind: 'link',
      path: 'C:/raum/Ordner/Alpha.md',
      label: 'Alpha',
    });
  });
});

describe('script-sandbox Laufzeit — pq-Knoten-Details', () => {
  async function runScript(script) {
    const { deliver, port, received } = createRuntime();
    deliver({ type: 'pm-script-run', script, data: null }, [port]);
    await settle();
    expect(received.length).toBe(1);
    expect(received[0].type).toBe('result');
    return received[0].output;
  }

  it('pq.link ohne Snapshot lässt Pfade unverändert', async () => {
    const output = await runScript('pq.out(pq.link("/p/A.md", "A"), pq.md("**fett**"));');
    expect(output).toEqual([
      { kind: 'link', path: '/p/A.md', label: 'A' },
      { kind: 'md', text: '**fett**' },
    ]);
  });
});
