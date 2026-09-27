// 4T-001821 (Epic 3E-000254, Bauplan B1, B3, B6; E11.5): Aus geprüften
// Anweisungen und gelesenem Bestand wird der Schreib-Plan — als **Daten**, bevor
// irgendetwas geschrieben ist.
//
// **Warum der Plan Daten sind und kein Ablauf.** Ein Auftrag berührt schon bei
// einem einzigen Datensatz zwei Dateien, die Tabellen-Datei und ihre
// Beleg-Datei. Die Klammer darüber, das Absichts-Protokoll, entsteht im
// folgenden Vorgang (4T-001822 und 4T-001823) und schreibt genau diesen Plan
// fest, bevor die erste Datei ersetzt wird. Ein Ablauf, der unterwegs entscheidet,
// ließe sich nicht protokollieren; eine Liste fertiger Texte schon.
//
// Der Plan trägt zweierlei:
//
//   `dateien`  je zu ersetzender Datei der **gelesene** Stand und der **neue**
//              Text. Der gelesene Stand ist die Erwartung der Konflikt-Prüfung
//              des gemeinsamen Schreibwegs.
//   `belege`   je anzufügendem Beleg die Angaben UND der fertige Anfüge-Text.
//
// **Der Beleg-Text steht doppelt bereit, und das ist Absicht.** Geschrieben wird
// er über `schreibeBeleg`, das die Zusage aus E10.7 trägt (ein einziger Aufruf im
// Anfüge-Modus, ohne die Datei vorher zu lesen). Damit der Plan trotzdem den
// fertigen Text kennt — er ist das, was das Absichts-Protokoll mitführen muss —,
// wird er hier über dieselben Funktionen des Format-Moduls gebildet, mit
// eingefrorenem Zeitpunkt und eingefrorener Herkunft. Beide Male entsteht
// dadurch Zeichen für Zeichen derselbe Text; ein zweites Format entsteht nicht.
// Der frühe Bau hat einen zweiten Nutzen: Ein unbrauchbarer Beleg fällt auf,
// **bevor** eine Datei ersetzt ist.
//
// **Eine Änderung ohne geändertes Feld erzeugt keinen Beleg** (AK9) und schreibt
// ihre Datei nicht. Ein Beleg mit leerer Feld-Liste behauptete eine Änderung, die
// nicht stattgefunden hat, und unterbräche die Kette der Werte mit einer
// Nulleintragung.
//
// 4T-001822 (Epic 3E-000254, B2, B3, B6 bis B8): **Nach einem Erzwingen trägt
// der Plan den Beleg der Fremd-Änderung**, vor dem gewöhnlichen Beleg desselben
// Datensatzes und unter derselben Vorgangs-Kennung. Festgestellt wird die
// Abweichung nicht hier, sondern in `record-auftrag-stand.js`; der Plan setzt sie
// allein in Belege um. Jedes Ergebnis trägt dazu den neuen Stand aller Felder,
// den der Aufrufer als nächste Erwartung führt.
'use strict';

const {
  schreibeDatensaetze,
  schreibeHochwasserstand,
  zellTexte,
} = require('../../shared/database/record-write.js');
const { naechsteKennung, nummerAus } = require('../../shared/database/record-identity.js');
const {
  ART_CREATE,
  ART_UPDATE,
  ART_DELETE,
  ART_EXTERNAL,
  anfuegeText,
  baueBeleg,
} = require('../../shared/database/change-record.js');
const {
  LAGEN,
  ART_ANLEGEN,
  ART_AENDERN,
  ART_LOESCHEN,
  befund,
  istNichtGesetzt,
  zellenAus,
} = require('./record-auftrag-pruefung.js');
const { dateiFuerKennung, kennungVorhanden } = require('./record-auftrag-bestand.js');

// Die Art des Belegs zur Art der Anweisung. Beide Vokabulare tragen dieselben
// drei Wörter; die Zuordnung steht trotzdem ausgeschrieben da, weil sie ein
// Vertrag zwischen zwei Modulen ist und kein Zufall, und ein Prüffall hält sie
// fest.
const BELEG_ART = Object.freeze({
  [ART_ANLEGEN]: ART_CREATE,
  [ART_AENDERN]: ART_UPDATE,
  [ART_LOESCHEN]: ART_DELETE,
});

// Die Zell-Texte eines gelesenen Datensatzes, über die EINE Auslegung des
// Schreibwegs: Der Trennabstand hinter dem Datensatz steht im Text seiner
// letzten Zelle und gehört nicht zu ihrem Wert (Begründung bei `zellTexte` in
// `record-write.js`). Ohne sie gälte ein unveränderter letzter Wert als geändert,
// und sein Änderungsbeleg trüge einen Zeilenumbruch, den niemand geschrieben hat.
function werteDes(record) {
  return record ? zellTexte(record) : [];
}

function zellText(texte, index) {
  return texte[index] === undefined ? '' : texte[index];
}

// 4T-001822 (Epic 3E-000254, B7): Der zuletzt gelesene Stand einer Anweisung als
// Zell-Liste in der Reihenfolge der Felder, dünn besetzt wie die Werte. Ein
// Feld, das der Aufrufer nicht genannt hat, ist leer.
function erwarteteTexte(erwartet, karte) {
  const texte = [];
  for (const [name, text] of Object.entries(erwartet || {})) {
    const treffer = karte.get(name.toLowerCase());
    if (treffer) texte[treffer.index] = text;
  }
  return texte;
}

// --- Schritt 1: Kennung vergeben und Ziel-Datei auflösen (B1, B6) -----------------------

/**
 * Bringt jede Anweisung auf ihre Kennung und ihre Ziel-Datei.
 *
 * **Die Kennung wird hier gezogen**, wenn das Anlegen keine mitbringt (B1); wer
 * vorher «Neuanlage eröffnen» gerufen hat, reicht die gezogene herein. Gezogen
 * wird unter der bereits gehaltenen Sperre der Beleg-Datei, die nach B4 auch das
 * Fortschreiben des Hochwasserstands reiht.
 *
 * @param {Array<object>} anweisungen Normalisierte Anweisungen.
 * @param {Map<string, object>} bestaende Gelesener Bestand je Tabellen-Angabe.
 * @returns {{ok: true, schritte: Array<object>, staende: Map<string, number|null>}
 *   |{ok: false, lagen: Array<object>}}
 */
function loeseSchritte(anweisungen, bestaende) {
  const lagen = [];
  const schritte = [];
  // Tabellen-Angabe -> Hochwasserstand, wie er nach diesem Auftrag gilt.
  const staende = new Map();
  // Kennungen, die dieser Auftrag selbst anlegt, je Tabelle; sie sind im
  // Bestand noch nicht zu finden und trotzdem vergeben.
  const eigene = new Map();

  for (const anweisung of anweisungen) {
    const bestand = bestaende.get(anweisung.tabelle);
    const stelle = { position: anweisung.position, tabelle: anweisung.tabelle, id: anweisung.id };
    if (!staende.has(anweisung.tabelle)) staende.set(anweisung.tabelle, bestand.lastId);

    let id = anweisung.id;
    if (anweisung.art === ART_ANLEGEN) {
      if (id === null) {
        const gezogen = naechsteKennung(staende.get(anweisung.tabelle));
        id = gezogen.kennung;
        staende.set(anweisung.tabelle, gezogen.hochwasserstand);
      }
      if (!eigene.has(anweisung.tabelle)) eigene.set(anweisung.tabelle, new Set());
      const schonVergeben = eigene.get(anweisung.tabelle);
      if (kennungVorhanden(bestand, id) || schonVergeben.has(id)) {
        lagen.push(befund(LAGEN.kennungVergeben, { ...stelle, id }));
        continue;
      }
      schonVergeben.add(id);
      // Auch eine mitgebrachte Kennung schiebt den Hochwasserstand nach oben,
      // falls sie über ihm liegt: Sonst vergäbe der nächste Auftrag sie erneut.
      const nummer = nummerAus(id);
      const stand = staende.get(anweisung.tabelle);
      if (nummer !== null && (stand === null || nummer > stand))
        staende.set(anweisung.tabelle, nummer);
      schritte.push({ anweisung, id, pfad: bestand.ziel, bestand });
      continue;
    }

    const gefunden = dateiFuerKennung(bestand, id);
    // 4T-001822 (Epic 3E-000254, B7): Der von Hand gelöschte Datensatz ist eine
    // Fremd-Änderung und keine unbekannte Kennung. Wer mit `erwartet` Werte
    // nennt, sagt damit, dass er den Datensatz gelesen hat; dass er jetzt fehlt,
    // ist dann eine Abweichung des vorgefundenen Stands, über die der Vergleich
    // urteilt. Der Schritt zeigt auf die Datei, in der ein Anlegen entstünde.
    // Ohne genannte Felder bleibt es die unbekannte Kennung, und der
    // mehrdeutige Fall bleibt ohnehin eine Lage.
    if (
      !gefunden.ok &&
      gefunden.code === LAGEN.datensatzUnbekannt &&
      Object.keys(anweisung.erwartet || {}).length > 0
    ) {
      schritte.push({ anweisung, id, pfad: bestand.ziel, bestand, fehlt: true });
      continue;
    }
    if (!gefunden.ok) {
      lagen.push(befund(gefunden.code, stelle));
      continue;
    }
    schritte.push({ anweisung, id, pfad: gefunden.pfad, bestand });
  }

  if (lagen.length > 0) return { ok: false, lagen };
  return { ok: true, schritte, staende };
}

// --- Schritt 2: die berührten Felder je Anweisung --------------------------------------

// Beim Anlegen und beim Löschen stehen ALLE Felder im Beleg, beim Ändern allein
// die tatsächlich geänderten (AK9). Gleichzeitig entstehen die Zellen, die das
// Zurückschreiben erwartet: eine dünn besetzte Liste, damit jede nicht genannte
// Zelle unangetastet stehen bleibt.
function beruehrteFelder(schritt) {
  const { anweisung, bestand } = schritt;
  const felder = bestand.fields;
  const texte = werteDes(datensatzVon(schritt));

  if (anweisung.art === ART_LOESCHEN) {
    return {
      zellen: [],
      felder: felder.map((feld, i) => ({ name: feld.name, alt: zellText(texte, i), neu: null })),
    };
  }
  if (anweisung.art === ART_ANLEGEN) {
    const zellen = zellenAus(anweisung.werte, bestand.karte);
    return {
      zellen,
      felder: felder.map((feld, i) => ({
        name: feld.name,
        alt: null,
        neu: zellen[i] === undefined ? '' : zellen[i],
      })),
    };
  }

  const zellen = [];
  const beruehrt = [];
  for (const [name, text] of Object.entries(anweisung.werte)) {
    const treffer = bestand.karte.get(name.toLowerCase());
    if (!treffer) continue; // von der Typ- und Pflicht-Prüfung bereits abgewiesen
    const alt = zellText(texte, treffer.index);
    if (alt === text) continue; // kein geändertes Feld: kein Beleg, kein Schreiben
    zellen[treffer.index] = text;
    beruehrt.push({ name: treffer.feld.name, alt, neu: text });
  }
  return { zellen, felder: beruehrt };
}

// Der gelesene Datensatz eines Schrittes, oder null beim Anlegen.
function datensatzVon(schritt) {
  const datei = schritt.bestand.dateien.find((d) => d.pfad === schritt.pfad);
  return datei ? datei.records.get(schritt.id) || null : null;
}

/**
 * Prüft die Pflicht-Angaben am RESULTIERENDEN Datensatz (Entscheidung des
 * Product Owners vom 2026-09-20, E22.8).
 *
 * **Warum erst hier und nicht vor den Sperren.** Ob ein Datensatz nach der
 * Änderung ein Pflicht-Feld leer lässt, hängt an seinen vorgefundenen Werten;
 * die kennt erst, wer ihn unter der Sperre frisch gelesen hat. Die Vor-Prüfung
 * vor den Sperren bleibt daneben bestehen, weil sie einen offensichtlich
 * ungültigen Auftrag abweist, ohne eine Sperre zu nehmen.
 *
 * **Die Asymmetrie zum Typ ist gewollt.** E22.8 verlangt die Nachpflege, sobald
 * ein regelwidrig gewordener Datensatz das nächste Mal über einen
 * Datenbank-Schreibweg geändert wird — das trifft die fehlende Pflicht-Angabe.
 * Ein vorgefundener TYP-verletzender Wert in einem Feld, das der Auftrag gar
 * nicht anfasst, wird dagegen NICHT abgewiesen: Beim Lesen bleibt die Linie
 * weich (E22.3), und wer den Wert nicht anfasst, hat ihn nicht geschrieben.
 * Abgewiesen wird allein, was der Auftrag selbst setzt.
 *
 * @param {Array<object>} schritte Ergebnis von `loeseSchritte`.
 * @returns {Array<object>} Die Befunde; leer heißt «keine Beanstandung».
 */
function pruefePflichtAmErgebnis(schritte) {
  const lagen = [];
  for (const schritt of schritte) {
    // Beim Anlegen ist der ganze Datensatz bereits vor den Sperren bekannt und
    // dort geprüft; beim Löschen gibt es kein Ergebnis zu prüfen.
    if (schritt.anweisung.art !== ART_AENDERN) continue;
    const karte = schritt.bestand.karte;
    // 4T-001822 (Epic 3E-000254, B7): Beim von Hand gelöschten Datensatz tritt
    // der zuletzt gelesene Stand an die Stelle des vorgefundenen; das ist die
    // Grundlage, auf der ein Erzwingen ihn wieder anlegt.
    const texte = schritt.fehlt
      ? erwarteteTexte(schritt.anweisung.erwartet, karte)
      : werteDes(datensatzVon(schritt));
    for (const [name, text] of Object.entries(schritt.anweisung.werte)) {
      const treffer = karte.get(name.toLowerCase());
      if (treffer) texte[treffer.index] = text;
    }
    schritt.bestand.fields.forEach((feld, i) => {
      if (feld.required !== true) return;
      if (!istNichtGesetzt(zellText(texte, i), feld.type)) return;
      lagen.push(
        befund(LAGEN.pflichtFehlt, {
          position: schritt.anweisung.position,
          tabelle: schritt.anweisung.tabelle,
          id: schritt.id,
          feld: feld.name,
        }),
      );
    });
  }
  return lagen;
}

// --- Schritt 3: der Plan ----------------------------------------------------------------

// 4T-001822 (Epic 3E-000254, B8): Der Stand aller Felder nach der Anweisung,
// Feld-Name auf Zell-Text. Unverändert gelassene Felder tragen ihren
// vorgefundenen Text, auch wenn die Anweisung gar nichts ändert.
//
// **Hier hängt die Zusage «genau ein Fremd-Beleg»:** Der Aufrufer führt diesen
// Stand als nächste Erwartung. Stünde hier der alte Text statt des neuen,
// wiche jeder folgende Schreibvorgang desselben Aufrufers ab, und ein
// wiederholtes Erzwingen erzeugte bei jedem Speichern einen neuen Fremd-Beleg.
function standNach(felder, texte, zellen) {
  const stand = {};
  felder.forEach((feld, i) => {
    stand[feld.name] = zellen[i] !== undefined ? zellen[i] : zellText(texte, i);
  });
  return stand;
}

// 4T-001822 (Epic 3E-000254, B6): Der Fremd-Beleg führt je abweichendem Feld vom
// erwarteten zum vorgefundenen Wert. Damit schließt die Kette: Der letzte eigene
// Beleg endet beim erwarteten Wert, dieser führt zum vorgefundenen, und der
// gewöhnliche Beleg danach misst seinen alten Wert am vorgefundenen.
function fremdBelegVon(abweichung) {
  return {
    art: ART_EXTERNAL,
    felder: abweichung.felder.map((feld) => ({
      name: feld.name,
      alt: feld.erwartet,
      neu: feld.vorgefunden,
    })),
  };
}

// 4T-001822 (Epic 3E-000254, B7): Der von Hand gelöschte Datensatz, erzwungen.
// Ein Löschen schreibt nichts mehr; allein der Fremd-Beleg entsteht, und die
// Kette endet sichtbar bei «von Hand entfernt». Ein Ändern legt den Datensatz
// unter seiner Kennung neu an, mit dem zuletzt gelesenen Stand als Grundlage und
// den Werten der Anweisung darüber. Der Hochwasserstand bleibt, wie er ist: Die
// Kennung lag bereits darunter.
function planeWiederanlage(schritt, belege) {
  const { anweisung, bestand } = schritt;
  if (anweisung.art === ART_LOESCHEN) return { operation: null, belege, felder: [], stand: null };
  const texte = erwarteteTexte(anweisung.erwartet, bestand.karte);
  for (const [name, text] of Object.entries(anweisung.werte)) {
    const treffer = bestand.karte.get(name.toLowerCase());
    if (treffer) texte[treffer.index] = text;
  }
  const zellen = bestand.fields.map((_feld, i) => zellText(texte, i));
  const felder = bestand.fields.map((feld, i) => ({ name: feld.name, alt: null, neu: zellen[i] }));
  belege.push({ art: ART_CREATE, felder });
  return {
    operation: { art: ART_ANLEGEN, id: schritt.id, zellen },
    belege,
    felder: felder.map((feld) => feld.name),
    stand: standNach(bestand.fields, [], zellen),
  };
}

// Was ein Schritt zum Plan beiträgt: die Operation an seiner Datei (oder keine),
// seine Belege in ihrer Reihenfolge, die Namen der eigenen berührten Felder und
// der Stand danach.
function planeSchritt(schritt, abweichung) {
  const { anweisung, bestand } = schritt;
  const belege = abweichung === null ? [] : [fremdBelegVon(abweichung)];
  if (schritt.fehlt) return planeWiederanlage(schritt, belege);

  const { zellen, felder } = beruehrteFelder(schritt);
  const stand =
    anweisung.art === ART_LOESCHEN
      ? null
      : standNach(bestand.fields, werteDes(datensatzVon(schritt)), zellen);
  // Eine Änderung ohne geändertes Feld: kein Beleg der Änderung, kein Schreiben
  // (AK9). Nach einem Erzwingen ist der Fremd-Beleg trotzdem fällig, denn die
  // Abweichung ist festgestellt, auch wenn die eigene Fassung der vorgefundenen
  // gleicht (4T-001822).
  if (anweisung.art === ART_AENDERN && felder.length === 0)
    return { operation: null, belege, felder: [], stand };
  belege.push({ art: BELEG_ART[anweisung.art], felder });
  return {
    operation: { art: anweisung.art, id: schritt.id, zellen },
    belege,
    felder: felder.map((feld) => feld.name),
    stand,
  };
}

function planFehler(code, mehr) {
  return { ok: false, lagen: [befund(code, mehr)] };
}

// Der neue Text einer Datei: Datensatz-Zeilen ersetzen, den Hochwasserstand
// fortschreiben, oder beides. Der Hochwasserstand steht allein in der
// Kopf-Datei; ein Folge-Segment trägt die Definition nicht (E26.3).
function neuerText(datei, felder, operationen, stand) {
  if (operationen.length === 0) {
    if (stand === null) return null;
    return schreibeHochwasserstand(datei.text, stand);
  }
  const optionen = stand === null ? undefined : { lastId: stand };
  return schreibeDatensaetze(datei.text, felder, operationen, optionen);
}

/**
 * Bildet den Schreib-Plan eines Auftrags.
 *
 * @param {object} p Parameter.
 * @param {Array<object>} p.schritte Ergebnis von `loeseSchritte`.
 * @param {Map<string, number|null>} p.staende Hochwasserstand je Tabelle danach.
 * @param {Map<string, object>} p.bestaende Gelesener Bestand je Tabellen-Angabe.
 * @param {number} p.vorgang Die eine Vorgangs-Kennung des Auftrags (E11.5).
 * @param {string} p.zeitpunkt Eingefrorener Zeitpunkt aller Belege.
 * @param {object} p.herkunft Eingefrorene Herkunft in der Form von `herkunftsFelder`.
 * @param {Map<object, object>} [p.abweichungen] Je erzwungenem Schritt die
 *   festgestellte Abweichung aus `pruefeStaende` (4T-001822); daraus entsteht
 *   der Beleg der Fremd-Änderung.
 * @returns {{ok: true, plan: object}|{ok: false, lagen: Array<object>}}
 */
function baueSchreibPlan({
  schritte,
  staende,
  bestaende,
  vorgang,
  zeitpunkt,
  herkunft,
  abweichungen,
}) {
  // Datei-Pfad -> gesammelte Operationen; die Reihenfolge der Dateien folgt der
  // Reihenfolge ihres ersten Auftretens im Auftrag und ist damit vorhersagbar.
  const jeDatei = new Map();
  const belege = [];
  const ergebnisse = [];

  // 4T-001822: Ohne Vergleich (etwa im Prüffall, der den Plan allein baut) gibt
  // es keine Abweichung und damit keinen Fremd-Beleg.
  const abweichungenJeSchritt = abweichungen instanceof Map ? abweichungen : new Map();

  for (const schritt of schritte) {
    const { anweisung, bestand } = schritt;
    const stelle = { position: anweisung.position, tabelle: anweisung.tabelle, id: schritt.id };
    const abweichung = abweichungenJeSchritt.get(schritt) || null;
    const geplant = planeSchritt(schritt, abweichung);

    // Eine Änderung ohne geändertes Feld schreibt keine Datei (AK9); sie steht
    // trotzdem mit ihrem Ergebnis im Plan, und nach einem Erzwingen mit ihrem
    // Fremd-Beleg (4T-001822).
    if (geplant.operation !== null) {
      if (!jeDatei.has(schritt.pfad)) {
        const datei = bestand.dateien.find((d) => d.pfad === schritt.pfad);
        jeDatei.set(schritt.pfad, { datei, bestand, operationen: [] });
      }
      jeDatei.get(schritt.pfad).operationen.push(geplant.operation);
    }

    // 4T-001822 (B6): Die Reihenfolge der Belege ist die des Plans, und der
    // Fremd-Beleg steht darin vor dem gewöhnlichen; `fuehreSchreibPlanAus`
    // fügt sie in genau dieser Reihenfolge an.
    for (const eintrag of geplant.belege) {
      const angaben = { art: eintrag.art, id: schritt.id, vorgang, felder: eintrag.felder };
      let text;
      try {
        text = anfuegeText(baueBeleg({ ...angaben, zeitpunkt, herkunft }));
      } catch (err) {
        return planFehler(LAGEN.belegFehlgeschlagen, {
          ...stelle,
          grund: err && err.message ? err.message : String(err),
        });
      }
      belege.push({ tabellenPfad: bestand.pfad, tabelle: anweisung.tabelle, angaben, text });
    }

    ergebnisse.push({
      ...stelle,
      art: anweisung.art,
      geaendert: geplant.operation !== null,
      beleg: geplant.belege.length > 0,
      // 4T-001822 (B8): ob ein Beleg der Fremd-Änderung entstanden ist, und der
      // neue Stand aller Felder, den der Aufrufer als nächste Erwartung führt.
      fremdBeleg: abweichung !== null,
      felder: geplant.felder,
      stand: geplant.stand,
    });
  }

  // Der Hochwasserstand gehört der Kopf-Datei. Sie steht deshalb auch dann im
  // Plan, wenn der neue Datensatz in einem Folge-Segment entsteht.
  for (const [tabelle, bestand] of bestaende) {
    const stand = staende.has(tabelle) ? staende.get(tabelle) : null;
    if (stand === null || stand === bestand.lastId) continue;
    if (jeDatei.has(bestand.pfad)) continue;
    jeDatei.set(bestand.pfad, { datei: bestand.dateien[0], bestand, operationen: [] });
  }

  const dateien = [];
  for (const [pfad, eintrag] of jeDatei) {
    const { datei, bestand, operationen } = eintrag;
    const stand = staende.get(bestand.tabelle);
    const fortschreiben = datei.kopf && stand !== null && stand !== bestand.lastId ? stand : null;
    const gebaut = neuerText(datei, bestand.fields, operationen, fortschreiben);
    if (gebaut === null) continue;
    if (!gebaut.ok)
      return planFehler(LAGEN.schreibenFehlgeschlagen, {
        tabelle: bestand.tabelle,
        datei: pfad,
        grund: gebaut.code,
      });
    // Ein Text, der sich nicht geändert hat, wird nicht geschrieben: Das spart
    // eine Ersetzung und hält den Datei-Beobachter des Bereichs ruhig.
    if (gebaut.text === datei.text) continue;
    dateien.push({ pfad, tabelle: bestand.tabelle, gelesen: datei.text, neu: gebaut.text });
  }

  return { ok: true, plan: { dateien, belege, ergebnisse } };
}

module.exports = {
  BELEG_ART,
  // 4T-001822: Die eine Auslegung eines gelesenen Datensatzes, geteilt mit dem
  // Vergleich in `record-auftrag-stand.js`. Eine zweite dort wäre die Stelle, an
  // der ein unveränderter Wert als abweichend gälte.
  werteDes,
  zellText,
  datensatzVon,
  // 4T-001932: der zuletzt gelesene Stand als Zell-Liste, geteilt mit den
  // Regel-Modulen, die einen von Hand gelöschten Datensatz beurteilen.
  erwarteteTexte,
  loeseSchritte,
  beruehrteFelder,
  pruefePflichtAmErgebnis,
  baueSchreibPlan,
};
