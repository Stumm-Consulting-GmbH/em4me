// 4T-001537 (Epic 3E-000173): Baum-Zeichner der Graphenansicht — die zweite
// Darstellungs-Form neben dem Netz (Entscheidung V1 des Product Owners vom
// 2026-09-06). Eingabe ist das Baum-Modell aus buildTreeModel (4T-001536),
// Ausgabe sind verschachtelte Listen mit Aufklapp-Schaltern.
//
// Eigenes Modul und nicht Teil von graph-tab.js: Der Reiter verdrahtet zwei
// Formen, er zeichnet keine. graph-view.js liegt aus demselben Grund daneben.
//
// KEIN Kraft-Layout und keine Knoten-Obergrenze. Der Baum begrenzt die
// gezeichnete Menge ueber seine Bedienung: Beim Setzen der Daten ist allein
// die erste Ebene offen, tiefere Ebenen entstehen erst beim Aufklappen
// (Entscheidung V4). Ein Bereich mit tausenden Dateien erzeugt damit
// tausende Zeilen erst, wenn jemand sie aufklappt.
'use strict';

// Zustand je Instanz. `offen` haelt die Knoten-IDs, deren Kinder gezeichnet
// sind; sie ueberlebt ein setData mit derselben Wurzel nicht, weil der Baum
// dann ohnehin neu entsteht.
export function createTreeView(container, options = {}) {
  const t = typeof options.t === 'function' ? options.t : (k) => k;
  const onOpenFile = typeof options.onOpenFile === 'function' ? options.onOpenFile : () => {};

  const wurzelListe = document.createElement('ul');
  wurzelListe.className = 'graph-tree';
  container.appendChild(wurzelListe);

  let modell = null;
  let knotenById = new Map();
  const offen = new Set();

  function kinderVon(id) {
    const knoten = knotenById.get(id);
    return knoten ? knoten.children : [];
  }

  // Eine Zeile samt ihrer Kinder-Liste. Rekursiv, aber nur ueber die
  // AUFGEKLAPPTEN Knoten — ein zugeklappter Ast erzeugt kein DOM.
  function baueZeile(id) {
    const knoten = knotenById.get(id);
    const li = document.createElement('li');
    li.className = 'graph-tree-item';
    li.dataset.id = id;

    const zeile = document.createElement('div');
    zeile.className = 'graph-tree-row';

    const kinder = kinderVon(id);
    if (kinder.length > 0) {
      const schalter = document.createElement('button');
      schalter.type = 'button';
      schalter.className = 'graph-tree-toggle';
      const istOffen = offen.has(id);
      schalter.textContent = istOffen ? '▾' : '▸';
      schalter.title = t(istOffen ? 'graph.tree.collapse' : 'graph.tree.expand');
      schalter.setAttribute('aria-expanded', istOffen ? 'true' : 'false');
      schalter.addEventListener('click', () => {
        if (offen.has(id)) offen.delete(id);
        else offen.add(id);
        zeichne();
      });
      zeile.appendChild(schalter);
    } else {
      // Platzhalter statt Schalter: Ohne ihn saessen Blaetter und Aeste
      // derselben Ebene nicht auf einer Fluchtlinie.
      const platz = document.createElement('span');
      platz.className = 'graph-tree-toggle-space';
      zeile.appendChild(platz);
    }

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'graph-tree-file';
    name.textContent = knoten.name;
    name.title = id;
    name.addEventListener('click', () => void onOpenFile(id));
    zeile.appendChild(name);

    if (kinder.length > 0) {
      const zahl = document.createElement('span');
      zahl.className = 'graph-tree-count';
      zahl.textContent = String(kinder.length);
      zeile.appendChild(zahl);
    }

    li.appendChild(zeile);

    if (kinder.length > 0 && offen.has(id)) {
      const liste = document.createElement('ul');
      liste.className = 'graph-tree-children';
      for (const kind of kinder) liste.appendChild(baueZeile(kind));
      li.appendChild(liste);
    }
    return li;
  }

  function zeichne() {
    wurzelListe.innerHTML = '';
    if (!modell || !modell.root) return;
    wurzelListe.appendChild(baueZeile(modell.root));
  }

  return {
    // Neues Baum-Modell zeichnen. Die Wurzel ist von Anfang an offen, damit
    // die erste Ebene sichtbar ist (V4); alles Weitere bleibt zu.
    setData(tree) {
      modell = tree && tree.root ? tree : null;
      knotenById = new Map((modell ? modell.nodes : []).map((n) => [n.id, n]));
      offen.clear();
      if (modell) offen.add(modell.root);
      zeichne();
    },
    alleAuf() {
      for (const id of knotenById.keys()) if (kinderVon(id).length > 0) offen.add(id);
      zeichne();
    },
    // «Alles zu» klappt WIRKLICH alles zu, auch die Wurzel: Uebrig bleibt
    // die eine Wurzel-Zeile. Der Anfangszustand aus setData (erste Ebene
    // offen) ist damit NICHT dasselbe wie «alles zu» — das ist Absicht, denn
    // ein Knopf, der auf den Anfangszustand zurueckspringt, waere ein
    // Zuruecksetzen und kein Zuklappen.
    alleZu() {
      offen.clear();
      zeichne();
    },
    destroy() {
      wurzelListe.remove();
      modell = null;
      knotenById = new Map();
      offen.clear();
    },
  };
}
