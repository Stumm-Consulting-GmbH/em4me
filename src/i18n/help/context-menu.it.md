# Menu contestuale dell'editor

Un clic destro nell'editor apre un menu contestuale che rende accessibili i costrutti di formattazione, paragrafo e inserimento direttamente sul testo. È disponibile in modalità sorgente e live. Gli accessi e le scorciatoie predefinite sono nella [tabella delle funzioni](functions.md).

## Struttura

Dall'alto verso il basso, il menu è suddiviso in sei gruppi:

- **Collegamento** — racchiudere la selezione come collegamento wiki o come collegamento esterno.
- **Formato** — livello carattere: grassetto, corsivo, barrato, evidenziato, codice, formula, commento e «rimuovi formattazione».
- **Paragrafo** — livello riga: elenco puntato, elenco numerato, elenco attività, titolo da 1 a 6, nessun titolo e citazione.
- **Inserisci** — modelli: nota a piè di pagina, tabella, riquadro, linea orizzontale e blocco di codice.
- **Tabella** — operazioni di modifica per la tabella al cursore; appare solo quando il cursore si trova in una tabella.
- **Appunti** — taglia, copia, incolla, seleziona tutto.

Le scorciatoie predefinite per grassetto (`Ctrl+B`) e corsivo (`Ctrl+I`) funzionano anche senza il menu; tutte le altre azioni possono essere associate a una scorciatoia nelle impostazioni.

## Semantica di selezione

I formati carattere seguono la selezione:

- Con una selezione, l'azione si applica ai caratteri selezionati.
- Senza selezione, prende la parola sotto il cursore.
- Se il cursore non è dentro una parola, viene inserita una coppia di marcatori vuota e il cursore posizionato tra i due.

Gli spazi iniziali e finali restano fuori dai marcatori.

## Interruttori e segni di spunta

Tutte le azioni di formato e paragrafo sono interruttori: se il formato è già applicato, la stessa azione lo rimuove. Cambiando il tipo di elenco, il prefisso esistente viene sostituito anziché impilato. Il sottomenu Paragrafo indica con un segno di spunta quale stato è attivo per la riga del cursore, ad esempio un determinato livello di titolo o «nessun titolo».

## Più righe

Se la selezione copre più righe, un'azione di paragrafo si applica a tutte. Un elenco numerato viene numerato consecutivamente.

## Sottomenu Tabella

Quando il cursore si trova in una tabella, appare in aggiunta il gruppo **Tabella** con un sottomenu; fuori dalle tabelle è assente. Le operazioni agiscono sulla tabella al cursore e funzionano in entrambi i tipi di tabella, la tabella pipe e la [Perspective Table](perspective-table.md):

- **Allineamento** — allineare la colonna a sinistra, al centro o a destra; un segno di spunta indica l'allineamento attuale della colonna del cursore.
- **Righe** — spostare in alto o in basso, inserire sotto, eliminare.
- **Colonne** — spostare a sinistra o a destra, inserire a destra, eliminare.
- **Trasponi** — scambiare righe e colonne; la riga di intestazione diventa la prima colonna.

Ogni operazione è un singolo passo di annullamento. Le destinazioni non possibili appaiono attenuate: la riga di intestazione e la riga di separazione di una tabella pipe non possono essere spostate o eliminate, e l'ultima colonna non può essere eliminata. Durante l'intervento, le tabelle pipe vengono riscritte formattate (pipe esterni, colonne allineate con spazi); questo vale anche per le tabelle senza bordi. Nelle tabelle Perspective, le operazioni sulle righe lavorano sulle sezioni `|-`; le operazioni sulle colonne e la trasposizione sono possibili lì solo senza `colspan`/`rowspan` e altrimenti vengono rifiutate con un avviso. Tutte le operazioni sono anche nella palette dei comandi e possono essere associate a scorciatoie; l'estensione «Strumenti tabella» disattiva il sottomenu e i suoi comandi.

## Protezione in collegamenti e codice

All'interno di una destinazione di collegamento wiki e di codice in linea, le azioni di formato restano deliberatamente senza effetto, perché i marcatori distruggerebbero la struttura in quei punti. «Rimuovi formattazione», invece, continua a ripulire in tali posizioni.

## Editor di sola lettura

Se l'editor è di sola lettura, cioè una vista senza modalità modifica, il menu mostra solo copia e seleziona tutto; i gruppi collegamento, formato, paragrafo e inserimento vengono omessi.
