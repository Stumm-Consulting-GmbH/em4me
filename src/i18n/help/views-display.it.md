# Viste e visualizzazione

L'aspetto di un documento si decide su due livelli. La **vista** appartiene alla singola scheda: stabilisce se il documento viene mostrato renderizzato, come sorgente, diviso o live. L'**aspetto** vale per l'intera applicazione: tema, zoom, larghezza del contenuto e caratteri. Questa pagina unisce i due livelli e indica il posto di ogni impostazione.

## Le sei viste

Ogni scheda si trova in esattamente una delle sei viste. La modalità scelta vale per scheda e non globalmente: un documento può restare aperto renderizzato mentre accanto un secondo viene modificato come sorgente.

| Vista             | Che cosa mostra                                    | Scorciatoia predefinita |
| ----------------- | -------------------------------------------------- | ----------------------- |
| **Renderizzato**  | solo il risultato formattato                       | `Ctrl+1`                |
| **Diviso**        | sorgente e risultato affiancati                    | `Ctrl+2`                |
| **Sorgente**      | solo la sorgente Markdown                          | `Ctrl+3`                |
| **Live**          | la sorgente, formattata dove si scrive             | `Ctrl+4`                |
| **Mappa mentale** | la struttura del documento come mappa invece che come testo | `Ctrl+5`   |
| **Tela**          | una superficie con schede e collegamenti dal documento | `Ctrl+6`                |

Il cambio avviene con i pulsanti della barra di stato o dalla parte alta del menu Visualizza; la mappa mentale sta nel menu e sulla sua scorciatoia, non nella barra di stato, e il pulsante della tela resta attenuato finché il documento non contiene una superficie Canvas. Quale vista riceve una scheda appena aperta si imposta nella sezione «Comportamento» delle impostazioni.

### Modalità live

La modalità live renderizza il Markdown direttamente nell'editor: grassetto e corsivo, collegamenti, tabelle, codice, immagini, formule KaTeX e diagrammi Mermaid appaiono come nel risultato renderizzato. Quando il cursore si trova in una riga, proprio quella riga mostra la sua sorgente grezza e resta modificabile. Così sparisce l'andirivieni tra scrivere e controllare.

**Le tabelle fanno eccezione a questa regola.** Restano impaginate anche mentre il cursore si trova al loro interno: il clic colpisce la cella, il tabulatore e i tasti freccia portano di cella in cella, e ciò che si digita arriva al punto giusto del sorgente. Chi ha bisogno della sintassi grezza di una tabella — la riga separatrice con i due punti di allineamento, per esempio — passa alla vista sorgente o a quella divisa.

**I collegamenti nel testo corrente sono contrassegnati in modo permanente.** Portano la loro sottolineatura in ogni momento, senza che il mouse debba trovarsi sopra: sia i wiki link sia i collegamenti Markdown, sia verso un documento sia verso un indirizzo esterno. La vista renderizzata sottolinea un collegamento ancora solo al passaggio del mouse; nella vista in cui si scrive, invece, deve essere visibile senza sforzo che dietro un testo c’è un collegamento. Sulla riga del cursore la sintassi grezza appare come di consueto.

### Mappa mentale

La mappa mentale mostra i titoli e gli elenchi del documento come albero e il testo corrente come nota sul nodo. Appartiene all'estensione omonima e scompare con essa; struttura, uso, le cinque posizioni della radice e il valore per documento sono descritti nella pagina [Vista mappa mentale](mindmap.md).

### Tela

La tela mostra una superficie con schede e collegamenti che si trova nel documento stesso. Appartiene all’estensione omonima e scompare con essa; è inoltre l’unica delle sei viste a dipendere dal documento ed è selezionabile solo se questo contiene una superficie Canvas. Struttura, uso, più superfici e il formato di memorizzazione sono descritti nella pagina [Superficie Canvas](canvas.md).

### Modifica

La modalità di modifica attiva l'editor e agisce nella vista sorgente, in quella divisa e in quella live (predefinito `Ctrl+E`, matita nella barra di stato, Visualizza → Modifica). Un clic sulla matita nella vista di sola lettura passa da sé a una vista di modifica e vi attiva l'editor. Quale, lo determina l'impostazione «Vista al passaggio alla modalità di modifica» (File → Impostazioni… → Comportamento; sono disponibili Divisa, Sorgente e Live, Divisa come predefinita). Se la vista è già una delle tre, resta: lì la matita attiva solo l'editor. Con che cosa si formatta nella modalità di modifica lo descrivono le pagine [Menu contestuale dell'editor](context-menu.md) e [Barra di formattazione](toolbar.md).

## Visualizzazione editor

Il sottomenu Visualizza → Visualizzazione editor raccoglie i cinque interruttori che riguardano l'editor stesso. Gli stessi interruttori si trovano come icone nella barra di stato.

- **Piegatura** mostra la barra di piegatura sul bordo sinistro: titoli, elenchi e blocchi si richiudono lì, e la gerarchia resta visibile come traccia.
- **Numeri di riga** mostra la colonna dei numeri.
- **A capo automatico** manda a capo le righe lunghe al bordo della finestra invece di scorrere in orizzontale. Il seguito di una riga andata a capo inizia all'altezza del rientro del suo contenuto: in una voce di elenco dopo il segno, in una numerata dopo il numero, in una riga rientrata al suo stesso rientro. Un paragrafo senza rientro resta allineato a sinistra.
- **Sincronizzazione scorrimento** accoppia le due metà nella vista divisa: scorrendo la sorgente, il risultato segue per contenuto, e viceversa. L'interruttore vale per scheda.
- **Scorrimento macchina da scrivere** tiene la riga del cursore centrata in verticale non appena il cursore si muove. Agisce solo nella modalità di modifica.

I primi tre interruttori sono **legati al documento**: il loro valore finisce nel frontmatter del file (`fold-gutter`, `line-numbers`, `word-wrap`) e viaggia con esso. Il cambio vi scrive il nuovo valore e segna il file come modificato; un documento senza indicazione propria segue l'impostazione predefinita sotto File → Impostazioni… → Aspetto. L'ordine di risoluzione è descritto nella pagina [Frontmatter e proprietà](frontmatter.md).

## Aspetto

### Chiaro, scuro e sistema

L'applicazione gira in un tema chiaro o scuro; il valore predefinito segue il tema del sistema operativo. Il cambio passa dall'icona del tema nella barra di stato o da Visualizza → Aspetto → Chiaro/Scuro/Sistema. Quali colori usa un tema si stabilisce liberamente tramite le combinazioni di colori, vedi [Combinazioni di colori](color-schemes.md).

Su Linux il valore predefinito del sistema dipende dall'ambiente desktop: se non comunica alcuna preferenza chiaro o scuro, resta il tema chiaro. Il cambio manuale vi funziona senza limitazioni.

### Modalità focus

La modalità focus nasconde la barra delle schede, la barra di stato e la barra laterale e lascia solo il documento (Visualizza → Aspetto → Modalità focus, predefinito `Ctrl+Maiusc+F`). La barra dei menu resta raggiungibile con `Alt`. `Esc` lascia la modalità, a meno che non sia aperto proprio un dialogo o un menu. Uno stato compresso della barra laterale non ne è toccato e continua a valere dopo l'uscita.

### Riga attiva

La riga con il cursore riceve uno sfondo discreto nella modalità di modifica, sia nella vista sorgente sia in quella live e fin dentro la colonna dei numeri di riga. Nella vista di sola lettura resta senza segno, perché lì non c'è cursore. La tinta è semitrasparente e si posa quindi su qualsiasi combinazione di colori; selezione, risultati di ricerca e segni del linter restano visibili sopra di essa. Interruttore: File → Impostazioni… → Aspetto.

### Zoom

Il contenuto di ogni scheda si ingrandisce e si riduce in modo indipendente a passi di dieci per cento (predefinito `Ctrl + +`, `Ctrl + −`, `Ctrl + 0`, oltre a `Ctrl` con la rotellina). Se il fattore si scosta da cento per cento, la barra di stato lo mostra; un clic sopra lo riporta al valore iniziale. Lo zoom è volatile e non sopravvive alla chiusura della finestra.

### Larghezza del contenuto

La larghezza del contenuto stabilisce in percentuale quanto spazio usa la visualizzazione renderizzata (20 a 100, predefinito 80). I valori più stretti restano centrati. Vale per la vista renderizzata e per quella divisa; l'esportazione PDF usa indipendentemente tutta la larghezza di stampa. Impostazione: File → Impostazioni… → Aspetto.

### Carattere e dimensione

Carattere e dimensione si scelgono separatamente per la superficie di modifica e per la vista renderizzata; la dimensione sta tra 8 e 32. I valori valgono per tutti i documenti e agiscono subito in tutte le finestre aperte. Impostazione: File → Impostazioni… → Aspetto.

## Stato della finestra

Posizione, dimensione e stato ingrandito di una finestra vengono memorizzati alla chiusura e ripristinati al successivo avvio. Non c'è nulla da impostare. Che cosa riporti inoltre un'intera sessione con le sue schede è descritto nella pagina [Applicazioni, finestre e aree](apps-windows.md).

## Barra di stato

La barra di stato sul bordo inferiore della finestra è il punto di comando che resta visibile in ogni vista. Se la sua larghezza non basta per tutti gli elementi, si compatta: al suo bordo sinistro e al suo bordo destro appare un menu che accoglie gli elementi che non trovano più posto. Una voce del menu mostra etichetta e stato e agisce esattamente come il pulsante nella barra; quando la finestra torna a essere più larga, gli elementi rientrano e un menu che resterebbe vuoto scompare. L'area dei messaggi brevi resta visibile a ogni larghezza e gli interruttori centrali si compattano per ultimi.

Quando la barra si compatta lo stabilisce l'impostazione «Compattazione» (File → Impostazioni… → Barra di stato). «Automaticamente quando lo spazio è scarso» è il valore predefinito e ripone solo ciò che non trova più posto; «Sempre compattata» mantiene i pulsanti nei due menu indipendentemente dalla larghezza della finestra e lascia la barra permanentemente sobria. La stessa sezione porta anche i pulsanti di comando propri della barra e l'elenco dei pulsanti predefiniti nascosti, vedi [Posizionamento dei comandi](command-placement.md).

Come la barra tratta i pulsanti che al momento non possono fare nulla lo stabilisce l'impostazione «Pulsanti non utilizzabili» (File → Impostazioni… → Barra di stato). Sono interessati i selettori di vista e i tre interruttori dell'editor al centro, oltre a Modifica, alla sincronizzazione dello scorrimento e alla cronologia del documento a destra: per esempio mentre è in primo piano una pagina di sistema come le impostazioni, oppure finché non è aperto alcun documento. «Mostra in grigio» è il valore predefinito: il pulsante resta al suo posto, è visibilmente disattivato e non reagisce. «Nascondi» lo toglie dalla barra finché non può fare nulla, e anche dai due menu ai bordi della barra compattata; appena può agire di nuovo, torna al suo posto. Gli interruttori dei pannelli a sinistra, i pulsanti di comando propri, la scelta della lingua e il commutatore chiaro/scuro non conoscono questo stato e non sono mai interessati dalla scelta; anche il menu Visualizza rimane invariato e continua a mostrare in grigio le voci non disponibili.

Un pulsante può quindi mancare nella barra per tre motivi diversi, e solo il terzo dipende da questa impostazione: è deselezionato nell'elenco dei pulsanti predefiniti nascosti e resta assente in modo permanente — quell'elenco agisce prima della scelta, vedi [Posizionamento dei comandi](command-placement.md); appartiene a un'estensione disattivata, e allora la funzione non esiste, vedi [Estensioni](extensions.md); oppure al momento non può fare nulla e la scelta è su «Nascondi», e allora torna da sé.

## Statistiche delle parole

La barra di stato mostra parole, caratteri e il tempo di lettura stimato del file attivo. Se nell'editor è selezionato qualcosa, l'indicazione passa alla selezione. Un clic apre un dialogo di dettaglio con paragrafi, frasi e il numero di titoli per livello. Frontmatter, blocchi di codice e formule KaTeX non vengono conteggiati.

## Impostazioni

Le impostazioni si aprono come scheda propria (File → Impostazioni…, predefinito `Ctrl+,`). La loro navigazione si divide in quattro blocchi:

- **Generali** — tutto ciò che vale per l'intera applicazione, per esempio aspetto, comportamento, scorciatoie da tastiera ed esportazione.
- **Area corrente** — le impostazioni dell'area aperta. Il blocco appare solo finché un'area è aperta.
- **Estensioni (interne)** — l'attivazione e la disattivazione delle estensioni fornite, con le loro sezioni proprie.
- **Estensioni (esterne)** — la gestione dei pacchetti di estensione installati da sé.

Le modifiche agiscono dapprima come bozza con anteprima dal vivo dell'aspetto. Applica e OK salvano; entrambi sono evidenziati solo in presenza di modifiche non salvate, senza modifiche Applica è attenuato. Annulla o la chiusura della scheda scarta la bozza. I valori salvati valgono subito in tutte le finestre aperte. Di più sui due blocchi di estensioni si trova nella pagina [Estensioni](extensions.md).

## Lingua

L'interfaccia esiste in tedesco, inglese, francese, spagnolo e italiano. Il cambio passa dal selettore di lingua nella barra di stato; le pagine del manuale aperte cambiano immediatamente con esso.

## Barra dei menu

La barra dei menu porta i tre menu File, Visualizza e Aiuto. `Alt` attiva il comando da tastiera, e le lettere sottolineate portano direttamente al menu corrispondente, per esempio `Alt+F` per File. Le scorciatoie attualmente attive di tutti i comandi sono elencate nella pagina [Scorciatoie da tastiera](shortcuts.md).

Proprio alla fine del menu Visualizza si trovano gli strumenti di sviluppo. Sono fissati di proposito su `F12` e non sono riassegnabili: sono uno strumento di diagnosi e non parte del lavoro quotidiano.
