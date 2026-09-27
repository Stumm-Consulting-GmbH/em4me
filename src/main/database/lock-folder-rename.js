// 4T-001795 (Epic 3E-000255, E9, Bauplan N3): Den Namen des Sperr-Ordners
// setzen — ein Vorgang im Haupt-Prozess, vier Schritte, fester Ausgang.
//
// **Warum ein eigenes Modul und nicht ein Rumpf im Kanal.** Der Vorgang trägt
// die einzige Stelle der Anwendung, an der ein Ordner des Anwenders umbenannt
// und gleichzeitig eine Angabe in der Bereichsdatei nachgezogen wird. Beide
// Schritte müssen zusammen gelten oder zusammen ausbleiben, und genau diese
// Kopplung ist prüfbar nur dort, wo sie als geschlossener Vorgang liegt. Im
// Kanal-Rumpf stünde sie zwischen Fenster-Auflösung und Antwort-Bildung.
//
// **Ein halber Zustand entsteht nicht.** Entweder der Ordner heißt neu und die
// Bereichsdatei nennt den neuen Namen, oder beides bleibt, wie es war. Scheitert
// das Schreiben der Bereichsdatei, wird das Umbenennen über denselben Weg
// zurückgenommen; scheitert auch die Rücknahme, nennt die Meldung beide Namen,
// damit ein Mensch den Ordner wiederfindet.
//
// **Die Gültigkeits-Regel wird hier nicht nachgebaut.** Fünf ihrer sechs Regeln
// liegen prozess-neutral in shared/database/lock-folder-name.js, weil die
// Eingabe-Prüfung der Oberfläche dieselben braucht. Allein die sechste — unter
// dem Namen liegt in der Bereichs-Wurzel schon etwas anderes — ist ohne Blick
// ins Dateisystem nicht zu beantworten und liegt deshalb hier.
//
// **Nicht hier:** ein Text und ein Übersetzungs-Schlüssel. Die Codes sind
// sprachneutral; wer eine Meldung braucht, bildet sie an seinem Bedienort ab.
'use strict';

const fsPromises = require('node:fs/promises');
const path = require('node:path');

// Die Bereichs-Grenze der Anwendung, dieselbe Innerhalb-Prüfung wie im
// Sperr-Speicher; area/ importiert seinerseits nichts aus database/.
const { isInsideArea } = require('../area/area-path.js');
const { pruefeSperrOrdnerName } = require('../../shared/database/lock-folder-name.js');
// Der wirksame Name kommt aus dem Speicher und nicht aus einer zweiten
// Auflösung: Sonst urteilte die Umbenennung über einen anderen Ordner als den,
// in dem die Sperren tatsächlich liegen.
const { sperrOrdnerName } = require('./lock-store.js');
// 4T-001789: Dieselbe gemessene Wiederhol-Schleife wie jedes andere Umbenennen
// der Anwendung. Auf einer Netz-Freigabe scheitert ein Umbenennen regelmäßig
// beim ersten Versuch, und eine zweite Schleife wäre eine zweite Auslegung
// desselben Fensters.
const { benenneUmMitWiederholung } = require('../documents/atomic-write.js');

// Codes der Fehlschläge, die erst hier entstehen können. Die übrigen kommen
// unverändert aus der Gültigkeits-Regel; ein Aufrufer unterscheidet sie am
// Code und nicht am Text.
const SPERR_ORDNER_CODES = Object.freeze({
  belegt: 'lockFolderTaken',
  inArbeit: 'lockFolderBusy',
  umbenennen: 'lockFolderRenameFailed',
  ruecknahme: 'lockFolderRollbackFailed',
});

function alsText(fehler) {
  return fehler && fehler.message ? fehler.message : String(fehler);
}

function fehler(code, text, weiteres) {
  return { ok: false, code, error: text, ...(weiteres || {}) };
}

// Nähte nach dem Vorbild des Sperr-Speichers. `leseKonfig`, `schreibeKonfig`
// und die Verwaltung sind **Pflicht** und fallen nicht still auf eine Vorgabe
// zurück: Ohne den Leser wäre der alte Ordner nicht bestimmbar, ohne die
// Verwaltung liefe die Umbenennung an der Frage vorbei, ob gerade jemand
// arbeitet — beides sind stille Weichen mit Datenverlust am Ende.
function nahtstellen(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  if (typeof d.leseKonfig !== 'function' || typeof d.schreibeKonfig !== 'function') {
    throw new TypeError('setzeSperrOrdnerName: leseKonfig und schreibeKonfig sind Pflicht-Nähte');
  }
  if (!d.verwaltung || typeof d.verwaltung.lebendeSperren !== 'function') {
    throw new TypeError('setzeSperrOrdnerName: verwaltung braucht lebendeSperren()');
  }
  return {
    fsp: d.fsp || fsPromises,
    benenneUm: typeof d.benenneUm === 'function' ? d.benenneUm : benenneUmMitWiederholung,
    verwaltung: d.verwaltung,
    leseKonfig: d.leseKonfig,
    schreibeKonfig: d.schreibeKonfig,
  };
}

// Liegt unter diesem Pfad schon etwas? «Nicht da» ist die einzige Antwort, die
// weitergehen lässt; jeder andere Fehler des Nachsehens gilt als belegt, weil
// ein Umbenennen auf einen Pfad, über den nichts bekannt ist, im besten Fall
// scheitert und im schlechteren fremden Bestand verdeckt.
async function liegtEtwas(fsp, pfad) {
  try {
    await fsp.stat(pfad);
    return true;
  } catch (err) {
    return !err || err.code !== 'ENOENT';
  }
}

// Die Auskunft über die erste lebende Sperre: Benutzer und Rechner ihres
// Halters, damit die Meldung sagen kann, WER gerade arbeitet. Beide dürfen
// fehlen — eine Sperre mit unbrauchbarem Inhalt zählt als lebend, nennt aber
// niemanden.
function halterAus(sperre) {
  const konflikt = sperre && sperre.konflikt ? sperre.konflikt : {};
  return { benutzer: konflikt.benutzer || null, rechner: konflikt.rechner || null };
}

/**
 * Setzt den Namen des Sperr-Ordners eines Bereichs.
 *
 * Vier Schritte: Gültigkeit prüfen, lebende Sperren abfragen, den bestehenden
 * Ordner umbenennen und die Bereichsdatei schreiben. Scheitert der vierte, wird
 * der dritte zurückgenommen. Ein gleicher wirksamer Name vorher wie nachher ist
 * ein Erfolg ohne Wirkung.
 *
 * @param {string} rootPath Wurzelpfad des Bereichs.
 * @param {unknown} name Der gewünschte Ordnername.
 * @param {object} deps Nähte: `leseKonfig`, `schreibeKonfig` und `verwaltung`
 *   sind Pflicht; `fsp` und `benenneUm` haben Vorgaben.
 * @returns {Promise<{ok: true, name: string, geaendert: boolean, umbenannt: boolean}
 *   |{ok: false, code: string, error: string}>}
 */
async function setzeSperrOrdnerName(rootPath, name, deps) {
  const { fsp, benenneUm, verwaltung, leseKonfig, schreibeKonfig } = nahtstellen(deps);

  // Schritt 1: die fünf prozess-neutralen Regeln, mit derselben Funktion, die
  // auch der Speicher beim Lesen benutzt.
  const geprueft = pruefeSperrOrdnerName(name);
  if (!geprueft.ok) {
    return fehler(geprueft.code, `Der Name des Sperr-Ordners ist unzulässig: ${String(name)}`);
  }
  const neu = geprueft.name;
  const alt = await sperrOrdnerName(rootPath, deps);
  // Ohne Wirkung, aber kein Fehlschlag: Wer den Namen bestätigt, der ohnehin
  // gilt, hat nichts falsch gemacht.
  if (alt === neu) return { ok: true, name: neu, geaendert: false, umbenannt: false };

  const neuerPfad = path.join(rootPath, neu);
  const alterPfad = path.join(rootPath, alt);
  // Vor jedem Dateizugriff die Bereichs-Grenze; ein geprüfter Name kann sie
  // nicht verlassen, und genau deshalb kostet die Prüfung hier nichts.
  if (!isInsideArea(rootPath, neuerPfad)) {
    return fehler(SPERR_ORDNER_CODES.belegt, `Der Name führt aus dem Bereich hinaus: ${neu}`);
  }

  // Schritt 1b, die sechste Regel: Unter dem Namen darf in der Bereichs-Wurzel
  // nichts anderes liegen. Sonst überschriebe die Umbenennung fremden Bestand
  // oder scheiterte mit einer Meldung des Dateisystems, die niemandem sagt, was
  // los ist.
  if (await liegtEtwas(fsp, neuerPfad)) {
    return fehler(
      SPERR_ORDNER_CODES.belegt,
      `In der Bereichs-Wurzel liegt bereits etwas unter diesem Namen: ${neu}`,
    );
  }

  // Schritt 2: Solange jemand arbeitet, wird nicht umbenannt. Er verlöre seine
  // Markierung, ohne es zu merken.
  const lebend = await verwaltung.lebendeSperren(rootPath);
  if (!lebend.ok) return lebend;
  if (lebend.sperren.length > 0) {
    return fehler(
      SPERR_ORDNER_CODES.inArbeit,
      'Im Sperr-Ordner liegt mindestens eine lebende Sperre.',
      halterAus(lebend.sperren[0]),
    );
  }

  // Schritt 3: den bestehenden Ordner umbenennen, statt einen zweiten
  // anzulegen. Fehlt er, entfällt der Schritt — vor der ersten Sperre gibt es
  // ihn nicht, und das ist der Normalfall und kein Fehler.
  let umbenannt = false;
  if (await liegtEtwas(fsp, alterPfad)) {
    try {
      await benenneUm(alterPfad, neuerPfad);
      umbenannt = true;
    } catch (err) {
      return fehler(
        SPERR_ORDNER_CODES.umbenennen,
        `Der Sperr-Ordner konnte nicht umbenannt werden (${alt} nach ${neu}): ${alsText(err)}`,
      );
    }
  }

  // Schritt 4: die Angabe in die Bereichsdatei. Die bestehende Sektion geht
  // mit, damit das Schreiben allein den Namen ändert und die übrigen Angaben
  // des Bereichs stehen lässt; eine defekte Bereichsdatei meldet der
  // Schreibweg und überschreibt sie nie.
  const bestand = await bestehendeSektion(leseKonfig, rootPath);
  const geschrieben = await schreibeVersuch(schreibeKonfig, rootPath, bestand, neu);
  if (geschrieben.ok) return { ok: true, name: neu, geaendert: true, umbenannt };

  if (!umbenannt) return fehler(SPERR_ORDNER_CODES.umbenennen, geschrieben.error);
  try {
    await benenneUm(neuerPfad, alterPfad);
  } catch (err) {
    // Beide Namen gehören in das Ergebnis und nicht nur in den Text: Der
    // Bedienort muss sie in seiner Sprache nennen können, damit der Anwender
    // den Ordner von Hand zurückbenennen kann (Muster des Mitziehens der
    // Begleit-Dateien).
    return fehler(
      SPERR_ORDNER_CODES.ruecknahme,
      `Die Bereichsdatei ließ sich nicht schreiben (${geschrieben.error}), und der Sperr-Ordner` +
        ` liegt weiter unter dem neuen Namen ${neu} statt unter ${alt}: ${alsText(err)}`,
      { alt, neu },
    );
  }
  return fehler(SPERR_ORDNER_CODES.umbenennen, geschrieben.error);
}

// Die bestehende Sektion, falls lesbar. Eine fehlende oder defekte Bereichsdatei
// ergibt ein leeres Objekt; ob sie defekt ist, entscheidet danach der
// Schreibweg und nicht dieser Leser.
async function bestehendeSektion(leseKonfig, rootPath) {
  try {
    const roh = await leseKonfig(rootPath);
    return roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
  } catch {
    return {};
  }
}

// Der Schreibversuch, auf eine Form gebracht: Der Schreibweg meldet einen
// Fehlschlag als Wert, ein unerwarteter Bruch kommt als Ausnahme — für die
// Rücknahme sind beide derselbe Fall.
async function schreibeVersuch(schreibeKonfig, rootPath, config, name) {
  try {
    const ergebnis = await schreibeKonfig(rootPath, config, { sperrOrdnerName: name });
    if (ergebnis && ergebnis.ok === true) return { ok: true };
    return { ok: false, error: ergebnis && ergebnis.error ? ergebnis.error : 'unbekannter Grund' };
  } catch (err) {
    return { ok: false, error: alsText(err) };
  }
}

module.exports = {
  SPERR_ORDNER_CODES,
  setzeSperrOrdnerName,
};
