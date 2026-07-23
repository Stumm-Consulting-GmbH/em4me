# Combinazioni di colori

Una combinazione di colori definisce i colori dell'applicazione: l'interfaccia (sfondi, testo, accento, barre, schede) e il contenuto renderizzato (titoli, link, citazioni, codice, tabelle). I colori passano attraverso un elenco curato di slot di colore denominati che alimentano i colori del tema. Una combinazione è attiva per modalità; il commutatore chiaro/scuro (icona della barra di stato, Visualizza → Tema) passa dalla combinazione chiara a quella scura.

## Slot e gruppi

Uno slot è un colore denominato, non un accesso diretto ai dettagli interni. Gli slot sono organizzati in cinque gruppi: Superfici (Sfondo, Superficie, Superficie attenuata, Barra degli strumenti), Testo (Testo principale, Testo attenuato), Accento e bordi (Accento, Testo su accento, Bordo, Bordo marcato), Schede (Barra delle schede, Scheda attiva) e Contenuto (Sfondo del codice, Colore di avviso). Il contenuto renderizzato segue gli slot di superficie: i link portano l'accento, i titoli il testo principale, la linea dei titoli e i bordi delle tabelle il bordo, la barra di citazione il bordo marcato.

## Gestire le combinazioni

La gestione delle combinazioni si apre in Impostazioni → Combinazioni di colori.

- **Assegnazione per modalità:** in alto si sceglie una combinazione attiva per ogni modalità (Combinazione per chiaro, Combinazione per scuro).
- **Combinazioni incluse** sono non modificabili e fungono da modello: Standard chiaro e scuro, Alto contrasto chiaro e scuro, Seppia, oltre ad altre quattro coppie con una versione chiara e una scura ciascuna — Azzurro acciaio (freddo), Verde bosco (verde attenuato), Ambra (caldo) e Grafite (grigio neutro).
- **Combinazione personale:** «Nuova da modello» o «Duplica» crea una copia modificabile. Una combinazione personale può essere rinominata ed eliminata; eliminando la combinazione attiva, la modalità torna alla combinazione Standard.
- **Editor degli slot:** un selettore di colore per slot; «Ripristina» riporta al valore del modello. Le modifiche hanno effetto subito in tutta l'applicazione (anteprima dal vivo) e nelle altre finestre dopo l'applicazione.

L'editor modifica sempre la combinazione attiva della modalità in cui l'applicazione è in esecuzione: in modalità chiara la combinazione chiara, in modalità scura la combinazione scura. Per regolare la combinazione dell'altra modalità, si passa prima l'app a quella modalità tramite l'icona del tema nella barra di stato (o Visualizza → Tema). Così ogni modifica di colore ha effetto immediato nella modalità esatta a cui si applica (anteprima dal vivo).

## Contrasto e limiti

La leggibilità delle tue combinazioni personali dipende da te: non c'è un controllo automatico del contrasto. L'anteprima dal vivo mostra l'effetto subito, e «Ripristina» per singolo slot riporta a un valore del modello. Alcuni colori restano volutamente fuori dagli slot: i colori dei gruppi di schede e l'evidenziazione della sintassi dei blocchi di codice seguono ancora il tema. L'esportazione PDF resta chiara e riprende i colori della combinazione chiara attiva.
