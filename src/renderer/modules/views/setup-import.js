// 4T-001588 (Story 4S-000904, Epic 3E-000160): Einlesen der eigenen
// Einstellungen — Datei wählen, Vorschau bestätigen, Bericht lesen.
//
// Der Anzeige-Prozess führt hier nur die Bedienung. **Die Werte der Datei
// erreichen ihn nie** — genau wie bei der Ausgabe. Er bekommt vom
// Hauptprozess den Plan (was ergänzt, was ersetzt, was umbenannt, was
// übersprungen wird) und schickt eine Bestätigung zurück; gelesen, gerechnet
// und geschrieben wird dort.
//
// Drei Zusicherungen des Tasks tragen die Form dieses Moduls:
// **Ohne Bestätigung wird nichts geschrieben** (AK3) — der Weg von
// `exchange:plan` zu `exchange:apply` führt zwingend über den Dialog.
// **Der Anwender sieht vorher, was geschieht** (AK2) — jede Zeile trägt ihre
// Wirkung, und Umbenennungen stehen namentlich darunter.
// **Kein stiller Teil-Import** (AK9, Z3) — dieselbe Liste erscheint danach als
// Bericht, einschließlich dessen, was nicht ankam.
'use strict';

import { t } from '../../i18n.js';
import { api, $ } from '../app/api.js';
import { showStatusbarHint } from './views.js';
import { speichereEinrichtung } from './setup-export.js';

// Wirkung einer Zeile als Text. Bewusst je Fall ein eigener Schlüssel statt
// einer zusammengesetzten Zeichenkette: Die Fälle stehen in den fünf
// Sprachfassungen unterschiedlich, und «ergänzt: 3» wäre in keiner davon ein
// Satz.
function wirkungsText(eintrag) {
  if (eintrag.action === 'skip') {
    return eintrag.grund === 'no-area'
      ? t('exchange.import.skippedNoArea')
      : t('exchange.import.skippedForm');
  }
  if (eintrag.action === 'append') {
    if (eintrag.hinzu === 0) return t('exchange.import.addedNone');
    return eintrag.hinzu === 1
      ? t('exchange.import.addedOne')
      : t('exchange.import.addedMany').replace('{n}', String(eintrag.hinzu));
  }
  return t('exchange.import.replaced');
}

// Die Zusatz-Zeilen unter einer Datenart: was umbenannt, was übersprungen und
// was verworfen wurde. Jede Abweichung vom geradlinigen Fall wird benannt.
function detailZeilen(eintrag) {
  const zeilen = [];
  for (const u of eintrag.umbenannt || []) {
    zeilen.push(t('exchange.import.renamed').replace('{von}', u.von).replace('{nach}', u.nach));
  }
  if (eintrag.uebersprungen > 0) {
    zeilen.push(t('exchange.import.duplicates').replace('{n}', String(eintrag.uebersprungen)));
  }
  if (eintrag.verworfen && eintrag.verworfen.length > 0) {
    zeilen.push(t('exchange.import.dropped').replace('{namen}', eintrag.verworfen.join(', ')));
  }
  // 4T-001590: Ein Eintrag, dessen Definition unvollständig ist, kommt nicht
  // an — und wird namentlich genannt statt stillschweigend weggelassen. Der
  // Unterschied zu «verworfen» daneben: Dort passte die FORM eines Pfads
  // nicht, hier ist der Gegenstand selbst unvollständig.
  if (eintrag.abgewiesen && eintrag.abgewiesen.length > 0) {
    zeilen.push(
      t('exchange.import.rejectedIncomplete').replace('{namen}', eintrag.abgewiesen.join(', ')),
    );
  }
  if (eintrag.uebernommen === false && eintrag.action !== 'skip') {
    zeilen.push(t('exchange.import.notApplied'));
  }
  return zeilen;
}

function zeichneListe(container, kinds, unknownSections) {
  container.innerHTML = '';
  const ul = document.createElement('ul');
  ul.className = 'setup-import-rows';
  for (const eintrag of kinds) {
    const li = document.createElement('li');
    if (eintrag.action === 'skip' || eintrag.uebernommen === false) {
      li.className = 'setup-import-skipped';
    }
    const kopf = document.createElement('div');
    kopf.className = 'setup-import-head';
    const name = document.createElement('span');
    name.className = 'setup-import-name';
    name.textContent = t(eintrag.labelKey);
    const wirkung = document.createElement('span');
    wirkung.className = 'setup-import-action';
    wirkung.textContent = wirkungsText(eintrag);
    kopf.appendChild(name);
    kopf.appendChild(wirkung);
    li.appendChild(kopf);
    for (const zeile of detailZeilen(eintrag)) {
      const p = document.createElement('div');
      p.className = 'setup-import-detail';
      p.textContent = zeile;
      li.appendChild(p);
    }
    ul.appendChild(li);
  }
  // Ein unbekannter Abschnitt ist keine Datenart und bekommt deshalb keine
  // Zeile mit Wirkung — aber genannt wird er (Z3, Fassungs-Verträglichkeit).
  for (const name of unknownSections || []) {
    const li = document.createElement('li');
    li.className = 'setup-import-skipped';
    const kopf = document.createElement('div');
    kopf.className = 'setup-import-head';
    const links = document.createElement('span');
    links.className = 'setup-import-name';
    links.textContent = name;
    const rechts = document.createElement('span');
    rechts.className = 'setup-import-action';
    rechts.textContent = t('exchange.import.skippedUnknown');
    kopf.appendChild(links);
    kopf.appendChild(rechts);
    li.appendChild(kopf);
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

// Der gemeinsame Rahmen beider Phasen. `optionen.bestaetigen` unterscheidet
// die Vorschau (zwei Schaltflächen und die Sicherung) vom Bericht (nur
// Schließen). Aufbau und Tasten-Verhalten folgen dem Auswahl-Dialog der
// Ausgabe, damit beide sich gleich bedienen lassen.
function zeigeModal(optionen) {
  const modal = $('#setup-import-modal');
  const listEl = $('#setup-import-list');
  const btnConfirm = $('#btn-setup-import-confirm');
  const btnCancel = $('#btn-setup-import-cancel');
  const btnBackup = $('#btn-setup-import-backup');
  const warnEl = $('#setup-import-warning');
  if (!modal || !listEl) return Promise.resolve(false);

  return new Promise((resolve) => {
    $('#setup-import-title').textContent = optionen.titel;
    $('#setup-import-intro').textContent = optionen.intro;
    warnEl.textContent = optionen.warnung || '';
    warnEl.hidden = !optionen.warnung;
    zeichneListe(listEl, optionen.kinds, optionen.unknownSections);

    btnConfirm.textContent = optionen.bestaetigen
      ? t('exchange.import.confirm')
      : t('dialog.close');
    btnCancel.hidden = !optionen.bestaetigen;
    btnCancel.textContent = t('dialog.cancel');
    btnBackup.hidden = !optionen.sichern;
    btnBackup.textContent = t('exchange.import.backup');
    // Nichts zu übernehmen: Die Bestätigung wäre eine Zusage über nichts.
    btnConfirm.disabled = optionen.bestaetigen && !optionen.etwasZuTun;

    const finish = (wert) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      btnBackup.removeEventListener('click', onBackup);
      backdrop.removeEventListener('click', onCancel);
      resolve(wert);
    };
    const onConfirm = () => finish(optionen.bestaetigen ? true : false);
    const onCancel = () => finish(false);
    const onBackup = async () => {
      const gesichert = await optionen.sichern();
      if (gesichert) btnBackup.hidden = true;
    };
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (!btnConfirm.disabled) onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    btnBackup.addEventListener('click', onBackup);
    backdrop.addEventListener('click', onCancel);

    modal.hidden = false;
    setTimeout(() => btnConfirm.focus(), 0);
  });
}

// Meldung zu einem Lese-Fehler. Die Kennungen kommen aus dem Format-Modul und
// aus dem Kanal; jede bekommt einen eigenen Satz, statt dem Anwender einen
// Fehlercode zu zeigen.
const LESE_FEHLER = {
  unreadable: 'exchange.import.errorUnreadable',
  'no-frontmatter': 'exchange.import.errorNotOurs',
  'invalid-frontmatter': 'exchange.import.errorNotOurs',
  'not-an-exchange-file': 'exchange.import.errorNotOurs',
  'wrong-kind': 'exchange.import.errorWrongKind',
  'invalid-format-version': 'exchange.import.errorDamaged',
  'unterminated-fence': 'exchange.import.errorDamaged',
  'unmarked-fence': 'exchange.import.errorDamaged',
  'invalid-section-name': 'exchange.import.errorDamaged',
  'duplicate-section': 'exchange.import.errorDamaged',
  'invalid-section-content': 'exchange.import.errorDamaged',
};

/**
 * Liest eine Austausch-Datei ein: wählen, Vorschau, Übernahme, Bericht.
 *
 * @returns {Promise<boolean>} true, wenn etwas übernommen wurde.
 */
export async function importSetup() {
  const gewaehlt = await api.exchangeOpenDialog();
  // Abbruch im Öffnen-Dialog ist kein Fehler und bekommt keinen Hinweis.
  if (!gewaehlt || !gewaehlt.ok) return false;

  const plan = await api.exchangePlan(gewaehlt.path);
  if (!plan || !plan.ok) {
    const schluessel = (plan && LESE_FEHLER[plan.error]) || 'exchange.import.errorDamaged';
    showStatusbarHint(schluessel, { duration: 4000, error: true });
    return false;
  }

  const zuTun = plan.kinds.filter((k) => k.action !== 'skip');
  // Was sich sichern lässt, ist die Schnittmenge aus dem, was eingelesen
  // würde, und dem, was hier tatsächlich eingerichtet ist: Eine leere
  // Datenart hat keinen Stand, der zu sichern wäre.
  const lage = await api.exchangeList();
  const sicherbar =
    lage && lage.ok
      ? lage.kinds.map((k) => k.id).filter((id) => zuTun.some((k) => k.id === id))
      : [];

  const warnungen = [];
  if (plan.neuereFassung) warnungen.push(t('exchange.import.warnNewerVersion'));
  if (plan.nurNachNeustart.length > 0) warnungen.push(t('exchange.import.warnRestart'));

  const bestaetigt = await zeigeModal({
    titel: t('exchange.import.title'),
    intro: t('exchange.import.intro'),
    warnung: warnungen.join(' '),
    kinds: plan.kinds,
    unknownSections: plan.unknownSections,
    bestaetigen: true,
    etwasZuTun: zuTun.length > 0,
    sichern: sicherbar.length > 0 ? () => speichereEinrichtung(sicherbar) : null,
  });
  if (!bestaetigt) return false;

  const ergebnis = await api.exchangeApply();
  if (!ergebnis || !ergebnis.ok) {
    const schluessel =
      ergebnis && ergebnis.error === 'plan-changed'
        ? 'exchange.import.errorPlanChanged'
        : 'exchange.import.errorApply';
    showStatusbarHint(schluessel, { duration: 4000, error: true });
    return false;
  }

  const uebernommen = ergebnis.kinds.filter((k) => k.uebernommen);
  await zeigeModal({
    titel: t('exchange.import.reportTitle'),
    intro:
      uebernommen.length > 0
        ? t('exchange.import.reportIntro')
        : t('exchange.import.reportNothing'),
    warnung: plan.nurNachNeustart.length > 0 ? t('exchange.import.warnRestart') : '',
    kinds: ergebnis.kinds,
    unknownSections: ergebnis.unknownSections,
    bestaetigen: false,
  });
  return uebernommen.length > 0;
}
