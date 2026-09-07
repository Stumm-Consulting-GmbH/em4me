# Vue graphe

La vue graphe rend visibles les relations de liens des fichiers Markdown : chaque fichier est un nœud, chaque lien une arête orientée. Il existe deux points d'entrée avec la même interaction : le **graphe de l'espace** dans son propre onglet pour l'espace entier, et le **graphe du fichier** dans un panneau latéral pour le voisinage du fichier actif. Le graphe de l'espace présente ses données au choix sous forme de **réseau** ou d'**arbre**.

Les deux formes appartiennent à l'extension **Vue graphe** et peuvent être désactivées ensemble sous Paramètres → Extensions.

## Graphe de l'espace (onglet)

Le graphe de l'espace montre tous les fichiers Markdown de l'espace ouvert avec leurs liens sur la grande surface d'un onglet dédié. Il s'ouvre via le menu Affichage → Graphe de l'espace ou via le menu contextuel du panneau de l'espace ; il existe un onglet graphe par fenêtre, une nouvelle ouverture active l'onglet existant. L'onglet est une vue en lecture seule sans mode d'édition ; son titre porte le nom de l'espace. Sans espace ouvert, l'entrée n'est pas disponible.

La barre d'outils en tête de l'onglet propose :

- **Affichage** — bascule entre **réseau** et **arbre**. Le choix vaut pour l'onglet ouvert ; à la prochaine ouverture il repart du réseau. La direction et « Réorganiser » ne valent que pour le réseau.
- **Direction** — « Les deux directions » montre le graphe complet. « Entrants » ou « Sortants » limitent l'affichage aux fichiers accessibles depuis le fichier actif via des liens de la direction choisie (à n'importe quelle profondeur). Si aucun fichier n'est actif, le graphe montre toutes les arêtes et l'indique.
- **Compteur de fichiers** — le nombre de nœuds actuellement affichés.
- **Réorganiser** — recalcule la disposition et abandonne les positions déplacées à la main.

### Arbre des liens

L'arbre répond à la question de l'**ordre** que le réseau laisse ouverte : ce qui pend sous un point d'entrée, et à quelle profondeur. Il montre les mêmes données — les mêmes fichiers, les mêmes liens, la même frontière de zone —, seulement orientées depuis une racine et dépliables.

**La racine** est d'abord la page de démarrage de la zone ; si aucune n'est définie, l'arbre s'enracine dans le fichier qui était actif à l'ouverture de la vue. Elle se change de deux façons : par l'affichage de la racine dans la barre d'outils, qui ouvre la même sélection par nom que « Ouvrir un fichier par son nom », ou par l'entrée « Comme racine de l'arbre des liens » dans le menu contextuel d'un fichier du panneau de zone. La racine choisie vaut pour l'onglet ouvert ; la page de démarrage n'en est pas affectée.

**Chaque fichier apparaît exactement une fois.** S'il est accessible par plusieurs chemins, il se place sur son chemin **le plus court** vers la racine ; à longueur égale, le parent alphabétiquement premier l'emporte. Un fichier que vous ne trouvez pas là où vous l'attendez se trouve donc plus haut. Les cycles n'entraînent aucune répétition.

**Le dépliage est progressif :** à l'ouverture, le premier niveau est visible, les niveaux plus profonds sur un clic sur le triangle ; « Tout déplier » et « Tout replier » agissent sur l'arbre entier. Le nombre après un nom indique ses enfants. Un clic sur le nom ouvre le fichier.

**Le pied de page** indique le nombre de fichiers qui ne sont **pas** accessibles depuis cette racine. Ce n'est pas une erreur mais une propriété de votre fonds : l'arbre montre ce qui pend sous la racine, pas la zone entière. S'il n'y a aucun fichier de ce type, la ligne disparaît.

## Graphe du fichier (panneau)

Le panneau « Graphe du fichier » montre le voisinage de liens du fichier actif et suit automatiquement le changement d'onglet. Il se bascule via le menu Affichage → Barre latérale → Panneaux → Graphe du fichier, l'icône du graphe dans la barre d'état ou un raccourci clavier personnalisé ; côté, ordre et groupes d'onglets suivent les règles de la [barre latérale](sidebar.md).

Deux réglages se trouvent dans l'en-tête du panneau :

- **Profondeur** (1 à 5) — combien d'étapes de liens autour du fichier actif sont incluses. La profondeur 1 ne montre que les voisins directs, des valeurs plus grandes étendent le voisinage pas à pas.
- **Direction** — « Sortants » ne suit que les liens sortant du fichier, « Entrants » seulement les liens pointant vers le fichier, « Les deux directions » combine les deux.

Les deux réglages s'appliquent par colonne pour la session en cours. Un fichier sans relation de lien apparaît comme un nœud isolé avec une indication. En dehors d'un espace, le panneau travaille avec l'espace de recherche limité autour du dossier du fichier et l'indique discrètement ; le graphe complet est fourni par l'espace.

## Interaction

- **Zoom** — molette de la souris au-dessus de la surface, centré sur le pointeur.
- **Déplacer** — faire glisser la surface avec le bouton de la souris enfoncé.
- **Déplacer des nœuds** — les nœuds individuels peuvent être repositionnés à la souris ; la position est conservée pendant la session, même quand le graphe s'actualise.
- **Mise en évidence** — au survol d'un nœud, le nœud lui-même, ses voisins directs et les arêtes concernées ressortent, le reste est atténué.
- **Ouvrir** — un clic sur un nœud ouvre le fichier (ou saute vers l'onglet déjà ouvert). Le fichier actif est mis en évidence par la couleur.
- **Noms en double** — si plusieurs fichiers portent le même nom, une infobulle sur le nœud montre le chemin complet.

## Sémantique des flèches

Les arêtes sont orientées : la flèche pointe du document liant vers le document lié. Si deux fichiers se référencent mutuellement, les deux liens fusionnent en **une** arête avec des pointes de flèche aux deux extrémités (double flèche). Le graphe inclut les liens wiki (résolution d'alias comprise) et les liens Markdown vers des fichiers de l'espace de recherche ; plusieurs liens entre les deux mêmes fichiers comptent comme une seule arête.

## Limites

- Les nœuds sont exclusivement des **fichiers Markdown** ; les tags, pièces jointes ou blocs individuels n'apparaissent pas dans le graphe.
- Pour les très grands espaces (plus de 1500 fichiers), **le réseau** montre les nœuds les plus connectés et signale ceux qui sont masqués. L'arbre ne connaît pas cette limite : il ne dessine que les branches dépliées et reste donc complet.
- Le graphe de l'espace nécessite un espace ouvert ; le panneau du fichier fonctionne aussi sans espace, alors avec un espace de recherche limité.
