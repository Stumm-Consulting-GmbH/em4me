# Cronologia del documento

La cronologia del documento registra le modifiche di un documento Markdown come **cronologia delle revisioni**: chi cura un documento nel tempo vede quali modifiche sono state fatte e quando, può confrontare due stati riga per riga e recuperare uno stato precedente. La cronologia vive in un **file di accompagnamento** accanto al documento e viaggia con esso quando i due file vengono copiati o spostati insieme.

## File Markdown-Data (.mdd)

Al documento `Note.md` corrisponde il file di accompagnamento `Note.mdd` («Markdown-Data») nella stessa cartella. Nasce al primo salvataggio con la cronologia attiva e contiene la cronologia completa: lo stato iniziale, tutti i pacchetti di modifiche e, a intervalli, stati intermedi completi come punti di ancoraggio. Il formato è testo leggibile (JSON), volutamente trasparente; un `.mdd` non può essere aperto come documento.

Lo stesso file di accompagnamento contiene anche, accanto alla cronologia, la [nota del documento](notes.md), in una sezione propria. A differenza della cronologia, la nota non ha però né revisioni né ripristino.

Due cose da sapere:

- Se il documento viene **rinominato o spostato** fuori dall'app, il file di accompagnamento va portato con sé a mano, altrimenti la cronologia perde il collegamento e ricomincia da capo.
- Nelle cartelle **sincronizzate, salvate o versionate** da altri programmi, anche i file `.mdd` viaggiano. È voluto (la cronologia appartiene al documento), ma va saputo: l'intera cronologia delle modifiche di un documento viaggia con il file di accompagnamento.

## Attivare: tre livelli

Di fabbrica la cronologia è **disattivata**. Si attiva su tre livelli; vince il livello più specifico, i livelli non impostati ereditano dal successivo più generale:

| Livello | Posizione | Effetto |
|---|---|---|
| Documento | proprietà YAML `history` nel frontmatter | prevale su area e app |
| Area | file di area `Area_Settings.mdda` nella cartella radice dell'area | prevale sull'impostazione dell'app, vale per tutti i documenti dell'area |
| App | Impostazioni → Comportamento → Cronologia del documento | impostazione di base per tutto il resto |

Il livello documento sta nel frontmatter:

```yaml
---
history: true
---
```

`history: false` disattiva; una proprietà assente eredita. Il modo più semplice è il menu del clic sull'icona nella barra di stato (attivare, disattivare, usare il valore ereditato). Il valore predefinito dell'area si imposta nella voce di impostazioni «Cronologia del documento» del gruppo di navigazione «Area corrente» (visibile solo quando un'area è aperta); il file di area nasce solo alla prima impostazione.

**Disattivare non cancella nulla.** La registrazione va solo in pausa; il file di accompagnamento resta. Alla riattivazione la lacuna viene annotata come un pacchetto raggruppato e la cronologia resta tracciabile senza interruzioni.

## Pacchetti di modifiche

Perché salvataggi frequenti (per esempio con il salvataggio automatico) non inondino la cronologia di micro-passi, l'app raggruppa i salvataggi consecutivi in un **pacchetto di modifiche**. Lo controllano due finestre temporali (Impostazioni → Comportamento):

- **Durata massima del pacchetto** (predefinito 5 minuti): dopo, inizia un nuovo pacchetto anche lavorando senza pause.
- **Chiusura per inattività** (predefinito 2 minuti): dopo una pausa senza modifiche, il salvataggio successivo apre un nuovo pacchetto.

Ogni pacchetto porta marche temporali e l'origine rilevata: **Modifica** (salvato nell'app) oppure **Esterno** (il file è stato cambiato da un altro programma; l'app lo rileva all'apertura e prima di ogni salvataggio e annota la differenza invece di lasciare che la cronologia si spezzi).

## Barra di stato

L'icona a orologio nella barra di stato mostra lo stato del documento attivo:

- **Attiva** (piena): le modifiche vengono registrate.
- **In pausa** (contorno): la cronologia è effettivamente disattivata, esiste un file di accompagnamento.
- **Inattiva**: la cronologia è disattivata, nessun file di accompagnamento.

Il tooltip indica inoltre quale livello determina l'impostazione (file, area o app). Un clic apre il menu con la vista della cronologia e gli interruttori del livello documento.

## Vista della cronologia

«Visualizza → Cronologia del documento» (o il menu della barra di stato) apre l'elenco delle revisioni del documento attivo come scheda in sola lettura: la revisione più recente in alto, sotto tutti i pacchetti con data, origine ed entità (+righe inserite/−rimosse), in fondo lo stato iniziale. La scheda si trova immediatamente a destra della scheda del documento. Per finestra esiste esattamente una vista della cronologia; aprirla per un altro documento sposta la stessa scheda accanto alla scheda di quest'ultimo.

- **Visualizza** mostra lo stato completo di una revisione sotto l'elenco.
- **Confronta** mette a confronto riga per riga due stati selezionati (colonne «Da» e «A», a scelta anche contro lo stato attuale): righe rimosse in rosso, inserite in verde, con segni di omissione per i passaggi invariati.
- **Ripristina** carica lo stato scelto nella scheda di modifica del documento. Il documento risulta quindi modificato; solo il salvataggio rende effettivo il ripristino e crea così una revisione **nuova**. Le revisioni precedenti non vengono mai cancellate né sovrascritte.
