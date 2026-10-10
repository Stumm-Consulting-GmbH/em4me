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

**In tutte le finestre.** Il dialogo compare in ogni finestra aperta dell'applicazione, anche nelle finestre di un'altra area, nelle finestre senza area e nelle finestre di libro e di libreria. Per questo ogni voce indica la sua provenienza, per esempio «Provenienza: Progetti»: l'area, il libro o la libreria da cui viene il promemoria. Completato, Ricordamelo più tardi e Chiudere agiscono sempre sul file di quella provenienza, da qualunque finestra vengano, e una sola volta: il promemoria scompare poi da tutte le finestre, e una seconda azione quasi contemporanea in un'altra finestra resta senza effetto e senza messaggio di errore. Se scadono più promemoria, ogni finestra li raccoglie in un unico dialogo. Una finestra aperta più tardi mostra anch'essa un promemoria ancora aperto.

**Con modifiche non salvate.** Se il file dell'attività è aperto con modifiche non salvate, anche in una finestra diversa da quella in cui si fa clic o come documento che non è in primo piano, Completato e Ricordamelo più tardi agiscono su quello stato non salvato: la modifica compare lì nell'editor, il documento resta non salvato e arriva sul disco solo con il suo salvataggio, e il promemoria scompare come dopo qualsiasi altra azione. Spuntare un'attività e le altre azioni in una query di attività si comportano allo stesso modo (pagina [Liste di attività](tasks.md), sezione «Query di attività e riscrittura»).

**Collegamento al file di origine.** Un clic sul nome del file apre il file alla riga dell'attività, nella finestra della sua area. Se la finestra in cui si è fatto clic mostra un'altra area o nessuna, la finestra dell'area di provenienza passa in primo piano e vi apre il file; se quell'area non è aperta, viene aperta. Il promemoria resta al suo posto: aprire il file non conta come gestirlo.

## Solo con l'applicazione in esecuzione

I promemoria si segnalano **solo finché l'applicazione è in esecuzione e l'area è aperta**. Non esiste un servizio in background né un avviso con l'applicazione chiusa. Se l'applicazione non è aperta al momento di avviso, non va comunque perso nulla: al successivo avvio un **dialogo di recupero** raccoglie tutti i promemoria diventati dovuti nel frattempo e li mostra insieme, in ogni finestra aperta, con le stesse azioni del dialogo normale. Fuori da un'area aperta non avviene alcuna sorveglianza.

Con un'area aperta, l'applicazione controlla di continuo i marcatori di tutti i file dell'area (con ciclo di 30 secondi sull'indice dell'area). In opzione si può attivare una **notifica di sistema** che compare in aggiunta al dialogo quando nessuna finestra dell'applicazione è in primo piano. Compare una sola volta per avviso, anche con più finestre aperte; un clic su di essa porta l'applicazione in primo piano. A mostrarla è il sistema operativo: su Linux se ne occupa l'ambiente desktop, e senza il suo servizio di notifiche resta solo il dialogo dentro l'applicazione.

## Elenco promemoria

Un pannello della barra laterale elenca tutti i promemoria dell'area, raggruppati in **In ritardo**, **Oggi**, **Domani** e **Più tardi**. Il pannello si apre tramite l'icona di sveglia della barra di stato o tramite Visualizza → Barra laterale → Pannelli → Promemoria.

- Ogni voce offre le azioni dirette **Completato** e **Più tardi**; agiscono come nella finestra di promemoria, anche con modifiche non salvate.
- Un clic su una voce apre il file di origine alla riga corrispondente.
- Il nome del file di origine compare qui e nella finestra di notifica senza l'estensione Markdown; il suggerimento indica il percorso completo.
- Il gruppo **In ritardo** comprende anche i promemoria silenziati e vi propone **Attiva di nuovo**.

## Impostazioni ed estensione

La sezione di impostazioni **Promemoria** (File → Impostazioni…) controlla:

- **Ora predefinita**: ora di avviso per i marcatori senza parte oraria (predefinito 09:00).
- **Opzioni di rinvio**: l'elenco delle offerte di rinvio nel dialogo e nell'elenco.
- **Notifica di sistema**: attiva o disattiva la notifica aggiuntiva che compare quando nessuna finestra dell'applicazione è in primo piano.

I promemoria sono un'**estensione** attivabile con una dipendenza dall'estensione **Attività**: se «Attività» è disattivata, anche i promemoria sono inattivi. Maggiori dettagli nella pagina [Estensioni](extensions.md).
