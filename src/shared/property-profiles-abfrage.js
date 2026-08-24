// 4T-1176 (Epic 3E-0220, E7): Erzeugung der Abfrage zu einem Profil — der
// Text, den das Kommando «Profil-Abfrage einfügen» an der Cursor-Position
// hinschreibt.
//
// Eigene Datei, weil es eine eigene Fachlichkeit ist: Hier steht die
// Übersetzung einer Profil-KONFIGURATION in einen Abfrage-TEXT. Die
// Auflösung (property-profiles.js) beantwortet die umgekehrte Frage — welche
// Felder eine konkrete Datei trägt — und die Abfrage-Sprache (query/) weiß
// nichts von Profilen. Der Bezug ist gerichtet (hier -> Bereichs-Konfiguration)
// und bleibt damit kreisfrei; die Fassade property-profiles.js reicht die
// Erzeugung wie alles andere weiter.
//
// **Was die erzeugte Abfrage abdeckt** (Entscheidung des Product Owners vom
// 2026-08-24, verankert als Nachtrag zu E7 im Konzept-Dokument
// «Metadaten-Modell», Kapitel 6.16): die drei ausdrücklichen Zuordnungs-Wege
// — Zuordnungs-Feld, Schlagwort-Bindungen, Ordner-Bindungen. Der vierte Weg,
// das Standard-Profil des Bereichs, ist keine ausdrückliche Aussage über
// Zugehörigkeit und wäre als Abfrage die Negation sämtlicher Bindungen; ist
// das gewählte Profil selbst das Standard-Profil, entsteht deshalb eine
// Abfrage über alle Dokumente des Bereichs.
//
// **Nur das Profil selbst, nicht seine Kinder** (dieselbe Entscheidung): Erbt
// «Kunde» von «Projekt», so erscheinen Kunde-Dokumente nicht in der Abfrage zu
// «Projekt». Sie tragen dessen Felder, sind aber keine Projekte. Deshalb geht
// hier auch kein Profil-Katalog ein — die Vererbungs-Kette wird nicht
// gebraucht, und ein Parameter, den niemand liest, wäre eine falsche Zusage.
//
// **Momentaufnahme, kein lebender Bezug.** Der erzeugte Text bildet die
// Konfiguration zum Zeitpunkt der Erzeugung ab und zieht später nicht nach.
// Das ist die Folge der Entscheidung, keine eigene Ansicht zu bauen (E7,
// Variante A verworfen), und kein Mangel: Der Block ist danach gewöhnlicher
// Inhalt und frei änderbar.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

const { DEFAULT_ASSIGN_FIELD } = require('./property-profiles-config.js');

// Hinweis-Code für einen Zuordnungs-Feldnamen, den die Abfrage-Sprache nicht
// ansprechen kann. Die Erzeugung lässt den Zweig trotzdem stehen (siehe
// erzeugeProfilAbfrage); der Code speist den Hinweis des Kommandos.
const HINWEIS_ZUORDNUNGS_FELD = 'assignFieldNotAddressable';

// Wort-Regel des Abfrage-Tokenizers (WORD_RE in query/perspective-query.js),
// auf den ganzen Namen verankert.
const WORT_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u;
// Reiner Zahl-Lauf: der Tokenizer klassifiziert ihn nach dem Wort-Scan als
// ZAHL, nicht als Feld (NUMBER_RE ebenda).
const NUR_ZAHL_RE = /^\d+(\.\d+)?$/;
// Reservierte Wörter der Ausdrucks-Ebene; sie können nie ein Feld benennen.
const RESERVIERT = new Set(['and', 'or', 'not', 'in']);

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Kann die Abfrage-Sprache ein Feld dieses Namens ansprechen?
//
// Drei Ausschluss-Gründe, alle aus dem Tokenizer der Sprache: ein Name, der
// nicht der Wort-Regel folgt (Leerzeichen, Doppelpunkt), bricht die Abfrage
// mit einem Syntaxfehler ab; ein reserviertes Wort ebenso; eine reine Zahl
// dagegen parst anstandslos — und wird als ZAHL ausgewertet, sodass die
// Bedingung nie trifft. Der dritte Fall ist der gefährlichste, weil er als
// einziger unsichtbar bleibt, und deshalb steht er hier mit den anderen.
function zuordnungsFeldAnsprechbar(name) {
  const n = text(name);
  if (n === '') return false;
  if (RESERVIERT.has(n.toLowerCase())) return false;
  if (NUR_ZAHL_RE.test(n)) return false;
  return WORT_RE.test(n);
}

// Ein Wert als Text-Literal der Abfrage-Sprache.
//
// Die Sprache kennt in Zeichenketten KEINE Escape-Sequenzen: Ein Literal läuft
// bis zum nächsten gleichen Anführungszeichen, und beide Arten sind erlaubt.
// Deshalb wird auf das einfache ausgewichen, sobald der Wert ein doppeltes
// trägt. Trägt er beide, gibt es keine gültige Darstellung; dann bleibt es
// beim doppelten, und der Fence zeigt einen Syntaxfehler. Das ist Absicht:
// Ein sichtbar kaputter Text ist besser als ein still fehlender Zweig — der
// Fall kann auf einem Windows-Dateisystem ohnehin auf kein reales Verzeichnis
// und keinen realen Profil-Namen zeigen ('"' ist dort im Namen verboten).
function alsTextLiteral(wert) {
  const s = String(wert === null || wert === undefined ? '' : wert);
  return s.includes('"') && !s.includes("'") ? `'${s}'` : `"${s}"`;
}

// Ordner-Pfad auf die Vergleichs-Form bringen: Trenner auf '/', ohne führenden
// und abschließenden Trenner. Dieselbe Regel wie in `ordnerTrifft`
// (property-profiles.js) und `normFolder` (query/query-sources.js) — die drei
// müssen denselben Ordner-Begriff haben, sonst findet die erzeugte Abfrage
// andere Dateien als die Bindung, aus der sie stammt.
function ordnerPfad(s) {
  return text(s)
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

// Bedingung für eine Ordner-Bindung: der Ordner UND seine Unterordner,
// gleichlautend mit `ordnerTrifft`.
//
// Beide Hälften sind nötig und keine ist entbehrlich. Die Gleichheit trifft
// den gebundenen Ordner selbst und vergleicht von sich aus ohne Rücksicht auf
// Groß- und Kleinschreibung; `startswith` tut das NICHT und bekommt deshalb
// `lower(...)` und ein klein geschriebenes Literal. Der abschließende
// Schrägstrich im Literal ist der Unterschied zwischen «Unterordner» und
// «Ordner mit gleichem Namens-Anfang»: «10 Projekte Archiv» darf nicht unter
// «10 Projekte» fallen, was ein reiner Zeichenketten-Vergleich täte.
function ordnerBedingung(ordner) {
  const p = ordnerPfad(ordner);
  const gleich = `file.folder = ${alsTextLiteral(p)}`;
  const darunter = `startswith(lower(file.folder), ${alsTextLiteral(p.toLowerCase() + '/')})`;
  return `(${gleich} OR ${darunter})`;
}

// Die Schlagwort- und Ordner-Bindungen eines Profils, über alle Einträge der
// Bindungs-Liste eingesammelt. Ein Profil darf mehrfach gebunden sein; jede
// Bindung wird ein eigener ODER-Zweig, Doppelte fallen weg. Der Profil-Name
// vergleicht sich ohne Rücksicht auf Groß- und Kleinschreibung, wie überall in
// der Auflösung (Windows-Dateisystem).
function bindungenDesProfils(bindings, profilName) {
  const gesucht = text(profilName).toLowerCase();
  const tags = [];
  const folders = [];
  for (const bindung of Array.isArray(bindings) ? bindings : []) {
    if (!bindung || typeof bindung !== 'object') continue;
    if (text(bindung.profile).toLowerCase() !== gesucht) continue;
    for (const t of Array.isArray(bindung.tags) ? bindung.tags : []) {
      const s = text(t).replace(/^#/, '');
      if (s !== '' && !tags.some((x) => x.toLowerCase() === s.toLowerCase())) tags.push(s);
    }
    for (const f of Array.isArray(bindung.folders) ? bindung.folders : []) {
      const s = ordnerPfad(f);
      if (s !== '' && !folders.some((x) => x.toLowerCase() === s.toLowerCase())) folders.push(s);
    }
  }
  return { tags, folders };
}

/**
 * Erzeugt den Abfrage-Text zu einem Profil (ohne Fence-Rahmen; den setzt die
 * einfügende Seite, Muster `insertEventsBlock`).
 *
 * @param {object} p Eingaben.
 * @param {string} p.profil Name des gewählten Profils.
 * @param {string} [p.assignField] Zuordnungs-Feldname der Bereichs-Konfiguration.
 * @param {string} [p.defaultProfile] Standard-Profil des Bereichs oder null.
 * @param {Array} [p.bindings] Bindungs-Liste der Bereichs-Konfiguration.
 * @returns {{ text: string, hinweise: string[] }|null} Abfrage-Text samt
 *   Hinweis-Codes, oder null ohne Profil-Namen.
 */
function erzeugeProfilAbfrage({ profil, assignField, defaultProfile, bindings } = {}) {
  const name = text(profil);
  if (name === '') return null;
  const hinweise = [];

  // Das Standard-Profil gilt für alles, was keine andere Zuordnung hat. Die
  // Negation sämtlicher Bindungen wäre lang, undurchsichtig und still falsch,
  // sobald jemand später eine Bindung hinzufügt — der erzeugte Text ist
  // gewöhnlicher Inhalt und zieht nicht nach. Über den ganzen Bereich zu
  // fragen ist hier die richtige Antwort und zugleich die ehrliche.
  if (text(defaultProfile) !== '' && text(defaultProfile).toLowerCase() === name.toLowerCase()) {
    return { text: 'LIST', hinweise };
  }

  const feld = text(assignField) || DEFAULT_ASSIGN_FIELD;
  if (!zuordnungsFeldAnsprechbar(feld)) hinweise.push(HINWEIS_ZUORDNUNGS_FELD);
  // Gleichheit deckt beide Schreibweisen des Zuordnungs-Feldes ab: den
  // einzelnen Wert und die Liste. Die Sprache prüft bei einer Liste die
  // MITGLIEDSCHAFT, und Zeichenketten vergleicht sie ohne Rücksicht auf Groß-
  // und Kleinschreibung — dieselbe Regel, nach der `assignedProfileNames` und
  // die Auflösung ihre Profile finden. Ein `contains` wäre hier falsch: Auf
  // einem einzelnen Wert prüft es Teilzeichenketten und fände «Projektleiter»
  // unter «Projekt».
  const zweige = [`${feld} = ${alsTextLiteral(name)}`];

  const { tags, folders } = bindungenDesProfils(bindings, name);
  // `icontains` prüft die Mitgliedschaft in der Schlagwort-Liste ohne Rücksicht
  // auf Groß- und Kleinschreibung — gleichlautend mit `gebundeneProfile`. Die
  // Bindung ist immer ohne führende Raute normalisiert; die Schlagwort-Liste
  // der Datei ist es ebenso.
  for (const t of tags) zweige.push(`icontains(file.tags, ${alsTextLiteral(t)})`);
  for (const f of folders) zweige.push(ordnerBedingung(f));

  // Eine Zeile je Zweig: Die Sprache erlaubt Zeilenumbrüche innerhalb einer
  // Klausel, und ein Profil mit mehreren Bindungen ergäbe auf einer Zeile einen
  // unlesbaren Wurm. Das eingerückte `OR` am Zeilenanfang zeigt zugleich, dass
  // die Wege kumulieren.
  return { text: `LIST\nWHERE ${zweige.join('\n  OR ')}`, hinweise };
}

module.exports = {
  HINWEIS_ZUORDNUNGS_FELD,
  erzeugeProfilAbfrage,
  zuordnungsFeldAnsprechbar,
  alsTextLiteral,
  ordnerBedingung,
};
