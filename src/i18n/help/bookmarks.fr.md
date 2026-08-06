# Signets

Les signets gardent à portée de main les fichiers souvent utilisés, quel que soit le dossier ouvert. Ils vivent dans un panneau latéral dédié, sous forme d'arborescence de dossiers et d'entrées de fichiers. Il en existe deux sortes : les **signets généraux**, valables dans toute l'application, et les **signets de zone**, qui appartiennent à une [zone](apps-windows.md) et voyagent avec elle.

## Le panneau des signets

Le panneau des signets se bascule comme tout panneau latéral : via l'étoile de la barre d'état, le menu Affichage → Barre latérale → Panneaux → Favoris (défaut `Ctrl+Maj+L`) ou un raccourci que vous attribuez vous-même. La bascule agit sur la colonne active ; côté, ordre et groupes d'onglets suivent les règles de la [barre latérale](sidebar.md). L'étoile de la barre d'état indique en outre si le fichier actif est déjà en signet.

Un clic sur une entrée ouvre le fichier. Si un fichier en signet manque à l'emplacement attendu, l'entrée le signale au lieu de ne mener nulle part. Même à l'état vide de l'application, sans document ouvert, la liste reste utilisable, de sorte que les fichiers en signet peuvent être ouverts directement.

## Deux sections : générale et liée à la zone

Lorsqu'une zone est ouverte, le panneau se divise en deux sections avec leurs propres en-têtes : **Signets de la zone** et **Signets**. Sans zone ouverte, le panneau n'affiche que les signets généraux, sans en-têtes de section, c'est-à-dire dans la présentation habituelle à une seule section.

- Les **signets généraux** vivent dans les réglages globaux de l'application et enregistrent des chemins absolus. Ils sont toujours disponibles.
- Les **signets de zone** appartiennent à la zone ouverte et vivent dans son fichier de zone. Leurs cibles sont enregistrées relativement à la racine de la zone ; ils n'apparaissent que tant que la zone est ouverte et disparaissent du panneau à sa fermeture.

La section qui figure en haut est déterminée par l'option « Signets de zone en haut » (Paramètres → Comportement). Par défaut, les signets de zone sont en haut ; si l'option est désactivée, ce sont les généraux. Sans zone ouverte, le réglage n'a aucun effet visible.

## Pourquoi des chemins relatifs

Un signet de zone ne retient pas sa cible sous forme de chemin complet, mais relativement à la racine de la zone, avec des barres obliques. Ainsi, les signets restent valides lorsque tout le dossier de la zone est déplacé ou copié sur une autre machine : ils sont résolus à neuf contre la racine actuelle de la zone à chaque ouverture. Pour que cette relativité tienne, un signet de zone ne peut pointer que vers des fichiers situés à l'intérieur de la zone. Une cible en dehors de la zone n'est pas possible ; l'application la refuse.

## Créer des signets

### Signets généraux

Le fichier actif est mis en signet via Fichier → Autres fonctions de fichier → Ajouter le fichier actif aux favoris (défaut `Ctrl+D`) ou l'étoile. Si aucune zone n'est ouverte, ou si le fichier est en dehors de la zone ouverte, un signet général est créé sans question.

En revanche, si une zone est ouverte et que le fichier actif s'y trouve, `Ctrl+D` ouvre un petit menu de choix près de l'étoile, avec les cibles « Signet général » et « Signet de zone ». Ainsi, à chaque création, la section de destination est claire.

### Signets de zone directement

Deux menus contextuels créent un signet de zone sans passer par le choix de la cible :

- La **ligne de fichier du panneau de zone** propose « Ajouter comme signet de zone » au clic droit ; les fichiers y sont de toute façon dans la zone.
- Le **menu contextuel d'un onglet de fichier** propose « Ajouter comme signet général » et, lorsqu'une zone est ouverte avec le fichier à l'intérieur, en plus « Ajouter comme signet de zone ».

## Convertir entre les sections

Un signet existant peut passer dans l'autre sorte via son menu contextuel : « Convertir en signet de zone » ou « Convertir en signet général ». Cela vaut aussi pour un dossier entier avec son sous-arbre, alors repris avec sa structure et son ordre.

Lors d'une conversion en signet de zone, l'application vérifie que toutes les cibles concernées sont à l'intérieur de la zone. Si ce n'est pas le cas, toute l'opération est refusée et signale que la conversion contient des cibles en dehors de la zone. La règle des chemins relatifs reste ainsi préservée.

## Organiser et entretenir

Les deux sections partagent les mêmes outils. Le menu du clic droit d'une entrée crée de nouveaux dossiers et sous-dossiers ; les entrées peuvent être renommées, déplacées dans un dossier et supprimées. Les dossiers contiennent à nouveau des dossiers, de sorte que la collection peut être structurée librement.

Le glisser-déposer trie à l'intérieur d'une section et range les entrées dans des dossiers. Le glissement reste volontairement dans sa propre section : une entrée n'est pas glissée par-dessus la frontière entre signets de zone et signets généraux. Pour changer de section, on utilise la conversion.

Lorsqu'un fichier en signet est renommé dans l'application, ou que son dossier est renommé, les signets suivent automatiquement, dans les deux sections : le modèle général via les chemins absolus, l'arbre de zone via les chemins relatifs.

## Sans zone ouverte

Sans zone ouverte, seule la section générale est visible, sans en-tête et sans section de zone. Les signets de zone ne sont alors pas perdus mais attendent dans le fichier de zone ; dès que la zone est rouverte, ils réapparaissent dans le panneau.
