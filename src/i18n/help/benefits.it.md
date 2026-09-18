# Utilità e modi di lavorare

Questa pagina non risponde a **come** si fa qualcosa, ma a **a che cosa serve**. Ha due metà: la prima metà mostra quali **modi di lavorare** apre l'applicazione, dal singolo documento allo spazio di lavoro con un nome. La seconda metà mostra che cosa un file Markdown può **esprimere** oltre lo standard Markdown. Dove il discorso si fa concreto, un collegamento alla fine di ogni sezione porta alla pagina che tratta l'argomento in dettaglio.

## Un documento, come serve in questo momento

Leggere, scrivere e verificare sono attività diverse e richiedono presentazioni diverse dello stesso testo. Invece di imporre un compromesso, l'applicazione tiene pronte sei viste, e basta un tasto per passare dall'una all'altra: la pagina finita per leggere, il testo sorgente per il lavoro preciso, entrambi affiancati per confrontare, la modalità dal vivo per scrivere in scioltezza, la mappa mentale per vedere la struttura e la tela per schede su una superficie. Il passaggio non costa nulla e non modifica mai il file.

- **Renderizzata** per leggere, **codice sorgente** per il lavoro preciso sulla sintassi.
- **Divisa** mostra sorgente e risultato affiancati, per i costrutti insidiosi.
- **Dal vivo** formatta mentre si digita e mostra i caratteri Markdown solo nella riga corrente.
- **Mappa mentale** trasforma la struttura dei titoli in un albero.
- **Tela** mostra una superficie con schede e collegamenti che si trova nel documento stesso.

In dettaglio: [Viste e visualizzazione](views-display.md), [Vista mappa mentale](mindmap.md), [Superficie Canvas](canvas.md).

## Molti documenti affiancati

Un ragionamento sta di rado in un solo file. Per questo restano aperti più documenti insieme, in schede che si possono ordinare: i gruppi colorati tengono unito ciò che va insieme, la seconda colonna affianca due documenti, e la barra laterale tiene sott'occhio indice, collegamenti in entrata, note o attività mentre si scrive. Tutto questo lo decidi tu, non il programma: i pannelli si spostano tra il lato sinistro e quello destro, e larghezze e altezze restano come le hai impostate.

- **Schede** per quanti documenti aperti servono, con selezione multipla e posizione a scelta.
- **Gruppi di schede** che uniscono per colore i documenti correlati.
- **Due colonne** nella stessa finestra per origine e destinazione, bozza e modello, capitolo e nota.
- **Pannelli laterali** a sinistra o a destra, con ordine, larghezza e altezza impostati liberamente.

In dettaglio: [Applicazioni, finestre e aree](apps-windows.md), [Barra laterale](sidebar.md).

## Più di una finestra, più di un contesto

Chi lavora a più cose insieme non se la cava con una sola finestra. Una scheda passa in una nuova finestra dal menu contestuale, e più finestre appartengono a un'applicazione, il contesto di lavoro comune. Di applicazioni se ne possono avviare più d'una: ciascuna ha finestre e numerazione proprie, così due progetti non si intralciano mai, anche se usano la stessa applicazione. All'avvio successivo il ripristino della sessione riporta tutto.

- **Finestre** in numero libero, le schede si spostano tra loro.
- **Applicazioni** come contesti di lavoro autonomi con finestre proprie.
- **Ripristino della sessione** che riporta applicazioni, finestre e schede.

In dettaglio: [Applicazioni, finestre e aree](apps-windows.md).

## Ordine per confini, ordine per memoria

Sono disponibili due forme di ordine diverse, e vale la pena conoscerne la differenza. Un'**area** lega un'applicazione a una cartella e la trasforma in un confine: finestra di apertura, elenco dei recenti, salvataggio e ricerca restano al suo interno, così un progetto riservato non sconfina mai per sbaglio in un altro. Uno **spazio di lavoro**, invece, ricorda uno stato: tutte le finestre, le schede, i gruppi e le bozze sotto un nome, tenuti aggiornati senza un passaggio di salvataggio. Aprendolo settimane dopo ci si ritrova esattamente dove si era smesso. I due si possono combinare.

- **Area** significa confine di cartella: ciò che sta fuori non entra — con una sola eccezione, che imposta lei.
- **Spazio di lavoro** significa stato di lavoro salvato, con nome e contrassegno di colore.
- **I due insieme** danno uno stato di lavoro con nome e un confine di cartella fisso.
- **Le aree collegate** sono questa eccezione: un prefisso che lei inserisce, un senso, un collegamento che varca. Una porta, non un confine aperto.

In dettaglio: [Applicazioni, finestre e aree](apps-windows.md).

## Una rete invece di un archivio

La conoscenza cresce di rado nelle cartelle. Cresce nei collegamenti: una nota rimanda a una seconda, una terza riprende entrambe, e dopo un anno il suo materiale porta più nessi di quanti una struttura di cartelle potrebbe rappresentare. Questi nessi vengono conservati e si leggono da due lati — come superficie che mostra che cosa è collegato a che cosa, e come albero che mostra che cosa pende sotto un punto di ingresso e a quale profondità.

- **Collegamenti in entrambi i sensi**: che cosa nomina questo documento e chi nomina questo documento.
- **La rete** mostra l'intorno di un documento, **l'albero** da una radice scelta l'ordine che vi pende sotto.
- **Ogni file esattamente una volta** nell'albero, sulla sua via più breve verso la radice; un clic lo apre.
- **Ciò che nessuno collega** non resta nascosto: le statistiche dell’area nominano questi file.

In dettaglio: [Collegamenti](linking.md) e [Vista grafo](graph.md).

## Quando l'ordine non basta più

Certi pensieri non hanno un ordine. Affiancare alternative, abbozzare un flusso o mettere in ordine dei nessi chiede superficie invece che righe — e chiede di stabilire da sé che cosa va dove. Una tela è esattamente questo: una superficie dentro un normale file Markdown, sulla quale lei dispone liberamente schede con testo proprio e le unisce con linee colorate ed etichettate. A differenza della vista grafo non calcola nulla, ma conserva ciò che lei ha disposto — e poiché si trova nel documento, i testi delle schede restano leggibili anche in qualunque altro programma di testo.

- **Schede con testo proprio**, disposte liberamente e di dimensione regolabile; il loro contenuto è normale Markdown.
- **Collegamenti con senso, colore ed etichetta** — anche con la freccia a entrambe le estremità e con il lato di attacco a scelta.
- **La sua disposizione resta la sua**: la superficie non calcola posizioni, ricorda ciò che lei ha disposto.
- **Testo in chiaro nel documento**: la superficie sta in un blocco di codice del file Markdown ed è leggibile anche senza EM4me.
- **Anche senza mouse**: un elenco accanto alla superficie enumera tutti gli elementi e permette di crearli, etichettarli, collegarli ed eliminarli da tastiera — e di cercarli.

In dettaglio: [Superficie Canvas](canvas.md).

## Dai file nasce un libro

Un'opera lunga è fatta di molti file, e il loro ordine sta altrimenti nel nome del file o nella posizione della cartella, dove ogni rinomina lo rimette in discussione. Un libro ribalta la cosa e mette per iscritto la propria struttura: i capitoli restano normali file Markdown, leggibili anche senza l'applicazione, ma il loro ordine e il loro annidamento sono fissati, l'indice li mostra e la guida di lettura percorre l'opera intera oltre i confini dei capitoli. Gli scaffali raggruppano più libri.

- **Ordine di lettura dichiarato** invece dell'ordinamento alfabetico per nome di file.
- **I capitoli restano file**, leggibili singolarmente e utilizzabili altrove.
- **Guida di lettura** continua, l'indice riordina trascinando o da tastiera.
- **Scaffali** che raggruppano più libri.

In dettaglio: [Libri](books.md).

## Quando un documento supera le dimensioni di un file

A volte un documento cresce oltre ciò che si riesce a modificare con scorrevolezza. Invece di importi un limite, l’applicazione divide da sé un documento simile in più file al salvataggio e lo riunisce all’apertura. Tu non te ne accorgi: un testo continuo, una cronologia di annullamento, un risultato di ricerca. Il taglio avviene solo in corrispondenza dei titoli, così che nessun costrutto venga spezzato, e ogni file di parte resta un normale file Markdown, leggibile senza l’applicazione.

- **La dimensione smette di essere un limite**: anche i documenti molto ampi restano utilizzabili.
- **Invisibile nel tuo lavoro**: una scheda, un testo, un risultato di ricerca.
- **Il taglio avviene ai titoli**, mai in mezzo a una tabella, un elenco o un blocco di codice.
- **Reversibile**: un comando di menu riporta le parti a un unico file.

In dettaglio: [Divisione di documenti grandi](document-parts.md).

## Dati e prosa negli stessi file

Una cartella di file Markdown può essere al tempo stesso una banca dati, e non occorre dichiararla tale: non appena un documento descrive la banca dati, l'area ne contiene una, e una panoramica propria risponde in un solo punto alla domanda su che cosa vi si trovi, cioè nome e descrizione, le tabelle con il numero dei propri campi e le anomalie in chiaro. Le tabelle stesse sono file ordinari: la definizione sta nell'intestazione, i record stanno nel corpo sottostante, e così una tabella è completa in un solo file. Il guadagno vero sta accanto. Da un qualunque testo dell'area rimandi a una singola riga di una tabella, così come altrove rimandi a un file; la nota su una riunione punta allora al record della persona di cui parla.

- **L'area diventa una banca dati** non appena un documento la descrive, e riceve la propria panoramica come vista di sola lettura.
- **La tabella risiede nel suo file**: i campi nell'intestazione, i record nel corpo. Rinominare e spostare non cambiano nulla, neppure fuori dall'applicazione.
- **Otto tipi di colonna**, con etichette che possono esistere in più lingue.
- **Il collegamento a un singolo record** si scrive come un'ancora e si comporta come ogni altro collegamento: il linter Markdown indica se vale, e un clic apre il file della tabella.
- **I grandi insiemi restano una sola tabella**: da circa 0,7 MB in poi l'applicazione distribuisce i record al salvataggio su più file affiancati, senza che alcun collegamento ne risenta.

Ciò che questa prima tappa non porta ancora: i record si inseriscono ancora nel testo del file, non c'è una maschera di inserimento, né una verifica dei valori in scrittura, né un'interrogazione sui record.

In dettaglio: [Banca dati](database.md).

## L’applicazione si adatta — e ti segue

Chi lavora a lungo con un programma finisce per plasmarlo: colori, scorciatoie da tastiera, pulsanti, modelli e segnalibri crescono con il tuo modo di lavorare, e a un certo punto ne fa parte anche la lingua in cui parla l’interfaccia. Finora questo lavoro era legato a un solo computer e alle lingue fornite con l’applicazione. Entrambe le cose sono aperte: la tua configurazione può essere scritta in un file leggibile e riletta altrove, e chi ha bisogno di una sesta lingua traduce da sé l’interfaccia. A questo si aggiunge lo sguardo d’insieme: una pagina che mostra affiancati tutti i tuoi spazi di lavoro, aree, libri e librerie, comprese quelle che al momento non sono collegate.

- **La configurazione come file**: esportarla, portarla con sé, rileggerla altrove — per intero o in parte, con un’anteprima che dice in anticipo che cosa accadrà.
- **Una sesta lingua: la tua.** Tradurre un modello, installarlo, sceglierlo nella barra di stato; ciò che vi manca compare in inglese e non come chiave grezza.
- **Tutti i contenitori in un solo luogo**: inseriti a mano invece che raccolti automaticamente, con cifre e il momento in cui sono state rilevate.
- **Nulla accade alle tue spalle**: nessun disco viene percorso, e nessuna lettura scrive alcunché prima della tua conferma.

In dettaglio: [Esportare e importare le impostazioni](setup-exchange.md), [Lingua dell’interfaccia propria](custom-locale.md), [My Extended Memory](my-extended-memory.md).

## Tabelle che reggono più di una riga

Qui finisce la domanda sui modi di lavorare e comincia quella su ciò che il file può esprimere. Lo standard Markdown non ha bisogno di spiegazioni; conta ciò che va oltre, e comincia dalla tabella. Una tabella standard è basata sulla riga e accoglie perciò solo testo breve. La Perspective Table accoglie interi blocchi in una cella: elenchi annidati, più paragrafi, blocchi di codice, immagini e perfino una tabella dentro la tabella. La tabella diventa così uno strumento di struttura per contenuti veri invece di una raccolta di parole chiave.

- **Celle a blocco** con elenchi, paragrafi, codice e immagini invece di campi di una sola riga.
- **Annidamento**, unione di celle e allineamento per impaginazioni esigenti.
- **Ordinamento ed evidenziazione degli stati** direttamente nella tabella renderizzata.
- **Leggibile anche altrove:** il blocco resta un blocco di codice pulito in altri programmi Markdown invece di lacerare il testo.

In dettaglio: [Perspective Table](perspective-table.md).

## Tabelle che calcolano

Per i numeri invece del testo c'è il secondo tipo di tabella. La Perspective Datatable è una tabella di dati tipizzata: ogni colonna ha un tipo di valore, le celle accettano solo valori conformi, le righe di aggregato calcolano dal vivo e le colonne calcolate valutano un'espressione per riga. Si modifica direttamente nella griglia renderizzata, senza passare dal testo sorgente. Questo regge spese, registrazione dei tempi o inventari senza diventare un file di banca dati, perché tutto resta testo in chiaro nel documento.

- **Tipi di valore fissi** per colonna, così i numeri restano numeri e le date restano date.
- **Aggregati** che calcolano dal vivo e **colonne calcolate** per riga.
- **Modifica nella griglia**, senza passare al testo sorgente.
- **Calcolare anche nel testo corrente:** i calcoli in linea usano lo stesso linguaggio di espressioni a metà frase.
- **Il testo in chiaro resta in chiaro:** i dati stanno immutati nel file Markdown.

In dettaglio: [Perspective Datatable](datatable.md).

## Tipi di documenti che si appoggiano l'uno all'altro

Molti documenti di un'area condividono gli stessi campi: uno stato, una data, una categoria. I profili di proprietà descrivono questi campi una sola volta, in modo centralizzato, con tipo, valori ammessi e valore predefinito; gli editor delle proprietà li suggeriscono e offrono gli insiemi di valori come liste di selezione. I profili ereditano l'uno dall'altro: un profilo di base dice ciò che vale per tutti, e un tipo di documento come articolo o riunione aggiunge solo la propria parte, esclude se necessario campi ereditati o li sostituisce. Gli scostamenti producono avvisi invece di blocchi. Quale profilo vale non deve essere scritto nel documento: bastano un'etichetta o la sua cartella, e un simbolo sul documento mostra quale è risultato. Anche i valori ammessi di un campo possono venire dal materiale stesso invece che dalla definizione.

- **Descrivere i campi una sola volta** invece che in ogni documento: suggerimenti, liste di selezione e tipi vengono dal profilo.
- **Ereditarietà con esclusione e sostituzione:** il comune nel profilo genitore, il proprio nel tipo di documento.
- **Avvisi leggeri invece di blocchi:** gli scostamenti vengono indicati, nulla viene bloccato.
- **Assegnazione senza voce nel documento:** un'etichetta o la cartella decide quale profilo vale.
- **Liste di valori che si mantengono da sole:** i valori ammessi vengono da una nota o da una query sul materiale.
- **Campi che portano una struttura:** Una riunione con tre partecipanti ha bisogno di un campo invece di tre elenchi paralleli per nome, ruolo e azienda; nel blocco di metadati resta YAML comune e leggibile.

In dettaglio: [Profili di proprietà](property-profiles.md).

## Elenchi che si mantengono aggiornati

Chi gestisce molti file mantiene altrimenti le panoramiche a mano, e invecchiano il giorno stesso. Una query Perspective descrive invece **che cosa** si cerca, e il risultato compare lì nel documento: un elenco o una tabella cliccabile sull'intero insieme, filtrata per proprietà, etichette e campi del file, fino ai singoli blocchi di testo e alle attività. Se l'insieme cambia, cambia l'output, senza che nessuno aggiorni nulla.

- **Pagine tematiche** che elencano da sé i file collegati.
- **Filtri** su proprietà del frontmatter, etichette e campi del file.
- **Livello di blocco e di attività**, non solo file interi.
- **Ogni risultato cliccabile**, che porta dritto alla sua destinazione.

In dettaglio: [Query Perspective](frontmatter-query.md).

## Quando la query non basta: gli script

Certe analisi non si formulano come condizione, per esempio un albero ricorsivo lungo i collegamenti o una panoramica che calcola strada facendo. Se ne occupano i blocchi di script: un blocco esegue un piccolo programma, legge lo stesso insieme della query e produce elenchi, tabelle o testo già formattato nel documento. Poiché questo significa più libertà, la funzione è legata a un modello di fiducia esplicito e a limiti di esecuzione, e non è semplicemente attiva di fabbrica.

- **Analisi libere** sugli stessi dati della query.
- **Strutture ricorsive** e panoramiche calcolate, non esprimibili in modo dichiarativo.
- **Modello di fiducia esplicito** e limiti di esecuzione invece di un'esecuzione silenziosa.

In dettaglio: [Blocchi di script](scripts.md).

## E il resto del linguaggio

Oltre ai quattro grandi costrutti, il linguaggio porta più di cinquanta estensioni: riquadri di richiamo e note a piè di pagina per il testo, formule e diagrammi per la presentazione, collegamenti, etichette e incorporamenti per i nessi, attività, promemoria e appuntamenti per la giornata di lavoro, oltre a modelli e diari. Nulla di tutto questo è obbligatorio: ogni estensione ha il proprio interruttore, e ciò che è spento sparisce da menu, comandi e visualizzazione invece di intralciare.

- **Estensioni di testo** per riquadri di richiamo, note a piè di pagina, evidenziazione e abbreviazioni.
- **Presentazione** con formule, diagrammi e codice evidenziato; nell'esportazione portatile un diagramma viaggia come immagine finita ed è visibile anche dove EM4me non è installato.
- **Rimandi all'interno del testo** tramite ancore, incorporamenti ed etichette.
- **Giornata di lavoro** con attività, promemoria, appuntamenti, modelli e diari.
- **Attivabili una per una** e aperto a estensioni proprie tramite un'interfaccia documentata.

In dettaglio: [Funzionalità](functions.md), [Estensioni](extensions.md), [Creare estensioni](extensions-dev.md).
