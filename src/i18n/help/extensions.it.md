# Estensioni

Molte funzioni dell'applicazione sono estensioni integrate e possono essere attivate o disattivate singolarmente. Il nucleo — editor, schede e finestre, gestione dei file, modalità di visualizzazione, cornice della barra laterale, impostazioni, manuale, tema, lingue e il rendering di base CommonMark — non è volutamente disattivabile; l'applicazione resta così sempre funzionante.

## Attivare e disattivare

La sezione Estensioni delle impostazioni (File → Impostazioni → Estensioni) elenca tutte le estensioni integrate in tre categorie:

- **Rendering** — costrutti Markdown come callout, note a piè di pagina, evidenziazione, tipografia, tabelle Perspective, formule KaTeX, diagrammi Mermaid o evidenziazione della sintassi.
- **Connessioni** — link wiki, incorporamenti wiki, tag e completamento automatico.
- **Strumenti** — linter Markdown, segnalibri, modalità focus con scorrimento macchina da scrivere, statistiche delle parole e pulsante di copia del codice.

Ogni riga mostra un nome e una breve descrizione. Le modifiche hanno effetto con Applica oppure OK — subito, senza riavvio e in tutte le finestre.

## Modalità di lavoro

Sopra l'elenco degli interruttori si trova la sezione Modalità di lavoro. Una modalità di lavoro imposta in blocco gli interruttori delle estensioni integrate: una sola decisione al posto di molte decisioni singole. Sono disponibili tre modalità fisse, e sono annidate: ciò che contiene la più piccola lo contiene anche la più grande.

- **Principiante** — scrivere e collegare. Sono compresi il repertorio Markdown consueto (tra l'altro callout, note a piè di pagina, evidenziazione, tipografia, emoji, immagini con dimensione, tabelle Perspective ed evidenziazione della sintassi), i collegamenti tramite link wiki, etichette e completamento automatico, oltre agli strumenti della scrittura quotidiana: elenchi di attività, modelli, segnalibri, controllo ortografico, barra di formato, editor di tabelle, riga del titolo, selettore di data, statistiche delle parole, modalità focus e l'area dimostrativa.
- **Avanzata** — tutto questo e in più organizzare e pianificare: libri, diari, profili di proprietà, promemoria, eventi, vista a grafo, mappa mentale, struttura, spazi di lavoro, gruppi di schede, orologio, formule e diagrammi, insieme ai costrutti Markdown meno frequenti come contenitori personalizzati, elenchi di definizioni, abbreviazioni, spoiler, commenti, numerazione dei titoli e stati di attività estesi.
- **Completa** — tutte le estensioni integrate, quindi in più le superfici canvas, il database, Perspective Datatable, i grafici di tabelle, il calcolo in linea, Critic Markup, i blocchi di righe, gli attributi dei titoli, i sistemi di calendario personalizzati, la lingua dell'interfaccia personale, My Extended Memory, i pulsanti personali della barra di stato e lo scambio della propria configurazione.

Come ogni altra modifica di questa pagina, la scelta ha effetto con Applica oppure OK — da quel momento subito, senza riavvio e in tutte le finestre aperte.

**Una modalità è un punto di partenza, non un blocco.** Dopo il passaggio ogni singolo interruttore resta regolabile come prima, e nessuna modalità toglie qualcosa che non si possa riattivare. Sotto i tre pulsanti è indicato quale modalità corrisponde allo stato attuale degli interruttori; se non corrisponde a nessuna perché singoli interruttori sono impostati diversamente, vi compare **Personalizzata**. Il nome della modalità descrive quindi lo stato invece di fissarlo — e appena lo stato corrisponde di nuovo esattamente a una modalità, questa torna a essere indicata come attiva.

La protezione delle dipendenze vale immutata: nessuna modalità crea uno stato che la disattivazione di una singola estensione vieterebbe.

### Il primo avvio

Una nuova configurazione parte in modalità Principiante. La scelta viene proposta là dove l'applicazione si mostra per la prima volta: la visita guidata, che si avvia da sola al primissimo avvio del programma, porta a questo scopo una tappa a sé con le tre modalità. Principiante è lì preselezionata, e un clic ha effetto subito — non occorre né terminare la visita né ricaricare una finestra. Chi salta la tappa o interrompe la visita resta in modalità Principiante.

Una configurazione esistente conserva lo stato dei suoi interruttori: lì la visita non si avvia all'apertura e l'insieme delle funzioni non cambia. Se in seguito la visita viene richiamata a mano, la tappa mostra lo stato realmente in vigore e non ripristina nulla senza chiedere.

### Modalità personalizzate

Sotto le tre modalità fisse, lo stato attuale degli interruttori può essere conservato con un nome proprio: «Salva lo stato attuale come modalità…» chiede il nome. Il numero di modalità personalizzate non è limitato.

Ogni modalità personalizzata porta quattro operazioni: un clic sul suo nome la **applica**, **Rinomina** le dà un altro nome, **Sovrascrivi** le assegna lo stato attuale degli interruttori, **Elimina** la rimuove. Rinominare ed eliminare non cambiano lo stato in vigore. Le tre modalità fisse ne restano fuori: non si possono né sovrascrivere né rinominare né eliminare.

Se un nome è già assegnato, arriva una domanda invece di una sovrascrittura silenziosa; un nome vuoto viene rifiutato. Una modalità salvata registra lo stato dell'istante: modificare in seguito singoli interruttori non modifica la modalità — a questo serve Sovrascrivi.

**Una modalità salvata registra quali estensioni sono disattivate.** Per questo sopravvive ad aggiunte e rimozioni: un'estensione che non esiste più viene tralasciata all'applicazione; una aggiunta dopo il salvataggio e assente dalla modalità resta attiva.

Le modalità personalizzate valgono in tutte le aree e viaggiano con la propria configurazione — vedi [Esportare e importare le impostazioni](setup-exchange.md).

## Effetto dello stato disattivato

- **Estensioni di rendering:** la sintassi appare come testo semplice o Markdown standard. `==evidenziato==` resta ad esempio testo visibile, e un blocco Mermaid diventa un normale blocco di codice.
- **Pannelli e accessi:** i pannelli laterali, i pulsanti della barra di stato, le voci di menu e le scorciatoie associati scompaiono; non restano controlli morti.
- **Sezioni delle impostazioni:** se un'estensione porta una propria sezione di impostazioni (ad esempio gli stati delle attività), questa appare nella navigazione solo quando l'estensione è attiva.

## Dipendenze

Alcune estensioni si basano su altre: gli incorporamenti wiki e i collegamenti tra aree richiedono i link wiki, i promemoria richiedono le attività, gli eventi e la banca dati richiedono i profili di proprietà, i grafici di tabelle richiedono la Perspective Datatable. Finché una simile estensione dipendente è attiva, la sua base non può essere disattivata: l'interruttore della base è bloccato e, sotto la sua descrizione, compare «Non disattivabile — richiesto da:» con i nomi delle dipendenti; più nomi compaiono insieme in un'unica frase. Un clic sulla riga bloccata mostra brevemente la stessa indicazione nella barra di stato e non cambia nulla nell'interruttore. Chi vuole disattivare la base, disattiva prima le sue dipendenti; dopo di che il suo interruttore è libero.

Il blocco vale solo dove l'estensione dipendente senza la sua base non può più lavorare. Quando la disattivazione di un'estensione impoverisce soltanto un'altra — scompare un comando, non arriva un suggerimento, una verifica tace, mentre l'estensione per il resto continua a funzionare —, l'interruttore resta libero.

Se una configurazione importata da altrove porta con sé una base disattivata mentre un'estensione dipendente è attiva, questo stato resta invariato: la dipendente risulta disattivata e mostra l'indicazione «Disattivato per dipendenza»; conserva il proprio interruttore e torna efficace non appena la base viene riattivata.

## I dati restano conservati

Disattivare non cancella nulla: l'albero dei segnalibri, le definizioni degli stati delle attività, la visibilità dei pannelli, le scorciatoie personalizzate e tutte le altre impostazioni restano salvate e ritornano all'attivazione.

## Estensioni esterne

Oltre alle estensioni interne, l'app carica anche pacchetti di estensione esterni creati da te. Si gestiscono nella sezione impostazioni Estensioni (esterne): i pacchetti appena rilevati sono disattivati, l'attivazione richiede una conferma esplicita nella finestra di avviso (il codice di terze parti ottiene pieno accesso a documenti e app) e i pacchetti difettosi vengono disattivati automaticamente. Come creare un proprio pacchetto è descritto nella pagina [Creare estensioni](extensions-dev.md).
