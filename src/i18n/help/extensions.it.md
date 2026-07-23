# Estensioni

Molte funzioni dell'applicazione sono estensioni integrate e possono essere attivate o disattivate singolarmente. Il nucleo — editor, schede e finestre, gestione dei file, modalità di visualizzazione, cornice della barra laterale, impostazioni, manuale, tema, lingue e il rendering di base CommonMark — non è volutamente disattivabile; l'applicazione resta così sempre funzionante.

## Attivare e disattivare

La sezione Estensioni delle impostazioni (File → Impostazioni → Estensioni) elenca tutte le estensioni integrate in tre categorie:

- **Rendering** — costrutti Markdown come callout, note a piè di pagina, evidenziazione, tipografia, tabelle Perspective, formule KaTeX, diagrammi Mermaid o evidenziazione della sintassi.
- **Connessioni** — link wiki, incorporamenti wiki, tag e completamento automatico.
- **Strumenti** — linter Markdown, segnalibri, modalità focus con scorrimento macchina da scrivere, statistiche delle parole e pulsante di copia del codice.

Ogni riga mostra un nome e una breve descrizione. Le modifiche hanno effetto con Applica oppure OK — subito, senza riavvio e in tutte le finestre.

## Effetto dello stato disattivato

- **Estensioni di rendering:** la sintassi appare come testo semplice o Markdown standard. `==evidenziato==` resta ad esempio testo visibile, e un blocco Mermaid diventa un normale blocco di codice.
- **Pannelli e accessi:** i pannelli laterali, i pulsanti della barra di stato, le voci di menu e le scorciatoie associati scompaiono; non restano controlli morti.
- **Sezioni delle impostazioni:** se un'estensione porta una propria sezione di impostazioni (ad esempio gli stati delle attività), questa appare nella navigazione solo quando l'estensione è attiva.

## Dipendenze

Alcune estensioni si basano su altre: gli incorporamenti wiki richiedono i link wiki. Se la base viene disattivata, le estensioni dipendenti si disattivano con essa; la sezione mostra allora l'indicazione «Disattivato per dipendenza». L'estensione dipendente conserva il proprio interruttore e torna efficace non appena la base viene riattivata.

## I dati restano conservati

Disattivare non cancella nulla: l'albero dei segnalibri, le definizioni degli stati delle attività, la visibilità dei pannelli, le scorciatoie personalizzate e tutte le altre impostazioni restano salvate e ritornano all'attivazione.

## Estensioni esterne

Oltre alle estensioni interne, l'app carica anche pacchetti di estensione esterni creati da te. Si gestiscono nella sezione impostazioni Estensioni (esterne): i pacchetti appena rilevati sono disattivati, l'attivazione richiede una conferma esplicita nella finestra di avviso (il codice di terze parti ottiene pieno accesso a documenti e app) e i pacchetti difettosi vengono disattivati automaticamente. Come creare un proprio pacchetto è descritto nella pagina [Creare estensioni](extensions-dev.md).
