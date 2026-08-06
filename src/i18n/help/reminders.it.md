# Promemoria

Un promemoria si segnala in un momento a scelta e riporta un'attività sotto gli occhi. Dipende dal marcatore di promemoria ⏰ di una riga di attività e si distingue così dalla scadenza 📅: la scadenza indica la data effettiva (quando qualcosa deve essere pronto), il marcatore di promemoria indica il momento di avviso (quando l'applicazione lo ricorda). I promemoria sono un'estensione attivabile e si appoggiano alle [liste di attività](tasks.md).

## Marcatore e vie di inserimento

Come gli altri marcatori di attività, il marcatore si colloca a fine riga:

```
⏰ AAAA-MM-GG [HH:MM]
```

La parte oraria è facoltativa. In sua assenza, il promemoria si segnala all'ora predefinita configurata (vedi Impostazioni).

```markdown
- [ ] Presentare la dichiarazione ⏰ 2099-04-14
- [ ] Richiamare il cliente ⏰ 2099-04-14 09:30
```

- [ ] Presentare la dichiarazione ⏰ 2099-04-14
- [ ] Richiamare il cliente ⏰ 2099-04-14 09:30

Ci sono diverse vie per l'inserimento:

- **Comando «Imposta promemoria»** (predefinito `Ctrl+Alt+R`): su una riga di attività apre il selettore di data e ora e scrive il marcatore.
- **Completamento automatico**: su una riga di attività la voce «Promemoria…» propone il marcatore e apre lo stesso selettore.
- **Dialogo di modifica attività**: la riga di promemoria del dialogo imposta o modifica il marcatore insieme agli altri campi.
- **Clic sul valore**: un clic sul valore ⏰ o sul badge ⏰ apre il selettore precompilato.

## Dialogo di notifica

Quando un promemoria è dovuto, un dialogo lo segnala con la descrizione dell'attività e un collegamento al file di origine. Restano tre vie:

- **Completato**: fa avanzare l'attività lungo la catena di stati configurata. Se l'attività porta una regola di ripetizione, viene creata l'istanza successiva e il marcatore ⏰ passa in quell'istanza con un momento spostato.
- **Ricordamelo più tardi**: rinvia il momento di avviso. Sono proposte le opzioni di rinvio configurate (predefinito 10 minuti, 1 ora, 4 ore, 1 giorno, 1 settimana) e una scelta di data libera. Il nuovo momento viene scritto direttamente nel marcatore del file di origine.
- **Chiudere** (chiusura o Esc): silenzia questo promemoria fino al successivo avvio dell'applicazione. L'attività stessa resta invariata.

## Solo con l'applicazione in esecuzione

I promemoria si segnalano **solo finché l'applicazione è in esecuzione e l'area è aperta**. Non esiste un servizio in background né un avviso con l'applicazione chiusa. Se l'applicazione non è aperta al momento di avviso, non va comunque perso nulla: al successivo avvio un **dialogo di recupero** raccoglie tutti i promemoria diventati dovuti nel frattempo e li mostra insieme, con le stesse azioni del dialogo normale. Fuori da un'area aperta non avviene alcuna sorveglianza.

Con un'area aperta, l'applicazione controlla di continuo i marcatori di tutti i file dell'area (con ciclo di 30 secondi sull'indice dell'area). In opzione si può attivare una **notifica di sistema** che compare in aggiunta al dialogo quando la finestra non è in primo piano; un clic su di essa porta l'applicazione in primo piano.

## Elenco promemoria

Un pannello della barra laterale elenca tutti i promemoria dell'area, raggruppati in **In ritardo**, **Oggi**, **Domani** e **Più tardi**. Il pannello si apre tramite l'icona di sveglia della barra di stato o tramite Visualizza → Barra laterale → Pannelli → Promemoria.

- Ogni voce offre le azioni dirette **Completato** e **Più tardi**.
- Un clic su una voce apre il file di origine alla riga corrispondente.
- Il gruppo **In ritardo** comprende anche i promemoria silenziati e vi propone **Attiva di nuovo**.

## Impostazioni ed estensione

La sezione di impostazioni **Promemoria** (File → Impostazioni…) controlla:

- **Ora predefinita**: ora di avviso per i marcatori senza parte oraria (predefinito 09:00).
- **Opzioni di rinvio**: l'elenco delle offerte di rinvio nel dialogo e nell'elenco.
- **Notifica di sistema**: attiva o disattiva la notifica aggiuntiva per una finestra non in primo piano.

I promemoria sono un'**estensione** attivabile con una dipendenza dall'estensione **Attività**: se «Attività» è disattivata, anche i promemoria sono inattivi. Maggiori dettagli nella pagina [Estensioni](extensions.md).
