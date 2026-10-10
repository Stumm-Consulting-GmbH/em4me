# Versione portatile

EM4me esiste come versione installata e come versione portatile. La versione portatile non si installa: è un unico file di programma che si avvia da qualsiasi posizione, e conserva tutto ciò che salva in una cartella accanto a sé. Così la si può portare con sé su una chiavetta USB e usare su un altro computer senza configurarvi nulla. La versione portatile viene distribuita per Windows; sotto Linux EM4me conserva i propri dati nel profilo dell'utente.

## Avviare

La versione portatile è il file del programma `EM4me-<Version>-Portable.exe`. Collocarlo in una posizione in cui si dispone dei permessi di scrittura, ad esempio in una cartella apposita all'interno della cartella Documenti o su una chiavetta USB, e avviarlo da lì.

Non viene installato nulla: non nasce né una voce nell'elenco dei programmi di Windows né un'associazione di estensioni di file con EM4me.

## La cartella dei dati

Al primo avvio EM4me crea la cartella `Data` accanto al file del programma. Accoglie tutto ciò che EM4me salva: impostazioni, sessione, bozze, lingue dell'interfaccia proprie, estensioni esterne e file temporanei. Se la cartella si trova già lì, EM4me continua a usarla.

**Per questo non eliminare né rinominare la cartella `Data`.** Se manca all'avvio, EM4me la ricrea vuota e comincia come al primo avvio; ciò che si trovava nella cartella precedente non viene allora usato.

Portarla con sé significa copiare il file del programma insieme alla cartella `Data`, nel modo più semplice copiando la cartella in cui si trovano entrambi, ad esempio su una chiavetta USB o su un altro computer. Impostazioni e sessione vengono così portate con sé.

## Dove si trovano i dati

Nella versione portatile «Aiuto → Informazioni…» mostra la riga «Versione portatile – i dati si trovano in:» con il percorso completo della cartella `Data`. Il pulsante «Apri la cartella dei dati» sottostante la apre nel gestore file. Nella versione installata la riga e il pulsante mancano.

## Il primo avvio

La versione portatile non riprende nulla dal computer su cui funziona. Il suo primo avvio comincia con le impostazioni predefinite, anche se sullo stesso computer è configurata la versione installata: la versione portatile non legge le sue impostazioni, i suoi elenchi recenti né le sue aree. È il primo avvio di una nuova configurazione: si avvia la visita guidata, ed EM4me comincia nella modalità di lavoro Principiante ([Estensioni](extensions.md)).

### Portare con sé la propria configurazione

Chi vuole continuare a usare la configurazione della versione installata la porta con sé tramite un file di scambio:

1. Nella versione **installata**, scegliere «File → Impostazioni → Esporta…», selezionare i tipi di dati desiderati e salvare il file, ad esempio direttamente sulla chiavetta USB.
2. Nella versione **portatile**, scegliere «File → Impostazioni → Importa…», selezionare il file, leggere l'anteprima e scegliere «Applica».

Entrambi i percorsi appartengono all'estensione «Esportazione e importazione delle impostazioni», che è attiva solo nella modalità di lavoro Completa. In una versione portatile appena avviata il sottomenu manca quindi all'inizio; lo si attiva in «File → Impostazioni… → Estensioni», con la modalità di lavoro Completa o con l'interruttore singolo dell'estensione. Lo stesso vale per la versione installata se vi è impostata una modalità di lavoro più ridotta.

Che cosa porta con sé il file e che cosa no è descritto nella pagina [Esportare e importare le impostazioni](setup-exchange.md). Le lingue dell'interfaccia proprie e i pacchetti di estensioni esterne non ne fanno parte: una lingua propria si carica di nuovo nella versione portatile ([Lingua dell’interfaccia propria](custom-locale.md)), un pacchetto di estensione si copia nella sua directory delle estensioni ([Creare estensioni](extensions-dev.md)).

## Quando EM4me non può scrivere

Se EM4me non può creare la cartella `Data` accanto al file del programma o non può scrivervi, ad esempio su una chiavetta USB protetta da scrittura o in una cartella protetta del sistema, lo segnala all'avvio con «Impossibile avviare EM4me» e si chiude. In tal caso non salva nulla da nessuna parte, nemmeno in sostituzione nel profilo dell'utente. Il messaggio compare nella lingua del sistema operativo, perché in quel momento le impostazioni non sono ancora state lette.

Rimedio: collocare il file del programma in una posizione in cui si dispone dei permessi di scrittura, ad esempio la cartella Documenti o una chiavetta USB scrivibile, e avviarlo da lì.

## Che cosa lascia la versione portatile sul computer

La versione portatile non si installa. Tutto ciò che EM4me salva si trova nella cartella `Data` accanto al file del programma: impostazioni, sessione, bozze e anche file temporanei. Chi porta con sé il file del programma con la cartella `Data`, ad esempio su una chiavetta USB, porta con sé tutto.

**Che cosa fa il file del programma all'avvio.** All'avvio il file del programma estrae il programma vero e proprio nella cartella temporanea di Windows e lo avvia da lì; alla chiusura lo rimuove di nuovo. Se EM4me viene terminato forzatamente, ad esempio tramite Gestione attività, questa copia può rimanere lì. È una caratteristica di questa forma di distribuzione e riguarda solo il programma stesso, mai i propri dati.

I propri documenti si trovano dove li si ripone. Nella cartella di un'area che si apre, EM4me crea come di consueto i propri file dell'area.

**Che cosa registra Windows.** Windows tiene proprie registrazioni su ogni programma; EM4me non può impedirlo. Da esse si può leggere che EM4me è stato eseguito sul computer, da quale posizione è stato avviato e quali cartelle sono state visitate nelle sue finestre di dialogo dei file. Ne fanno parte ad esempio il nome visualizzato del programma, le viste delle cartelle memorizzate e l'ultima cartella visitata della finestra di dialogo dei file, una cache della grafica e l'ora di modifica di due file dell'ortografia. L'elenco non è completo. I contenuti dei propri documenti e i nomi dei propri file non compaiono in nessuna delle registrazioni misurate.

**Che cosa fa EM4me al riguardo.** La versione portatile non inserisce nulla nell'elenco dei file usati di recente, ricorda l'ultima cartella visitata solo finché è in esecuzione e non aggiunge parole al dizionario; la correzione ortografica in sé funziona come di consueto.

## Che cosa è diverso nella versione portatile

Due cose si comportano volutamente in modo diverso nella versione portatile rispetto a quella installata, perché altrimenti scriverebbero o leggerebbero fuori dalla cartella `Data`:

- **Dizionario.** La correzione ortografica segnala le parole e propone suggerimenti come nella versione installata. Le parole però non possono essere aggiunte al dizionario: il menu contestuale dell'editor non offre «Aggiungi al dizionario», e in «Impostazioni → Correzione ortografica» manca la rimozione delle singole parole. Entrambe le cose scriverebbero nel dizionario dell'utente Windows, cioè sul computer anziché nella cartella `Data`. Altre informazioni sul controllo nella pagina [Strumenti](tools.md), sezione «Correzione ortografica».
- **Finestre di dialogo dei file.** Dopo l'avvio, le finestre di dialogo di apertura e di salvataggio cominciano nella cartella «Documenti», a meno che l'operazione stessa non proponga una posizione. EM4me ricorda l'ultima cartella visitata solo finché il programma è in esecuzione; dopo la chiusura viene dimenticata, e l'avvio successivo ricomincia da «Documenti». Ciò che Windows memorizza da sé su queste finestre di dialogo, EM4me non lo legge.

Gli elenchi dei file e delle aree aperti di recente all'interno di EM4me restano disponibili; si trovano nella cartella `Data`.
