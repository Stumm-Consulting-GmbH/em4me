# Utilità e modi di lavorare

Questa pagina non risponde a **come** si fa qualcosa, ma a **a che cosa serve**. Ha due metà: le prime cinque sezioni mostrano quali **modi di lavorare** apre l'applicazione, dal singolo documento allo spazio di lavoro con un nome. La seconda metà mostra che cosa un file Markdown può **esprimere** oltre lo standard Markdown. Dove il discorso si fa concreto, un collegamento alla fine di ogni sezione porta alla pagina che tratta l'argomento in dettaglio.

## Un documento, come serve in questo momento

Leggere, scrivere e verificare sono attività diverse e richiedono presentazioni diverse dello stesso testo. Invece di imporre un compromesso, l'applicazione tiene pronte cinque viste, e basta un tasto per passare dall'una all'altra: la pagina finita per leggere, il testo sorgente per il lavoro preciso, entrambi affiancati per confrontare, la modalità dal vivo per scrivere in scioltezza e la mappa mentale per vedere la struttura. Il passaggio non costa nulla e non modifica mai il file.

- **Renderizzata** per leggere, **codice sorgente** per il lavoro preciso sulla sintassi.
- **Divisa** mostra sorgente e risultato affiancati, per i costrutti insidiosi.
- **Dal vivo** formatta mentre si digita e mostra i caratteri Markdown solo nella riga corrente.
- **Mappa mentale** trasforma la struttura dei titoli in un albero.

In dettaglio: [Viste e visualizzazione](views-display.md), [Vista mappa mentale](mindmap.md).

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

- **Area** significa confine di cartella: ciò che sta fuori non entra.
- **Spazio di lavoro** significa stato di lavoro salvato, con nome e contrassegno di colore.
- **I due insieme** danno uno stato di lavoro con nome e un confine di cartella fisso.

In dettaglio: [Applicazioni, finestre e aree](apps-windows.md).

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

## Tabelle che reggono più di una riga

Qui finisce la domanda sui modi di lavorare e comincia quella su ciò che il file può esprimere. Lo standard Markdown non ha bisogno di spiegazioni; conta ciò che va oltre, e comincia dalla tabella. Una tabella standard è basata sulla riga e accoglie perciò solo testo breve. La Perspective Table accoglie interi blocchi in una cella: elenchi annidati, più paragrafi, blocchi di codice, immagini e perfino una tabella dentro la tabella. La tabella diventa così uno strumento di struttura per contenuti veri invece di una raccolta di parole chiave.

- **Celle a blocco** con elenchi, paragrafi, codice e immagini invece di campi di una sola riga.
- **Annidamento**, unione di celle e allineamento per impaginazioni esigenti.
- **Ordinamento ed evidenziazione degli stati** direttamente nella tabella renderizzata.
- **Leggibile anche altrove:** il blocco resta un blocco di codice pulito in altri programmi Markdown invece di lacerare il testo.

In dettaglio: [Perspective Table](perspective-table.md).

## Tabelle che calcolano

Per i numeri invece del testo c'è il secondo tipo di tabella. La Perspective Datatable è una tabella di dati tipizzata: ogni colonna ha un tipo di valore, le celle accettano solo valori conformi, le righe di aggregato calcolano dal vivo e le colonne calcolate valutano un'espressione per riga. Si modifica direttamente nella griglia renderizzata, senza passare dal testo sorgente. Questo regge spese, registrazione dei tempi o inventari senza diventare un file di database, perché tutto resta testo in chiaro nel documento.

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
- **Presentazione** con formule, diagrammi e codice evidenziato.
- **Nessi** tramite collegamenti, ancore, incorporamenti ed etichette.
- **Giornata di lavoro** con attività, promemoria, appuntamenti, modelli e diari.
- **Attivabili una per una** e aperto a estensioni proprie tramite un'interfaccia documentata.

In dettaglio: [Funzionalità](functions.md), [Estensioni](extensions.md), [Creare estensioni](extensions-dev.md).
