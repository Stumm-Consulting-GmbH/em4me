# Barre latérale

La barre latérale regroupe les panneaux de l'app — des signets, de la table des matières et de la zone, en passant par les propriétés, les tags et les rétroliens, jusqu'au calendrier, aux rappels et au graphe du fichier (la liste complète figure dans le [tableau des fonctions](functions.md)). Chaque colonne dispose d'une zone de barre latérale à gauche et à droite du contenu. La visibilité des panneaux se règle par colonne ; la disposition des panneaux (côté, ordre, groupes) vaut pour toute l'application.

## Afficher et masquer les panneaux

Chaque panneau possède une icône dans la barre d'état et une entrée dans le sous-menu Affichage → Panneaux (raccourcis par défaut dans l'[aperçu des raccourcis](shortcuts.md)) ; le commutateur agit sur la colonne active. Les deux emplacements présentent les mêmes panneaux dans le même ordre ; l'ordre se réorganise librement sous Paramètres → Ordre des panneaux et agit à la fois sur le menu et la barre d'état. Le contenu des différents panneaux est décrit dans le [tableau des fonctions](functions.md) ainsi que sur les pages [Mise en relation](linking.md) (tags, rétroliens, liens sortants), [Frontmatter et propriétés](frontmatter.md), [Notes du document](notes.md) (panneau Notes) et [Applications, fenêtres et zones](apps-windows.md) (panneau de zone).

## Réduire et développer les colonnes

Au-delà des commutateurs de panneaux individuels, une colonne entière de la barre latérale peut être réduite et développée d'un coup lorsqu'il faut brièvement un peu plus de place pour le texte. La réduction pose un état distinct sur la visibilité des panneaux sans la modifier ; le développement rétablit exactement l'état précédent.

- **Icône d'en-tête :** Dans l'en-tête supérieur de chaque colonne, au bord intérieur, là où la colonne rejoint le texte, se trouve une icône de barre latérale. Un clic réduit la colonne. L'icône est alignée à droite dans la colonne de gauche et, en miroir, alignée à gauche dans la colonne de droite ; elle apparaît aussi bien dans l'en-tête de section que dans la barre d'onglets d'un groupe, et dans le rendu en texte comme en symbole des titres.
- **Réduite :** Une colonne réduite reste visible sous forme d'une fine bande au bord de la fenêtre. Le survol de la souris y fait apparaître l'icône ; un clic développe de nouveau la colonne. L'infobulle passe alors de réduire à développer.
- **Menu et commandes :** Affichage → Réduire la barre latérale gauche et Affichage → Réduire la barre latérale droite basculent les mêmes états. Les deux commandes figurent aussi dans la palette de commandes et peuvent recevoir un raccourci sous Paramètres → Raccourcis clavier ; il n'y a pas d'affectation par défaut.

En vue partagée, chaque colonne d'éditeur bascule ses deux barres latérales de façon autonome ; la réduction n'agit que sur cette colonne. Le dernier état défini est enregistré globalement et vaut encore au démarrage suivant.

Une colonne sans panneau visible reste inchangée et disparaît entièrement comme auparavant, sans bande ni icône. Le mode focus masque en outre la barre latérale de manière purement visuelle et laisse l'état de réduction intact ; en le quittant, cet état vaut toujours.

## Disposition : côté et ordre

Chaque panneau peut se placer à gauche ou à droite, l'ordre est librement choisi. Deux chemins mènent à la disposition souhaitée :

- **Glisser-déposer :** faire glisser le titre du panneau (pour les groupes, l'onglet). Le tiers supérieur ou inférieur d'un panneau le classe avant ou après, le milieu forme un groupe d'onglets, la zone libre d'une barre latérale y ajoute le panneau — sur un côté vide, une fine bande de dépôt apparaît pendant le glissement. Les zones cibles sont marquées en couleur ; Échap annule. Les modifications agissent immédiatement, y compris dans les autres fenêtres.
- **Paramètres → Barre latérale :** les deux côtés sous forme de listes avec des actions pour déplacer (vers le haut, vers le bas, changer de côté), grouper et dissocier, plus une réinitialisation à la disposition par défaut. Les modifications agissent avec Appliquer ou OK.

La **disposition par défaut** répartit les panneaux sur les deux côtés et les regroupe en groupes d'onglets thématiques : à gauche les panneaux d'entrée, de structure et d'agenda, à droite les notes ainsi que les panneaux de métadonnées et de liens. Elle s'applique tant qu'aucune disposition personnalisée n'est définie ; « Réinitialiser la disposition par défaut » rétablit exactement cette répartition.

## Variantes

La disposition actuelle peut être enregistrée comme **variante nommée** — avec la visibilité des panneaux des deux colonnes, c'est-à-dire toute la structure de la barre latérale. Un nombre illimité de variantes est possible, par exemple une pour le travail de conception et une pour le travail quotidien.

- **Enregistrer :** Affichage → Dispositions de la barre latérale → « Enregistrer la disposition actuelle… », ou le bouton du même nom sous Paramètres → Barre latérale, section Variantes. Le nom est saisi dans la boîte de dialogue ; enregistrer sous un nom existant met à jour cette variante.
- **Appliquer :** par un clic dans le sous-menu Affichage → Dispositions de la barre latérale, via la fenêtre de sélection de la commande « Appliquer une variante de barre latérale », ou dans les listes des variantes des paramètres. Appliquer remplace immédiatement la disposition actuelle ; les réaménagements ultérieurs ne modifient pas la variante — « Remplacer » reprend explicitement la disposition actuelle dans une variante existante.
- **Gérer :** Paramètres → Barre latérale, section Variantes répertorie les variantes globales avec Appliquer, Renommer, Remplacer et Supprimer.

Les **variantes de zone** appartiennent à une zone : elles se trouvent dans le fichier de zone, se déplacent avec le dossier de la zone et n'apparaissent que lorsque la zone est ouverte, séparées dans le menu dans un groupe propre portant le nom de la zone. Leur gestion, avec un bouton d'enregistrement dédié, se trouve dans la section de paramètres « Variantes de barre latérale » du groupe « Zone actuelle » ; lors de l'enregistrement via le menu ou la commande, une option de la boîte de dialogue choisit la cible (globale ou zone). Des noms identiques dans les deux groupes sont autorisés. L'entrée « Disposition par défaut » du sous-menu rétablit à tout moment la répartition fournie.

Les variantes sont indépendantes des espaces de travail : un espace de travail mémorise les fenêtres et les onglets, une variante de barre latérale uniquement la structure de la barre latérale.

## Groupes d'onglets

Plusieurs panneaux à la même position se partagent la place sous forme de groupe d'onglets : une barre d'onglets remplace les titres des panneaux, seul le panneau actif est visible. Afficher un panneau groupé active son onglet ; l'onglet actif est mémorisé.

## Largeurs

Chaque côté a sa propre largeur (180 à 500 pixels), réglable au séparateur entre la barre latérale et le contenu. La largeur vaut par côté pour les deux colonnes et reste enregistrée.

## Hauteurs des panneaux

Lorsque plusieurs panneaux sont empilés d'un côté de la barre latérale, une poignée de glissement se trouve entre chaque paire de panneaux. Elle règle la hauteur du panneau situé au-dessus : glisser la poignée vers le haut ou vers le bas avec la souris. Les hauteurs définies restent enregistrées et sont rétablies au démarrage ; un double-clic sur la poignée rétablit la hauteur automatique.

Le panneau du bas n'a pas de poignée, car aucun autre ne le suit. Il suit donc toujours la hauteur de son contenu et occupe la place que les panneaux au-dessus lui laissent. Une barre de défilement n'y apparaît que si cette place ne suffit pas au contenu.

Si les hauteurs définies exigent ensemble plus de place que le côté n'en offre, toute la colonne devient défilable verticalement. Aucun panneau ne disparaît pour autant : chacun conserve au moins son en-tête, et ceux du bas restent accessibles par défilement. Pour retrouver l'état précédent, réduire le panneau agrandi à l'excès ou lui rendre la hauteur automatique par un double-clic sur sa poignée.

## Hauteur par panneau ou par groupe

Ce dont dépend la hauteur d'un bloc est réglable (Réglages → Barre latérale).

Avec **Hauteur par panneau**, chaque panneau conserve sa propre hauteur. Dans un groupe d'onglets, c'est la hauteur du panneau affiché qui s'applique ; parcourir le groupe modifie donc la hauteur du bloc, et les panneaux situés en dessous se déplacent avec lui. C'est le réglage par défaut.

Avec **Hauteur fixe par groupe**, un groupe d'onglets conserve sa hauteur au fil des changements d'onglet. Tous les panneaux du groupe apparaissent à la même hauteur et ce qui se trouve en dessous reste en place. La poignée sous le groupe règle alors leur hauteur commune ; un double-clic rétablit la hauteur automatique de tout le groupe.

Les panneaux isolés se comportent de la même façon dans les deux cas. Les hauteurs des deux réglages sont mémorisées séparément : en revenant en arrière, on retrouve ses anciennes hauteurs de panneaux inchangées.

## Titres en symbole

Les titres des panneaux peuvent passer du texte au symbole du panneau concerné (Réglages → Barre latérale). Le changement vaut aussi bien pour les en-têtes de section que pour les onglets des panneaux groupés ; le nom du panneau reste disponible en infobulle et pour les lecteurs d'écran. Comme la disposition, le commutateur prend effet avec Appliquer ou OK.
