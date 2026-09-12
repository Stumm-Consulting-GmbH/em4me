# Surface Canvas

Un **canevas** est une surface de travail spatiale au sein d'un document Markdown ordinaire : des **cartes** portant leur propre texte y sont disposées librement, et des **connexions** tracent les relations entre elles. Lorsque des variantes sont posées côte à côte, qu'un déroulement est esquissé ou que des idées sont d'abord triées, l'ordre vient ici de la position et non de la séquence.

La surface est portée par un bloc de code avec la balise de langage `perspective-canvas`. Un document peut en contenir autant que voulu, et tout le reste y demeure du Markdown ordinaire.

La fonction fait partie des [extensions internes](extensions.md) (« Vue canevas »). Désactivée, le bloc reste un bloc de code ordinaire, le mode d'affichage disparaît et les commandes pour la surface et la carte s'en vont. Le document reste parfaitement lisible ; rien n'est perdu.

## Distinction avec la vue graphe

Les deux montrent des cadres et des lignes, et elles ne disent pas la même chose :

| Question | [Vue graphe](graph.md) | Canevas |
| -------- | ---------------------- | ------- |
| D'où viennent les nœuds ? | des fichiers de l'espace | créés par vous |
| D'où viennent les lignes ? | des liens existants | tracées par vous |
| D'où vient la disposition ? | l'application la **calcule** | vous la **décidez** |
| Quel est le résultat ? | une analyse de l'existant | une surface de travail au contenu propre |

En bref : la vue graphe **analyse** et calcule elle-même sa disposition ; le canevas **laisse disposer** et retient ce qui a été disposé. Une carte déplacée reste où elle a été posée, un nœud du graphe non.

Il en va de même face à la [vue carte mentale](mindmap.md) : celle-ci dérive son arbre des titres et des listes du document et ne modifie jamais le texte. Le canevas porte son contenu lui-même et le réécrit dans le document au fil des modifications.

## Créer une surface

La commande **« Canevas »** insère une surface vide au point d'insertion. Deux chemins y mènent : la palette de commandes (`Ctrl+K` par défaut) et le menu contextuel de l'éditeur → Insérer → Canevas. Aucun raccourci n'est préaffecté ; il peut être attribué dans les paramètres.

La commande exige un document modifiable ; à défaut, la barre d'état le dit au lieu de ne rien faire en silence. Ce qui est inséré est un bloc vide :

````markdown
```perspective-canvas
```
````

## Ouvrir la vue canevas

Le canevas est le sixième mode d'affichage, à côté de Source, Scindée, Rendu, Live et Carte mentale : **Affichage → Canevas**, le bouton de la barre d'état ou `Ctrl+6` par défaut. Comme pour les autres modes, le choix vaut par document ouvert et non pour toute l'application.

**C'est le seul des six modes qui dépende du document.** Il n'est sélectionnable que si le document contient une surface Canvas — une vue canevas sans surface ne montrerait qu'un message. Sans surface, le bouton et l'entrée de menu restent **visibles et atténués** ; la raison figure dans l'infobulle du bouton. Le chemin par le raccourci et la palette de commandes ne mène alors nulle part et ne vous éjecte pas non plus de votre vue actuelle. Dès qu'une surface apparaît dans le texte ou en disparaît, l'accès suit. Un document qui était ouvert en vue canevas à la fermeture et dont la surface a entre-temps disparu s'ouvre en vue de lecture.

## Plusieurs surfaces dans un document

Si un document porte plus d'une surface, une barre apparaît au-dessus de la surface avec un **onglet** par surface ; un clic change la surface affichée et l'ajuste. Avec exactement une surface, il n'y a pas de barre.

L'intitulé est dérivé et non déclaré : la première ligne utile de la première carte, sinon un décompte (« Canevas 2 »). Rien n'est stocké pour cela dans le document. La surface sélectionnée vaut par document ouvert, survit à la frappe et au changement de mode et n'est pas enregistrée — une simple action d'affichage ne doit pas modifier le document.

## Cartes

### Créer

- Un **double-clic** sur le fond libre crée une carte à l'endroit du clic et ouvre aussitôt sa saisie de texte.
- Un **clic droit** sur le fond → « Ajouter une carte au canevas » fait de même à l'endroit du clic.
- La commande **« Ajouter une carte au canevas »** (palette de commandes, menu Affichage, raccourci attribuable) la place au centre de la portion visible. Hors de la vue canevas, elle signale dans la barre d'état que les cartes ne naissent que là.

### Sélectionner, déplacer, redimensionner

- Un **clic** sélectionne une carte, un clic sur le fond annule la sélection. Un seul élément au plus est sélectionné — une carte ou une connexion.
- **Faire glisser** déplace la carte ; ses connexions suivent pendant le déplacement. Il n'y a pas de grille.
- La **poignée du coin inférieur droit** modifie la taille. Celle-ci est indépendante du contenu : si le texte ne tient pas, la carte défile — elle ne grandit jamais d'elle-même.

### Écrire le texte

Un **double-clic dans une carte** la bascule sur son texte brut. Il s'agit de Markdown ordinaire, rendu dans la carte — titres, mises en évidence, listes, tableaux, formules et diagrammes compris.

| Saisie | Effet |
| ------ | ----- |
| Clic hors de la carte | valide |
| `Ctrl+Entrée` | valide |
| `Échap` | abandonne |

Un texte inchangé n'écrit rien dans le document.

### Supprimer

`Suppr` supprime la carte sélectionnée, tout comme « Supprimer la carte » dans son menu contextuel. Les connexions dont une extrémité pointe sur elle disparaissent avec elle — en une étape qui se reprend d'un bloc.

## Connexions

### Créer

Une carte sélectionnée montre quatre **poignées de connexion**, une par côté. Un glissement d'une poignée vers une autre carte crée la connexion ; une ligne d'aperçu suit le pointeur. Pendant le glissement, la carte sous le pointeur montre quatre **zones cibles** le long de ses bords : relâcher sur une zone fixe le côté d'arrivée, relâcher sur le corps de la carte laisse ce côté à l'application. Un glissement dans le vide ou de retour sur la même carte ne crée rien.

### Modifier

Une connexion sélectionnée porte une petite **barre d'outils** au milieu de son tracé :

- **Changer le sens** — en cycle : flèche vers la cible (→), flèche aux deux extrémités (↔), sans pointe (—). Le signe sur le bouton montre l'état actuel.
- **Inverser le sens** — échange le début et la fin ainsi que leurs côtés de raccordement.
- **Couleur** — huit couleurs du jeu de couleurs, plus « Aucune couleur ».
- **Côté de départ** et **Côté d'arrivée** — automatique, gauche, droite, haut ou bas. « Automatique » choisit le côté d'après la position des deux cartes ; un côté choisi explicitement reste en place même lorsqu'une carte est déplacée.
- **Étiquette** — ouvre la même saisie de texte qu'un double-clic sur la connexion. Le texte se place ensuite le long de la ligne.

Les mêmes actions figurent dans le **menu contextuel** de la connexion (clic droit). `Suppr` supprime la connexion sélectionnée.

## Annuler

`Ctrl+Z` reprend la dernière action sur la surface, `Ctrl+Y` et `Ctrl+Maj+Z` la rétablissent. Chaque action est exactement une étape : une carte déplacée, une taille modifiée, une connexion créée, un texte changé. Tant que la saisie de texte d'une carte ou d'une connexion est ouverte, `Ctrl+Z` s'applique au texte frappé là.

## Naviguer

- **Déplacer** — faire glisser le fond libre avec le bouton de la souris enfoncé.
- **Zoom** — molette au-dessus de la surface, centrée sur le pointeur.
- **Ajuster** — à l'entrée dans la vue et au changement de surface, la portion s'ajuste d'elle-même au contenu.

## Consulter seulement

La surface suit la modifiabilité de son document. Tant que le document est en simple affichage, sans mode édition, la surface est **consultable seulement** : pas de poignées, pas de glissement, pas de création, pas de saisie, pas de barre d'outils, et le menu contextuel reste sans entrées. Déplacer la portion, zoomer et sélectionner un élément d'un clic restent permis, car cela ne touche pas au document.

Le mode édition libère la manipulation — crayon dans la barre d'état, `Ctrl+E` par défaut ; les détails figurent sur la page [Vues et affichage](views-display.md).

## La surface hors de la vue canevas

Comme la surface se trouve dans un document Markdown ordinaire, elle se rencontre dans toutes les vues de ce document :

| Vue | Ce qui apparaît |
| --- | --------------- |
| Source | le bloc en clair — cette vue **est** la source |
| Scindée | le texte en clair à gauche, le bloc de synthèse à droite |
| Rendu | **le bloc de synthèse** : nature, volume en cartes et connexions, un aperçu des textes de cartes et le bouton « Ouvrir la vue Canvas » |
| Live | le même bloc ; lorsque le point d'insertion touche le bloc, celui-ci se déplie en texte brut et devient modifiable |
| Carte mentale | une courte note avec nature et volume au lieu du texte brut |
| Canevas | la surface elle-même |

L'aperçu montre six cartes au plus ; en dessous figure le nombre de cartes restantes. Le bloc se **replie**, sa ligne d'en-tête restant en place ; cet état vaut pour la session en cours et n'est pas écrit dans le document. L'impression et l'export PDF suivent la vue rendue, sans imprimer les deux boutons du bloc.

## Le format de stockage

La surface se trouve en clair dans le document. Elle est donc interprétable sans cette application — et ce qui figure dans les cartes est lisible dans n'importe quel outil de texte.

### Structure

Dans le bloc, chaque élément commence par un **marqueur en colonne 0**. Ses attributs figurent sur la ligne du marqueur ; les lignes suivantes, jusqu'au marqueur suivant, sont son contenu.

Un attribut a la forme `nom=valeur`. Une valeur est soit un mot sans espace, soit une chaîne entre guillemets droits, dans laquelle `\"` représente un guillemet et `\\` une barre oblique inverse. Les identifiants se composent de lettres, de chiffres, du trait d'union et du tiret bas.

### Cartes

```text
!karte <identifiant> x=<nombre> y=<nombre> b=<nombre> h=<nombre>
```

| Attribut | Signification |
| -------- | ------------- |
| `x`, `y` | coin supérieur gauche de la carte |
| `b`, `h` | largeur et hauteur |

Les quatre sont des **nombres entiers** comptés en pixels au zoom 1. L'**origine se trouve au centre de la surface** : les valeurs négatives sont à sa gauche ou au-dessus. Les lignes sous le marqueur sont le texte de la carte.

### Connexions

```text
!linie <identifiant> <première extrémité> <flèche> <seconde extrémité> von=<côté> nach=<côté> farbe=<nom>
```

Les deux extrémités sont des identifiants de cartes, et la **flèche entre elles porte le sens** :

| Flèche | Signification |
| ------ | ------------- |
| `->` | orientée, pointe à la seconde extrémité |
| `<->` | pointe aux deux extrémités |
| `--` | sans pointe |

`von=` nomme le côté de raccordement à la première extrémité, `nach=` celui de la seconde ; sont admis `links` (gauche), `rechts` (droite), `oben` (haut), `unten` (bas) et `auto`. `farbe=` colore la ligne ; sont admis `blau`, `rot`, `grün`, `gelb`, `lila`, `orange`, `türkis` et `pink` — bleu, rouge, vert, jaune, violet, orange, turquoise et rose. Sans cet attribut, la ligne est tracée dans la couleur par défaut du jeu de couleurs. Les lignes sous le marqueur sont l'**étiquette**.

L'**ordre dans le bloc est aussi l'ordre d'empilement** : ce qui figure plus bas se trouve plus en avant.

### Deux règles qui protègent le fichier

- **L'échappement du point d'exclamation.** Une ligne de contenu qui commence par `!` reçoit une barre oblique inverse devant elle à l'écriture et la perd à la lecture : le document contient `\!Attention`, la carte affiche `!Attention`. Si la ligne doit se lire littéralement `\!Attention`, le document contient `\\!Attention`.
- **L'inconnu est conservé.** Un marqueur ou un attribut que l'application ne connaît pas est transporté et réécrit tel quel ; un élément non modifié est ressorti mot pour mot. Ouvrir une surface et l'enregistrer sans changement rend le même fichier. Un attribut erroné ne jette rien non plus : l'élément est alors dessiné de manière visible ou pas du tout, mais il ne disparaît jamais du fichier.

### Un exemple

````markdown
```perspective-canvas
!karte k1 x=-320 y=-140 b=260 h=120
## Point de départ

L'import ne lit aujourd'hui qu'une seule source.

!karte k2 x=40 y=-140 b=260 h=120
## Cible

Plusieurs sources, une fusion.

!karte k3 x=-140 y=120 b=260 h=160
## Question ouverte

Comment les conflits sont-ils tranchés ?

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
donne

!linie e2 k3 -- k1
croquis associé

!linie e3 k2 <-> k3 von=unten nach=oben
se conditionnent
```
````

Au rendu, le bloc de synthèse apparaît ici, et le bouton qu'il contient mène à la surface :

```perspective-canvas
!karte k1 x=-320 y=-140 b=260 h=120
## Point de départ

L'import ne lit aujourd'hui qu'une seule source.

!karte k2 x=40 y=-140 b=260 h=120
## Cible

Plusieurs sources, une fusion.

!karte k3 x=-140 y=120 b=260 h=160
## Question ouverte

Comment les conflits sont-ils tranchés ?

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
donne

!linie e2 k3 -- k1
croquis associé

!linie e3 k2 <-> k3 von=unten nach=oben
se conditionnent
```

## Limites

- Une carte porte **son propre texte** ; il n'existe pas d'autre type de carte. Les formes géométriques et les cadres de groupe ne font pas partie de la surface.
- Un lien dans le texte d'une carte n'apparaît **pas** dans le graphe des liens ni dans les rétroliens : l'index de l'espace ignore le contenu des blocs de code.
- La surface se manipule à la souris ; le clavier porte l'annulation, la suppression et les saisies de texte.
- Une surface appartient à son document. Les cartes ne peuvent pas être glissées d'une surface à une autre.
