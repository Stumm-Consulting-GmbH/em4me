# Vue carte mentale

La vue carte mentale montre la structure d'**un** document sous forme de carte : les titres et les puces deviennent les nœuds d'un arbre, et le texte courant qui les suit devient la note de son nœud. C'est une vue du même document, pas un second document, et elle ne modifie jamais le texte.

La vue appartient à l'extension **Vue carte mentale** et peut être désactivée sous Paramètres → Extensions. Une fois désactivée, l'entrée de menu disparaît, et un onglet ouvert en dernier comme carte revient à la vue de lecture.

## Ouvrir

La carte mentale est le cinquième mode d'affichage d'un onglet, à côté de Source, Divisé, Rendu et Direct : Affichage → Carte mentale ou `Ctrl+5` par défaut. Le mode vaut par onglet : un document peut donc rester ouvert comme carte pendant qu'un second est modifié en source à côté. La carte suit le document : ajoutez un titre dans la source et il apparaît peu après dans la carte.

## Ce qui devient un nœud

| Dans le document | Dans la carte |
| ---------------- | ------------- |
| titres | les niveaux supérieurs de l'arbre |
| puces | poursuivent la hiérarchie sous leur nœud |
| paragraphes, tableaux, blocs de code, images | note de leur nœud parent |

La racine est le titre de premier niveau si le document n'en porte qu'un seul ; sinon c'est le nom du fichier qui porte la racine, et tous les titres de premier niveau en deviennent les enfants. Un niveau sauté ne crée pas de nœud vide : un nœud se rattache à l'ancêtre existant le plus proche.

## Position de la racine

Le sens de croissance se choisit, car il dépend du document et de l'écran : un arbre profond se lit mieux de gauche à droite, un arbre plat et large de haut en bas, et la position centrale exploite le mieux un écran large.

| Position | Image |
| -------- | ----- |
| **À gauche** | racine à gauche, toutes les branches poussent vers la droite |
| **Au centre** | racine au milieu, les branches se répartissent des deux côtés |
| **À droite** | racine à droite, toutes les branches poussent vers la gauche |
| **En haut** | racine en haut, l'arbre pousse vers le bas |
| **En bas** | racine en bas, l'arbre pousse vers le haut |

Le texte des nœuds reste horizontal dans toutes les positions : c'est la disposition qui pivote, pas l'étiquette. En position centrale, les branches principales gardent l'ordre du document et sont partagées en un seul point : les premières branches vont à droite, les autres à gauche, et la coupure tombe là où les deux côtés atteignent des hauteurs aussi proches que possible. Le même document donne donc toujours la même image.

## Manipulation

- **Replier** — le cercle au bout d'une branche replie et redéploie la sous-arborescence. Avec `Ctrl`, le clic agit sur toute la sous-arborescence.
- **Zoom** — molette de la souris sur la surface, centrée sur le pointeur.
- **Déplacer** — faire glisser la surface avec le bouton de la souris enfoncé. En entrant dans la vue, la carte s'ajuste d'elle-même au cadre ; y revenir la ramène après un zoom ou un déplacement libre.
- **Notes** — les nœuds accompagnés de texte courant portent un symbole de feuillet ; un clic dessus affiche le texte dans un encadré près du nœud. Un clic sur la surface libre le referme.
- **Aller à la source** — un clic sur le texte du nœud bascule dans la vue divisée et place le curseur sur la ligne correspondante.

L'état de repli vaut pour la session en cours et n'est écrit ni dans le document ni dans un fichier compagnon : un simple état d'affichage ne doit pas alourdir un format qui reste lisible sans l'application.

## Régler l'affichage

La section Carte mentale des paramètres est la **valeur par défaut pour tous les documents** :

- **Position de la racine** — les cinq directions ci-dessus.
- **Style de trait** — liaisons courbes ou droites.
- **Figer la couleur de branche à partir du niveau** — jusqu'à quel niveau une nouvelle branche reçoit sa propre couleur ; en dessous, toute la sous-arborescence hérite de la couleur de sa branche principale.
- **Profondeur dépliée au départ** — jusqu'à quelle profondeur la carte s'ouvre ; `-1` déplie tout.
- **Largeur maximale d'un nœud** — la largeur à partir de laquelle un titre long passe à la ligne.

## Valeur par document

Chaque document peut remplacer la valeur par défaut pour lui-même, dans l'en-tête YAML sous la clé `mindmap` :

```yaml
---
mindmap:
  layout: mitte
  linienfuehrung: gerade
  anfangsTiefe: 2
---
```

L'indication ne vaut que pour ce document ; tous les autres continuent de suivre le paramètre. Les valeurs admises sont `links`, `mitte`, `rechts`, `oben` et `unten` pour `layout`, `geschwungen` et `gerade` pour `linienfuehrung` ; s'y ajoutent les nombres `farbEinfrierEbene`, `anfangsTiefe` et `hoechstBreite`. Ce qui n'est pas compris revient silencieusement à la valeur par défaut, afin que le fichier reste lisible. Les autres indications d'en-tête sont décrites sur la page [Frontmatter et propriétés](frontmatter.md).

## Limites

- La carte est une **représentation**, pas un éditeur : on n'y déplace ni n'y renomme les nœuds. Les modifications se font dans le document, la carte suit.
- Elle montre **un** document. Les relations entre fichiers sont montrées par la [vue graphe](graph.md).
- Les documents très volumineux sont tronqués à 3000 nœuds ; une note sous la carte indique le nombre de nœuds affichés.
- Un document sans titres ni listes n'offre aucune structure pour une carte et affiche une note à la place.
