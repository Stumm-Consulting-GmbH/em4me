# Vue graphe

La vue graphe rend visibles les relations de liens des fichiers Markdown : chaque fichier est un nœud, chaque lien une arête orientée. Il existe deux formes avec la même interaction : le **graphe de l'espace** dans son propre onglet pour l'espace entier, et le **graphe du fichier** dans un panneau latéral pour le voisinage du fichier actif.

Les deux formes appartiennent à l'extension **Vue graphe** et peuvent être désactivées ensemble sous Paramètres → Extensions.

## Graphe de l'espace (onglet)

Le graphe de l'espace montre tous les fichiers Markdown de l'espace ouvert avec leurs liens sur la grande surface d'un onglet dédié. Il s'ouvre via le menu Affichage → Graphe de l'espace ou via le menu contextuel du panneau de l'espace ; il existe un onglet graphe par fenêtre, une nouvelle ouverture active l'onglet existant. L'onglet est une vue en lecture seule sans mode d'édition ; son titre porte le nom de l'espace. Sans espace ouvert, l'entrée n'est pas disponible.

La barre d'outils en tête de l'onglet propose :

- **Direction** — « Les deux directions » montre le graphe complet. « Entrants » ou « Sortants » limitent l'affichage aux fichiers accessibles depuis le fichier actif via des liens de la direction choisie (à n'importe quelle profondeur). Si aucun fichier n'est actif, le graphe montre toutes les arêtes et l'indique.
- **Compteur de fichiers** — le nombre de nœuds actuellement affichés.
- **Réorganiser** — recalcule la disposition et abandonne les positions déplacées à la main.

## Graphe du fichier (panneau)

Le panneau « Graphe du fichier » montre le voisinage de liens du fichier actif et suit automatiquement le changement d'onglet. Il se bascule via le menu Affichage → Panneaux → Graphe du fichier, l'icône du graphe dans la barre d'état ou un raccourci clavier personnalisé ; côté, ordre et groupes d'onglets suivent les règles de la [barre latérale](sidebar.md).

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
- Pour les très grands espaces (plus de 1500 fichiers), le graphe montre les nœuds les plus connectés et signale ceux qui sont masqués.
- Le graphe de l'espace nécessite un espace ouvert ; le panneau du fichier fonctionne aussi sans espace, alors avec un espace de recherche limité.
