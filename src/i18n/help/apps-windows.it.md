# Applicazioni, finestre e aree

L'app organizza il lavoro su tre livelli: **applicazioni** (contesti di lavoro indipendenti), **finestre** (quante se ne vogliono per applicazione) e **schede**. Questa pagina descrive l'avvio multiplo, la gestione delle finestre, la sistematica dei titoli, le **aree** (una cartella come spazio di lavoro esclusivo di un'applicazione) e gli **spazi di lavoro** (applicazioni con nome, salvate stabilmente con tutte le loro finestre).

## Applicazioni

Il programma può essere avviato più volte: ogni avvio aggiuntivo del file di programma crea una nuova applicazione, un contesto di lavoro indipendente con finestre e numerazione proprie. «File → Nuova applicazione» fa lo stesso.

Tutte le applicazioni girano in un unico processo e condividono le impostazioni. Il ripristino della sessione (Aiuto → Ripristina sessione) riapre al prossimo avvio tutte le applicazioni con le loro finestre e schede.

## Bozze non salvate

I nuovi documenti mai salvati (schede senza titolo con contenuto) sopravvivono alla chiusura dell'app: il loro contenuto viene conservato alla chiusura e riaperto come schede senza titolo al successivo avvio. Ciò avviene indipendentemente dal ripristino della sessione, quindi anche quando questo è disattivato.

La memoria temporanea agisce solo alla chiusura dell'app o di una finestra, non alla chiusura di una singola scheda (Ctrl+W); una singola bozza viene deliberatamente scartata tramite la finestra di dialogo di salvataggio. I file già salvati non sono interessati e mantengono la loro finestra di dialogo di salvataggio alla chiusura.

Disattivazione in «Impostazioni → Comportamento» con «Conserva i nuovi documenti non salvati alla chiusura» (predefinito: attivo).

## Finestre

All'interno di un'applicazione si possono aprire quante finestre si vuole: tramite il menu contestuale della scheda («Sposta in» / «Copia in» → «Nuova finestra») una scheda passa in una nuova finestra della stessa applicazione. Con più finestre aperte, il sottomenu elenca tutte le altre finestre come destinazione; non appena sono in esecuzione più applicazioni, le voci di destinazione riportano il contesto dell'applicazione.

## Posizione delle nuove schede

Una scheda creata **a partire da un'altra** si apre immediatamente alla sua destra. Vale per ogni clic nel contenuto di un documento — link wiki, risultato di una interrogazione, origine di un evento, navigazione dei diari, collegamento di diagramma — e allo stesso modo per la cronologia del documento, che compare accanto alla scheda del proprio documento. Il legame fra origine e destinazione resta visibile e il ritorno è breve.

Se un'azione apre più file in una volta, essi si dispongono dietro l'origine nel loro ordine. Se il file di destinazione è già aperto, viene attivata solo la sua scheda; l'ordine della barra non cambia mai per questo.

Tutte le aperture **senza** origine si collocano come sempre alla fine della barra: finestra di dialogo dei file, tavolozza dei comandi, segnalibri, pannelli, elenco dei file dell'area, oltre al manuale e alle impostazioni.

## Gruppi di schede

Le schede possono essere riunite in gruppi denominati e colorati: i membri stanno insieme dietro un'**intestazione di gruppo** colorata nella barra delle schede, e le loro schede portano una sottolineatura nel colore del gruppo.

- **Creare:** menu contestuale di una scheda → «Nuovo gruppo con questa scheda». Il gruppo riceve un nome predefinito e il successivo colore libero; la finestra di rinomina con scelta del colore (tavolozza fissa di otto colori, adattata ai temi chiaro e scuro) si apre subito.
- **Riempire:** «Aggiungi al gruppo» nel menu contestuale della scheda, oppure trascinare una scheda sull'intestazione del gruppo o tra due membri. «Rimuovi dal gruppo» o trascinare una scheda fuori dal blocco termina l'appartenenza; i gruppi restano sempre contigui.
- **Spostare in blocco:** se sono selezionate più schede (vedi «Selezione multipla di schede»), le tre voci di gruppo del menu contestuale agiscono sull'intera selezione, e trascinare una scheda selezionata sull'intestazione fa entrare tutto il blocco. Esso si aggiunge alla fine del blocco del gruppo nel suo ordine nella barra; all'uscita si colloca subito dietro di esso.
- **File derivati:** quando un clic nel contenuto di un documento raggruppato apre un altro file (link wiki, risultato di query, riga di evento, navigazione del giornale), la nuova scheda si aggiunge allo stesso gruppo, nella sua posizione accanto all'origine (vedi «Posizione delle nuove schede»). Il blocco resta compatto. Le aperture al di fuori del contenuto del documento — elenco dei file, pannelli, segnalibri, palette dei comandi, finestre di dialogo — restano non raggruppate; i file di destinazione già aperti vengono solo attivati.
- **Comprimere:** un clic sull'intestazione comprime il gruppo — resta visibile solo l'intestazione con il numero dei membri. Vale anche quando la scheda attiva si trova nel gruppo: resta attiva, il suo contenuto resta nella finestra e l'intestazione porta lo stesso contrassegno di una scheda attiva. Il gruppo si espande solo con un clic; un'attivazione dall'esterno (link wiki, palette dei comandi, cambio scheda da tastiera) lo lascia compresso.
- **Passare il mouse invece di espandere:** passando il mouse sull'intestazione di un gruppo compresso compare, dopo una breve pausa, l'elenco delle sue schede; un clic al suo interno passa a quel file senza espandere il gruppo. La scheda attiva è contrassegnata nell'elenco e i file non salvati portano il loro punto di modifica.
- **Gestire:** menu contestuale dell'intestazione — «Rinomina e colore…», «Separa il gruppo» (le schede restano aperte) e «Chiudi il gruppo» (tutti i membri con le consuete richieste di salvataggio). Trascinare l'intestazione sposta l'intero gruppo lungo la barra.

I gruppi appartengono alla loro barra delle schede (una per lato nella vista divisa); una scheda che cambia barra lascia il suo gruppo. Nome, colore, membri e stato compresso sopravvivono al ripristino della sessione. La funzione può essere disattivata come estensione «Gruppi di schede»; i gruppi vengono conservati e ricompaiono invariati alla riattivazione.

## Selezione multipla di schede

È possibile selezionare più schede contemporaneamente e spostarle poi in un solo passaggio.

- **Selezionare:** **Ctrl** e clic aggiunge una scheda alla selezione e la rimuove di nuovo, **Maiusc** e clic seleziona l'intervallo dalla scheda attiva a quella su cui si è fatto clic. Le schede selezionate sono evidenziate; la selezione diventa visibile a partire da due membri.
- **Spostare:** trascinare una scheda selezionata sposta l'intero blocco, sia nella barra sia su un'intestazione di gruppo. Oltre il confine della colonna, invece, viaggia solo la scheda trascinata.
- **Menu contestuale:** le voci di gruppo agiscono sulla selezione non appena la scheda su cui si è fatto clic ne fa parte. Le voci che indicano esattamente un file — rinomina, segnalibro, sposta o copia in una finestra — restano legate alla scheda su cui si è fatto clic, così come il clic centrale per chiudere.
- **Fine della selezione:** un clic senza tasto modificatore, il cambio di colonna o la chiusura della sessione. La selezione appartiene a una singola barra delle schede e non viene salvata.

## Forma delle schede

Le schede e le intestazioni dei gruppi hanno angoli superiori squadrati oppure arrotondati, a scelta (File → Impostazioni… → Aspetto). Con gli angoli arrotondati uno stretto spazio sostituisce la linea di separazione verticale tra le schede; il contrassegno della scheda attiva, le fasce colorate dei gruppi e la marcatura della colonna attiva restano invariati. L'impostazione vale per l'intera applicazione e ha effetto immediato in tutte le finestre aperte.

## Sistematica dei titoli

Il titolo della finestra mostra tra parentesi a quale contesto appartiene una finestra, solo quanto necessario:

| Situazione | Suffisso del titolo |
|---|---|
| Un'applicazione, una finestra | *(nessun suffisso)* |
| Un'applicazione, più finestre | `(Finestra 2)` |
| Più applicazioni, una finestra ciascuna | `(App 2)` |
| Più applicazioni e finestre | `(App 2, Finestra 3)` |
| Applicazione di area | `(Area Note)` oppure `(Area Note, Finestra 2)` |
| Spazio di lavoro | `(Spazio di lavoro Alpha)` oppure combinato `(Spazio di lavoro Alpha, Area Note, Finestra 2)` |

I numeri scalano alla chiusura: se si chiude l'applicazione 1, l'applicazione 2 diventa il nuovo numero 1; lo stesso vale per i numeri di finestra all'interno di un'applicazione. Le applicazioni di area non portano un numero; mostrano sempre il nome della loro cartella di area. Gli spazi di lavoro mostrano il proprio nome, combinato con il nome dell'area quando un'area è collegata.

## Aree

Un'**area** vincola un'applicazione a una cartella: tutto ciò che si trova in questa cartella, sottocartelle comprese, è lo spazio di lavoro, nient'altro. «File → Area → Apri area…» sceglie la cartella; «File → Area → Chiudi area» termina il lavoro nell'area e chiude tutte le finestre dell'applicazione dell'area (con le consuete richieste di salvataggio). Il vincolo è fisso: un'area non può essere cambiata, solo chiusa.

All'apertura valgono tre regole:

- Se l'applicazione è vuota (nessun file aperto), adotta l'area.
- Se l'applicazione ha già un file aperto, viene creata una nuova applicazione per l'area.
- Se l'area è già in esecuzione, il focus passa a una finestra dell'applicazione dell'area; la stessa area non gira mai due volte.

**Demo-Area:** «File → Area → Crea la Demo-Area…» copia una raccolta di esempi fornita in inglese — pagine Markdown insieme ad allegati immagine e PDF che mostrano le funzioni più importanti — in una cartella vuota e la apre direttamente come area: un ambiente di prova per sperimentare senza rischi. Le cartelle di destinazione non vuote vengono rifiutate, e i file esistenti non vengono mai sovrascritti. La funzione può essere disattivata come estensione «Demo-Area»; le cartelle demo già create sono aree ordinarie e restano intatte.

**Che cosa porta con sé la raccolta:** Due spazi di lavoro denominati vengono creati come voci in «File → Spazi di lavoro», senza aprirsi da soli. «Astronomy» comprende due finestre con i gruppi di schede colorati «Hierarchy» e «Scales», «Getting Started» una finestra per iniziare. L'area tematica dedicata all'astronomia illustra allo stesso tempo una gerarchia di sottopagine a quattro livelli, dalla galassia alla luna passando per la stella e il pianeta, oltre a pagine su velocità della luce, distanze ed età.

### Limiti rigidi

All'interno di un'applicazione di area, l'area è il confine: la finestra di apertura parte nell'area e respinge una selezione esterna, «Recenti» mostra solo file dell'area, «Salva con nome» accetta solo destinazioni nell'area, e nemmeno tramite trascinamento entra un file estraneo. I file aperti dall'esplora risorse si aprono sempre in un'applicazione senza area.

I collegamenti la cui destinazione si trova fuori dall'area sono contrassegnati con una sottolineatura di avviso; il suggerimento mostra il percorso completo della destinazione. Un clic non apre la destinazione ma segnala il motivo nella barra di stato. Le immagini incorporate vengono comunque mostrate anche se si trovano all'esterno; il confine riguarda l'apertura dei file, non il rendering.

### Spazio di ricerca e indice

In un'applicazione di area, lo spazio di ricerca per backlink, tag, completamento automatico e linter copre l'**intera** area invece della sola cartella del file attivo. Affinché l'area sia pronta rapidamente all'apertura, l'applicazione crea il file **`Area_Cache.mdda`** nella cartella radice dell'area. È una semplice cache dell'indice e può essere eliminato senza rischi; viene ricostruito alla successiva apertura dell'area.

### Pannello dell'area

Il pannello «Area» mostra l'area come struttura di cartelle nella barra laterale (agganciabile a sinistra o a destra come ogni pannello; l'interruttore è l'icona della cartella nella barra di stato o Visualizza → Barra laterale → Pannelli → Area): l'albero delle cartelle in alto e sotto i file Markdown della cartella selezionata; gli altri tipi di file non compaiono. Un clic su un file lo apre come scheda, tutte le voci mostrano il percorso completo come suggerimento e le modifiche esterne (file creato, eliminato, rinominato) compaiono automaticamente. Il pulsante «+» in testa all'elenco crea un nuovo file Markdown nella cartella selezionata e lo apre. In un'applicazione di area appena aperta e ancora vuota il pannello è visibile automaticamente.

### Statistiche dell'area

«Visualizza → Statistiche dell'area» apre una pagina di indicatori dell'area aperta come scheda dedicata; lo stesso punto di accesso si trova nel menu contestuale del pannello dell'area. La pagina è di sola lettura e mostra sei sezioni: **File e spazio occupato** (file Markdown e non Markdown suddivisi in immagini, PDF e altri, numero di cartelle, spazio occupato con le sue quote), **Proprietà** e **Tag** (il numero di file per voce, ordinabile per nome o per numero), **File di accompagnamento** (il `.mdd` di ogni documento e i file dell'area `.mdda`), **Contenuto** (attività per stato, collegamenti wiki e Markdown, alias, file senza collegamenti in entrata) e **File notevoli** (i più grandi, i modificati più di recente e i più collegati). Un clic su un nome di file in queste ultime tre liste apre il file.

Si contano **file, non occorrenze**: se il tag `#progetto` mostra 180, allora 180 file portano quel tag; quante volte compaia nel loro testo non viene indicato. Gli elenchi lunghi iniziano con 25 righe e si possono espandere per intero.

I numeri portano in alto un riferimento temporale e vengono calcolati **su richiesta**, non di continuo: il pulsante «Aggiorna» li ricalcola, così come una nuova chiamata della voce di menu. Senza un'area aperta non esiste un insieme di file delimitato; la voce è allora disattivata. La funzione si può disattivare come estensione «Statistiche dell'area».

### Aree recenti

«File → Area → Aree recenti» elenca le aree aperte di recente con il nome della cartella. Un clic apre l'area con le consuete regole. Le aree vengono ripristinate con la sessione; se all'avvio manca una cartella di area, l'applicazione corrispondente non viene ripristinata e viene mostrato un avviso.

## Spazi di lavoro

Uno **spazio di lavoro** è un'applicazione con nome, salvata stabilmente: comprende tutte le sue finestre con i riquadri, le schede con le relative impostazioni di visualizzazione, i gruppi di schede, un eventuale collegamento a un'area e le bozze non salvate. Uno spazio di lavoro aperto mantiene il proprio stato aggiornato **automaticamente**, senza alcun passaggio manuale di salvataggio; alla riapertura il lavoro riprende esattamente dall'ultimo stato. Accesso: il sottomenu «File → Spazi di lavoro» con l'elenco di tutti gli spazi di lavoro (il punto colorato indica anche lo stato: pieno = aperto, anello = chiuso) e le quattro azioni sottostanti; le stesse azioni sono disponibili come comandi nella palette dei comandi.

**Area e spazio di lavoro sono due cose diverse:** un'*area* collega un'applicazione a una **cartella** e ne delimita lo spazio di lavoro (vedi sopra). Uno *spazio di lavoro* è una **raccolta di finestre** con nome e riapribile, cioè uno stato di lavoro salvato. Le due cose si combinano: uno spazio di lavoro la cui applicazione ha collegato un'area porta quel collegamento con sé nella registrazione.

**Colore della barra del titolo:** le finestre di uno spazio di lavoro aperto portano il suo colore nella barra del titolo — una variante intensa nel tema chiaro, una variante pastello della palette nel tema scuro, ciascuna con un colore del testo del titolo adeguato. La colorazione segue il ciclo di vita: compare all'apertura, cambia subito con il colore nella gestione, scompare alla chiusura o all'eliminazione e viene meno alla disattivazione dell'estensione «Spazi di lavoro». Richiede Windows 11; senza questo supporto resta la barra del titolo standard e l'app non ne è compromessa.

### Ciclo di vita

- **Creare:** «Salva come spazio di lavoro…» dà un nome all'applicazione in corso con tutte le sue finestre (la finestra di dialogo chiede nome e colore; i colori provengono dalla palette a otto colori dei gruppi di schede). «Nuovo spazio di lavoro…» crea uno spazio di lavoro vuoto e apre subito la sua prima finestra.
- **Aprire:** un clic su una voce dell'elenco ripristina tutte le finestre all'ultimo stato. Lo stesso spazio di lavoro non è mai aperto due volte; se è già aperto, il focus passa alla sua finestra attiva più recente.
- **Chiudere:** «Chiudi lo spazio di lavoro» (o la chiusura dell'ultima finestra) congela lo stato e chiude tutte le finestre dello spazio di lavoro. Le modifiche non salvate di file con nome passano per le consuete richieste di salvataggio; un annullamento interrompe la chiusura. Le schede senza titolo con contenuto passano nella registrazione senza richieste e tornano alla successiva apertura dello spazio di lavoro.
- **Rinominare e colore:** in qualsiasi momento tramite «Gestisci gli spazi di lavoro…»; il titolo della finestra si aggiorna subito.
- **Eliminare:** dopo una conferma rimuove solo la registrazione, mai i file Markdown. Uno spazio di lavoro attualmente aperto non viene chiuso; continua come normale applicazione senza nome, e le sue bozze ancora salvate passano nel deposito generale delle bozze.

### Gestione

«Gestisci gli spazi di lavoro…» apre una finestra di dialogo con tutti gli spazi di lavoro: punto colorato, nome, stato (aperto o chiuso) e momento dell'ultima apertura. Ogni voce offre le azioni **Apri**, **Rinomina e colore…** ed **Elimina**.

### Ripristino della sessione e casi limite

Con il ripristino della sessione attivo, al prossimo avvio tornano le applicazioni senza nome **e** tutti gli spazi di lavoro aperti al momento della chiusura. Se il ripristino è disattivato, si apre come al solito una finestra vuota; le registrazioni restano integre e possono essere aperte in qualsiasi momento dal sottomenu. Se all'apertura manca la cartella di area collegata di uno spazio di lavoro, compare un avviso e l'apertura non avviene; la registrazione resta invariata.

La funzione può essere disattivata come estensione «Spazi di lavoro»: sottomenu, comandi e gestione scompaiono, mentre le registrazioni e gli spazi di lavoro aperti restano intatti; alla riattivazione tutto torna invariato.
