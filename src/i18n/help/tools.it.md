# Strumenti

Dieci aiutanti per il lavoro quotidiano sul testo: linter, correzione ortografica, ricerca, trova e sostituisci, editor di tabelle, esportazione PDF, palette dei comandi, inserimento di data e ora, orologio con sveglie, timer, cronometro e calendario mensile, riga del titolo. Gli accessi e le scorciatoie predefinite figurano nella [tabella delle funzionalità](functions.md).

## Linter Markdown

Il linter segnala con discrezione sette difetti tipici nell'editor (viste Sorgente, Divisa e Live); passare il mouse su una segnalazione mostra la spiegazione. Gli esempi stanno in blocchi di codice perché questa pagina resti essa stessa senza segnalazioni.

| Regola | Violazione | Correzione |
|---|---|---|
| URL nudo | `Vedi https://example.org al riguardo.` | `Vedi [l'esempio](https://example.org) al riguardo.` |
| Testo del collegamento vuoto | `[](https://example.org)` | `[Esempio](https://example.org)` |
| Testo alternativo mancante | `![](immagine.png)` | `![Schizzo dell'architettura](immagine.png)` |
| Wiki link senza destinazione | `[[Nome-errato]]` | `[[Piano di progetto]]` (file esistente) |
| Ancora wiki rotta | `[[Piano di progetto#Manca]]` | `[[Piano di progetto#Milestone]]` (ancora esistente) |
| Tipo di callout sconosciuto | `> [!importante] Titolo` | `> [!warning] Titolo` (tipo dalla lista bianca) |
| Marcatore di commento spaiato | `Testo %% senza chiusura` | `Testo %%privato%% continua` oppure `\%%` per un `%%` letterale |

## Correzione ortografica

La correzione ortografica segnala le parole errate nell'editor (vista sorgente e vista dal vivo). È disattivata di fabbrica e si attiva in Impostazioni → Correzione ortografica.

Il controllo usa il correttore del sistema operativo. L'applicazione non porta con sé alcun dizionario proprio e non ne scarica nessuno; senza connessione di rete il controllo funziona allo stesso modo.

### Quale lingua viene controllata

Vale la lingua del sistema operativo, indipendentemente dalla lingua dell'interfaccia. Impostare l'interfaccia in italiano mentre il sistema operativo è in portoghese dà un controllo portoghese. Per questo un testo in una lingua diversa da quella del sistema operativo viene segnalato per intero; non è un difetto, ma la conseguenza di questa scelta. La lingua di controllo si cambia nelle impostazioni di lingua del sistema operativo.

Volutamente non esiste alcuna selezione della lingua all'interno dell'applicazione. Comporterebbe lo scaricamento di dizionari dalla rete, ed è proprio ciò che si vuole evitare.

### Correggere

Un clic destro su una parola segnalata apre il menu contestuale dell'editor con fino a cinque suggerimenti in cima. Un clic su un suggerimento sostituisce la parola. Sotto si trova «Aggiungi al dizionario»: la parola vale da quel momento come corretta in modo permanente, anche dopo un riavvio. Se sotto il puntatore non c'è alcuna parola segnalata, questa parte del menu non compare.

Le parole aggiunte in questo modo figurano in Impostazioni → Correzione ortografica e possono essere rimosse lì una per una.

### Limite

La sintassi Markdown, i percorsi e il codice vengono controllati anch'essi, perché il correttore vede il testo parola per parola e non conosce la marcatura. È la ragione per cui il controllo è disattivato di fabbrica.

### Estensione

La correzione ortografica è un'estensione commutabile (Impostazioni → Estensioni). Nello stato disattivato spariscono le segnalazioni, i suggerimenti e l'area delle impostazioni; lo stato dell'interruttore resta conservato.

## Ricerca testuale

La ricerca (predefinito `Ctrl+F`) trova in tempo reale durante la digitazione; l'ambito di ricerca segue la vista (testo sorgente o anteprima). Due interruttori la estendono: `.*` per le espressioni regolari, `Aa` per maiuscole/minuscole. `F3` e `Maiusc+F3` saltano tra i risultati, nella barra di ricerca anche `Invio` / `Maiusc+Invio`.

Il punto interrogativo nella barra apre un riferimento rapido regex; i pattern più importanti:

| Pattern | Significato |
|---|---|
| `.` | qualsiasi carattere |
| `*` / `+` / `?` | 0+, 1+ oppure 0–1 ripetizioni |
| `^` / `$` | inizio / fine riga |
| `\d` / `\w` / `\s` | cifra / carattere di parola / spazio |
| `[abc]` / `[^abc]` | uno / nessuno dei caratteri |
| `a\|b` | a oppure b |

## Trova e sostituisci

In modalità modifica (predefinito `Ctrl+H`) si aggiunge una riga di sostituzione. Con l'interruttore regex attivo funzionano i riferimenti a posteriori nel testo di sostituzione: `$1`, `$2` per i gruppi catturati. «Sostituisci tutto» è una singola transazione, un solo `Ctrl+Z` annulla tutto insieme.

```text
Trova:       (\d{2})\.(\d{2})\.(\d{4})
Sostituisci: $3-$2-$1
Effetto:     12.06.2026 → 2026-06-12
```

## Dove cerca la ricerca

L'ambito segue la scheda in cui la ricerca viene aperta; gli ambiti si escludono a vicenda:

| Scheda attiva | La ricerca copre |
|---|---|
| Singolo file | quel file, nel sorgente o nell'anteprima |
| File di un'area aperta | **tutti** i file Markdown dell'area |
| Pagina del manuale | **tutte** le pagine del manuale, anche quelle non aperte |
| Impostazioni | **tutte** le sezioni delle impostazioni, anche quelle mai visitate |

L'ambito in vigore è mostrato a sinistra nella barra di ricerca.

Oltre il singolo file, le corrispondenze compaiono nel pannello **Risultati della ricerca**, raggruppate per file, pagina o sezione e con un conteggio per gruppo. Un clic apre la destinazione ed evidenzia il punto; `F3` supera il confine del gruppo.

### In un'area

Il **file aperto viene per primo**, e con il suo stato non salvato: ciò che si trova nell'editor viene trovato, anche prima del salvataggio. Le sue corrispondenze restano evidenziate nel testo come sempre, l'elenco si aggiunge. Per gli altri file vale lo stato salvato su disco.

La ricerca copre i file Markdown dell'area. Gli altri file e i file di accompagnamento dell'applicazione restano fuori.

**La sostituzione** resta legata al singolo file: aprire la riga di sostituzione riporta la ricerca al documento corrente.

In un'area molto grande la riga di stato del pannello segnala che ogni ricerca rilegge i file; la ricerca risponde allora più lentamente.

### Nel manuale e nelle impostazioni

Cambiare sezione nelle impostazioni non salva nulla, una bozza iniziata si conserva. La sostituzione è disattivata qui perché entrambi sono in sola lettura. Con il sorgente Markdown di una pagina del manuale davanti, cioè la vista sorgente, la ricerca torna a quella singola pagina.

**Differenza con la palette dei comandi:** la palette trova **comandi** per nome e li esegue. Questa ricerca trova **testo**. Chi sa cosa vuole fare usa la palette; chi vuole sapere dove si trova qualcosa o come si chiama usa la ricerca.

**Differenza con la query Perspective:** filtra i file in base alle loro proprietà e li elenca nel documento. La ricerca trova testo corrente, indipendentemente da qualsiasi proprietà.
## Editor di tabelle

Nelle tabelle pipe, `Tab` salta alla cella successiva e `Maiusc+Tab` alla precedente. Alla fine dell'ultima riga, `Tab` o `Invio` creano una nuova riga di tabella con lo stesso numero di colonne; due `Invio` su una riga vuota escono dalla tabella. Vengono riconosciute anche le tabelle senza bordi (senza pipe esterni). Le operazioni di struttura (spostare, inserire ed eliminare righe e colonne, allineamento, trasposizione) sono offerte dal sottomenu **Tabella** nel [Menu contestuale dell'editor](context-menu.md).
## Esportazione PDF

«File → Altre funzioni file → Esporta come PDF…» (predefinito `Ctrl+Maiusc+P`) stampa il contenuto della scheda attiva in un file PDF. L'esportazione segue la vista attiva: la vista codice sorgente stampa il Markdown grezzo con evidenziazione della sintassi, inclusi i numeri di riga se attivi nella scheda; le modalità renderizzata, divisa e live stampano il documento formattato (divisa e live passano internamente alla vista renderizzata per la stampa e poi ripristinano la vista). Il PDF è sempre chiaro, anche se l'applicazione usa il tema scuro; i diagrammi Mermaid vengono ridisegnati con colori chiari e restano grafica vettoriale. Formule, evidenziazione del codice, callout e tabelle perspective appaiono come nell'anteprima.

Formato pagina, orientamento e margini si impostano nella sezione «Esportazione» delle impostazioni (File → Impostazioni…); il valore predefinito è A4 verticale con margini normali. Quando il contenuto scorre su più pagine, blocchi di codice, tabelle, diagrammi, formule e callout restano insieme per quanto possibile; i titoli non rimangono soli a fine pagina.

## Palette dei comandi

«Visualizza → Palette dei comandi» (predefinito `Ctrl+K`) apre una finestra a comparsa filtrabile con tutti i comandi dell'applicazione. Digitando si filtra l'elenco per sottostringa sui nomi dei comandi; i tasti freccia spostano la selezione, `Invio` o un clic esegue il comando e chiude la finestra, `Esc` annulla. A destra di ogni comando figura la scorciatoia da tastiera attualmente attiva, comprese le proprie riassegnazioni dalla sezione delle impostazioni «Scorciatoie da tastiera». I comandi non disponibili nel contesto attuale (per esempio i comandi d'area senza un'area aperta) appaiono attenuati e non possono essere eseguiti.

La palette è l'accesso fugace da tastiera al registro dei comandi; per accessi propri permanenti — pulsanti della barra di stato, voci del menu contestuale e macro — vedere la pagina [Posizionamento dei comandi](command-placement.md).

## Inserimento di data e ora

Una finestra a comparsa di calendario inserisce una data e un'ora alla posizione del cursore, anche nel campo nota. Tre comandi la aprono: predefinito `Ctrl+Alt+T` per data e ora, predefinito `Ctrl+Alt+D` per la sola data, predefinito `Ctrl+Alt+U` per la sola ora. I formati inseriti sono `2026-07-10`, `14:30` oppure combinato `2026-07-10 14:30`.

### Usare la finestra

A sinistra c'è un calendario mensile con una colonna delle settimane e il lunedì come inizio settimana; le frecce sfogliano i mesi, `Oggi` salta al giorno corrente. A destra, l'ora si presenta come quattro cifre regolabili singolarmente (decine e unità delle ore, decine e unità dei minuti) con i due punti in mezzo; `Adesso` imposta l'ora attuale. Data e ora si attivano singolarmente, con almeno una parte che resta attiva.

La tastiera guida il calendario: le frecce spostano di un giorno (sinistra, destra) o di una settimana (su, giù), `Pag su` e `Pag giù` di un mese, `Invio` conferma, `Esc` annulla. Anche un clic fuori dalla finestra annulla.

Nell'ora, un clic seleziona una delle quattro cifre: i pulsanti freccia ▲/▼ e i tasti freccia su/giù regolano la cifra attiva con ciclo continuo, sinistra/destra cambiano cifra, e i tasti numerici la impostano direttamente e passano alla successiva. Le ore non valide non si possono così proprio inserire.

### Trigger di scrittura

Due punti e virgola `;;` nell'editor aprono il selettore combinato in quel punto. La conferma sostituisce i due caratteri con il valore scelto, `Esc` li lascia al loro posto. In codice, formule e frontmatter la sequenza non attiva nulla; nelle celle di una tabella Perspective invece funziona, perché lì la sequenza è contenuto e non codice.

### Valori cliccabili nell'editor

Nell'editor, in modalità sorgente come in modalità live, l'applicazione riconosce i valori nei tre formati e li sottolinea con un discreto punteggiato. Un clic apre il selettore precompilato con il valore, gli interruttori secondo la sua forma; la conferma lo sostituisce sul posto. Non sono cliccabili i valori

- in codice, formule e frontmatter,
- nelle destinazioni di wiki link,
- dietro i marcatori di data delle [liste di attività](tasks.md), che vi compaiono come badge.

Sulla riga in cui si trova il cursore vale una particolarità: lì il clic semplice continua a posizionare il cursore — anche in mezzo al valore — e il selettore si apre con **Ctrl-clic**. Finché il tasto non è premuto, il valore resta senza sottolineatura; tenendo premuto Ctrl questa compare e segnala che il clic aprirà ora il selettore. Nelle viste in sola lettura non ci sono valori cliccabili.

Il riconoscimento cattura di proposito anche i valori digitati a mano: ogni data e ogni ora in questi formati diventa così modificabile.

### Estensione

Questa funzionalità appartiene all'estensione commutabile «Inserimento di data e ora» (Impostazioni → Estensioni). Una volta disattivata, i comandi, il trigger di scrittura e la decorazione al clic scompaiono; i valori restano testo normale. I formati corrispondono ai marcatori di data delle liste di attività, cosicché entrambe le funzionalità condividono la stessa notazione.

## Orologio, sveglie, timer, cronometro e calendario

Un pannello laterale mostra l'ora come orologio analogico, come indicazione digitale e con una riga di data; dimensione, tipo di quadrante, lancetta dei secondi, formato orario e di data nonché la settimana di calendario si scelgono nelle impostazioni. Una barra in alto nel pannello passa tra cinque viste: orologio, sveglia, timer, cronometro e calendario. La scelta vale per colonna della barra laterale e sopravvive a un riavvio.

### Dimensione

Tre livelli dimensionano quadrante e testo insieme, così che il pannello risulti un'unica immagine. L'impostazione si trova nel blocco «Visualizzazione» delle impostazioni e vale anche quando il quadrante è disattivato e funziona solo l'indicazione digitale. Ora, riga di data e settimana di calendario crescono insieme e mantengono le proporzioni.

Il livello piccolo è pensato per colonne strette, quello grande per una colonna allargata. Se una riga non entra nella colonna non viene spezzata su due righe ma tagliata a sinistra e a destra; il centro resta leggibile. Per vederla per intero, allargare la colonna o scegliere un livello più piccolo.

### Sveglie

La modalità sveglia accoglie un numero qualsiasi di sveglie. Alla creazione si scelgono l'ora, un nome e lo schema di ripetizione: una volta, ogni giorno o in giorni scelti della settimana. L'ora passa da un controllo a cifre, quindi un inserimento non valido è impossibile. Ogni sveglia si attiva singolarmente senza eliminarla; una sveglia singola si disattiva dopo aver suonato.

Una sveglia scaduta mostra un avviso che si può confermare o posticipare di una durata configurabile (Impostazioni → Orologio). Se la finestra non è in primo piano si aggiunge una notifica di sistema; un clic porta la finestra in primo piano.

### Timer e cronometro

La modalità timer elenca i timer con tempo restante e barra di avanzamento. Tre pulsanti avviano subito durate consuete, le durate proprie passano da un controllo per ore, minuti e secondi. Avvio, pausa e azzeramento agiscono per timer. Il tempo restante si calcola da marche temporali anziché con un conto alla rovescia: un timer prosegue quindi correttamente anche se la finestra era in secondo piano o l'applicazione è stata chiusa nel frattempo. Un timer scaduto mostra un avviso e si può confermare o riavviare.

Il cronometro conta in avanti, con centesimi. Oltre ad avvio, pausa e azzeramento registra i tempi sul giro; il giro più recente è in alto.

### Calendario mensile

La modalità calendario mostra un mese come griglia: i giorni della settimana nell'intestazione, lunedì per primo, il giorno corrente evidenziato e i giorni dei mesi vicini attenuati. La colonna delle settimane a sinistra si disattiva e si riattiva nelle impostazioni, alla voce «Calendario».

La navigazione si trova sopra la tabella. Le frecce singole sfogliano un mese, quelle doppie un anno; «Oggi» riporta al mese corrente. Un clic sulla denominazione del mese apre l'immissione dell'anno: quattro posizioni di cifre che si regolano con i tasti freccia, si cambiano con sinistra e destra e si impostano direttamente digitando una cifra. Un anno non valido non è immettibile, e il tasto Invio o il segno di spunta lo applica.

I giorni sono di sola visualizzazione. Il calendario serve per la consultazione, per esempio per sapere in che giorno della settimana cade una data lontana; non porta ai diari né agli appuntamenti. Per questo c'è il pannello Calendario dei diari.

### Limite

Sveglie e timer suonano solo con l'applicazione in funzione. Ad applicazione chiusa non c'è avviso e un orario di sveglia trascorso nel frattempo non viene recuperato all'avvio successivo. Un timer in corso invece prosegue correttamente e suona non appena il tempo restante è esaurito.

### Estensione

L'orologio appartiene all'estensione attivabile «Orologio» (Impostazioni → Estensioni). Se disattivata, spariscono pannello, pulsante della barra di stato, voce di menu e area delle impostazioni; non vengono sorvegliati nemmeno sveglie e timer.

## Riga del titolo

Sopra il documento il nome del file senza estensione compare come una riga del titolo compatta, con l'aspetto di un'intestazione — senza numero di riga, fissa allo scorrimento e in tutte e quattro le viste (nella vista divisa una sola volta, sopra la colonna del testo sorgente). Le sottopagine mostrano il loro nome logico completo in notazione con barre, con la parte superiore attenuata; i documenti senza nome mostrano il segnaposto «Senza titolo». Le pagine del manuale e di sistema non hanno riga del titolo.

### Rinominare direttamente

Un clic sul titolo (oppure `Invio` o `F2` sulla riga con il focus) lo rende modificabile; `Invio` o un clic all'esterno conferma, `Esc` annulla, un testo invariato termina in silenzio. La conferma rinomina il file tramite il normale meccanismo di rinomina: i link al file vengono aggiornati secondo l'impostazione «Aggiorna i link negli altri file», il file associato si sposta insieme, una pagina con sottopagine porta con sé l'intero albero delle sottopagine. Le modifiche non salvate vengono salvate prima. In una **sottopagina** è modificabile solo il proprio segmento di nome; la parte superiore lo precede senza poter essere modificata, e lì una barra viene rifiutata. In una pagina senza pagina superiore, invece, una barra la trasforma in sottopagina. La finestra di rinomina (File → Altre funzioni file → Rinomina…) resta come via con anteprima e resoconto del risultato ed è anche il punto in cui si può cambiare il nome completo di una sottopagina.

I nomi non validi (vuoti, caratteri non ammessi) e le collisioni di nomi vengono segnalati da un avviso direttamente sotto il titolo; il file resta allora invariato. Per i documenti senza nome, confermare un nome avvia «Salva con nome» con quel nome precompilato.

### Estensione

La riga del titolo appartiene all'estensione commutabile «Riga del titolo» (Impostazioni → Estensioni). Una volta disattivata, la riga scompare completamente; il nome del file resta visibile tramite il titolo della scheda e il titolo della finestra, e la rinomina resta raggiungibile tramite la finestra di dialogo.
