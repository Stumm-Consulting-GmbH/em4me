# Placement des commandes

Chaque action de l'application est une commande du registre central. Le placement des commandes en fait des accès personnalisés durables : des boutons de commande dans la barre d'état, une liste de masquage pour les boutons par défaut, des entrées personnalisées dans le menu contextuel de l'éditeur et des macros comme séquences de commandes. Tout se gère dans une section commune : « Fichier → Paramètres… → Placement des commandes ». Les quatre fonctions appartiennent à l'extension désactivable « Placement des commandes » (catégorie Outils).

## Boutons de la barre d'état

Les boutons de commande personnalisés apparaissent comme un segment distinct dans la barre d'état, à droite des boutons de vue. La création se fait en trois étapes : choisir une commande par recherche filtrée, définir une icône du jeu interne sélectionné, attribuer éventuellement un nom d'affichage. L'info-bulle du bouton montre le nom d'affichage suivi de la commande d'origine entre parenthèses ; sans nom d'affichage, elle montre la commande elle-même. Dans la liste de la section de paramètres, les boutons peuvent être réordonnés (monter/descendre), modifiés et supprimés.

Si la place manque dans la barre d'état — par exemple avec des fenêtres étroites —, les boutons excédentaires passent, à partir de la droite, dans un menu supplémentaire : un bouton à points à la fin du segment ouvre les entrées rangées sous forme de menu, depuis lequel elles restent exécutables.

Les boutons dont la commande appartient à une extension désactivée n'apparaissent pas (la configuration est conservée et revient avec l'extension).

## Masquer les boutons par défaut

Chaque élément par défaut de la barre d'état peut être masqué individuellement : les commutateurs de panneaux, les trois bascules de l'éditeur (pliage, numéros de ligne, retour à la ligne), les quatre boutons de vue et les éléments du côté droit (statistiques de mots, affichage du zoom, modifier, synchronisation du défilement, historique du document, thème, langue). Seule la ligne d'indication reste toujours visible — elle est le seul canal pour les messages courts comme l'état d'enregistrement.

Masquer ne retire que l'accès, la fonction demeure : tout ce qui est masqué reste accessible via le menu, la palette de commandes et les raccourcis clavier. Le bouton « Tout afficher » rétablit la barre d'état par défaut.

## Menu contextuel de l'éditeur

Les entrées de commande personnalisées apparaissent comme une section supplémentaire à la fin du menu contextuel de l'éditeur, en mode source comme en mode live. Elles se gèrent dans une seconde liste de la section de paramètres — même flux de création et même modèle d'entrée que les boutons de la barre d'état, mais avec un ordre propre. Chaque entrée montre son icône et son nom d'affichage.

Les entrées dont la commande n'est pas exécutable dans le contexte actuel (par exemple une commande d'espace sans espace ouvert) apparaissent désactivées au lieu de disparaître — en cohérence avec le reste du menu. Sans entrées configurées, la section disparaît complètement. La section appartient à l'éditeur principal ; le menu contextuel du champ de note reste inchangé.

## Macros

Une macro regroupe une suite ordonnée d'étapes sous son propre nom et sa propre icône. Deux types d'étapes sont disponibles : « Exécuter une commande » (une commande du registre, y compris une autre macro) et « Délai » (zéro à dix secondes, par exemple pour laisser à une vue le temps de se construire). Les étapes s'exécutent strictement l'une après l'autre ; chaque étape attend la précédente.

Si une étape échoue ou si sa commande n'est pas exécutable dans le contexte actuel, la séquence s'interrompt et la barre d'état affiche un message avec le nom de la macro et le numéro de l'étape. Quand une macro appelle une autre macro, la chaîne d'appels est limitée ; une imbrication trop profonde (y compris une macro qui s'appelle elle-même) s'interrompt avec un message propre. Les macros ne démarrent jamais automatiquement, uniquement via leurs accès.

L'astuce décisive : chaque macro est elle-même enregistrée comme commande régulière. Elle est ainsi trouvable dans la palette de commandes, associable à un raccourci propre dans la section de paramètres « Raccourcis clavier » et plaçable via les boutons de la barre d'état et les entrées de menu contextuel — sans traitement particulier.

L'éditeur d'étapes se trouve dans la même section de paramètres : par macro, une liste d'étapes dépliable avec réordonnancement et suppression, plus un bouton d'exécution de test. L'exécution de test lance immédiatement l'état d'édition actuel — dans le contexte de l'onglet des paramètres, de sorte que les étapes liées au contexte s'y interrompent, comme attendu, avec le message.

## Délimitation par rapport à la palette de commandes

La [palette de commandes](tools.md) et le placement des commandes travaillent sur le même registre de commandes mais servent des situations différentes : la palette est l'accès clavier éphémère — ouvrir, taper, exécuter, sans rien configurer. Le placement crée des accès durables pour les gestes récurrents : un clic dans la barre d'état, un clic droit dans l'éditeur, un raccourci sur une macro.

## État désactivé

Si l'extension « Placement des commandes » est désactivée, la barre d'état retrouve son état par défaut : pas de boutons personnalisés, pas de masquages, pas de section de menu contextuel ; les commandes de macro sont désenregistrées et la section de paramètres est masquée. Toute la configuration reste enregistrée et s'applique inchangée après la réactivation.
