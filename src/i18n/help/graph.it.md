# Vista grafo

La vista grafo rende visibili le relazioni di collegamento dei file Markdown: ogni file è un nodo, ogni collegamento un arco orientato. Esistono due accessi con la stessa interazione: il **grafo dell'area** in una scheda dedicata per l'intera area e il **grafo del file** come pannello laterale per il vicinato del file attivo. Il grafo dell'area presenta i suoi dati a scelta come **rete** oppure come **albero**.

Entrambe le forme appartengono all'estensione **Vista grafo** e possono essere disattivate insieme in Impostazioni → Estensioni.

## Grafo dell'area (scheda)

Il grafo dell'area mostra tutti i file Markdown dell'area aperta con i loro collegamenti sulla grande superficie di una scheda dedicata. Si apre dal menu Visualizza → Grafo dell'area oppure dal menu contestuale del pannello dell'area; c'è una scheda grafo per finestra, aprirla di nuovo attiva quella esistente. La scheda è una vista di sola lettura senza modalità di modifica; il suo titolo porta il nome dell'area. Senza un'area aperta la voce non è disponibile.

La barra degli strumenti in testa alla scheda offre:

- **Visualizzazione** — passa tra **rete** e **albero**. La scelta vale per la scheda aperta; alla prossima apertura riparte dalla rete. Direzione e «Riorganizza» valgono solo per la rete.
- **Direzione** — «Entrambe le direzioni» mostra il grafo completo. «In entrata» o «In uscita» limitano la visualizzazione ai file raggiungibili dal file attivo tramite collegamenti della direzione scelta (a qualsiasi profondità). Se nessun file è attivo, il grafo continua a mostrare tutti gli archi e lo segnala.
- **Contatore dei file** — il numero di nodi attualmente visualizzati.
- **Riorganizza** — ricalcola la disposizione e scarta le posizioni spostate a mano.

### Albero dei collegamenti

L'albero risponde alla domanda sull'**ordine** che la rete lascia aperta: che cosa pende sotto un punto di ingresso e a quale profondità. Mostra gli stessi dati — gli stessi file, gli stessi collegamenti, lo stesso confine dell'area —, solo orientati a partire da una radice e apribili.

**La radice** è inizialmente la pagina iniziale dell'area; se non ne è impostata alcuna, l'albero si radica nel file che era attivo all'apertura della vista. Si cambia in due modi: tramite l'indicazione della radice nella barra degli strumenti, che apre la stessa selezione per nome di «Apri file tramite il nome», oppure tramite la voce «Come radice dell'albero dei collegamenti» nel menu contestuale di un file nel pannello dell'area. La radice scelta vale per la scheda aperta; la pagina iniziale non ne è toccata.

**Ogni file compare esattamente una volta.** Se è raggiungibile per piu vie, si colloca sulla sua via **piu breve** verso la radice; a parita di lunghezza decide il genitore alfabeticamente primo. Un file che non trova dove se lo aspetta si trova quindi piu in alto. I cicli non producono ripetizioni.

**L'apertura procede a passi:** all'apertura è visibile il primo livello, i livelli piu profondi con un clic sul triangolo; «Espandi tutto» e «Comprimi tutto» agiscono sull'intero albero. Il numero dopo un nome indica i suoi figli. Un clic sul nome apre il file.

**Il piè di pagina** indica il numero di file **non** raggiungibili da questa radice. Non è un errore ma una proprietà del suo materiale: l'albero mostra ciò che pende sotto la radice, non l'intera area. Se non esiste alcun file di questo tipo, la riga scompare.

## Grafo del file (pannello)

Il pannello «Grafo del file» mostra il vicinato di collegamenti del file attivo e lo segue automaticamente al cambio di scheda. Si attiva dal menu Visualizza → Barra laterale → Pannelli → Grafo del file, dall'icona del grafo nella barra di stato o con una scorciatoia da tastiera personalizzata; lato, ordine e gruppi di schede seguono le regole della [barra laterale](sidebar.md).

Nell'intestazione del pannello ci sono due controlli:

- **Profondità** (da 1 a 5) — quanti passi di collegamento attorno al file attivo vengono inclusi. La profondità 1 mostra solo i vicini diretti, valori maggiori estendono il vicinato passo dopo passo.
- **Direzione** — «In uscita» segue solo i collegamenti che escono dal file, «In entrata» solo i collegamenti che puntano al file, «Entrambe le direzioni» combina i due.

Entrambe le impostazioni valgono per colonna per la sessione in corso. Un file senza relazioni di collegamento appare come nodo singolo con un'indicazione. Al di fuori di un'area il pannello lavora con lo spazio di ricerca limitato attorno alla cartella del file e lo segnala con discrezione; il grafo completo lo fornisce l'area.

## Interazione

- **Zoom** — rotellina del mouse sopra la superficie, centrato sul puntatore.
- **Spostare** — trascinare la superficie tenendo premuto il pulsante del mouse.
- **Trascinare i nodi** — i singoli nodi possono essere riposizionati con il mouse; la posizione viene mantenuta per la durata della sessione, anche quando il grafo si aggiorna.
- **Evidenziare** — al passaggio del puntatore su un nodo risaltano il nodo stesso, i suoi vicini diretti e gli archi coinvolti; il resto viene attenuato.
- **Aprire** — un clic su un nodo apre il file (oppure salta alla scheda già aperta). Il file attivo è evidenziato con il colore.
- **Nomi duplicati** — se più file condividono lo stesso nome, un suggerimento sul nodo mostra il percorso completo.

## Semantica delle frecce

Gli archi sono orientati: la freccia punta dal documento che collega al documento collegato. Se due file si riferiscono a vicenda, i due collegamenti si fondono in **un** arco con punte di freccia a entrambe le estremità (doppia freccia). Nel grafo entrano i collegamenti wiki (inclusa la risoluzione degli alias) e i collegamenti Markdown verso file dello spazio di ricerca; più collegamenti tra gli stessi due file contano come un solo arco.

## Limiti

- I nodi sono esclusivamente **file Markdown**; tag, allegati o singoli blocchi non compaiono nel grafo.
- Nelle aree molto grandi (più di 1500 file) **la rete** mostra i nodi più connessi e segnala quelli nascosti. L'albero non conosce questo limite: disegna solo i rami aperti e resta quindi completo.
- Il grafo dell'area richiede un'area aperta; il pannello del file funziona anche senza area, allora con uno spazio di ricerca limitato.
