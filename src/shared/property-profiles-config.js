// 4T-001159 (Epic 3E-000219, E13): Bereichs-Konfiguration der Eigenschafts-Profile
// — die `propertyProfiles`-Sektion der Bereichsdatei.
//
// Eigene Datei seit der Zuordnung über Schlagwort und Ordner: Bis dahin war
// die Sektion drei Zeilen im Format-Modul; mit den Bindungen wird sie eine
// eigene Fachlichkeit mit eigener Normalisierung. Der Schnitt war in 4T-001155
// bereits als die zweite tragfähige Naht benannt — hier liegt, was den
// BEREICH konfiguriert, im Format-Modul, was eine Profil-DATEI liest.
//
// Sektion (Area_Settings.mdda; Sektions-Muster mit Fehler-Isolation,
// Vorbilder templates-/journals-Sektion):
//   propertyProfiles:
//     folder          Profil-Ordner relativ zur Bereichs-Wurzel
//     assignField     Zuordnungs-Feldname im Frontmatter (Default 'class')
//     defaultProfile  Profil-Name des Standard-Profils oder null
//     bindings        optional (4T-001159): Liste der zusätzlichen
//                     Zuordnungs-Wege, je Eintrag { profile, tags, folders }
//
// **Warum die Bindungen hier stehen und nicht in der Profil-Datei.** Der
// Struktur-Prüfschritt der Konzept-Stufe hat es festgelegt (Kapitel 6.17):
// Die zusätzlichen Zuordnungs-Wege sind Angaben der Bereichsdatei und
// gehören in den bestehenden Einstellungs-Bereich. Das hält sie an einem
// Ort — wer wissen will, warum ein Dokument seine Felder hat, sieht in EINE
// Konfiguration statt in jede Profil-Datei des Ordners.
//
// **Rückwärts-Verträglichkeit:** `bindings` erscheint nur dann am
// normalisierten Objekt, wenn die Sektion es trägt. Eine Bereichsdatei ohne
// Bindungen liefert exakt dasselbe Objekt wie vor der Erweiterung und wird
// beim Schreiben nicht um eine leere Liste ergänzt.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

// Default des Zuordnungs-Feldnamens (belegtes Nutzungs-Muster des PO,
// Referenz-Analyse Metadata_Menu.md §4: Alias `Class`).
const DEFAULT_ASSIGN_FIELD = 'class';

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Text-Liste einer Bindungs-Angabe: Skalar oder Liste, getrimmt, ohne Leere
// und Doppelte. Tolerant wie die Werte-Listen — ein defekter Eintrag entfällt
// still, statt die ganze Bindung auszusetzen.
function textListe(value) {
  const roh = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const out = [];
  for (const eintrag of roh) {
    const s = cleanString(eintrag);
    if (s === '' || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

// Ordner-Pfad einer Bindung normalisieren: Trenner auf '/', ohne führenden
// und abschließenden Trenner. Der Vergleich selbst läuft bei der Auflösung
// case-insensitiv; die Schreibweise bleibt hier erhalten, damit der
// Einstellungs-Bereich zeigt, was jemand eingegeben hat.
function ordnerPfad(s) {
  return s.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

// Bindungs-Liste normalisieren. Ein Eintrag ohne Profil-Namen oder ohne
// verwertbare Bindung entfällt still (Fehler-Isolation je Eintrag, dasselbe
// Muster wie bei den Feld-Definitionen); eine defekte Liste ergibt eine leere.
// Ein Eintrag darf beide Bindungs-Arten tragen und wirkt dann in beiden
// Stufen der Auflösungs-Folge.
function normalizeBindings(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const eintrag of value) {
    if (!eintrag || typeof eintrag !== 'object' || Array.isArray(eintrag)) continue;
    const profile = cleanString(eintrag.profile);
    if (profile === '') continue;
    const tags = textListe(eintrag.tags)
      .map((t) => t.replace(/^#/, ''))
      .filter((t) => t !== '');
    const folders = textListe(eintrag.folders)
      .map(ordnerPfad)
      .filter((f) => f !== '');
    if (tags.length === 0 && folders.length === 0) continue;
    out.push({ profile, tags, folders });
  }
  return out;
}

// Normalisiert die propertyProfiles-Sektion auf { folder, assignField,
// defaultProfile } — plus `bindings`, wenn die Sektion welche trägt. Tolerant:
// defekte oder fehlende Teile fallen auf null bzw. den Default, nie auf einen
// Wurf. null = keine Konfiguration.
function normalizeProfilesConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const folder = cleanString(value.folder) || null;
  const assignRaw = cleanString(value.assignField);
  const defaultProfile = cleanString(value.defaultProfile) || null;
  const bindings = normalizeBindings(value.bindings);
  if (folder === null && assignRaw === '' && defaultProfile === null && bindings.length === 0) {
    return null;
  }
  const out = { folder, assignField: assignRaw || DEFAULT_ASSIGN_FIELD, defaultProfile };
  // Nur führen, wenn vorhanden: sonst schriebe der Einstellungs-Bereich eine
  // leere Liste in jede Bereichsdatei, die er anfasst.
  if (bindings.length > 0) out.bindings = bindings;
  return out;
}

module.exports = { DEFAULT_ASSIGN_FIELD, normalizeProfilesConfig, normalizeBindings };
