// 4T-001509 (Epic 3E-000250, Baustein T1 und E21.4): Unit-Tests des
// Steckbriefs der Datenbank — die vier Angaben, beide Beschriftungs-Formen,
// der abgeleitete Vorgabewert der Rückfall-Sprache und das Verhalten bei jeder
// einzeln fehlenden Angabe.
//
// Die Angaben laufen direkt gegen ihr Modul: Der Steckbrief steht in einem
// eigenen Dokument und nicht im Definitions-Behälter, und beide Parser sehen
// einander nicht.
import { describe, it, expect } from 'vitest';
import {
  DB_DATABASE_KEY,
  DB_INFO_KEYS,
  DB_LABEL_KEYS,
  istSteckbriefDokument,
  parseSteckbrief,
  wirksameRueckfallSprache,
} from '../../src/shared/database/database-steckbrief.js';
// 4T-001758 (Epic 3E-000253): die Auflösung einer Beschriftung in der Sprache
// des Anwenders, erster Verbraucher ist der Einstellungs-Bereich «Datenbank».
import { loeseBeschriftung } from '../../src/shared/database/beschriftung.js';
import { HINWEIS_META } from '../../src/shared/database/table-hinweise.js';
import {
  DB_TABLE_KEY,
  parseTableDefinition,
  istTabellenDokument,
} from '../../src/shared/database/table-definition.js';

// Frontmatter-Objekt eines Steckbrief-Dokuments.
function steckbrief(behaelter) {
  return { [DB_DATABASE_KEY]: behaelter };
}

function lies(behaelter) {
  return parseSteckbrief(steckbrief(behaelter));
}

// Die Codes der Hinweise eines Ergebnisses, in Lese-Reihenfolge.
function codes(ergebnis) {
  return ergebnis.hints.map((hinweis) => hinweis.code);
}

const VOLLSTAENDIG = {
  name: 'Mini-CRM',
  description: 'Firmen, Personen und Verkaufschancen',
  schemaVersion: '1.2.0',
  fallbackLocale: 'de',
};

describe('Steckbrief: der Behälter (AK2)', () => {
  it('weist eine Datei über den Frontmatter-Behälter als Steckbrief aus', () => {
    expect(istSteckbriefDokument(steckbrief(VOLLSTAENDIG))).toBe(true);
    expect(istSteckbriefDokument({ title: 'Notiz' })).toBe(false);
    expect(istSteckbriefDokument(null)).toBe(false);
  });

  it('liest die vier Angaben', () => {
    const ergebnis = lies(VOLLSTAENDIG);
    expect(ergebnis.istSteckbrief).toBe(true);
    expect(ergebnis.hints).toEqual([]);
    expect(ergebnis.name).toBe('Mini-CRM');
    expect(ergebnis.description).toBe('Firmen, Personen und Verkaufschancen');
    expect(ergebnis.schemaVersion).toBe('1.2.0');
    expect(ergebnis.fallbackLocale).toBe('de');
  });

  it('führt genau die vier Angaben und keine fünfte', () => {
    expect(DB_INFO_KEYS).toEqual(['name', 'description', 'schemaVersion', 'fallbackLocale']);
  });

  it('nimmt einen leeren Behälter als Datenbank ohne Beschreibung hin', () => {
    // Der Zustand unmittelbar nach dem Anlegen ist kein Fehler.
    const ergebnis = lies(null);
    expect(ergebnis.istSteckbrief).toBe(true);
    expect(ergebnis.hints).toEqual([]);
    expect(ergebnis.name).toBeUndefined();
  });

  it('meldet einen Behälter, der kein Objekt ist, und bleibt ein Steckbrief', () => {
    // Ein defekter Steckbrief ist ein Steckbrief mit einem Fehler und nicht
    // plötzlich ein gewöhnliches Dokument.
    const ergebnis = lies('Mini-CRM');
    expect(ergebnis.istSteckbrief).toBe(true);
    expect(codes(ergebnis)).toEqual(['databaseContainer']);
  });

  it('lässt Angaben späterer Stufen unangetastet und hinweisfrei', () => {
    // Ausdrücklich der Hochwasserstand der Vorgangs-Kennung aus E10.5: Eine
    // Datei, die für eine spätere Stufe geschrieben wurde, richtet heute
    // keinen Schaden an.
    const ergebnis = lies({ ...VOLLSTAENDIG, lastTransaction: 4711 });
    expect(ergebnis.hints).toEqual([]);
    expect(ergebnis.lastTransaction).toBeUndefined();
  });
});

describe('Steckbrief: Beschriftungen in beiden Formen (AK3)', () => {
  it('nimmt Name und Beschreibung als einfachen Text', () => {
    const ergebnis = lies({ name: 'Mini-CRM', description: 'Kundenpflege' });
    expect(ergebnis.name).toBe('Mini-CRM');
    expect(ergebnis.description).toBe('Kundenpflege');
  });

  it('nimmt Name und Beschreibung als Sprach-Zuordnung', () => {
    const ergebnis = lies({
      name: { de: 'Kundenpflege', en: 'Customer care' },
      description: { de: 'Firmen und Personen' },
    });
    expect(ergebnis.name).toEqual({ de: 'Kundenpflege', en: 'Customer care' });
    expect(ergebnis.description).toEqual({ de: 'Firmen und Personen' });
  });

  it('führt Sprach-Kennungen kleingeschrieben', () => {
    // `DE` und `de` sind dieselbe Sprache.
    expect(lies({ name: { DE: 'Kundenpflege' } }).name).toEqual({ de: 'Kundenpflege' });
  });

  it('setzt eine defekte Zuordnung ganz aus statt halb zu zeigen', () => {
    // Dieselbe Regel wie bei der Beschriftung eines Feldes: Eine halbe
    // Zuordnung ließe einzelne Sprachen still verschwinden.
    const ergebnis = lies({ name: { de: 'Kundenpflege', en: 42 } });
    expect(codes(ergebnis)).toEqual(['databaseName']);
    expect(ergebnis.name).toBeUndefined();
  });

  it('nennt die beiden übersetzbaren Angaben', () => {
    expect(DB_LABEL_KEYS).toEqual(['name', 'description']);
  });
});

describe('Steckbrief: Rückfall-Sprache und ihr Vorgabewert (AK4)', () => {
  it('nimmt die ausdrücklich benannte Rückfall-Sprache', () => {
    expect(wirksameRueckfallSprache(lies({ ...VOLLSTAENDIG, fallbackLocale: 'ES' }))).toBe('es');
  });

  it('leitet sie sonst aus der ersten geschriebenen Beschriftung ab', () => {
    // E21.4: Der Vorgabewert ist die Sprache der ersten geschriebenen
    // Beschriftung — nicht Englisch, anders als der Rückfall der Anwendung.
    const ergebnis = lies({ name: { es: 'Clientes', en: 'Customers' } });
    expect(wirksameRueckfallSprache(ergebnis)).toBe('es');
  });

  it('zieht die Beschreibung heran, wenn der Name keine Sprache nennt', () => {
    const ergebnis = lies({ name: 'Mini-CRM', description: { fr: 'Clients' } });
    expect(wirksameRueckfallSprache(ergebnis)).toBe('fr');
  });

  it('greift auf durchgereichte Beschriftungen zu, wenn der Steckbrief schweigt', () => {
    // Die Beschriftungen der Tabellen kennt dieses Modul nicht; wer über die
    // ganze Datenbank blickt, reicht sie nach.
    const ergebnis = lies({ name: 'Mini-CRM' });
    expect(wirksameRueckfallSprache(ergebnis, [{ it: 'Aziende' }])).toBe('it');
  });

  it('liefert nichts, wenn keine Beschriftung eine Sprache nennt', () => {
    // Dann greifen die weiteren Stufen der Rückfall-Kette, die zur Auflösung
    // gehören und nicht zum Steckbrief.
    expect(wirksameRueckfallSprache(lies({ name: 'Mini-CRM' }))).toBeNull();
    expect(wirksameRueckfallSprache(lies(null))).toBeNull();
  });

  it('meldet eine Rückfall-Sprache, die keine Kennung ist', () => {
    const ergebnis = lies({ fallbackLocale: 42 });
    expect(codes(ergebnis)).toEqual(['fallbackLocale']);
    expect(ergebnis.fallbackLocale).toBeUndefined();
  });
});

// 4T-001758 (Epic 3E-000253): Die Rückfall-Kette aus E21.4, angewandt auf eine
// einzelne Beschriftung. Sie entstand mit dem Einstellungs-Bereich, der Name
// und Beschreibung der Datenbank zeigt, und ist dessen erster Verbraucher.
describe('Beschriftung: Auflösung in der Sprache des Anwenders', () => {
  it('gibt einen einfachen Text unverändert zurück', () => {
    // Ein Text nennt keine Sprache und gilt in jeder.
    expect(loeseBeschriftung('Mini-CRM', 'de')).toBe('Mini-CRM');
    expect(loeseBeschriftung('Mini-CRM', null, null)).toBe('Mini-CRM');
  });

  it('nimmt die aktive Sprache, wenn die Zuordnung sie führt', () => {
    const zuordnung = { de: 'Kunden', en: 'Customers', es: 'Clientes' };
    expect(loeseBeschriftung(zuordnung, 'es', 'de')).toBe('Clientes');
    expect(loeseBeschriftung(zuordnung, 'DE')).toBe('Kunden');
  });

  it('nimmt sonst die Rückfall-Sprache der Datenbank', () => {
    const zuordnung = { de: 'Kunden', en: 'Customers' };
    expect(loeseBeschriftung(zuordnung, 'it', 'de')).toBe('Kunden');
  });

  it('nimmt zuletzt die erste geschriebene Fassung', () => {
    // Stufe 3: Der Autor hat auf Spanisch angefangen, und weder die aktive
    // noch die Rückfall-Sprache ist gepflegt.
    const zuordnung = { es: 'Clientes', fr: 'Clients' };
    expect(loeseBeschriftung(zuordnung, 'it', 'de')).toBe('Clientes');
  });

  it('liefert null, wo nichts aufzulösen ist', () => {
    // Der letzte Schritt der Kette ist der technische Name, und den kennt nur
    // der Aufrufer — ein erfundener Ersatz nähme ihm die Wahl.
    expect(loeseBeschriftung(undefined, 'de')).toBeNull();
    expect(loeseBeschriftung(null, 'de')).toBeNull();
    expect(loeseBeschriftung({}, 'de')).toBeNull();
  });
});

describe('Steckbrief: Schema-Version (AK5)', () => {
  it('führt sie als Text und wertet sie nicht aus', () => {
    // Zwischenstand dieser Stufe: geführt, nicht ausgewertet. Der Update-Weg
    // beim Empfänger gehört zur Auslieferungs-Stufe.
    expect(lies({ schemaVersion: '1.2.0' }).schemaVersion).toBe('1.2.0');
    expect(lies({ schemaVersion: '2' }).schemaVersion).toBe('2');
  });

  it('meldet eine Zahl, statt sie still zu verfälschen', () => {
    // YAML liest `schemaVersion: 1.0` als Gleitkommazahl, und der Weg zurück
    // in Text ergäbe `1` — eine andere Version als die geschriebene.
    const ergebnis = lies({ schemaVersion: 1.0 });
    expect(codes(ergebnis)).toEqual(['schemaVersion']);
    expect(ergebnis.schemaVersion).toBeUndefined();
  });
});

describe('Steckbrief: fehlende und unbrauchbare Angaben (AK6)', () => {
  it('nimmt jede einzeln fehlende Angabe hinweisfrei hin', () => {
    for (const schluessel of DB_INFO_KEYS) {
      const behaelter = { ...VOLLSTAENDIG };
      delete behaelter[schluessel];
      const ergebnis = lies(behaelter);
      expect(ergebnis.hints, `ohne ${schluessel}`).toEqual([]);
      expect(ergebnis[schluessel], `ohne ${schluessel}`).toBeUndefined();
      // Die übrigen drei bleiben wirksam.
      for (const andere of DB_INFO_KEYS) {
        if (andere !== schluessel)
          expect(ergebnis[andere], `${andere} ohne ${schluessel}`).toBe(VOLLSTAENDIG[andere]);
      }
    }
  });

  it('lässt eine unbrauchbare Angabe einzeln entfallen und die übrigen stehen', () => {
    const ergebnis = lies({ ...VOLLSTAENDIG, name: [], schemaVersion: 7 });
    expect(codes(ergebnis)).toEqual(['databaseName', 'schemaVersion']);
    expect(ergebnis.name).toBeUndefined();
    expect(ergebnis.schemaVersion).toBeUndefined();
    expect(ergebnis.description).toBe(VOLLSTAENDIG.description);
    expect(ergebnis.fallbackLocale).toBe('de');
  });

  it('behandelt eine leere Angabe wie eine fehlende', () => {
    const ergebnis = lies({ ...VOLLSTAENDIG, description: '' });
    expect(ergebnis.hints).toEqual([]);
    expect(ergebnis.description).toBeUndefined();
  });

  it('macht ein Dokument ohne Steckbrief nicht zum Steckbrief', () => {
    const ergebnis = parseSteckbrief({ title: 'Notiz' });
    expect(ergebnis.istSteckbrief).toBe(false);
    expect(ergebnis.hints).toEqual([]);
  });
});

describe('Steckbrief: Abgrenzung gegen die Tabellen-Definition (AK1)', () => {
  it('ist ein eigenes Dokument und keine Tabelle', () => {
    expect(istTabellenDokument(steckbrief(VOLLSTAENDIG))).toBe(false);
    expect(parseTableDefinition(steckbrief(VOLLSTAENDIG)).istTabelle).toBe(false);
  });

  it('sieht den Definitions-Behälter nicht', () => {
    expect(istSteckbriefDokument({ [DB_TABLE_KEY]: { fields: [] } })).toBe(false);
  });

  it('trägt jedoch beides, wenn eine Datei beides erklärt', () => {
    // Nicht empfohlen, aber technisch möglich; beide Parser lesen dasselbe
    // Frontmatter unabhängig voneinander, und keiner verschluckt den anderen.
    const data = { ...steckbrief(VOLLSTAENDIG), [DB_TABLE_KEY]: { fields: [] } };
    expect(istSteckbriefDokument(data)).toBe(true);
    expect(istTabellenDokument(data)).toBe(true);
  });
});

describe('Steckbrief: Hinweis-Katalog', () => {
  it('trägt den Behälter-Schlüssel des Steckbriefs', () => {
    expect(HINWEIS_META.databaseContainer.key).toBe(DB_DATABASE_KEY);
  });

  it('hat für jede Angabe einen Eintrag mit ihrem Ortsbezug', () => {
    // Hält Angaben und Katalog deckungsgleich: Eine neue Angabe ohne ihren
    // Hinweis-Eintrag meldete sonst einen Fehler ohne Ortsbezug.
    const codeJeAngabe = {
      name: 'databaseName',
      description: 'databaseDescription',
      schemaVersion: 'schemaVersion',
      fallbackLocale: 'fallbackLocale',
    };
    for (const schluessel of DB_INFO_KEYS) {
      const code = codeJeAngabe[schluessel];
      expect(code, `Hinweis-Code für ${schluessel}`).toBeTruthy();
      expect(HINWEIS_META[code], `Hinweis-Eintrag für ${schluessel}`).toBeTruthy();
      expect(HINWEIS_META[code].key).toBe(schluessel);
    }
  });

  it('teilt keinen Code mit der Diagnose der Tabellen-Definition', () => {
    // `name` ist dort der fehlende FELD-Name; ein geteilter Code führte den
    // Autor an die falsche Stelle seiner Datei.
    expect(HINWEIS_META.name.key).toBe('name');
    expect(HINWEIS_META.databaseName.key).toBe('name');
    expect(HINWEIS_META.name).not.toBe(HINWEIS_META.databaseName);
    expect(HINWEIS_META.container.key).toBe(DB_TABLE_KEY);
    expect(HINWEIS_META.databaseContainer.key).toBe(DB_DATABASE_KEY);
  });
});
