# Sistemi di calendario

Cronologie liberamente definibili per mondi di fantasia e casi d'uso particolari: ogni area può tenere i propri blocchi di calendario, i cui calendari possono essere costruiti in modo completamente diverso dal consueto calendario standard — con proprie lunghezze dei mesi, regole intercalari, cicli settimanali ed epoche. La funzione fa parte dell'estensione «Sistemi di calendario» e vale solo nel contesto di un'area: senza un'area aperta, la sezione delle impostazioni e il comando di inserimento sono inattivi.

## Concetto

### Blocchi

Un blocco è un mondo temporale autonomo con un nome e un numero qualsiasi di calendari. I calendari dello stesso blocco procedono in parallelo, possono essere messi in corrispondenza e convertiti l'uno nell'altro. Blocchi diversi non hanno volutamente nulla a che vedere tra loro — tra di essi non c'è né conversione né comparabilità.

### Calendari e livelli

Un calendario è composto da un elenco ordinato di livelli, il più piccolo per primo (ad esempio secondo → minuto → ora → giorno → mese → anno), raggruppati in gruppi di livelli con nome (nel modello standard «Tempo» e «Data»). Ogni livello descrive la propria relazione con quello immediatamente inferiore mediante uno dei cinque tipi di relazione:

- **Fattore fisso** — un numero fisso di unità inferiori, ad esempio 60 secondi per minuto.
- **Tabella delle lunghezze** — unità con lunghezze individuali, ad esempio tre mesi di 30, 30 e 35 giorni; i nomi di riga della tabella sono al tempo stesso i nomi di posizione (nomi dei mesi).
- **Regola intercalare** — regole di ciclo secondo lo schema «intercalazione ogni 4, tranne ogni 100, tranne ogni 400», con indicazione dell'unità prolungata e del prolungamento.
- **Ciclo indipendente** — lo schema settimanale: un ciclo di lunghezza fissa scorre oltre i confini di mese e di anno, ancorato a una data di riferimento, facoltativamente con una regola di numerazione (il numero del ciclo segue l'anno in cui cade il giorno determinante del ciclo).
- **Raggruppamento** — una sintesi puramente calcolatoria, ad esempio trimestri di tre mesi ciascuno.

### Epoche

Ogni calendario ha esattamente un'epoca passata aperta (conta all'indietro), un numero qualsiasi di epoche intermedie chiuse e un'epoca futura aperta. I confini si susseguono senza interruzioni e si collocano su una data senza componente oraria; il conteggio degli anni parte da 1 in ogni epoca, non esiste un anno 0. Un confine di epoca può cadere a metà anno — l'anno 1 della nuova epoca è allora un anno parziale.

### Conversione tramite l'asse del blocco

Ogni blocco possiede un asse temporale neutro. Ogni calendario viene proiettato su questo asse tramite un'ancora (l'istante del calendario che si trova nel punto zero dell'asse) e una scala (la durata della sua unità più piccola in unità dell'asse, come frazione di numeratore e denominatore). Le conversioni tra calendari passano sempre per l'asse del blocco e arrotondano in modo deterministico al livello più piccolo del calendario di destinazione.

## Manutenzione nelle impostazioni

La sezione delle impostazioni «Sistemi di calendario» mostra i blocchi dell'area aperta in due livelli: la panoramica gestisce i blocchi (aggiungere, rinominare, aprire, rimuovere); la vista di dettaglio di un blocco mostra i suoi calendari come moduli con editor per livelli, epoche, cicli, raggruppamenti e l'asse del blocco.

- Il pulsante **«Inserisci il calendario standard come modello»** crea una definizione completa con dodici mesi, una regola intercalare e un ciclo di sette giorni — come punto di partenza da adattare e come esempio vivo di tutti i tipi di relazione.
- L'**anteprima dal vivo** mostra un valore di esempio a libera scelta in forma canonica e con i nomi; finché una definizione è incompleta, l'editor lo segnala come un avviso (validazione lieve), e solo l'applicazione verifica in modo rigoroso.
- Le definizioni vengono salvate nel file dell'area (file `Area_Settings.mdda`) e valgono per tutte le finestre dell'area.

La modifica non è volutamente mai bloccata: le modifiche di struttura su calendari già utilizzati sono consentite. I valori del documento che così diventano non validi restano conservati invariati e vengono contrassegnati in modo visibile.

## Valori nel documento

Un valore di calendario compare in forma canonica nel testo sorgente:

```text
@{Nome del calendario: Anno-Mese-Giorno}
@{Nome del calendario: Anno-Mese-Giorno Abbreviazione di epoca}
@{Nome del calendario: Anno-Mese-Giorno Ora:Minuto:Secondo}
```

Il primo simbolo di due punti separa il nome del calendario dal valore. I segmenti di data vanno dal più grande al più piccolo; l'abbreviazione di epoca viene omessa nell'epoca più recente, la parte oraria viene omessa quando tutti i segmenti di tempo sono al loro minimo. Nella vista renderizzata, in modalità live e nell'esportazione portable, il valore appare come un distintivo con i nomi della definizione (ad esempio nomi dei mesi e abbreviazione di epoca).

Se il calendario indicato non è definito nell'area o il valore non è valido, il testo sorgente resta invariato e il valore viene contrassegnato in modo visibile — come questo esempio, il cui calendario non esiste in questa pagina del manuale:

@{Calendario di esempio: 500-2-09 ZZ}

Nei blocchi di codice e negli span di codice la sintassi resta intatta: `@{Calendario di esempio: 500-2-09 ZZ}`.

## Inserire e modificare

- **Inserire:** il comando «Inserisci data di calendario» (palette dei comandi; è possibile assegnare una scorciatoia) apre il selettore e inserisce l'istante scelto in forma canonica alla posizione del cursore. È attivo non appena l'area aperta definisce almeno un calendario.
- **Modificare:** i valori sono cliccabili in modalità sorgente e live; il clic apre il selettore precompilato con il valore, e la conferma lo sostituisce sul posto in un unico passo di annullamento. Sulla riga con il cursore, **Ctrl-clic** apre il selettore mentre il clic semplice vi posiziona il cursore.

## Selettore

Il selettore dei calendari personalizzati funziona in modo analogo al selettore di data standard:

- Selezioni di intestazione per **blocco**, **calendario** ed **epoca** (le selezioni con una sola voce vengono omesse). Un cambio di calendario converte l'istante scelto; un cambio di blocco salta all'ancora del calendario di destinazione.
- La **griglia** nasce dalla struttura dei livelli: con un ciclo settimanale definito, come griglia a colonne (lunghezza del ciclo = numero di colonne, nomi di posizione come intestazione, colonna dei numeri in caso di regola di numerazione); senza ciclo, come elenco continuo dei giorni dell'unità.
- **Navigazione:** i pulsanti freccia esterni spostano l'unità più grande (l'anno), quelli interni l'unità della griglia (il mese); i tasti freccia navigano giorno per giorno, Invio conferma, Esc annulla. **«All'ancora»** salta all'istante di riferimento del calendario.
- **I livelli di tempo** appaiono come segmenti regolabili singolarmente con immissione tramite frecce e cifre — i valori non validi non sono inseribili per costruzione.

### Visualizzazione della conversione

Sotto la griglia, il selettore mostra l'istante scelto in tutti i calendari paralleli del blocco. Un clic su una corrispondenza sposta lì il calendario attivo. I calendari di blocchi diversi non sono volutamente convertibili.

## Cronologie derivate

Una cronologia derivata conta da un punto zero scelto: quanto manca a una data o quanto tempo è passato da un evento. Non richiede una definizione propria, ma solo una cronologia di riferimento e un punto zero.

### Creazione

Nella sezione delle impostazioni «Sistemi di calendario» il pulsante **«Aggiungi cronologia derivata»** apre un modulo breve:

- **Cronologia di riferimento** — un calendario dello stesso blocco oppure la cronologia standard inclusa. Per un conto alla rovescia non serve quindi un calendario proprio.
- **Punto zero (giorno 1)** — la data nella notazione del riferimento, a scelta tramite il selettore; cade sempre su un giorno intero.
- **Livello di dettaglio** — quanto finemente viene suddivisa la durata, dalla sola unità più piccola fino agli anni.
- **Sigle di direzione** — due parole brevi per il tempo prima e dopo il punto zero.

Qui non compaiono editor di livelli, cicli, raggruppamenti ed epoche, perché nulla di ciò è sovrascrivibile.

### Che cosa viene ereditato

La cronologia derivata assume le unità del suo riferimento e sposta i loro confini sul punto zero. Se questo cade in un giorno 23, ogni mese derivato inizia il 23 e ogni anno derivato lo stesso giorno; le settimane iniziano nel giorno della settimana del punto zero. Ogni unità mantiene così la lunghezza che ha nel riferimento e un giorno bisestile cade da sé nell’anno giusto. I nomi seguono: se il conteggio inizia a luglio, il primo mese si chiama ancora luglio. Se il punto zero cade in un giorno che non tutti i mesi hanno, il confine arretra all’ultimo giorno disponibile.

### Valori nel documento

Il valore conta in entrambe le direzioni dal punto zero: le unità maggiori come numero completo da 0, la più piccola come numero ordinale da 1. Prima del punto zero vale la stessa forma con la sigla di direzione.

```text
@{Cronologia: 0-0-1}              il punto zero stesso
@{Cronologia: 0-1-18}             un mese e diciassette giorni dopo
@{Cronologia: 0-0-15 prima GL}    quindici giorni prima
```

Ne viene mostrata la durata nel livello scelto, senza le parti di lunghezza zero, per esempio «1 mese, 2 settimane, 4 giorni». Il suggerimento indica inoltre il valore canonico e il momento corrispondente della cronologia di riferimento. Se la cronologia derivata si basa sulla cronologia standard, le unità appaiono al singolare e al plurale; nei calendari definiti dall’utente i nomi restano come sono stati inseriti.

### Selettore

Il selettore di una cronologia derivata mostra la griglia del suo riferimento: si sceglie una data normale e viene inserito il conteggio. **«All’ancora»** salta al punto zero.

### Modifiche alla cronologia di riferimento

Un valore è una coordinata della sua cronologia. Se il riferimento cambia, i valori delle sue cronologie derivate si spostano con esso. L’editor segnala in modo permanente le cronologie derivate esistenti e chiede conferma al momento dell’applicazione; una cronologia con derivate non può essere eliminata finché queste esistono.
