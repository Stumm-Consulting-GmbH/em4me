# Barra di formattazione

La barra di formattazione è una barra di pulsanti sopra l'editor per i gesti di modifica frequenti: formati di carattere, titoli, elenchi, citazione, collegamenti e tabelle. Ogni pulsante attiva un comando del registro centrale — gli stessi comandi che eseguono il menu contestuale dell'editor, le scorciatoie da tastiera e la palette dei comandi. La barra appartiene all'estensione disattivabile «Barra di formattazione» (categoria Strumenti).

## Visibilità

La barra appare esattamente quando la scheda attiva è in modalità modifica e la vista mostra un editor (vista Sorgente, Divisa o Live). Nella vista di lettura, sulle pagine del manuale e di sistema e in modalità focus è invisibile. Nella disposizione a finestra divisa, ogni colonna di editor porta la propria barra; un clic nella barra della seconda colonna attiva contemporaneamente quella colonna.

## Assegnazione standard e indicazione dello stato

L'assegnazione standard raggruppa tramite separatori: i formati di carattere (grassetto, corsivo, barrato, evidenzia, codice), il menu Titolo, i tipi di elenco (elenco puntato, elenco numerato, elenco attività), la citazione, le due azioni di collegamento (wiki link, collegamento esterno) e il pulsante Tabella. I suggerimenti mostrano il nome del comando e la scorciatoia attualmente attiva, i nomi visualizzati propri li precedono.

I pulsanti premuti mostrano lo stato alla posizione del cursore: i pulsanti di elenco, titolo e citazione seguono la riga del cursore, i pulsanti di formato di carattere seguono la selezione o la parola sotto il cursore. Premuto significa qui: un nuovo clic rimuove il formato — la visualizzazione e l'effetto di commutazione restano coincidenti.

## Menu Titolo

Il pulsante Titolo apre la selezione del livello: livello di titolo da uno a sei più «Nessun titolo», con un segno di spunta sul livello della riga del cursore. Il pulsante stesso appare premuto non appena la riga del cursore è un titolo.

## Griglia della tabella

Il pulsante Tabella apre una griglia di selezione sul modello dei programmi di videoscrittura: passandovi sopra si marcano righe per colonne (l'etichetta indica la dimensione, righe inclusa quella di intestazione), un clic inserisce la tabella vuota con riga di intestazione e riga di separazione al cursore. Annulla rimuove la tabella inserita in un solo passaggio. In tutti gli altri accessi (menu contestuale, palette, scorciatoia), il comando Tabella inserisce senza modifiche il suo modello standard compatto.

Accanto c'è un secondo pulsante per la [tabella Perspective](perspective-table.md): la sua icona mostra una tabella con la riga di intestazione unita, e un clic inserisce uno scheletro piccolo e subito valido con una riga di intestazione e una di dati; il cursore resta poi nella prima cella di intestazione. Qui non c'è una griglia, perché una tabella Perspective si modella comunque in seguito con celle unite. Con l'estensione delle tabelle Perspective disattivata il pulsante non compare.

## Traboccamento

Se l'assegnazione non entra nella larghezza della colonna di editor, le voci finali passano in un menu aggiuntivo sul bordo destro della barra. Le voci del menu mostrano icona, nome e segno di spunta di stato; il menu Titolo vi appare come sottomenu, la voce Tabella apre la griglia di selezione.

## Personalizzare l'assegnazione

La sezione «File → Impostazioni… → Barra di formattazione» gestisce l'assegnazione come elenco: riordinare le voci (su/giù), modificarle e rimuoverle; i nuovi comandi si creano in un dialogo a tre passaggi (comando tramite ricerca con filtro, icona dal set curato, nome visualizzato facoltativo). I separatori e il menu Titolo sono tipi di voce propri; «Ripristina lo standard» ripristina l'assegnazione standard. Le voci il cui comando appartiene a un'estensione disattivata non appaiono nella barra — la configurazione viene conservata e torna con l'estensione.

## Distinzione

La barra di formattazione è l'accesso di modifica in modalità modifica. I [pulsanti propri della barra di stato](command-placement.md) del posizionamento dei comandi sono accessi permanentemente visibili e liberamente assegnabili nella barra di stato; la palette dei comandi (vedi [Strumenti](tools.md)) è l'accesso fugace da tastiera a tutti i comandi.

## Stato disattivato

Se l'estensione «Barra di formattazione» viene disattivata, la barra scompare completamente e la sezione delle impostazioni è nascosta; tutti i comandi di formato restano raggiungibili tramite il menu contestuale, le scorciatoie e la palette. L'assegnazione resta salvata e vale invariata dopo la riattivazione.
