# Sistemi di calendario

Cronologie liberamente definibili per mondi di fantasia e casi d'uso particolari: ogni area può tenere i propri blocchi di calendario, i cui calendari possono essere costruiti in modo completamente diverso dal consueto calendario standard — con proprie lunghezze dei mesi, regole intercalari, cicli settimanali ed epoche. La funzione fa parte dell'estensione «Sistemi di calendario» e vale solo nel contesto di un'area: senza un'area aperta, la sezione delle impostazioni e il comando di inserimento sono inattivi.

## Concetto

### Blocchi

Un blocco è un mondo temporale autonomo con un nome e un numero qualsiasi di calendari. I calendari dello stesso blocco procedono in parallelo, possono essere messi in corrispondenza e convertiti l'uno nell'altro. Blocchi diversi non hanno volutamente nulla a che vedere tra loro — tra di essi non c'è né conversione né comparabilità.

### Calendari e livelli

Un calendario è composto da un elenco ordinato di livelli, il più piccolo per primo (ad esempio secondo → minuto → ora → giorno → mese → anno), raggruppati in gruppi di livelli con nome (nel modello standard «Tempo» e «Data»). Ogni livello descrive la propria relazione con quello immediatamente inferiore mediante uno dei cinque tipi di relazione:

- **Fattore fisso** — un numero fisso di unità inferiori, ad esempio 60 secondi per minuto.
- **Tabella delle lunghezze** — unità con lunghezze individuali, ad esempio tre mesi di 30, 30 e 35 giorni; i nomi di riga della tabella sono al tempo stesso i nomi di posizione (nomi dei mesi). Una regola intercalare posta sopra può percorrere la tabella più volte per istanza: due passaggi su dodici righe danno un anno di 24 mesi.
- **Regola intercalare** — determina gli anni bisestili **per divisibilità**, con regole di ciclo secondo lo schema «intercalazione ogni 4, tranne ogni 100, tranne ogni 400», oppure **secondo uno schema**: una lunghezza del ciclo in anni e le posizioni degli anni bisestili al suo interno, contate da 1 — ad esempio 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 in un ciclo di 30 anni. In entrambi i casi ne fanno parte l'unità prolungata e il prolungamento.
- **Ciclo indipendente** — lo schema settimanale: un ciclo di lunghezza fissa scorre oltre i confini di mese e di anno, ancorato a una data di riferimento, facoltativamente con una regola di numerazione (il numero del ciclo segue l'anno in cui cade il giorno determinante del ciclo).
- **Raggruppamento** — una sintesi puramente calcolatoria, ad esempio trimestri di tre mesi ciascuno.

I nomi di posizione valgono posizione per posizione, per un livello come per un ciclo o un raggruppamento. Se il numero di posizioni è fisso, ad esempio dodici mesi per anno, sette giorni per settimana o quattro trimestri, il programma prende esattamente altrettanti nomi: i nomi in eccesso vengono scartati alla lettura della definizione, quelli mancanti lasciano senza nome le posizioni successive. È ammesso anche un nome vuoto, che lascia senza nome solo la propria posizione. Una posizione senza nome di un livello mostra nel valore il proprio numero, ad esempio 05 per il quinto mese.

### Epoche

Ogni calendario ha esattamente un'epoca passata aperta (conta all'indietro), un numero qualsiasi di epoche intermedie chiuse e un'epoca futura aperta. I confini si susseguono senza interruzioni e si collocano su una data senza componente oraria; il conteggio degli anni parte da 1 in ogni epoca, non esiste un anno 0. Un confine di epoca può cadere a metà anno — l'anno 1 della nuova epoca è allora un anno parziale.

### Conversione tramite l'asse del blocco

Ogni blocco possiede un asse temporale neutro. Ogni calendario viene proiettato su questo asse tramite un'ancora (l'istante del calendario che si trova nel punto zero dell'asse) e una scala (la durata della sua unità più piccola in unità dell'asse, come frazione di numeratore e denominatore). Le conversioni tra calendari passano sempre per l'asse del blocco e arrotondano in modo deterministico al livello più piccolo del calendario di destinazione; il comando «Converti data» ne mostra il risultato (sezione omonima).

Due cronologie di un blocco per le quali non sono indicate né ancora né scala iniziano nello stesso punto dell'asse del blocco; le conversioni tra loro sono allora corrette solo se è voluto così. Perché ciò non passi inosservato durante la creazione, le impostazioni mostrano un avviso nel gruppo «Asse del blocco (conversione)» sotto i campi della scala, finché l'istante di ancoraggio, il numeratore e il denominatore di una cronologia sono vuoti e il blocco contiene un'altra cronologia; l'avviso nomina la prima delle altre cronologie del blocco. Scompare non appena uno dei campi viene compilato. Se intendi un'altra posizione, imposta l'ancora. Una cronologia inserita da un modello non mostra l'avviso, perché il modello porta con sé la propria posizione sull'asse.

## Manutenzione nelle impostazioni

La sezione delle impostazioni «Sistemi di calendario» mostra i blocchi dell'area aperta in due livelli: la panoramica gestisce i blocchi (aggiungere, rinominare, aprire, rimuovere); la vista di dettaglio di un blocco mostra i suoi calendari come moduli con editor per livelli, epoche, cicli, raggruppamenti e l'asse del blocco.

- Il menu a tendina **«Inserisci modello …»** crea una cronologia già compilata a partire dai modelli forniti (sezione «Modelli forniti»). Per iniziare senza modello, **«Aggiungi calendario»** crea una cronologia vuota.
- **Plurale:** accanto al nome di ogni livello si trova il campo «Plurale», così come nel ciclo («Nome del ciclo (plurale)») e in ogni raggruppamento («Nome del raggruppamento (plurale)»). Una durata mostra il singolare con esattamente un'unità e altrimenti il plurale, per esempio «1 mese, 2 settimane, 4 giorni»; senza plurale vale sempre il singolare.
- **«Scrivi sempre l'abbreviazione dell'epoca»:** la casella di controllo alla fine del gruppo «Epoche» scrive l'abbreviazione nel valore anche nell'epoca più recente. È utile se in seguito si aggiungono altre epoche: i valori già salvati mantengono così il loro significato. Un valore dell'epoca più recente indica lo stesso giorno con e senza abbreviazione. Che cosa accade ai valori senza abbreviazione quando si aggiunge un'epoca in seguito è descritto nella sezione «Aggiungere un'epoca in seguito».
- **«Passaggi della tabella delle lunghezze per istanza»:** se sotto una regola intercalare si trova una tabella delle lunghezze, questo campo della regola intercalare stabilisce quante volte la tabella viene percorsa in un'istanza; il valore predefinito è 1. L'indicazione accanto riporta le unità per istanza, cioè passaggi per righe. Aggiungendo o rimuovendo una riga i passaggi restano, e il numero di unità si adegua. I nomi delle posizioni oltre le righe (con due passaggi su dodici righe, i mesi da 13 a 24) non compaiono nella tabella; restano conservati dalla definizione salvata, e una riga creata con «Aggiungi voce» riprende il nome della sua posizione. Un campo del nome vuoto lascia la posizione senza nome.
- **Nomi delle posizioni di un ciclo:** il campo accoglie un nome per riga; una virgola fa parte del nome, come in «lun, presto». Una riga vuota in mezzo all'elenco lascia senza nome la posizione in quel punto; i nomi successivi mantengono la loro posizione. Nella griglia del selettore, una posizione senza nome mostra il proprio numero come intestazione di colonna, come una posizione senza nome di un livello.
- L'**anteprima dal vivo** mostra un valore di esempio a libera scelta in forma canonica e con i nomi; finché una definizione è incompleta, l'editor lo segnala come un avviso (validazione lieve), e solo l'applicazione verifica in modo rigoroso.
- Le definizioni vengono salvate nel file dell'area (file `Area_Settings.mdda`) e valgono per tutte le finestre dell'area.

La modifica non è volutamente mai bloccata: le modifiche di struttura su calendari già utilizzati sono consentite. I valori del documento che così diventano non validi restano conservati invariati e vengono contrassegnati in modo visibile. È bloccato soltanto il salvataggio di una definizione non valida: applicando compare un messaggio e non viene salvato nulla. Se, ad esempio, l'unità prolungata di una regola intercalare non rientra nelle unità per istanza, la regola intercalare lo segnala già durante l'immissione e indica le posizioni ammesse.

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
4. Calendario Hijri (Umm al-Qura)
5. Calendario persiano
6. Calendario ebraico
7. Calendario cinese
8. Calendario nazionale indiano
9. Calendario buddista
10. Calendario etiope
11. Calendario copto
12. Calendario giapponese
13. Calendario minguo

La scelta crea subito la cronologia nel blocco aperto, già compilata e senza ulteriori immissioni; poi il menu torna alla sua prima voce. La cronologia porta il nome del menu; se quel nome è già usato nell'area, riceve un numero aggiunto, per esempio «Calendario gregoriano 2». Come ogni modifica di questa sezione, viene salvata con **«Applica»**.

Ogni modello porta con sé i livelli di tempo secondo, minuto e ora, una settimana di sette giorni e il singolare e il plurale delle sue unità. Il calendario gregoriano mostra inoltre tutti i tipi di relazione in un'unica definizione: dodici mesi, regola intercalare, ciclo settimanale, trimestri e semestri. Tutti i modelli si trovano sullo stesso asse dei giorni: le cronologie create da modelli si convertono l'una nell'altra all'interno dello stesso blocco senza ulteriori indicazioni.

### Che cos'è un modello creato

Un modello creato è una normale cronologia dell'area. In seguito si modifica, si rinomina, si integra e si elimina come qualsiasi altra; il modello è il punto di partenza, non un legame permanente. Un aggiornamento del programma non raggiunge quindi una cronologia già creata. Fanno eccezione il mese e l'anno dei quattro modelli con una struttura che cambia di anno in anno (sezione seguente): lì la cronologia rimanda alla regola o alla tabella fornita invece di copiarla, e un aggiornamento del programma con una tabella aggiornata raggiunge anche le cronologie già create.

Le altre funzioni di data dell'applicazione restano gregoriane: i marcatori delle attività, i diari, i confronti delle query e i tipi della tabella dati non conoscono cronologie proprie.

### Modelli con una struttura che cambia di anno in anno

Nei calendari ebraico, persiano e cinese e nel calendario Hijri secondo Umm al-Qura ogni anno si compone in modo diverso: il numero dei mesi, la durata di ciascun mese e l'inizio dell'anno si determinano anno per anno. Il calendario ebraico segue la sua regola di calcolo fissa e vale senza limiti di tempo. Gli altri tre seguono una tabella fornita e verificata e valgono per un periodo fisso:

| Modello | Primo giorno | Ultimo giorno |
|---|---|---|
| Calendario Hijri (Umm al-Qura) | 30 aprile 1900 (1 Muharram 1318 AH) | 16 novembre 2077 (30 Dhuʻl-Hijjah 1500 AH) |
| Calendario persiano | 21 marzo 1900 (1 Farvardin 1279 AP) | 20 marzo 2101 (29 Esfand 1479 AP) |
| Calendario cinese | 19 febbraio 1901 (primo giorno dell'anno 1901) | 28 gennaio 2101 (ultimo giorno dell'anno 2100) |

Prima e dopo, il programma indica «non noto» invece di mostrare una data approssimata: nel selettore, per un valore nel documento e nel dialogo «Converti data». Le tabelle fanno parte del programma; non serve alcuna connessione a Internet. Vengono aggiornate prima della scadenza del loro periodo e dopo una correzione da parte dell'autorità competente.

- **I mesi intercalari** sono mesi a sé. In un valore ogni mese mantiene il suo numero in ogni anno; un mese intercalare porta il numero del mese a cui segue e una `L` aggiunta. Adar I dell'anno ebraico 5784 compare così nel documento come `5784-05L-01`, Adar II come `5784-06-01`, e il mese intercalare dell'anno cinese 2023 come `2023-02L-01`. Un valore salvato indica quindi lo stesso mese in ogni anno.
- **Nelle impostazioni** il mese e l'anno di queste cronologie sono di sola lettura; nomi, settimane ed ere restano modificabili. Non si possono scegliere come riferimento di una cronologia derivata (sezione «Cronologie derivate»).
- **Il giorno** inizia a mezzanotte, come in tutti i modelli; il programma non riproduce l'inizio del giorno al tramonto dei calendari ebraico e islamico.

### Letture e limiti

- **Calendario Hijri (tabulare)** — riproduce la lettura tabulare: dodici mesi che alternano 30 e 29 giorni; in un anno bisestile il dodicesimo mese (Dhuʻl-Hijjah) ha 30 giorni; gli anni bisestili sono gli anni 2, 5, 7, 10, 13, 16, 18, 21, 24, 26 e 29 di ogni ciclo di 30 anni, contati dall'epoca civile. Questo calcolo vale allo stesso modo per ogni anno. La data vissuta nella pratica religiosa segue invece l'avvistamento della falce di luna e può discostarsene di un giorno, raramente di due. I giorni iniziano a mezzanotte, non al tramonto.
- **Calendario Hijri (Umm al-Qura)** — il calendario ufficiale dell'Arabia Saudita per scopi amministrativi. I mesi iniziano secondo i dati dell'autorità saudita KACST (King Abdulaziz City for Science and Technology), non secondo una regola di calcolo fissa; ogni mese ha 29 o 30 giorni, l'anno 354 o 355. I nomi dei mesi e il conteggio degli anni «AH» sono quelli della lettura tabulare, che calcola con una sequenza fissa e può discostarsi dal calendario ufficiale di uno o due giorni. La tabella è verificata mese per mese sull'edizione ufficiale dell'autorità; termina con l'anno 1500 AH perché l'edizione ufficiale non va oltre. Le date precedenti al 1423 AH (prima del 15 marzo 2002) sono l'attuale calcolo retrospettivo ufficiale; il calendario allora in vigore in Arabia Saudita seguiva altre regole e poteva discostarsene di un giorno.
- **Calendario persiano** — la lettura ufficiale iraniana: l'anno inizia il giorno dell'equinozio di primavera se questo cade prima di mezzogiorno, ora di Teheran, altrimenti il giorno dopo. I primi sei mesi hanno 31 giorni, i cinque successivi 30, l'ultimo (Esfand) 29, o 30 in un anno bisestile; gli anni si contano «AP». La tabella è verificata sulla tabella degli anni bisestili del Centro del calendario dell'Università di Teheran.
- **Calendario ebraico** — calcola secondo la regola fissa del calendario, anche in anni molto lontani. In 7 anni su 19 si aggiunge Adar I come mese supplementare, e Adar si chiama allora Adar II. Gli anni si contano «AM»; prima dell'anno 1 l'epoca «prima di AM» conta all'indietro. Dal 10 novembre 2045 al 29 novembre 2046 il programma segue la regola di calcolo; alcuni altri programmi mostrano per questi giorni una data spostata di un giorno.
- **Calendario cinese** — il calendario lunisolare tradizionale. Il numero dell'anno è l'anno gregoriano in cui inizia l'anno cinese: `2025-01-01` è il 29 gennaio 2025, e l'anno 2026 termina il 5 febbraio 2027. Il modello non mostra il nome dell'anno nel ciclo di 60 anni. I mesi si chiamano da «Mese 1» a «Mese 12», un mese intercalare «Mese intercalare» con il numero del mese a cui segue, mostrato con i nomi per esempio come `2023-Mese intercalare 2-01`; come in ogni modello, i nomi si possono cambiare. La tabella è un calcolo astronomico dei noviluni e dei termini solari secondo l'ora di Pechino, verificato sui file ufficiali del calendario del governo di Hong Kong per gli anni dal 2023 al 2028 e, sull'intero periodo, su un secondo calcolo indipendente. Il 9° mese del 2057 inizia il 28 settembre, come nella tabella dell'Hong Kong Observatory; l'autorità stessa indica questo giorno come incerto, perché il novilunio cade solo pochi secondi prima di mezzanotte. Altri programmi possono discostarsi in singoli giorni, per esempio per il Capodanno 2027, che ufficialmente cade il 6 febbraio.
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

Se un valore si trova fuori dal periodo di validità della sua cronologia (sezione «Modelli con una struttura che cambia di anno in anno»), anche il testo sorgente resta invariato. Il valore allora non conta come non valido: il suo suggerimento indica «Nome: non noto».

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
- **Periodo di validità:** per una cronologia con tabella lo scorrimento si ferma al bordo del suo periodo. Aperto su un valore che ne è fuori, il selettore si posiziona sul suo primo giorno noto e indica «Nome: non noto». Un mese intercalare compare nell'intestazione con nome e codice, per esempio «Mese intercalare 2 (02L)».

### Visualizzazione della conversione

Sotto la griglia, il selettore mostra l'istante scelto in tutti i calendari paralleli del blocco. Un clic su una corrispondenza sposta lì il calendario attivo. I calendari di blocchi diversi non sono volutamente convertibili.

## Converti data

Il comando «Converti data» mostra a quale istante degli altri calendari di un blocco corrisponde una data. Si trova nella palette dei comandi e nel menu contestuale dell'editor; una scorciatoia si può assegnare in File → Impostazioni… → Scorciatoie da tastiera. È attivo non appena l'area aperta definisce almeno un calendario, anche nella vista di lettura.

Il dialogo offre le selezioni **«Blocco»** (solo con più blocchi) e **«Calendario»**, il campo **«Data»** per un valore in notazione canonica senza il nome del calendario (sezione «Valori nel documento») e il pulsante **«Scegli …»**, che apre il selettore. Sotto, l'elenco **«Corrisponde a»** mostra una riga «Nome: valore» per ciascuno degli altri calendari del blocco. Un clic o Invio su una riga rende il suo calendario il punto di partenza; così la conversione funziona in ogni direzione. Il dialogo viene precompilato dalla selezione nel testo: se questa tocca un valore di calendario o il cursore si trova al suo interno, con il suo calendario e il suo valore. Se è selezionato testo su una sola riga senza valore di calendario, vale come valore in notazione canonica nel primo calendario dell'area in cui è valido; se non è valido in nessuno, compare nel primo calendario con il messaggio «Non è una data valida di questo calendario.». Altre notazioni, come «3.10.2026», non vengono interpretate.

Ogni riga con un risultato porta i pulsanti **«Copia»** e **«Inserisci»**; entrambi riprendono la corrispondenza come valore di calendario con il suo nome, `@{Nome: valore}`, così come lo scrive «Inserisci data di calendario». «Copia» la mette negli appunti; il dialogo resta aperto e il pulsante mostra brevemente «Copiato». «Inserisci» la scrive nel documento in un unico passo di annullamento e chiude il dialogo: una selezione viene sostituita, e se il cursore si trova senza selezione all'interno di un valore di calendario, la corrispondenza viene inserita dopo di esso. Ciò è possibile solo se il dialogo è stato aperto da un documento in modalità modifica; altrimenti il pulsante è disattivato e il suo suggerimento ne indica il motivo. «Copia» funziona sempre. Da solo il dialogo non modifica nulla nel documento; scrive soltanto «Inserisci». Così una data viene sostituita dalla sua corrispondenza: selezionare l'intero valore di calendario o una data come testo, richiamare «Converti data» e scegliere «Inserisci» sulla riga desiderata.

Dove non c'è un risultato, compare un'indicazione al posto di un valore:

- Una data che non esiste nel calendario scelto viene segnalata con «Non è una data valida di questo calendario.»; l'elenco allora scompare.
- Se un calendario non può rappresentare l'istante, la sua riga riporta «Nome: fuori dall'intervallo rappresentabile».
- Se l'istante si trova fuori dal periodo di validità di una cronologia (sezione «Modelli con una struttura che cambia di anno in anno»), la sua riga riporta «Nome: non noto»; le altre righe mostrano il loro valore. Se è già la data immessa a trovarsi fuori, il dialogo segnala «Nome: non noto».
- Se il blocco ha un solo calendario, il dialogo segnala che ne manca un secondo.

La conversione avviene solo all'interno di un blocco; la riga di avviso del dialogo lo ricorda. I calendari da convertire tra loro devono quindi trovarsi nello stesso blocco. Una cronologia non si può spostare in un altro blocco: va creata di nuovo nel blocco di destinazione o inserita lì come modello. Il risultato è buono quanto l'ancora e la scala dei calendari coinvolti: i modelli forniti si trovano già da sé sullo stesso asse dei giorni; per i calendari definiti in proprio, il gruppo «Asse del blocco (conversione)» delle impostazioni ne fissa la posizione.

## Cronologie derivate

Una cronologia derivata conta da un punto zero scelto: quanto manca a una data o quanto tempo è passato da un evento. Non richiede una definizione propria, ma solo una cronologia di riferimento e un punto zero.

### Creazione

Nella sezione delle impostazioni «Sistemi di calendario» il pulsante **«Aggiungi cronologia derivata»** apre un modulo breve:

- **Cronologia di riferimento** — un calendario dello stesso blocco oppure la cronologia standard inclusa. Per un conto alla rovescia non serve quindi un calendario proprio. Le cronologie con una struttura che cambia di anno in anno non si possono scegliere come riferimento, perché il loro conteggio non si può spostare; un conteggio a partire da un giorno passa per la cronologia gregoriana dello stesso blocco.
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
