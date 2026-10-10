# Sistemi di calendario

Cronologie liberamente definibili per mondi di fantasia e casi d'uso particolari: ogni area può tenere i propri blocchi di calendario, i cui calendari possono essere costruiti in modo completamente diverso dal consueto calendario standard — con proprie lunghezze dei mesi, regole intercalari, cicli settimanali ed epoche. La funzione fa parte dell'estensione «Sistemi di calendario» e vale solo nel contesto di un'area: senza un'area aperta, la sezione delle impostazioni e il comando di inserimento sono inattivi.

## Concetto

### Blocchi

Un blocco è un mondo temporale autonomo con un nome e un numero qualsiasi di calendari. I calendari dello stesso blocco procedono in parallelo, possono essere messi in corrispondenza e convertiti l'uno nell'altro. Blocchi diversi non hanno volutamente nulla a che vedere tra loro — tra di essi non c'è né conversione né comparabilità.

### Calendari e livelli

Un calendario è composto da un elenco ordinato di livelli, il più piccolo per primo (ad esempio secondo → minuto → ora → giorno → mese → anno), raggruppati in gruppi di livelli con nome (nel modello standard «Tempo» e «Data»). Ogni livello descrive la propria relazione con quello immediatamente inferiore mediante uno dei cinque tipi di relazione:

- **Fattore fisso** — un numero fisso di unità inferiori, ad esempio 60 secondi per minuto.
- **Tabella delle lunghezze** — unità con lunghezze individuali, ad esempio tre mesi di 30, 30 e 35 giorni; i nomi di riga della tabella sono al tempo stesso i nomi di posizione (nomi dei mesi).
- **Regola intercalare** — determina gli anni bisestili **per divisibilità**, con regole di ciclo secondo lo schema «intercalazione ogni 4, tranne ogni 100, tranne ogni 400», oppure **secondo uno schema**: una lunghezza del ciclo in anni e le posizioni degli anni bisestili al suo interno, contate da 1 — ad esempio 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 in un ciclo di 30 anni. In entrambi i casi ne fanno parte l'unità prolungata e il prolungamento.
- **Ciclo indipendente** — lo schema settimanale: un ciclo di lunghezza fissa scorre oltre i confini di mese e di anno, ancorato a una data di riferimento, facoltativamente con una regola di numerazione (il numero del ciclo segue l'anno in cui cade il giorno determinante del ciclo).
- **Raggruppamento** — una sintesi puramente calcolatoria, ad esempio trimestri di tre mesi ciascuno.

### Epoche

Ogni calendario ha esattamente un'epoca passata aperta (conta all'indietro), un numero qualsiasi di epoche intermedie chiuse e un'epoca futura aperta. I confini si susseguono senza interruzioni e si collocano su una data senza componente oraria; il conteggio degli anni parte da 1 in ogni epoca, non esiste un anno 0. Un confine di epoca può cadere a metà anno — l'anno 1 della nuova epoca è allora un anno parziale.

### Conversione tramite l'asse del blocco

Ogni blocco possiede un asse temporale neutro. Ogni calendario viene proiettato su questo asse tramite un'ancora (l'istante del calendario che si trova nel punto zero dell'asse) e una scala (la durata della sua unità più piccola in unità dell'asse, come frazione di numeratore e denominatore). Le conversioni tra calendari passano sempre per l'asse del blocco e arrotondano in modo deterministico al livello più piccolo del calendario di destinazione; il comando «Converti data» ne mostra il risultato (sezione omonima).

## Manutenzione nelle impostazioni

La sezione delle impostazioni «Sistemi di calendario» mostra i blocchi dell'area aperta in due livelli: la panoramica gestisce i blocchi (aggiungere, rinominare, aprire, rimuovere); la vista di dettaglio di un blocco mostra i suoi calendari come moduli con editor per livelli, epoche, cicli, raggruppamenti e l'asse del blocco.

- Il menu a tendina **«Inserisci modello …»** crea una cronologia già compilata a partire dai modelli forniti (sezione «Modelli forniti»). Per iniziare senza modello, **«Aggiungi calendario»** crea una cronologia vuota.
- **Plurale:** accanto al nome di ogni livello si trova il campo «Plurale», così come nel ciclo («Nome del ciclo (plurale)») e in ogni raggruppamento («Nome del raggruppamento (plurale)»). Una durata mostra il singolare con esattamente un'unità e altrimenti il plurale, per esempio «1 mese, 2 settimane, 4 giorni»; senza plurale vale sempre il singolare.
- **«Scrivi sempre l'abbreviazione dell'epoca»:** la casella di controllo alla fine del gruppo «Epoche» scrive l'abbreviazione nel valore anche nell'epoca più recente. È utile se in seguito si aggiungono altre epoche: i valori già salvati mantengono così il loro significato. Un valore dell'epoca più recente indica lo stesso giorno con e senza abbreviazione. Che cosa accade ai valori senza abbreviazione quando si aggiunge un'epoca in seguito è descritto nella sezione «Aggiungere un'epoca in seguito».
- L'**anteprima dal vivo** mostra un valore di esempio a libera scelta in forma canonica e con i nomi; finché una definizione è incompleta, l'editor lo segnala come un avviso (validazione lieve), e solo l'applicazione verifica in modo rigoroso.
- Le definizioni vengono salvate nel file dell'area (file `Area_Settings.mdda`) e valgono per tutte le finestre dell'area.

La modifica non è volutamente mai bloccata: le modifiche di struttura su calendari già utilizzati sono consentite. I valori del documento che così diventano non validi restano conservati invariati e vengono contrassegnati in modo visibile.

### Aggiungere un'epoca in seguito

Un valore dell'epoca più recente sta nel documento senza abbreviazione, e un valore senza abbreviazione viene sempre letto come valore dell'epoca più recente. Quando una cronologia riceve una nuova epoca più recente, i valori salvati di quella precedente indicherebbero perciò un altro giorno o diventerebbero non validi. Se l'area contiene tali valori, l'applicazione chiede conferma all'applicazione delle modifiche, prima di salvare, e ne indica il numero:

- **«Metti al sicuro i valori e applica»** salva la modifica e riscrive ogni valore interessato in modo che indichi lo stesso giorno di prima. Un valore precedente all'inizio della nuova epoca riceve l'abbreviazione di quella precedente: `@{Nome del calendario: 30-06-01}` diventa `@{Nome del calendario: 30-06-01 AZ}`. Un valore a partire dall'inizio della nuova epoca riceve il suo numero d'anno: se essa inizia nell'anno 31 della precedente, `@{Nome del calendario: 32-01-15}` diventa `@{Nome del calendario: 2-01-15}`. Ciò vale anche per un valore che porta già l'abbreviazione dell'epoca precedente e che altrimenti diventerebbe non valido.
- **«Applica senza mettere al sicuro»** salva la modifica e lascia i valori come sono.
- **«Annulla»** lascia invariati impostazioni e documenti.

Viene messa al sicuro ogni posizione di testo con un valore interessato, nei documenti Markdown dell'area e nelle note del documento, anche sulle schede Canvas, nelle bacheche Kanban e nelle sezioni di codice. Prima di modificare un documento, l'applicazione ne deposita lo stato precedente nella cronologia del documento; un documento aperto con modifiche non salvate riceve la modifica nel suo stato non salvato ed è messo al sicuro soltanto quando viene salvato; il rapporto lo segnala. Le note del documento non hanno cronologia.

Alla fine un rapporto indica per documento il numero dei valori messi al sicuro e, separatamente, i documenti che non è stato possibile modificare: documenti divisi, documenti aperti in un'altra finestra con modifiche non salvate e documenti modificati dopo il conteggio. Lì i valori vanno corretti a mano. Gli stati precedenti nella cronologia del documento restano come sono stati salvati.

In un'area molto grande il cui testo la ricerca nell'area non tiene a disposizione, l'applicazione non può né contare né mettere al sicuro i valori; la richiesta lo segnala e offre soltanto «Applica» e «Annulla».

Chi prevede fin dall'inizio altre epoche attiva «Scrivi sempre l'abbreviazione dell'epoca»: ogni nuovo valore porta allora la sua abbreviazione, e restano da mettere al sicuro soltanto i valori a partire dall'inizio della nuova epoca.

## Modelli forniti

Il menu a tendina **«Inserisci modello …»** nella vista di dettaglio di un blocco offre i calendari forniti in quest'ordine:

1. Calendario gregoriano
2. Calendario giuliano
3. Calendario Hijri (tabulare)
4. Calendario nazionale indiano
5. Calendario buddista
6. Calendario etiope
7. Calendario copto
8. Calendario giapponese
9. Calendario minguo

La scelta crea subito la cronologia nel blocco aperto, già compilata e senza ulteriori immissioni; poi il menu torna alla sua prima voce. La cronologia porta il nome del menu; se quel nome è già usato nell'area, riceve un numero aggiunto, per esempio «Calendario gregoriano 2». Come ogni modifica di questa sezione, viene salvata con **«Applica»**.

Ogni modello porta con sé i livelli di tempo secondo, minuto e ora, una settimana di sette giorni e il singolare e il plurale delle sue unità. Il calendario gregoriano mostra inoltre tutti i tipi di relazione in un'unica definizione: dodici mesi, regola intercalare, ciclo settimanale, trimestri e semestri. Tutti i modelli si trovano sullo stesso asse dei giorni: le cronologie create da modelli si convertono l'una nell'altra all'interno dello stesso blocco senza ulteriori indicazioni.

### Che cos'è un modello creato

Un modello creato è una normale cronologia dell'area. In seguito si modifica, si rinomina, si integra e si elimina come qualsiasi altra; il modello è il punto di partenza, non un legame permanente. Un aggiornamento del programma non raggiunge quindi una cronologia già creata.

Le altre funzioni di data dell'applicazione restano gregoriane: i marcatori delle attività, i diari, i confronti delle query e i tipi della tabella dati non conoscono cronologie proprie.

### Letture e limiti

- **Calendario Hijri (tabulare)** — riproduce la lettura tabulare: dodici mesi che alternano 30 e 29 giorni; in un anno bisestile il dodicesimo mese (Dhuʻl-Hijjah) ha 30 giorni; gli anni bisestili sono gli anni 2, 5, 7, 10, 13, 16, 18, 21, 24, 26 e 29 di ogni ciclo di 30 anni, contati dall'epoca civile. Questo calcolo vale allo stesso modo per ogni anno. La data vissuta nella pratica religiosa segue invece l'avvistamento della falce di luna e può discostarsene di un giorno, raramente di due. I giorni iniziano a mezzanotte, non al tramonto.
- **Calendario buddista** — il computo buddista degli anni come vale in Thailandia: mesi e anni bisestili gregoriani, con il numero dell'anno superiore di 543 a quello gregoriano. Fino al 1940 l'anno thailandese iniziava il 1° aprile; il modello conta sempre con l'inizio dell'anno al 1° gennaio e perciò prima del 1941, da gennaio a marzo, mostra un anno superiore di uno rispetto all'uso dell'epoca, e lo stesso anno da aprile.
- **Calendario nazionale indiano** e **Calendario minguo** — entrambi continuano a contare all'indietro anche prima della loro introduzione (calendario nazionale indiano 1957, calendario minguo 1912). Per quel periodo le fonti non li attestano come validi; prima del 1912 le fonti indicano spesso mese e giorno secondo il calendario lunare.
- **Calendario giapponese** — mesi e anni bisestili gregoriani con le ere Meiji (dal 23 ottobre 1868), Taishō (dal 30 luglio 1912), Shōwa (dal 25 dicembre 1926), Heisei (dall'8 gennaio 1989) e Reiwa (dal 1° maggio 2019); l'anno 1 di un'era va dal suo inizio al 31 dicembre. Prima di allora, l'epoca «prima di Meiji» conta all'indietro; mancano le ere più antiche, perché si basano sul calendario lunare. Prima del 1873 in Giappone valeva il calendario lunare: le date anteriori al 1873 sono quindi date gregoriane calcolate all'indietro e si discostano dall'uso storico nel mese e nel giorno, talvolta anche nell'anno. Il modello scrive sempre l'era (casella «Scrivi sempre l'abbreviazione dell'epoca» attiva): il 30 settembre 2026 compare nel documento come `8-09-30 Reiwa`.

### Aggiungere una nuova era giapponese

Quando in Giappone inizia una nuova era, la versione successiva del programma dopo il suo annuncio la aggiunge al modello «Calendario giapponese». Una cronologia già creata non ne è raggiunta; lì l'era si aggiunge a mano:

1. Nelle impostazioni, aprire la sezione «Sistemi di calendario» e aprire il blocco con **«Apri»**.
2. Nella cronologia giapponese, sotto «Epoche», scegliere **«Aggiungi epoca»**.
3. Nella nuova e ultima epoca, inserire il nome dell'era sia in **«Nome»** sia in **«Abbreviazione»**, e in **«Inizio»** il suo primo giorno secondo il calendario gregoriano.
4. Scegliere **«Applica»**.

Poiché il modello scrive sempre l'abbreviazione dell'era, i valori già salvati precedenti all'inizio della nuova era mantengono il loro significato: `8-09-30 Reiwa` resta il 30 settembre 2026. Un valore a partire dall'inizio della nuova era ancora contato in quella precedente diventerebbe non valido; l'applicazione chiede conferma all'applicazione delle modifiche e, se lo si desidera, lo converte nel conteggio degli anni della nuova era (sezione «Aggiungere un'epoca in seguito»).

## Valori nel documento

Un valore di calendario compare in forma canonica nel testo sorgente:

```text
@{Nome del calendario: Anno-Mese-Giorno}
@{Nome del calendario: Anno-Mese-Giorno Abbreviazione di epoca}
@{Nome del calendario: Anno-Mese-Giorno Ora:Minuto:Secondo}
```

Il primo simbolo di due punti separa il nome del calendario dal valore. I segmenti di data vanno dal più grande al più piccolo; l'abbreviazione di epoca viene omessa nell'epoca più recente, a meno che per la cronologia sia attivo «Scrivi sempre l'abbreviazione dell'epoca», la parte oraria viene omessa quando tutti i segmenti di tempo sono al loro minimo. Nella vista renderizzata, in modalità live e nell'esportazione portable, il valore appare come un distintivo con i nomi della definizione (ad esempio nomi dei mesi e abbreviazione di epoca).

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

## Converti data

Il comando «Converti data» mostra a quale istante degli altri calendari di un blocco corrisponde una data. Si trova nella palette dei comandi e nel menu contestuale dell'editor; una scorciatoia si può assegnare in File → Impostazioni… → Scorciatoie da tastiera. È attivo non appena l'area aperta definisce almeno un calendario, anche nella vista di lettura.

Il dialogo offre le selezioni **«Blocco»** (solo con più blocchi) e **«Calendario»**, il campo **«Data»** per un valore in notazione canonica senza il nome del calendario (sezione «Valori nel documento») e il pulsante **«Scegli …»**, che apre il selettore. Sotto, l'elenco **«Corrisponde a»** mostra una riga «Nome: valore» per ciascuno degli altri calendari del blocco. Un clic o Invio su una riga rende il suo calendario il punto di partenza; così la conversione funziona in ogni direzione. Il dialogo viene precompilato dalla selezione nel testo: se questa tocca un valore di calendario o il cursore si trova al suo interno, con il suo calendario e il suo valore. Se è selezionato testo su una sola riga senza valore di calendario, vale come valore in notazione canonica nel primo calendario dell'area in cui è valido; se non è valido in nessuno, compare nel primo calendario con il messaggio «Non è una data valida di questo calendario.». Altre notazioni, come «3.10.2026», non vengono interpretate.

Ogni riga con un risultato porta i pulsanti **«Copia»** e **«Inserisci»**; entrambi riprendono la corrispondenza come valore di calendario con il suo nome, `@{Nome: valore}`, così come lo scrive «Inserisci data di calendario». «Copia» la mette negli appunti; il dialogo resta aperto e il pulsante mostra brevemente «Copiato». «Inserisci» la scrive nel documento in un unico passo di annullamento e chiude il dialogo: una selezione viene sostituita, e se il cursore si trova senza selezione all'interno di un valore di calendario, la corrispondenza viene inserita dopo di esso. Ciò è possibile solo se il dialogo è stato aperto da un documento in modalità modifica; altrimenti il pulsante è disattivato e il suo suggerimento ne indica il motivo. «Copia» funziona sempre. Da solo il dialogo non modifica nulla nel documento; scrive soltanto «Inserisci». Così una data viene sostituita dalla sua corrispondenza: selezionare l'intero valore di calendario o una data come testo, richiamare «Converti data» e scegliere «Inserisci» sulla riga desiderata.

Dove non c'è un risultato, compare un'indicazione al posto di un valore:

- Una data che non esiste nel calendario scelto viene segnalata con «Non è una data valida di questo calendario.»; l'elenco allora scompare.
- Se un calendario non può rappresentare l'istante, la sua riga riporta «Nome: fuori dall'intervallo rappresentabile».
- Se il blocco ha un solo calendario, il dialogo segnala che ne manca un secondo.

La conversione avviene solo all'interno di un blocco; la riga di avviso del dialogo lo ricorda. I calendari da convertire tra loro devono quindi trovarsi nello stesso blocco. Una cronologia non si può spostare in un altro blocco: va creata di nuovo nel blocco di destinazione o inserita lì come modello. Il risultato è buono quanto l'ancora e la scala dei calendari coinvolti: i modelli forniti si trovano già da sé sullo stesso asse dei giorni; per i calendari definiti in proprio, il gruppo «Asse del blocco (conversione)» delle impostazioni ne fissa la posizione.

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

Ne viene mostrata la durata nel livello scelto, senza le parti di lunghezza zero, per esempio «1 mese, 2 settimane, 4 giorni». Il suggerimento indica inoltre il valore canonico e il momento corrispondente della cronologia di riferimento. Se la cronologia derivata si basa sulla cronologia standard, le unità appaiono al singolare e al plurale; nei calendari definiti dall’utente vale per questo il campo «Plurale» di ciascuna unità, e senza plurale compare sempre il singolare.

### Selettore

Il selettore di una cronologia derivata mostra la griglia del suo riferimento: si sceglie una data normale e viene inserito il conteggio. **«All’ancora»** salta al punto zero.

### Modifiche alla cronologia di riferimento

Un valore è una coordinata della sua cronologia. Se il riferimento cambia, i valori delle sue cronologie derivate si spostano con esso. L’editor segnala in modo permanente le cronologie derivate esistenti e chiede conferma al momento dell’applicazione; una cronologia con derivate non può essere eliminata finché queste esistono. Le semplici denominazioni — nomi e plurali di livelli, cicli e raggruppamenti nonché nomi dei mesi e dei giorni della settimana — non spostano alcun valore e non richiedono conferma.
