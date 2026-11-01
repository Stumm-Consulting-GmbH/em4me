// 4T-002361 (Epic 3E-000371): Unbekannte Inhalte der Kalender-Sektion beim
// Schreiben durchreichen statt verwerfen.
//
// Die Oberfläche bekommt die Sektion nur in normalisierter Form; was diese
// Programmfassung nicht kennt (eine Beziehungs-Art oder Jahres-Struktur einer
// neueren Fassung, ein Feld einer neueren Fassung, eine fehlerhafte
// Definition), sieht sie nie und kann es deshalb auch nicht weglassen wollen.
// Der Schreiber legt bisher trotzdem allein ihre Form ab; im Mehr-Rechner-
// Betrieb löscht eine ältere Fassung so still, was eine neuere angelegt hat.
// Dieses Modul führt deshalb den alten Roh-Stand der Sektion mit dem neuen
// Stand der Oberfläche zusammen. Die Regel:
//   - Ein Block oder eine Zeitrechnung, deren Kennung die Normalisierung des
//     alten Stands nicht kennt, ist verborgen und bleibt unverändert und an
//     ihrer Stelle stehen.
//   - Ein Feld des alten Stands, das weder in seiner normalisierten Form noch
//     im neuen Stand steht, bleibt erhalten (Sektion, Block, Zeitrechnung,
//     Ebene, Beziehung gleichen Typs, Zyklus, Gruppierung).
//   - Gelöscht wird nur, was die Oberfläche kannte und weglässt; ein
//     gelöschter Block nimmt seine verborgenen Zeitrechnungen mit.
// Vorbild ist das Überleben unbekannter Sektionen der Bereichsdatei
// (area-config.js, writeAreaCalendarConfig), hier eine Ebene tiefer.
//
// Import-Richtung: Dieses Blatt lädt calendar-config.js, nie umgekehrt; es
// wird allein vom Hauptprozess geladen (Schreiber und Lese-Handler).
'use strict';

const { normalizeCalendarConfig } = require('./calendar-config.js');

function istObjekt(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Kennung wie in der Normalisierung (cleanString): nur ein Text zählt.
function kennung(v) {
  return istObjekt(v) && typeof v.id === 'string' ? v.id.trim() : '';
}

// Gleiche Art: Eine Ableitung bleibt eine Ableitung, eine Beziehung ihr Typ.
// Ein Feld einer anderen Art gehört nicht an den neuen Eintrag.
function gleicheArt(neu, alt) {
  if ((neu.derivedFrom != null) !== (alt.derivedFrom != null)) return false;
  return !('type' in neu && 'type' in alt) || neu.type === alt.type;
}

// Ergänzt neu um die Felder des alten Roh-Stands, die dessen normalisierte
// Form nicht trägt und die der neue Stand nicht setzt; verschachtelte Objekte
// gleicher Art und Listen mit Kennungen werden ebenso abgeglichen.
function felderErgaenzen(neu, altRoh, altNorm) {
  if (Array.isArray(neu)) return listeErgaenzen(neu, altRoh, altNorm);
  if (!istObjekt(neu) || !istObjekt(altRoh) || !istObjekt(altNorm)) return neu;
  if (!gleicheArt(neu, altRoh)) return neu;
  const out = { ...neu };
  for (const [k, wert] of Object.entries(altRoh)) {
    if (k === '__proto__') continue;
    if (Object.hasOwn(out, k)) out[k] = felderErgaenzen(out[k], wert, altNorm[k]);
    else if (!Object.hasOwn(altNorm, k)) out[k] = wert;
  }
  return out;
}

// Listen-Einträge über ihre Kennung zuordnen (der erste Roh-Eintrag zählt,
// wie in der Normalisierung); Einträge ohne Kennung bleiben, wie sie sind.
function listeErgaenzen(neu, altRoh, altNorm) {
  if (!Array.isArray(altRoh) || !Array.isArray(altNorm)) return neu;
  return neu.map((eintrag) => {
    const id = kennung(eintrag);
    if (id === '') return eintrag;
    const roh = altRoh.find((x) => kennung(x) === id);
    return felderErgaenzen(
      eintrag,
      roh,
      altNorm.find((x) => kennung(x) === id),
    );
  });
}

// Reiht die verborgenen Roh-Einträge in die neue Liste ein: hinter den
// nächsten vorangehenden Roh-Eintrag, den es in der neuen Liste noch gibt,
// sonst an den Anfang. Ihre Reihenfolge untereinander bleibt.
function einreihen(neuListe, rohListe, istVerborgen) {
  const neuIds = new Set(neuListe.map(kennung));
  const vorne = [];
  const hinter = new Map();
  let anker = null;
  for (const roh of rohListe) {
    if (istVerborgen(roh)) {
      if (anker === null) vorne.push(roh);
      else hinter.get(anker).push(roh);
    } else if (neuIds.has(kennung(roh)) && !hinter.has(kennung(roh))) {
      anker = kennung(roh);
      hinter.set(anker, []);
    }
  }
  const out = vorne.slice();
  for (const eintrag of neuListe) {
    out.push(eintrag);
    const folgende = hinter.get(kennung(eintrag));
    if (folgende) out.push(...folgende);
    hinter.delete(kennung(eintrag));
  }
  return out;
}

// Abzulegende Sektion: der neue Stand (Ablage-Form aus configForPersist oder
// null), ergänzt um alles aus dem alten Roh-Stand, was die Normalisierung
// nicht kennt. null, wenn danach nichts abzulegen ist. normalisiere ist
// austauschbar, damit ein Prüffall eine ältere Fassung nachstellen kann.
function unbekannteDurchreichen(altRoh, neu, normalisiere = normalizeCalendarConfig) {
  if (!istObjekt(altRoh)) return neu;
  const altNorm = normalisiere(altRoh) || { blocks: [] };
  const out = felderErgaenzen(istObjekt(neu) ? neu : { blocks: [] }, altRoh, altNorm);
  const rohBloecke = Array.isArray(altRoh.blocks) ? altRoh.blocks : [];
  const bloecke = (Array.isArray(out.blocks) ? out.blocks : []).map((block) => {
    const normBlock = altNorm.blocks.find((b) => b.id === kennung(block));
    const rohBlock = normBlock ? rohBloecke.find((b) => kennung(b) === normBlock.id) : null;
    if (!rohBlock || !Array.isArray(rohBlock.calendars)) return block;
    const bekannt = new Set(normBlock.calendars.map((c) => c.id));
    const neuKal = Array.isArray(block.calendars) ? block.calendars : [];
    const verborgen = (c) => istObjekt(c) && !bekannt.has(kennung(c));
    return { ...block, calendars: einreihen(neuKal, rohBlock.calendars, verborgen) };
  });
  const bekannteBloecke = new Set(altNorm.blocks.map((b) => b.id));
  out.blocks = einreihen(
    bloecke,
    rohBloecke,
    (b) => istObjekt(b) && !bekannteBloecke.has(kennung(b)),
  );
  if (out.blocks.length === 0 && Object.keys(out).length === 1) return null;
  return out;
}

// Was diese Fassung im Roh-Stand nicht darstellt: die Zahl der verborgenen
// Zeitrechnungen (jede eines verborgenen Blocks und jede verborgene eines
// bekannten Blocks, nur Einträge in Objekt-Form) und ihre Kennungen, damit
// die Oberfläche keine neue Kennung vergibt, die schon belegt ist.
function verborgeneEintraege(altRoh, normalisiere = normalizeCalendarConfig) {
  const ergebnis = { anzahl: 0, bloecke: [], kalender: {} };
  if (!istObjekt(altRoh) || !Array.isArray(altRoh.blocks)) return ergebnis;
  const altNorm = normalisiere(altRoh) || { blocks: [] };
  const kalenderListe = (b) => (Array.isArray(b.calendars) ? b.calendars.filter(istObjekt) : []);
  for (const rohBlock of altRoh.blocks.filter(istObjekt)) {
    const normBlock = altNorm.blocks.find((b) => b.id === kennung(rohBlock));
    if (!normBlock) {
      if (kennung(rohBlock) !== '') ergebnis.bloecke.push(kennung(rohBlock));
      ergebnis.anzahl += kalenderListe(rohBlock).length;
      continue;
    }
    if (rohBlock !== altRoh.blocks.find((b) => kennung(b) === normBlock.id)) continue;
    const bekannt = new Set(normBlock.calendars.map((c) => c.id));
    const verborgen = kalenderListe(rohBlock).filter((c) => !bekannt.has(kennung(c)));
    ergebnis.anzahl += verborgen.length;
    const ids = verborgen.map(kennung).filter((id) => id !== '');
    if (ids.length > 0) ergebnis.kalender[normBlock.id] = ids;
  }
  return ergebnis;
}

module.exports = { unbekannteDurchreichen, verborgeneEintraege };
