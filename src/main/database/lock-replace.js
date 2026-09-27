// 4T-001788 (Epic 3E-000255, Bauplan L6 und L6a): Das **Ablösen** einer Sperre,
// der fünfte Zugriff des Sperr-Speichers, gemeinsam benutzt von der Übernahme
// eines Absturz-Rests und vom Bruch einer abgelaufenen fremden Sperre.
//
// **Eigenes Modul, aber kein zweiter Zugriffs-Weg.** Es benutzt die Helfer von
// `lock-store.js`, also Nähte, Ort, exklusives Schreiben, Lesen und
// Änderungszeit, und bildet keinen davon nach; die Import-Richtung ist
// eindeutig und zyklenfrei. Herausgeschnitten wurde es allein, weil der
// Bruch-Anspruch den Speicher über sein Datei-Budget gehoben hätte.
//
// **Der Anspruch ist das exklusive Anlegen; das Umbenennen ist der zweite
// Schritt unter dem Anspruch.** Bis zum 2026-09-19 war das Umbenennen allein
// der Anspruch (L6). Der erste Zweirechner-Lauf hat das an der realen
// Konstellation gemessen: Mit **einem** Brecher je Rechner hielt in 200 von 200
// Runden genau einer; mit **acht** Brechern je Rechner auf dieselbe abgelaufene
// Sperre hielten in 61 von 200 Runden zwei oder drei zugleich. Die Ursache ist
// das in L6 benannte Rest-Fenster, nur ist es unter Gleichlauf nicht selten,
// sondern die Regel: Ein Brecher, der die alte Sperre noch gesehen hat, nimmt
// die frische Sperre des Gewinners beiseite, und während er sie zurückstellt,
// belegt ein dritter den Pfad. Drei gleichzeitige Brecher sind im Betrieb kaum
// zu erwarten, aber eine Sperr-Mechanik, die unter Gleichlauf zu einem Drittel
// versagt, bleibt nicht stehen, wenn das Gegenmittel klein ist.
//
// Das Gegenmittel benutzt deshalb das **gemessene** Primitiv, das exklusive
// Anlegen, und lässt erst nach einem **zweiten Blick auf den Stand** unter dem
// Anspruch umbenennen. Der Anspruch hängt am Stand und nicht am Gegenstand: Er
// betrifft genau die eine alte Sperre und steht keiner späteren im Weg.
//
// **Das bewusst hingenommene Rest-Fenster, neu gefasst:** Ein Doppel-Halter
// setzt seither voraus, dass der Halter einer seit Stunden abgelaufenen Sperre
// sie in denselben Millisekunden freigibt, in denen ein anderer sie bricht und
// ein dritter sie nimmt. Dahinter steht unverändert E9.2: Die Sperre ist nie
// allein zuständig, der Schreibvorgang prüft immer.
//
// **Kein Takt** (L11): kein Timer, kein Intervall. Die Wartezeiten der
// Umbenennen-Schleife gehören dem Schreibweg und sind kein Hintergrund-Lauf.
'use strict';

const { herkunftsFelder } = require('../documents/mdd-herkunft.js');
const {
  SPERR_CODES,
  SPERR_SCHEMA_VERSION,
  aenderungsZeit,
  alsText,
  fehler,
  lies,
  nahtstellen,
  ortFuer,
  schreibeExklusiv,
  standVon,
} = require('./lock-store.js');

// Endung der beiseite gelegten Datei. Sie endet bewusst **nicht** auf `.lock`;
// das Auflisten übergeht sie damit wie jede fremde Datei, ohne eine zweite
// Regel zu brauchen.
const ABGELOEST_MARKE = '.abgeloest-';

// Endung des Bruch-Anspruchs, aus demselben Grund ebenfalls ohne `.lock`.
const ANSPRUCH_MARKE = '.bruch-';

// Die drei folgenlosen Ausgänge des Ablösens. Alle sind Normalfälle und kein
// Fehlschlag, deshalb tragen sie einen Grund und keinen Code.
const ABLOESE_GRUENDE = Object.freeze({
  verschwunden: 'verschwunden',
  geaendert: 'geaendert',
  inArbeit: 'inArbeit',
});

// Entfernt eine beiseite gelegte Datei oder einen Anspruch. Ein Fehlschlag hier
// ist **kein** Fehlschlag des Ablösens: Was liegen bleibt, trägt keine
// `.lock`-Endung und wird vom Auflisten übergangen.
async function raeumeWeg(fsp, pfad) {
  try {
    await fsp.unlink(pfad);
  } catch (err) {
    void err;
  }
}

function folgenlos(grund, pfad, stand) {
  return { ok: true, abgeloest: false, grund, pfad, stand };
}

// Der Pfad des Anspruchs zu einem Stand. Sechzehn Hex-Zeichen genügen, denn der
// Stand ist ein SHA-256-Wert; in den Namen gehen **nur** seine Hex-Zeichen ein,
// damit ein unerwarteter Wert eines Aufrufers nie einen Pfad außerhalb des
// Sperr-Ordners bildet.
function anspruchsPfad(sperrPfad, erwarteterStand) {
  const hex = String(erwarteterStand)
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  return `${sperrPfad}${ANSPRUCH_MARKE}${hex.slice(0, 16)}`;
}

// Legt den Anspruch exklusiv an. Liefert `null` bei Erfolg und sonst den
// Fehler; die Einordnung des Fehlers gehört dem Aufrufer.
async function schreibeAnspruch(naht, pfad) {
  const inhalt = {
    schemaVersion: SPERR_SCHEMA_VERSION,
    ...herkunftsFelder(naht.herkunft()),
    pid: naht.pid,
    zeitpunkt: naht.jetzt(),
  };
  try {
    await schreibeExklusiv(naht.fsp, pfad, `${JSON.stringify(inhalt, null, 2)}\n`);
    return null;
  } catch (err) {
    return err || new Error('Der Bruch-Anspruch ließ sich nicht anlegen.');
  }
}

// **Ein liegengebliebener Anspruch** (Absturz im Fenster von Millisekunden
// zwischen Anlegen und Entfernen) folgt denselben Regeln wie eine Sperre: Er
// ist verwaist, wenn er ein Absturz-Rest ist oder seine Frist abgelaufen ist.
// Beurteilt wird er von der Verwaltung, denn nur sie kennt Frist und
// Lebend-Prüfung; ohne die Naht gilt ein Anspruch nie als verwaist.
async function istAnspruchVerwaist(naht, pfad) {
  if (naht.anspruchVerwaist === null) return false;
  const gelesen = await lies(naht.fsp, pfad);
  // Inzwischen fort: Er steht niemandem mehr im Weg, und über den Ausgang
  // entscheidet dann ohnehin das zweite exklusive Anlegen.
  if (!gelesen.vorhanden) return true;
  const geaendertMs = await aenderungsZeit(naht.fsp, pfad, gelesen.halter);
  return naht.anspruchVerwaist(gelesen.halter, geaendertMs) === true;
}

// Ein Anlege-Fehler, der nicht EEXIST ist. Fehlt der **Ordner** (ENOENT), dann
// gibt es dort auch keine Sperre; das ist «verschwunden» und kein Fehlschlag.
function anspruchsFehler(err, ort) {
  if (err && err.code === 'ENOENT') {
    return folgenlos(ABLOESE_GRUENDE.verschwunden, ort.pfad, standVon(null));
  }
  return fehler(SPERR_CODES.abloesen, alsText(err));
}

// Erlangt den Anspruch. Ergebnis ist `{erlangt: true}` oder `{erlangt: false,
// ergebnis}` mit dem fertigen Ergebnis des Ablösens. Wiederholt wird das
// Anlegen nach einem verwaisten Anspruch **genau einmal**: Eine Schleife wäre
// ein Kampf zweier Prozesse um denselben Platz, und beide verlören.
async function erlangeAnspruch(naht, pfad, ort, erwarteterStand) {
  // Der Stand ist die Auskunft, über die geurteilt wurde; gelesen wird auf
  // diesem Weg nichts, und deshalb wird auch nichts Frischeres behauptet.
  const inArbeit = () => ({
    erlangt: false,
    ergebnis: folgenlos(ABLOESE_GRUENDE.inArbeit, ort.pfad, erwarteterStand),
  });

  const erster = await schreibeAnspruch(naht, pfad);
  if (erster === null) return { erlangt: true };
  if (erster.code !== 'EEXIST') return { erlangt: false, ergebnis: anspruchsFehler(erster, ort) };
  if (!(await istAnspruchVerwaist(naht, pfad))) return inArbeit();

  await raeumeWeg(naht.fsp, pfad);
  const zweiter = await schreibeAnspruch(naht, pfad);
  if (zweiter === null) return { erlangt: true };
  if (zweiter.code !== 'EEXIST') return { erlangt: false, ergebnis: anspruchsFehler(zweiter, ort) };
  return inArbeit();
}

// **Rückfall aus L6**, seit dem Anspruch nur noch für das schmale Fenster
// zwischen dem zweiten Blick und dem Umbenennen: Dort ist eine frische Sperre
// entstanden und wurde weggenommen. Sie wird exklusiv an ihren alten Platz
// zurückgestellt.
async function stelleZurueck(fsp, ort, beiseite, gelesen) {
  // Eine Sperre, deren Bytes nicht gelesen werden konnten, lässt sich nicht
  // zurückstellen. Dann bleibt die beiseite gelegte Datei als einzige Kopie
  // liegen, und der Fehler nennt sie, damit ein Mensch sie findet.
  if (gelesen.roh === null) {
    return fehler(
      SPERR_CODES.abloesen,
      `Die abgelöste Sperre ist unlesbar und bleibt liegen: ${beiseite}`,
    );
  }
  try {
    await schreibeExklusiv(fsp, ort.pfad, gelesen.roh);
  } catch (err) {
    if (!err || err.code !== 'EEXIST') {
      return fehler(
        SPERR_CODES.abloesen,
        `Die abgelöste Sperre bleibt als einzige Kopie liegen (${beiseite}): ${alsText(err)}`,
      );
    }
    // Der Pfad ist inzwischen wieder belegt: Die weggenommene Sperre ist
    // verdrängt. Ihre Kopie wird entfernt, weil an ihrem Platz eine gültige
    // Sperre steht und eine zweite Datei dort niemandem nützt.
    await raeumeWeg(fsp, beiseite);
    return { ...folgenlos(ABLOESE_GRUENDE.geaendert, ort.pfad, gelesen.stand), verdraengt: true };
  }
  await raeumeWeg(fsp, beiseite);
  return folgenlos(ABLOESE_GRUENDE.geaendert, ort.pfad, gelesen.stand);
}

// Der Teil, der **unter dem Anspruch** läuft.
async function loeseUnterAnspruchAb(naht, ort, erwarteterStand) {
  const { fsp, benenneUm, zufall } = naht;

  // **Der zweite Blick war das Fehlende.** Wer die alte Sperre gesehen hat und
  // erst danach umbenennt, nimmt sonst die frische Sperre des Gewinners
  // beiseite; genau daraus entstanden die Doppel-Halter des Laufs vom
  // 2026-09-19. Weicht der Stand hier ab, wird **nicht** umbenannt.
  const vorher = await lies(fsp, ort.pfad);
  if (!vorher.vorhanden) {
    return folgenlos(ABLOESE_GRUENDE.verschwunden, ort.pfad, vorher.stand);
  }
  if (vorher.stand !== erwarteterStand) {
    return folgenlos(ABLOESE_GRUENDE.geaendert, ort.pfad, vorher.stand);
  }

  const beiseite = `${ort.pfad}${ABGELOEST_MARKE}${zufall()}`;
  try {
    await benenneUm(ort.pfad, beiseite);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return folgenlos(ABLOESE_GRUENDE.verschwunden, ort.pfad, standVon(null));
    }
    return fehler(SPERR_CODES.abloesen, alsText(err));
  }

  const gelesen = await lies(fsp, beiseite);
  // **Gemessen am 2026-09-19 auf Windows 11:** Benennen mehrere gleichzeitige
  // Rufer DIESELBE Quelle um, meldet der Aufruf mehreren von ihnen Erfolg —
  // bei zwölf Rufern und dem Vorgabe-Umfang des Arbeits-Pools vieren —, während
  // die Datei nur bei EINEM ankommt; mit einem Pool von einem Faden gewinnt
  // genau einer und die übrigen erhalten ENOENT. Das Umbenennen hängt deshalb
  // nicht am Rückgabewert, sondern daran, ob die beiseite gelegte Datei danach
  // wirklich DA ist. Wer sie nicht vorfindet, hat sie nicht erlangt, und für ihn
  // ist die Sperre verschwunden.
  if (!gelesen.vorhanden) {
    return folgenlos(ABLOESE_GRUENDE.verschwunden, ort.pfad, gelesen.stand);
  }
  if (gelesen.stand === erwarteterStand) {
    await raeumeWeg(fsp, beiseite);
    return { ok: true, abgeloest: true, pfad: ort.pfad, stand: gelesen.stand };
  }
  return stelleZurueck(fsp, ort, beiseite, gelesen);
}

/**
 * Löst eine Sperre ab — gemeinsam benutzt von der Übernahme eines Absturz-Rests
 * und vom Bruch einer abgelaufenen fremden Sperre (4T-001788, L6, L6a).
 *
 * **Der Anspruch ist das exklusive Anlegen.** Von mehreren gleichzeitigen
 * Ablösern derselben Sperre bekommt ihn genau einer; die übrigen lösen nicht ab
 * und erhalten den Grund «inArbeit», ohne die Sperre auch nur anzufassen.
 *
 * **Unter dem Anspruch entscheidet der Stand**, ob die richtige Sperre getroffen
 * wurde. Fehlt sie, ist sie «verschwunden»; weicht ihr Stand ab, ist sie
 * «geaendert» und wird nicht umbenannt. Erst bei gleichem Stand folgen
 * Umbenennen, die Prüfung der beiseite gelegten Datei und, als Rückfall aus L6,
 * das Zurückstellen.
 *
 * @param {string} bereichsWurzel Wurzelpfad des Bereichs.
 * @param {{art: string, tabelle: string, id?: string|number}} gegenstand
 * @param {string} erwarteterStand Stand, über den geurteilt wurde.
 * @param {object} deps Nähte; `leseKonfig` ist Pflicht, `pid` und
 *   `anspruchVerwaist` reicht die Sperr-Verwaltung herein.
 * @returns {Promise<{ok: true, abgeloest: boolean, grund?: string, verdraengt?: boolean,
 *   pfad: string, stand: string}|{ok: false, code: string, error: string}>}
 */
async function loeseSperreAb(bereichsWurzel, gegenstand, erwarteterStand, deps) {
  const ort = await ortFuer(bereichsWurzel, gegenstand, deps);
  if (!ort.ok) return ort;
  const naht = nahtstellen(deps);
  const anspruch = anspruchsPfad(ort.pfad, erwarteterStand);

  const erlangt = await erlangeAnspruch(naht, anspruch, ort, erwarteterStand);
  if (!erlangt.erlangt) return erlangt.ergebnis;

  try {
    return await loeseUnterAnspruchAb(naht, ort, erwarteterStand);
  } finally {
    // In JEDEM Ausgang, auch im Fehlerfall: Ein liegengebliebener Anspruch
    // hielte jeden weiteren Ablöser derselben alten Sperre bis zur Frist auf.
    await raeumeWeg(naht.fsp, anspruch);
  }
}

module.exports = {
  ABGELOEST_MARKE,
  ANSPRUCH_MARKE,
  ABLOESE_GRUENDE,
  loeseSperreAb,
};
