// 4T-000624 (Epic 3E-000119): Datenmodell der benannten Sidebar-Varianten.
//
// Reine Struktur-Sanitisierung ohne DOM- und ohne Electron-Abhängigkeit
// (CJS, Muster src/shared/color-schemes.js), gemeinsam für den Renderer
// (globale Liste im Einstellungs-Store, Key `sidebar.layoutVariants`) und
// den Main (Bereichs-Varianten in der mdda-Sektion, 4T-000625).
//
// Eine Variante ist ein benannter Snapshot der Sidebar-Anordnung:
//   { id, name, layout, visibility }
//   layout      Layout-Modell aus sidebar-layout.js ({ left, right } mit
//               Slots { panels: [panelId], active: panelId }).
//   visibility  Roh-Sichtbarkeit je Panel und Spalte:
//               { [panelId]: [bool, bool] } (Spalte 0, Spalte 1).
//
// Bewusst OHNE Panel-Wissen: unbekannte Panel-IDs bleiben hier erhalten,
// damit Varianten Panel-Zu- und -Abgänge überleben. Beim Anwenden
// normalisiert der Renderer gegen die aktuelle Panel-Menge
// (normalizeSidebarLayout, Architekturentscheidung 1 des Epics).
'use strict';

const VARIANT_SIDES = ['left', 'right'];

// Layout strukturell säubern: nur String-Panel-IDs, keine Duplikate über
// das Gesamtlayout, keine leeren Slots; ungültiges `active` fällt auf das
// erste Panel des Slots zurück. Liefert immer { left: [], right: [] }.
function sanitizeVariantLayout(raw) {
  const seen = new Set();
  const result = { left: [], right: [] };
  for (const side of VARIANT_SIDES) {
    const slots = raw && typeof raw === 'object' && Array.isArray(raw[side]) ? raw[side] : [];
    for (const slot of slots) {
      const panels = slot && Array.isArray(slot.panels) ? slot.panels : [];
      const cleaned = [];
      for (const id of panels) {
        if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
        seen.add(id);
        cleaned.push(id);
      }
      if (cleaned.length === 0) continue;
      const active = slot && cleaned.includes(slot.active) ? slot.active : cleaned[0];
      result[side].push({ panels: cleaned, active });
    }
  }
  return result;
}

// Sichtbarkeits-Objekt säubern: je Panel-ID ein Array aus maximal zwei
// booleschen Spalten-Werten; alles andere entfällt.
function sanitizeVariantVisibility(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [id, value] of Object.entries(raw)) {
    if (typeof id !== 'string' || id === '' || !Array.isArray(value)) continue;
    result[id] = value.slice(0, 2).map((v) => !!v);
  }
  return result;
}

// Eine Variante säubern; ohne gültige ID oder ohne nicht-leeren Namen null.
function sanitizeSidebarVariant(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (id === '' || name === '') return null;
  return {
    id,
    name,
    layout: sanitizeVariantLayout(raw.layout),
    visibility: sanitizeVariantVisibility(raw.visibility),
  };
}

// Varianten-Liste säubern: ungültige Einträge entfallen, doppelte IDs
// reduziert auf das erste Vorkommen (Muster normalizeState der Farbschemas).
function normalizeSidebarVariantList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const result = [];
  for (const entry of raw) {
    const variant = sanitizeSidebarVariant(entry);
    if (!variant || seen.has(variant.id)) continue;
    seen.add(variant.id);
    result.push(variant);
  }
  return result;
}

module.exports = {
  sanitizeVariantLayout,
  sanitizeVariantVisibility,
  sanitizeSidebarVariant,
  normalizeSidebarVariantList,
};
