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

## Barra Proprietà

La barra Proprietà mostra i campi del frontmatter modificabili dal vivo. Il tipo di campo si deduce dal valore: testo, lista, data, numero, booleano o multilinea. I nuovi campi si creano con «+ Aggiungi proprietà»; le modifiche seguono l'impostazione di salvataggio automatico.

In scrittura il blocco resta stabile nel round-trip: commenti, ordine dei campi e stile dei campi non modificati non vengono riformattati, e i fine riga CRLF restano stabili.

Con un errore di sintassi YAML la barra mostra il messaggio di errore e blocca l'aggiunta finché il blocco non è riparato nell'editor.

## Data di creazione e di modifica

Due campi possono essere aggiornati automaticamente al salvataggio: la data di creazione dalla data di creazione del file e la data di modifica dal momento del salvataggio.

```yaml
created: 2025-06-23 15:43
updated: 2026-07-18 12:04
```

Entrambi i campi si attivano in modo indipendente e i loro nomi sono liberamente selezionabili. Il formato è a scelta solo data oppure data e ora, sempre in ora locale. Una data di creazione esistente non viene mai sovrascritta; la data di modifica segue ogni salvataggio.

I campi mancanti vengono creati solo se la relativa opzione è attiva. Altrimenti vengono aggiornati soltanto i campi già presenti nel blocco e il documento resta per il resto invariato. L’accesso e l’interruttore sono riportati nella [tabella delle funzioni](functions.md).
