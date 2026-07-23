# Liste di attività

Le liste di attività sono voci di elenco con una casella di stato. Oltre agli stati standard (aperta, completata) esistono stati estesi con carattere, glifo e colore propri, oltre a marcatori di attività per scadenze, priorità e ricorrenza a fine riga.

## Stati standard

```markdown
- [ ] attività aperta
- [x] attività completata
```

- [ ] attività aperta
- [x] attività completata

Nei file modificabili un clic sulla casella completa l'attività o la riapre — nella vista Lettura e nella modalità Live. Nel manuale di sola lettura il clic non ha effetto.

## Stati estesi

Sei stati predefiniti; il carattere sta tra le parentesi quadre:

```markdown
- [/] in corso
- [-] annullata
- [>] delegata
- [?] domanda
- [!] importante
- [*] contrassegnata
```

- [/] in corso
- [-] annullata
- [>] delegata
- [?] domanda
- [!] importante
- [*] contrassegnata

Ogni stato appare come casella colorata con glifo. Un clic sulla casella passa al **simbolo successivo** dello stato (predefinito: completare con `[x]`); così si possono configurare catene come «aperta → in corso → completata».

## Stati personalizzati, tipo e simbolo successivo

La sezione **Stati attività** della pagina delle impostazioni (File → Impostazioni…) gestisce il set: gli stati predefiniti possono essere disattivati o ricolorati, stati personalizzati con carattere, etichetta e colore liberi possono essere aggiunti. Non sono ammessi spazio, `x`, `X`, parentesi quadre e backslash; un avviso segnala i caratteri usati più di una volta.

Ogni stato porta inoltre un **tipo** e un **simbolo successivo**:

- **Tipo** determina il significato dello stato: Aperto, In corso, In attesa, Completato, Annullato o Non è un'attività. Solo il passaggio a uno stato di tipo **Completato** imposta la data di completamento e attiva la ricorrenza; il tipo **Annullato** imposta la data di annullamento. Le righe di tipo **Non è un'attività** non contano come attività. L'assegnazione è libera: anche un carattere come `*` può portare il tipo Completato.
- **Simbolo successivo** determina quale carattere imposta poi il clic sulla casella di stato. Gli stati di base sono fissi: `[ ]` diventa `[x]`, `[x]` diventa `[ ]`.

## Marcatori di attività: scadenze

Le scadenze figurano come marcatori simbolo con una data `AAAA-MM-GG` a fine riga e compaiono in tutte le viste come badge:

```markdown
- [ ] Consegnare relazione 📅 2099-03-31
- [ ] Preparazione ⏳ 2099-03-24 🛫 2099-03-17
- [ ] Molto in ritardo 📅 2020-01-01
```

- [ ] Consegnare relazione 📅 2099-03-31
- [ ] Preparazione ⏳ 2099-03-24 🛫 2099-03-17
- [ ] Molto in ritardo 📅 2020-01-01

Si impostano manualmente **scadenza** (`📅`), **pianificata** (`⏳`) e **inizio** (`🛫`). Si creano automaticamente **creata** (`➕`), **completata** (`✅`) e **annullata** (`❌`) — vedi date automatiche. Le scadenze superate sono evidenziate in rosso; i valori non validi nel calendario (un 30 febbraio, ad esempio) vengono conservati e contrassegnati come non validi.

Dopo la data è ammessa facoltativamente un'**ora** `HH:mm`:

```markdown
- [ ] Appuntamento dal dentista 📅 2099-03-31 14:30
```

- [ ] Appuntamento dal dentista 📅 2099-03-31 14:30

L'ora è un'estensione di formato propria di questa applicazione; altri programmi Markdown con lo stesso formato di marcatore non si aspettano un'ora dopo la data. Le righe senza ora sono del tutto intercambiabili.

Da distinguere da questa data effettiva è il marcatore di promemoria ⏰, che attiva un promemoria al momento indicato; è descritto nella pagina [Promemoria](reminders.md).

## Marcatori di attività: priorità

Sei livelli; «normale» non ha simbolo e si colloca tra media e bassa:

```markdown
- [ ] Massima 🔺
- [ ] Alta ⏫
- [ ] Media 🔼
- [ ] Normale (senza marcatore)
- [ ] Bassa 🔽
- [ ] Minima ⏬
```

- [ ] Massima 🔺
- [ ] Alta ⏫
- [ ] Media 🔼
- [ ] Normale (senza marcatore)
- [ ] Bassa 🔽
- [ ] Minima ⏬

## Marcatori di attività: ricorrenza

Una regola di ricorrenza segue `🔁` e, al completamento dell'attività, produce automaticamente l'istanza successiva — con scadenze riportate, stato aperto e, secondo l'impostazione, sopra (predefinito) o sotto la riga completata:

```markdown
- [ ] Pianificazione settimanale 🔁 every week on Sunday ⏳ 2099-03-01
- [ ] Portare fuori la spazzatura 🔁 every 3 days when done 📅 2099-03-05
- [ ] Controllare l'affitto 🔁 every month on the last 📅 2099-03-31
```

- [ ] Pianificazione settimanale 🔁 every week on Sunday ⏳ 2099-03-01
- [ ] Portare fuori la spazzatura 🔁 every 3 days when done 📅 2099-03-05
- [ ] Controllare l'affitto 🔁 every month on the last 📅 2099-03-31

Forme di regola: `every day`, `every 3 days`, `every weekday`, `every week`, `every week on Sunday` (anche più giorni della settimana), `every 2 weeks`, `every month`, `every month on the 15th`, `every month on the last`, `every 6 months`, `every year`. L'aggiunta `when done` calcola dal completamento effettivo invece che dalla data prevista.

Comportamento in dettaglio: la base di calcolo è la scadenza, in mancanza la pianificata, in mancanza l'inizio — è richiesto almeno un campo di scadenza. Se più campi portano scadenze, le loro distanze vengono conservate; le ore vengono riprese invariate. Le regole mensili saltano i mesi senza il giorno obiettivo (un 31 non cade quindi mai il 30). Non c'è data di fine né limite al numero di occorrenze; le regole incomprensibili restano senza effetto.

## Date automatiche

Al cambio di stato l'applicazione scrive marcatori di data nella riga — ciascuno dei tre automatismi può essere disattivato singolarmente nella sezione di impostazioni **Attività**:

- **Completata** (`✅`): al passaggio a uno stato di tipo Completata; il ritorno indietro rimuove di nuovo la data.
- **Annullata** (`❌`): analogamente per il tipo Annullata.
- **Creata** (`➕`): quando si trasforma una riga in attività tramite il comando «Lista di attività» (disattivato per impostazione predefinita).

L'automatismo scrive solo la data, senza ora.

## Filtro globale

Il **Filtro globale** (sezione di impostazioni **Attività**) decide quali righe con casella contano come attività: solo le righe che contengono il testo del filtro (ad esempio `#task`) ricevono badge e date automatiche; con il filtro vuoto conta ogni riga con casella. Facoltativamente il testo del filtro viene nascosto nelle viste.

## ID e dipendenze

Un'attività può portare un **ID** (`🆔`) e dipendere da altre attività tramite **riferimenti a un predecessore** (`⛔` con uno o più ID) — relazioni fine-inizio:

```markdown
- [ ] Gettare le fondamenta 🆔 abc12 📅 2099-04-01
- [ ] Alzare i muri ⛔ abc12
```

- [ ] Gettare le fondamenta 🆔 abc12 📅 2099-04-01
- [ ] Alzare i muri ⛔ abc12

Un'attività è considerata **bloccata** finché almeno un predecessore è ancora aperto (tipi di stato Aperto, In corso o In attesa su entrambi i lati); i predecessori completati o annullati non bloccano. I risultati bloccati della query di attività portano un contrassegno `⛔` discreto; i campi `blocked`, `blocking` e `id.set` filtrano di conseguenza (vedi il Livello di attività della pagina [Query Perspective](frontmatter-query.md)).

Gli ID si compongono di lettere, cifre, `_` e `-`. Gli ID generati automaticamente (finestra o completamento automatico) sono **univoci nell'ambito di ricerca**; gli ID assegnati due volte a mano mostrano un badge `⚠` nei risultati e si trovano tramite il campo `id.duplicate`. Nell'istanza successiva di una ricorrenza, i marcatori di ID e di predecessore vengono rimossi affinché non nascano ID duplicati.

## Finestra di modifica

Il comando **Modifica attività…** (predefinito `Ctrl+Alt+A`, anche nel menu contestuale dell'editor sotto Inserisci e come pulsante matita sui risultati della query) apre un modulo per tutti i marcatori: descrizione, stato (dal set di stati configurato), priorità, regola di ricorrenza con indicazione in caso di forma incomprensibile, le tre scadenze manuali tramite il calendario delle date, oltre a ID, predecessori e successori con una ricerca di attività sull'ambito di ricerca. Su una riga di attività la finestra modifica; su una riga vuota crea una nuova attività. Il passaggio a uno stato di tipo Completato imposta la data di completamento secondo l'automatismo; una voce di successore scrive il riferimento al predecessore sulla riga di destinazione (l'attività stessa riceve automaticamente un ID se necessario). Ogni applicazione è un singolo passo di annullamento.

## Completamento automatico

Sulle righe di attività il completamento propone marcatori dopo la casella di stato: le tre scadenze (aprono il calendario delle date), la priorità, le regole di ricorrenza frequenti, i cambi di stato e «Genera ID». I suggerimenti compaiono a partire da una lunghezza di digitazione configurabile (o subito con `Ctrl+Spazio`) e sostituiscono la parola digitata all'accettazione; la lunghezza minima di digitazione e il numero di suggerimenti si trovano nella sezione di impostazioni **Attività**.

## Query di attività e riscrittura

L'ambito di query `LIST TASKS` (pagina [Query Perspective](frontmatter-query.md), sezione Livello di attività) elenca le attività su tutto l'ambito di ricerca — con filtri su tutti i campi marcatore, raggruppamento e controllo della disposizione. I risultati sono una superficie di lavoro: la **casella di stato** fa avanzare lo stato direttamente nel file sorgente (con commutazione a catena, date automatiche e ricorrenza), il **pulsante di posticipazione** sposta la scadenza rilevante a domani, una settimana dopo o una data scelta liberamente (le scadenze superate contano da oggi), il **pulsante matita** apre la finestra di modifica. La scrittura raggiunge anche file non aperti; i documenti aperti vengono aggiornati tramite lo stato dell'editor e mai superati, e se una riga di risultato è cambiata nel frattempo, appare un avviso invece di una scrittura alla cieca.

## Punteggio di urgenza

Il punteggio rende le liste di attività ordinabili senza interventi manuali (l'ordinamento predefinito della query di attività; mostrabile come valore tramite `SHOW urgency`, filtrabile e ordinabile tramite il campo `urgency`). È la somma di quattro componenti:

| Componente | Valore |
|---|---|
| Scadenza | 12,0 da sette giorni di ritardo, in calo progressivo fino a 2,4 da quattordici giorni nel futuro (scadenza oggi: 8,8); 0 senza scadenza |
| Priorità | Massima 9,0 · Alta 6,0 · Media 3,9 · Normale 1,95 · Bassa 0,0 · Minima −1,8 |
| Pianificata | +5,0 se la scadenza pianificata è oggi o prima |
| Inizio | −3,0 se la scadenza di inizio è domani o dopo |

Il punteggio calcola su base giornaliera; un'ora dopo la data non ha influenza, e le scadenze non valide nel calendario contano come mancanti.
