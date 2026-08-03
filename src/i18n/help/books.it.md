# Libri

Un libro riunisce più file Markdown in un **ordine di lettura dichiarato**. L'albero delle cartelle di un'[area](apps-windows.md) ordina alfabeticamente, le [sottopagine](subpages.md) portano la loro gerarchia nel nome del file; un libro, invece, mette per iscritto la propria struttura, in un file di accompagnamento posto nella cartella del libro. I capitoli restano file Markdown ordinari e si leggono singolarmente, anche senza l'applicazione.

## Che cos'è un libro

Un libro vive in una cartella tutta sua. Al suo interno stanno tre cose:

- il **file del libro**, un normale file Markdown con il testo del libro; le proprietà e un riferimento a un'immagine stanno nel [frontmatter](frontmatter.md), come ovunque,
- il **file di accompagnamento** `Book_Settings.mdda`, che nomina il file del libro e porta l'albero dei capitoli,
- i **capitoli** come file Markdown, direttamente nella cartella del libro oppure in sottocartelle di profondità qualsiasi.

Una cartella di libro si presenta quindi press'a poco così:

```text
Viaggio a Itaca/
  Book_Settings.mdda
  Viaggio a Itaca.md
  Parte 1/
    La partenza.md
    Il porto.md
  Parte 2/
    Il ritorno.md
```

### Il file di accompagnamento

Il file di accompagnamento è JSON indentato in modo leggibile. Nomina il file del libro e descrive l'albero dei capitoli; i percorsi sono relativi alla cartella del libro:

```json
{
  "schemaVersion": 1,
  "book": { "file": "Viaggio a Itaca.md" },
  "chapters": [
    {
      "path": "Parte 1/La partenza.md",
      "children": [{ "path": "Parte 1/Il porto.md", "children": [] }]
    },
    { "path": "Parte 2/Il ritorno.md", "children": [] }
  ]
}
```

Da qui discendono due proprietà del modello. Primo, l'applicazione riconosce un libro **dal solo file di accompagnamento**: un file Markdown è il file del libro esattamente quando il file di accompagnamento della sua cartella lo nomina. Nel file Markdown non viene scritto nulla a tale scopo, esso non porta alcun rimando all'indietro. Secondo, la **collocazione della cartella non dice nulla sulla struttura**: dove si trovi un file di capitolo è a libera scelta e modificabile in qualsiasi momento, la struttura sta unicamente nell'albero dei capitoli.

Un capitolo appartiene a esattamente un libro e vi è agganciato esattamente una volta. Agganciare lo stesso file più volte non è previsto.

## Aprire e creare un libro

Entrambe le vie stanno nel menu **File**, accanto alle voci dell'area:

- **Apri libro…** chiede la cartella del libro. Se essa non contiene un file di accompagnamento che nomini un file del libro, l'applicazione segnala che la cartella non è un libro e non cambia nulla.
- **Nuovo libro…** chiede una cartella padre e un nome. L'applicazione vi crea la cartella del libro, insieme al file del libro con lo stesso nome e al file di accompagnamento, e apre il libro.
- **Chiudi libro** scioglie il legame. Le schede aperte restano aperte; ciò che si chiude è il libro, non il documento.

All'apertura il file del libro compare come scheda e l'indice viene mostrato. C'è **un libro attivo per applicazione**: tutte le finestre della stessa applicazione lo condividono e viene ripristinato all'avvio successivo. Un capitolo si apre inoltre in modo del tutto ordinario, senza contesto di libro; resta un normale file Markdown.

## L'indice

Il pannello **Libro** mostra l'albero dei capitoli nell'ordine dichiarato. Un clic apre un capitolo, quello in lettura è evidenziato. Davanti a ogni nome sta un marcatore, che funge anche da maniglia per la cura della struttura. Il pannello si commuta come ogni altro: con il pulsante nella barra di stato oppure con Visualizza → Pannelli → Libro. Lato, ordine e gruppi di schede seguono le regole della [barra laterale](sidebar.md).

### File non agganciati

Sotto l'albero si trova la sezione **Non agganciati** con i file Markdown della cartella del libro che non pendono da alcun capitolo. Non vengono nascosti, ma restano visibili e utilizzabili, così si vede che cosa attende ancora il proprio posto. Il file del libro non compare mai lì, non è un capitolo.

## Curare la struttura dei capitoli

Tutte e tre le vie cambiano **soltanto la dichiarazione** nel file di accompagnamento. Nessun file viene spostato, rinominato o cancellato nel farlo.

### Trascinare

Con il marcatore davanti al nome di un capitolo si trascina quel capitolo insieme ai suoi sottocapitoli. Dove cade lo decide il punto sopra la riga di destinazione: il terzo superiore lo colloca prima, quello inferiore dopo, il centro lo aggancia come sottocapitolo. Un rilascio sull'area libera del pannello lo accoda in fondo al livello superiore. Una voce proveniente da «Non agganciati» raggiunge l'albero per la stessa strada. Trascinare un capitolo sotto uno dei propri sottocapitoli è escluso.

### Tastiera

Quando una riga ha il fuoco, questi comandi fissi agiscono sul capitolo insieme ai suoi sottocapitoli:

| Input | Effetto |
|---|---|
| `Alt+↑` / `Alt+↓` | una posizione più in alto o più in basso nel livello |
| `Alt+→` | annidare: diventa l'ultimo sottocapitolo del suo predecessore |
| `Alt+←` | togliere l'annidamento: sale di un livello, dietro il precedente capitolo padre |
| `Invio` / `Spazio` | aprire il capitolo |

Al bordo di un livello l'albero resta invariato e non segnala nulla: lì semplicemente non c'è una destinazione.

### Menu contestuale

Il clic destro su una riga offre:

- **Nuovo capitolo** crea un file e lo aggancia subito. Il nome si digita direttamente nel pannello; il file nasce nella cartella del capitolo padre, al livello superiore nella cartella del libro.
- **Sgancia** toglie la voce dall'albero. Il file rimane e compare poi sotto «Non agganciati».
- **Aggancia** è la via inversa su un file non agganciato; esso passa in fondo al livello superiore.

Sull'area libera del pannello, il clic destro crea un nuovo capitolo al livello superiore.

## Leggere oltre i confini dei capitoli

Due pulsanti nell'intestazione del pannello sfogliano avanti e indietro di una posizione; gli stessi passi esistono come comandi nella palette e, in modo predefinito, su `Ctrl+Alt+Pag giù` e `Ctrl+Alt+Pag su`. Il percorso segue l'ordine di lettura dell'albero: un capitolo precede i suoi sottocapitoli, poi seguono i suoi fratelli.

Alle estremità non c'è alcun ritorno ciclico. Invece di saltare in silenzio all'altro capo, la barra di stato segnala che si è raggiunto l'inizio o la fine del libro; lì i pulsanti sono disattivati. I file non agganciati restano fuori dal percorso.

## Spostare i file dei capitoli

Poiché la collocazione della cartella è libera, la sua modifica ha un comando proprio: **Sposta il file del capitolo…** nel menu contestuale di una voce. Chiede una cartella di destinazione all'interno della cartella del libro e vi sposta il file. Due cose si aggiornano di conseguenza:

- i **riferimenti** al file da altri documenti,
- l'**albero dei capitoli**, la cui voce mantiene lo stesso posto e gli stessi sottocapitoli.

Una destinazione fuori dalla cartella del libro viene rifiutata, così come una destinazione in cui esiste già un file con quel nome. Il file del libro stesso non si può spostare. Rinominare un file di capitolo funziona come per qualunque altro file e aggiorna l'albero dei capitoli allo stesso modo.

## Riparare i capitoli mancanti

Se un file di capitolo viene spostato o cancellato fuori dall'applicazione, la sua voce punta nel vuoto. Non sparisce, ma resta nell'indice ed è contrassegnata come **mancante**; non è cliccabile, perché non c'è nulla da aprire.

Se altrove nella cartella del libro esiste un file con lo stesso nome, la riga porta in più un segno di ricerca come proposta di ritrovamento. Non viene mai eseguita da sé. Il menu contestuale della voce offre due vie:

- **Riassegna…** apre una scelta sotto la riga. Un unico ritrovamento con lo stesso nome vi è evidenziato e preselezionato; accanto, «Scegliere un altro file…» porta alla scelta libera all'interno della cartella del libro.
- **Sgancia** rimuove la voce quando il capitolo è davvero sparito.

Non appena l'assegnazione è fatta, la riga perde il proprio contrassegno.

## Attivare e disattivare

I libri sono un'estensione commutabile (Impostazioni → [Estensioni](extensions.md), gruppo Strumenti), attiva di fabbrica. Nello stato disattivato scompaiono le voci di menu, i comandi e il pannello; un file del libro si apre allora come qualunque altro file Markdown. Il file del libro, il file di accompagnamento e i capitoli restano intatti, e riattivando l'estensione lo stato torna invariato.
