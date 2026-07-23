# Posizionamento dei comandi

Ogni azione dell'applicazione è un comando del registro centrale. Il posizionamento dei comandi li trasforma in accessi propri permanenti: pulsanti di comando nella barra di stato, un elenco di occultamento per i pulsanti predefiniti, voci proprie nel menu contestuale dell'editor e macro come sequenze di comandi. Tutto si gestisce in una sezione comune: «File → Impostazioni… → Posizionamento dei comandi». Le quattro funzioni appartengono all'estensione disattivabile «Posizionamento dei comandi» (categoria Strumenti).

## Pulsanti della barra di stato

I pulsanti di comando propri appaiono come segmento a sé nella barra di stato, a destra dei pulsanti di vista. La creazione avviene in tre passaggi: scegliere un comando tramite ricerca con filtro, impostare un'icona dal set interno curato e assegnare facoltativamente un nome visualizzato. Il suggerimento del pulsante mostra il nome visualizzato seguito dal comando originale tra parentesi; senza nome visualizzato mostra il comando stesso. Nell'elenco della sezione delle impostazioni i pulsanti si possono riordinare (su/giù), modificare e rimuovere.

Se lo spazio nella barra di stato non basta — per esempio con finestre strette —, i pulsanti in eccesso passano, a partire da destra, in un menu aggiuntivo: un pulsante a puntini alla fine del segmento apre le voci riposte come menu, dal quale restano eseguibili.

I pulsanti il cui comando appartiene a un'estensione disattivata non appaiono (la configurazione viene conservata e torna con l'estensione).

## Nascondi i pulsanti predefiniti

Ogni elemento predefinito della barra di stato può essere nascosto singolarmente: gli interruttori dei pannelli, i tre interruttori dell'editor (piegatura, numeri di riga, a capo automatico), i quattro pulsanti di vista e gli elementi del lato destro (statistiche parole, indicatore dello zoom, modifica, sincronizzazione scorrimento, cronologia del documento, tema, lingua). Solo la riga informativa resta sempre visibile — è l'unico canale per i messaggi brevi come lo stato di salvataggio.

Nascondere rimuove solo l'accesso, la funzione resta: tutto ciò che è nascosto rimane raggiungibile tramite il menu, la palette dei comandi e le scorciatoie da tastiera. Il pulsante «Mostra tutto» ripristina la barra di stato predefinita.

## Menu contestuale dell'editor

Le voci di comando proprie appaiono come sezione aggiuntiva alla fine del menu contestuale dell'editor, sia in modalità sorgente sia in modalità live. Si gestiscono in un secondo elenco della sezione delle impostazioni — stesso flusso di creazione e stesso modello di voce dei pulsanti della barra di stato, ma con un ordine proprio. Ogni voce mostra la propria icona e il proprio nome visualizzato.

Le voci il cui comando non è eseguibile nel contesto attuale (per esempio un comando d'area senza un'area aperta) appaiono disattivate invece di sparire — in coerenza con il resto del menu. Senza voci configurate la sezione viene omessa del tutto. La sezione appartiene all'editor principale; il menu contestuale del campo nota resta invariato.

## Macro

Una macro raggruppa una serie ordinata di passaggi sotto un proprio nome e una propria icona. Sono disponibili due tipi di passaggio: «Esegui comando» (un comando dal registro, anche un'altra macro) e «Ritardo» (da zero a dieci secondi, per esempio per dare a una vista il tempo di costruirsi). I passaggi vengono eseguiti rigorosamente uno dopo l'altro; ogni passaggio attende il precedente.

Se un passaggio fallisce o il suo comando non è eseguibile nel contesto attuale, la sequenza si interrompe e la barra di stato mostra un avviso con il nome della macro e il numero del passaggio. Se una macro richiama un'altra macro, la catena di chiamate è limitata; un annidamento troppo profondo (anche una macro che richiama sé stessa) si interrompe con un avviso proprio. Le macro non partono mai automaticamente, ma solo tramite i loro accessi.

Il punto decisivo: ogni macro viene registrata a sua volta come comando regolare. Così è reperibile nella palette dei comandi, associabile a una scorciatoia propria nella sezione delle impostazioni «Scorciatoie da tastiera» e collocabile tramite pulsanti della barra di stato e voci del menu contestuale — senza trattamento speciale.

L'editor dei passaggi si trova nella stessa sezione delle impostazioni: per macro, un elenco di passaggi espandibile con riordino ed eliminazione, più un pulsante di esecuzione di prova. L'esecuzione di prova esegue subito lo stato di modifica attuale — nel contesto della scheda delle impostazioni, cosicché i passaggi legati al contesto vi si interrompono, come previsto, con l'avviso.

## Distinzione dalla palette dei comandi

La [palette dei comandi](tools.md) e il posizionamento dei comandi lavorano sullo stesso registro dei comandi ma servono situazioni diverse: la palette è l'accesso fugace da tastiera — aprire, digitare, eseguire, senza configurare nulla. Il posizionamento crea accessi permanenti per gesti ricorrenti: un clic nella barra di stato, un clic destro nell'editor, una scorciatoia su una macro.

## Stato disattivato

Se l'estensione «Posizionamento dei comandi» viene disattivata, la barra di stato mostra di nuovo lo stato predefinito: nessun pulsante proprio, nessun occultamento, nessuna sezione del menu contestuale; i comandi macro vengono deregistrati e la sezione delle impostazioni è nascosta. L'intera configurazione resta salvata e vale invariata dopo la riattivazione.
