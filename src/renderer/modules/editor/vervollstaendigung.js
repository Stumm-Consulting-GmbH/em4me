// 4T-1339 (Epic 3E-0238): Ergebnisse der Vervollstaendigung — der
// Editor-seitige Teil dessen, was die Auswahl-Regeln unter src/shared/
// prozessneutral entscheiden.
//
// **Eine Mechanik, zwei Quellen** (4T-1357): Verweis-Ziele nach `[[` und
// Schlagworte nach `#` haben verschiedene Auswahl-Regeln, aber denselben Weg
// an die Vervollstaendigungs-Bibliothek. Der Weg steht deshalb genau einmal
// hier; die Quellen liefern nur, wie aus einem Eintrag eine Zeile wird.
// Die uebrigen Quellen in autocomplete-help.js verlassen sich weiterhin auf
// die Bibliothek und brauchen davon nichts.
'use strict';

import { t } from '../../i18n.js';
import {
  waehleWikiZiele,
  trefferBereich,
  klammerSchluss,
  schreibmarkeNachUebernahme,
} from '../../../shared/wiki-vorschlaege.js';
// 4T-1357 (Epic 3E-0238): Auswahl-Regel der Schlagworte, dieselbe Bauart.
import { waehleSchlagworte } from '../../../shared/schlagwort-vorschlaege.js';

// 4T-1307: Uebernahme eines Verweis-Vorschlags. Sie schreibt die fehlenden
// schliessenden Klammern mit und setzt die Schreibmarke dahinter, statt den
// Anwender beides von Hand nachtragen zu lassen. Die Entscheidung, was fehlt,
// liegt im geteilten Modul; hier steht nur der Editor-Griff.
export function uebernimmWikiZiel(view, completion, from, to) {
  const ergaenzung = klammerSchluss(view.state.sliceDoc(to, to + 2));
  view.dispatch({
    changes: { from, to, insert: completion.label + ergaenzung },
    selection: { anchor: schreibmarkeNachUebernahme(from, completion.label) },
    userEvent: 'input.complete',
  });
}

// 4T-1339: Was noch als Fortsetzung derselben Eingabe zaehlt. Bis dahin stand
// dasselbe Muster als `validFor` am Ergebnis; neben `filter: false` darf es
// dort nicht mehr stehen (Vertrag der Bibliothek). Es entscheidet jetzt in
// `update`, ob die Liste weitergerechnet wird oder die Quelle neu laufen muss
// — etwa weil ein `#` hinter `[[` den Anker-Modus oeffnet.
const NAME_FORTSETZUNG = /^[\p{L}\p{N}_-]*$/u;
// 4T-1357: Schlagworte duerfen zusaetzlich Schraegstriche tragen (Hierarchie).
const SCHLAGWORT_FORTSETZUNG = /^[\p{L}\p{N}_/-]*$/u;

// 4T-1339 (Epic 3E-0238): Der gemeinsame Ergebnis-Bau beider Quellen.
//
// **`filter: false` bestellt die Eigensortierung der Bibliothek ab.** Ohne das
// ordnet sie die uebergebene Liste nach ihrem eigenen Treffer-Vergleich; der
// gibt bei leerer Eingabe jedem Eintrag denselben Wert, und der Gleichstand
// faellt an den voreingestellten Vergleich, der alphabetisch nach der
// Beschriftung ordnet. Genau dort verschwand die Reihenfolge, die die
// Auswahl-Regeln aufbauen — und zwar in der einen Lage, fuer die sie gedacht
// ist: der Liste ohne Eingabe.
//
// Zwei Folgen, beide vom Vertrag der Bibliothek vorgegeben:
//
//   - **`validFor` entfaellt.** An seine Stelle tritt `update`. Es rechnet die
//     Liste beim Tippen synchron aus der einmal geholten Gesamtmenge neu,
//     statt je Zeichen erneut ueber die Prozessgrenze zu gehen. Passt die
//     Eingabe nicht mehr zum Muster, liefert es null, und die Bibliothek stellt
//     die Quelle auf «ausstehend» und laesst sie neu laufen.
//   - **`getMatch` liefert die Treffer-Hervorhebung nach**, weil die Bibliothek
//     sie ohne eigenen Filter-Lauf nicht mehr selbst ausrechnet.
//
// Nebenwirkung, die eine zweite Luecke schliesst: `update` filtert ueber die
// **vollstaendige** Vorschlagsmenge. Bis 4T-1339 filterte die Bibliothek nur
// innerhalb der bereits gekuerzten Liste; ein Ziel ausserhalb davon war durch
// Tippen nicht erreichbar.
//
// @param {object} quelle { alle, waehle, baueZeile, muster } — die Gesamtmenge,
//   die Auswahl-Regel, der Bau einer Zeile und das Fortsetzungs-Muster.
// @param {string} eingabe der bereits getippte Rest.
// @param {number} von Beginn der ersetzten Stelle im Dokument.
function baueErgebnis(quelle, eingabe, von) {
  const { alle, waehle, baueZeile, muster } = quelle;
  return {
    from: von,
    options: waehle(alle, eingabe).map((eintrag) => baueZeile(eintrag)),
    filter: false,
    getMatch: (completion) => trefferBereich(completion.label, eingabe),
    update: (aktuell, neuVon, neuBis, ctx) => {
      if (ctx.pos < neuVon) return null;
      const neueEingabe = ctx.state.sliceDoc(neuVon, ctx.pos);
      if (!muster.test(neueEingabe)) return null;
      return baueErgebnis(quelle, neueEingabe, neuVon);
    },
  };
}

// 4T-1339: Ergebnis der Basename-Vervollstaendigung nach `[[`.
export function baueWikiErgebnis(alle, eingabe, von) {
  return baueErgebnis(
    {
      alle,
      waehle: waehleWikiZiele,
      muster: NAME_FORTSETZUNG,
      baueZeile: (s) => ({
        label: s.name,
        type: s.kind === 'alias' ? 'keyword' : 'class',
        detail:
          s.kind === 'alias'
            ? t('autocomplete.detail.alias') + (s.detail ? ' → ' + s.detail : '')
            : t('autocomplete.detail.file'),
        apply: uebernimmWikiZiel,
      }),
    },
    eingabe,
    von,
  );
}

// 4T-1357 (Epic 3E-0238): Ergebnis der Schlagwort-Vervollstaendigung nach `#`.
// Dieselbe Mechanik, andere Auswahl-Regel: Ohne Eingabe fuehrt die Haeufigkeit
// statt der Aenderungszeit. Die Anzahl steht wie bisher im Zusatztext der
// Zeile, damit die Ordnung nachvollziehbar ist.
export function baueSchlagwortErgebnis(alle, eingabe, von) {
  return baueErgebnis(
    {
      alle,
      waehle: waehleSchlagworte,
      muster: SCHLAGWORT_FORTSETZUNG,
      baueZeile: (eintrag) => ({
        label: eintrag.tag,
        type: 'keyword',
        detail: t('autocomplete.detail.tag') + ' (' + eintrag.count + ')',
      }),
    },
    eingabe,
    von,
  );
}
