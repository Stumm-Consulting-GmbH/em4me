# Vista mappa mentale

La vista mappa mentale mostra la struttura di **un** documento come mappa: i titoli e i punti elenco diventano nodi di un albero, e il testo corrente sotto di essi diventa la nota del proprio nodo. È una vista dello stesso documento, non un secondo documento, e non modifica mai il testo.

La vista appartiene all'estensione **Vista mappa mentale** e si può disattivare in Impostazioni → Estensioni. Con l'estensione disattivata la voce di menu scompare, e una scheda rimasta aperta come mappa torna alla vista di lettura.

## Aprire

La mappa mentale è il quinto modo di visualizzazione di una scheda, accanto a Sorgente, Divisa, Renderizzata e Live: Visualizza → Mappa mentale oppure `Ctrl+5` come impostazione predefinita. Il modo vale per scheda: un documento può quindi restare aperto come mappa mentre accanto se ne modifica un secondo come sorgente. La mappa segue il documento: se si aggiunge un titolo nella sorgente, poco dopo compare nella mappa.

## Che cosa diventa un nodo

| Nel documento | Nella mappa |
| ------------- | ----------- |
| titoli | i livelli superiori dell'albero |
| punti elenco | proseguono la gerarchia sotto il proprio nodo |
| paragrafi, tabelle, blocchi di codice, immagini | nota del nodo sovraordinato |

La radice è il titolo di primo livello se il documento ne porta esattamente uno; altrimenti la radice la porta il nome del file e tutti i titoli di primo livello ne diventano i figli. Un livello saltato non genera un nodo vuoto: un nodo si aggancia all'antenato esistente più vicino.

## Posizione della radice

La direzione di crescita è una scelta, perché dipende dal documento e dallo schermo: un albero profondo si legge meglio da sinistra a destra, uno piatto e largo dall'alto in basso, e la posizione centrale sfrutta al meglio uno schermo largo.

| Posizione | Immagine |
| --------- | -------- |
| **A sinistra** | radice a sinistra, tutti i rami crescono verso destra |
| **Al centro** | radice al centro, i rami si distribuiscono su entrambi i lati |
| **A destra** | radice a destra, tutti i rami crescono verso sinistra |
| **In alto** | radice in alto, l'albero cresce verso il basso |
| **In basso** | radice in basso, l'albero cresce verso l'alto |

Il testo dei nodi resta orizzontale in ogni posizione: a ruotare è la disposizione, non l'etichetta. Nella posizione centrale i rami principali mantengono l'ordine del documento e vengono divisi in un unico punto: i primi rami vanno a destra, gli altri a sinistra, e il taglio cade dove i due lati risultano il più possibile uguali in altezza. Lo stesso documento dà così sempre la stessa immagine.

## Uso

- **Comprimere** — il cerchio all'estremità di un ramo chiude e riapre il sottoalbero. Con `Ctrl` il clic agisce sull'intero sottoalbero.
- **Zoom** — rotellina del mouse sulla superficie, centrata sul puntatore.
- **Spostare** — trascinare la superficie con il pulsante del mouse premuto. Entrando nella vista la mappa si adatta da sé all'inquadratura; rientrarvi la riporta dopo zoom e spostamenti liberi.
- **Note** — i nodi con testo corrente portano il simbolo di un foglio; un clic mostra il testo in un riquadro accanto al nodo. Un clic sulla superficie libera lo richiude.
- **Salto alla sorgente** — un clic sul testo del nodo passa alla vista divisa e porta il cursore sulla riga corrispondente.

Lo stato di compressione vale per la sessione in corso e non viene scritto né nel documento né in un file di accompagnamento: un semplice stato di visualizzazione non deve appesantire un formato che resta leggibile senza l'applicazione.

## Impostare la presentazione

La sezione Mappa mentale delle impostazioni è il **valore predefinito per tutti i documenti**:

- **Posizione della radice** — le cinque direzioni sopra.
- **Stile della linea** — collegamenti curvi o diritti.
- **Congela il colore del ramo dal livello** — fino a quale livello un ramo nuovo riceve un colore proprio; al di sotto l'intero sottoalbero eredita il colore del proprio ramo principale.
- **Profondità aperta all'inizio** — fino a quale profondità la mappa si apre; `-1` apre tutto.
- **Larghezza massima di un nodo** — la larghezza oltre la quale un titolo lungo va a capo.

## Valore per documento

Ogni documento può sostituire il valore predefinito per sé, nell'intestazione YAML sotto la chiave `mindmap`:

```yaml
---
mindmap:
  layout: mitte
  linienfuehrung: gerade
  anfangsTiefe: 2
---
```

L'indicazione vale solo per quel documento; tutti gli altri continuano a seguire l'impostazione. Per `layout` sono ammessi i valori `links`, `mitte`, `rechts`, `oben` e `unten`, per `linienfuehrung` i valori `geschwungen` e `gerade`; in più i numeri `farbEinfrierEbene`, `anfangsTiefe` e `hoechstBreite`. Ciò che non viene compreso ricade in silenzio sul valore predefinito, così il file resta leggibile. Le altre indicazioni dell'intestazione sono descritte nella pagina [Frontmatter e proprietà](frontmatter.md).

## Limiti

- La mappa è una **rappresentazione**, non un editor: al suo interno i nodi non si spostano né si rinominano. Le modifiche avvengono nel documento e la mappa le segue.
- Mostra **un** documento. Le relazioni tra file le mostra la [vista grafo](graph.md).
- I documenti molto grandi vengono troncati a 3000 nodi; una nota sotto la mappa indica quanti nodi sono rappresentati.
- Un documento senza titoli ed elenchi non offre struttura per una mappa e mostra una nota al suo posto.
