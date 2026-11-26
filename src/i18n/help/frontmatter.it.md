# Frontmatter e proprietà

Un blocco YAML all'inizio del file porta i metadati. Appare nella vista Lettura come una riga frontmatter compatta, viene mostrato con discrezione nell'editor sorgente e mantenuto in forma di modulo tramite la barra Proprietà.

## Blocco YAML

Il blocco sta tra due righe `---` e deve essere la primissima riga del file — per questo questa pagina del manuale lo mostra come blocco di codice anziché dal vivo:

```markdown
---
title: Piano di progetto
aliases: [Piano, Roadmap]
tags: [progetto/markdown, pianificazione]
review: 2026-07-01
final: false
---
```

## Visualizzazione nella vista renderizzata

All'inizio della vista renderizzata il frontmatter appare come una riga compatta e discreta con il numero di campi. Al passaggio del mouse si apre lo YAML in chiaro (commenti compresi), allontanandosi si richiude; un clic sulla riga la fissa, un altro clic la rilascia. La riga si usa anche da tastiera (focus, poi Invio o Spazio) ed è di sola visualizzazione — la modifica avviene tramite la barra Proprietà o il testo sorgente. Con un errore di sintassi YAML la riga mostra il testo grezzo senza numero di campi.

In modalità Live la stessa riga sostituisce le righe YAML finché il cursore resta fuori; l'ingresso del cursore o un clic nello YAML aperto passa al testo sorgente modificabile, uscendo si richiude.

La visualizzazione si disattiva in File → Impostazioni… → Aspetto (predefinito: attiva). L'impostazione aggiuntiva «Mostra il frontmatter espanso» (predefinito: disattivata) mantiene il blocco sempre aperto — nella vista renderizzata, in modalità live e quindi anche nell'esportazione PDF.

## Campi particolari

- `aliases:` rende il file collegabile con nomi aggiuntivi tramite `[[Alias]]`; i backlink lo trovano attraverso qualsiasi alias e contrassegnano i riscontri con «via alias» (vedi [Collegamenti](linking.md)).
- `tags:` aggiunge tag oltre ai `#tag` nel testo; entrambe le fonti alimentano la barra laterale dei tag.

## Vista dell'editor per documento

I tre interruttori della vista dell'editor — riquadro di piegatura, numeri di riga e a capo automatico — vengono salvati per documento nel frontmatter e viaggiano con il file, anche in caso di copia o apertura su un altro computer:

```markdown
---
fold-gutter: false
line-numbers: true
word-wrap: true
---
```

Solo i veri valori `true`/`false` hanno effetto; gli altri valori vengono ignorati. La risoluzione segue questo ordine: la chiave del frontmatter prima dell'impostazione globale predefinita (File → Impostazioni… → Aspetto) prima del valore predefinito integrato (piegatura attiva, numeri di riga attivi, a capo automatico disattivato).

La commutazione tramite la barra di stato o il menu Visualizza scrive il nuovo valore direttamente nel frontmatter del documento attivo: il file diventa così modificato e viene salvato tramite il normale percorso di salvataggio. Se un documento non ha ancora un frontmatter, la commutazione crea il blocco.

Casi particolari: nelle destinazioni di sola lettura (come le pagine del manuale) e con YAML errato l'interruttore agisce solo in modo temporaneo per la sessione in corso. Nelle schede Senza titolo è anch'esso temporaneo; al primo salvataggio l'app riporta nel frontmatter del nuovo file i valori che differiscono dal valore predefinito.

## Immagine di copertina

La proprietà `cover` pone un'immagine in cima al documento: a tutta larghezza del contenuto, ritagliata a un'altezza regolabile e mai deformata. Altre due proprietà stabiliscono altezza e inquadratura:

```markdown
---
cover: immagini/spiaggia.jpg
cover-height: 240
cover-position: top
---
```

L'immagine si indica in due modi:

- **come percorso relativo al documento**, come per un'immagine normale: `cover: immagini/spiaggia.jpg`. Valgono lo stesso confine, gli stessi formati e lo stesso limite di 20 MB della pagina [Immagini](images.md).
- **come nome tra doppie parentesi quadre, tra virgolette**: `cover: "[[spiaggia.jpg]]"`. Così l'applicazione trova l'immagine per nome, in qualunque cartella dell'area si trovi.

Se l'immagine viene rinominata, l'applicazione non adegua il valore di `cover`; il nuovo nome va inserito a mano.

`cover-height` è l'altezza in pixel, predefinita 200; i valori sotto 80 o sopra 600 vengono portati al limite più vicino. `cover-position` sceglie la parte visibile dell'immagine: un numero da 0 a 100, misurato dall'alto (0 mostra il bordo superiore, 100 quello inferiore), oppure una delle parole `top`, `center` e `bottom`; il valore predefinito è il centro. Ciò che non viene compreso ricade in silenzio sul valore predefinito.

L'immagine di copertina compare nella vista renderizzata, nella sua metà della vista divisa e in modalità Live, sotto la [riga del titolo](tools.md) con il nome del file e sopra la riga del frontmatter. In modalità Live resta al suo posto anche mentre il cursore si trova nelle righe YAML, e una modifica di `cover` mostra subito la nuova immagine. L'immagine di copertina non dipende dalla visualizzazione del frontmatter e compare anche quando questa è disattivata; un blocco con un errore di sintassi YAML non produce alcuna immagine di copertina.

La stampa, l'esportazione PDF e l'esportazione HTML contengono l'immagine di copertina così come la mostra la vista renderizzata. La [presentazione](presentation.md), i documenti incorporati, le schede e le anteprime non mostrano alcuna immagine di copertina.

Se l'applicazione non trova l'immagine — il file manca, si trova fuori dal confine, non è un file immagine o supera i 20 MB —, al suo posto compare l'avviso discreto «Immagine di copertina non trovata», senza messaggio di errore. Lo stesso vale per un documento mai salvato, finché non viene salvato. Un indirizzo da Internet (`http:` o `https:`) non viene caricato; al suo posto un avviso invita a mettere l'immagine come file nell'area. Stampa ed esportazione tralasciano gli avvisi; un'immagine di copertina senza immagine lì scompare del tutto.

I file del libro e della libreria portano la loro immagine di copertina nella stessa proprietà `cover` (vedi [Libri](books.md)); aprendo un tale file come documento, l'immagine compare anche in cima, sopra il suo contenuto.

L'immagine di copertina fa parte dell'[estensione interna](extensions.md) «Immagine di copertina», attiva a partire dalla modalità di lavoro **Avanzata**. Se è disattivata, non compaiono né immagine né avviso; le proprietà restano invariate nel documento e nella barra Proprietà e, dopo la riattivazione, l'immagine di copertina torna a comparire.

## Mappa mentale per documento

La chiave `mindmap` stabilisce come la [vista mappa mentale](mindmap.md) disegna proprio questo documento e sostituisce così il valore predefinito in File → Impostazioni… → Mappa mentale:

```markdown
---
mindmap:
  layout: mitte
  linienfuehrung: gerade
  anfangsTiefe: 2
---
```

`layout` accetta la posizione della radice (`links`, `mitte`, `rechts`, `oben`, `unten`), `linienfuehrung` i valori `geschwungen` e `gerade`; a questi si aggiungono i numeri `farbEinfrierEbene`, `anfangsTiefe` e `hoechstBreite`. Ciò che non viene compreso ricade in silenzio sul valore predefinito.

## Barra Proprietà

La barra Proprietà mostra i campi del frontmatter modificabili dal vivo. Il tipo di campo si deduce dal valore: testo, lista, data, numero, booleano o multilinea. I nuovi campi si creano con «+ Aggiungi proprietà»; le modifiche seguono l'impostazione di salvataggio automatico.

Un clic su un campo valore propone i valori già assegnati a quella proprietà nell'area, in ordine alfabetico; ogni carattere digitato riduce l'elenco e un valore proprio resta liberamente digitabile. Se un profilo di proprietà definisce un insieme di valori, entrambe le origini compaiono insieme e restano distinguibili: i valori provenienti dall'esistente sono contrassegnati come tali. Se la proprietà non compare da nessuna parte nell'area, non viene mostrato alcun elenco. Disattivabile in File → Impostazioni… → Estensioni.

In scrittura il blocco resta stabile nel round-trip: commenti, ordine dei campi e stile dei campi non modificati non vengono riformattati, e i fine riga CRLF restano stabili. Gli elenchi su una riga tra parentesi quadre vengono scritti senza spazi interni (`[a, b]`); un elenco scritto come `[ a, b ]` passa una sola volta a questa forma al primo salvataggio e poi resta invariato.

Con un errore di sintassi YAML la barra mostra il messaggio di errore e blocca l'aggiunta finché il blocco non è riparato nell'editor.

## Data di creazione e di modifica

Due campi possono essere aggiornati automaticamente al salvataggio: la data di creazione dalla data di creazione del file e la data di modifica dal momento del salvataggio.

```yaml
created: 2025-06-23 15:43
updated: 2026-07-18 12:04
```

Entrambi i campi si attivano in modo indipendente e i loro nomi sono liberamente selezionabili. Il formato è a scelta solo data oppure data e ora, sempre in ora locale. Una data di creazione esistente non viene mai sovrascritta; la data di modifica segue ogni salvataggio. Se un salvataggio scrive una nuova data di modifica, un `Ctrl+Z` subito dopo annulla questa data insieme all'ultima modifica precedente, anche dopo il salvataggio automatico.

I campi mancanti vengono creati solo se la relativa opzione è attiva. Altrimenti vengono aggiornati soltanto i campi già presenti nel blocco e il documento resta per il resto invariato. L’accesso e l’interruttore sono riportati nella [tabella delle funzioni](functions.md).
