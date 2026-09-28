# Extensions

De nombreuses fonctions de l'application sont des extensions intégrées et peuvent être activées ou désactivées individuellement. Le cœur — éditeur, onglets et fenêtres, gestion des fichiers, modes d'affichage, cadre de la barre latérale, réglages, manuel, thème, langues et le rendu de base CommonMark — n'est volontairement pas désactivable ; l'application reste ainsi toujours fonctionnelle.

## Activer et désactiver

La section Extensions des réglages (Fichier → Paramètres → Extensions) liste toutes les extensions intégrées en trois catégories :

- **Rendu** — constructions Markdown comme les callouts, les notes de bas de page, le surlignage, la typographie, les tableaux Perspective, les formules KaTeX, les diagrammes Mermaid ou la coloration syntaxique.
- **Connexions** — liens wiki, intégrations wiki, tags et autocomplétion.
- **Outils** — linter Markdown, marque-pages, mode focus avec défilement machine à écrire, statistiques de mots et bouton de copie de code.

Chaque ligne affiche un nom et une courte description. Les modifications prennent effet avec Appliquer ou OK — immédiatement, sans redémarrage et dans toutes les fenêtres.

## Modes de travail

Au-dessus de la liste des interrupteurs se trouve la section Mode de travail. Un mode de travail règle en bloc les interrupteurs des extensions intégrées — une seule décision au lieu de beaucoup de décisions isolées. Trois modes fixes sont proposés, et ils sont imbriqués : ce que contient le plus petit, le plus grand le contient aussi.

- **Débutant** — écrire et relier. Sont inclus le répertoire Markdown courant (entre autres callouts, notes de bas de page, surlignage, typographie, emoji, images avec taille, tableaux Perspective et coloration syntaxique), les connexions par liens wiki, étiquettes et autocomplétion, ainsi que les outils de l'écriture quotidienne : listes de tâches, modèles, marque-pages, correction orthographique, barre de format, éditeur de tableaux, ligne de titre, sélecteur de date, statistiques de mots, mode focus et la zone de démonstration.
- **Avancé** — tout cela et, en plus, organiser et planifier : livres, journaux, profils de propriétés, rappels, événements, vue en graphe, carte mentale, plan, espaces de travail, groupes d'onglets, horloge, formules et diagrammes, ainsi que les constructions Markdown plus rares comme les conteneurs personnalisés, les listes de définitions, les abréviations, les spoilers, les commentaires, la numérotation des titres et les états de tâches étendus.
- **Complet** — toutes les extensions intégrées, donc en plus les surfaces canvas, la base de données, Perspective Datatable, le calcul en ligne, Critic Markup, les blocs de lignes, les attributs de titre, les systèmes de calendrier personnalisés, la langue d'interface personnelle, My Extended Memory, les boutons personnels de la barre d'état et l'échange de sa propre installation.

Comme toute autre modification de cette page, le choix prend effet avec Appliquer ou OK — ensuite immédiatement, sans redémarrage et dans toutes les fenêtres ouvertes.

**Un mode est un point de départ, pas un verrou.** Après le changement, chaque interrupteur reste réglable comme avant, et aucun mode ne retire quoi que ce soit qui ne puisse être réactivé. Sous les trois boutons est indiqué quel mode correspond à l'état actuel des interrupteurs ; s'il ne correspond à aucun parce que certains interrupteurs sont réglés autrement, il y est écrit **Personnalisé**. Le nom du mode décrit donc l'état au lieu de le figer — et dès que l'état correspond de nouveau exactement à un mode, celui-ci réapparaît comme actif.

La protection des dépendances s'applique sans changement : aucun mode ne crée un état que la désactivation d'une extension isolée interdirait.

### Le premier lancement

Une nouvelle installation démarre en mode Débutant. Le choix est proposé là où l'application se montre pour la première fois : la visite guidée, qui démarre d'elle-même au tout premier lancement, comporte pour cela une étape à part avec les trois modes. Débutant y est présélectionné, et un clic prend effet immédiatement — il n'est nécessaire ni de terminer la visite ni de recharger une fenêtre. Qui saute l'étape ou interrompt la visite reste en mode Débutant.

Une installation existante conserve l'état de ses interrupteurs : la visite n'y démarre pas au lancement, et l'étendue des fonctions ne change pas. Si la visite est relancée manuellement plus tard, l'étape affiche l'état réellement en vigueur et ne remet rien en place sans être sollicitée.

### Modes personnalisés

Sous les trois modes fixes, l'état actuel des interrupteurs peut être conservé sous un nom choisi : « Enregistrer l'état actuel comme mode… » demande le nom. Le nombre de modes personnalisés n'est pas limité.

Chaque mode personnalisé porte quatre gestes : un clic sur son nom l'**applique**, **Renommer** lui donne un autre nom, **Remplacer** lui attribue l'état actuel des interrupteurs, **Supprimer** l'enlève. Renommer et supprimer ne changent pas l'état en vigueur. Les trois modes fixes n'en sont pas affectés — ils ne peuvent être ni remplacés, ni renommés, ni supprimés.

Si un nom est déjà pris, une question revient au lieu d'un remplacement silencieux ; un nom vide est refusé. Un mode enregistré retient l'état de l'instant : modifier ensuite des interrupteurs isolés ne modifie pas le mode — c'est à cela que sert Remplacer.

**Un mode enregistré retient quelles extensions sont désactivées.** C'est pourquoi il survit aux ajouts et aux retraits : une extension qui n'existe plus est ignorée à l'application ; une extension ajoutée après l'enregistrement et absente du mode reste activée.

Les modes personnalisés valent dans toutes les zones et voyagent avec votre propre installation — voir [Exporter et importer les paramètres](setup-exchange.md).

## Effet de l'état désactivé

- **Extensions de rendu :** la syntaxe s'affiche en texte brut ou en Markdown standard. `==surligné==` reste par exemple du texte visible, et un bloc Mermaid devient un bloc de code ordinaire.
- **Panneaux et accès :** les panneaux latéraux, boutons de la barre d'état, entrées de menu et raccourcis associés disparaissent ; aucun élément mort ne subsiste.
- **Sections de réglages :** si une extension apporte sa propre section de réglages (par exemple les états de tâches), celle-ci n'apparaît dans la navigation que lorsque l'extension est active.

## Dépendances

Certaines extensions s'appuient sur d'autres : les incorporations wiki et les liens entre zones ont besoin des liens wiki, les rappels ont besoin des tâches, les événements et la base de données ont besoin des profils de propriétés. Tant qu'une telle extension dépendante est activée, sa base ne peut pas être désactivée : l'interrupteur de la base est verrouillé et, sous sa description, figure « Impossible à désactiver — requis par : » avec le nom des dépendantes ; plusieurs d'entre elles apparaissent ensemble dans une seule phrase. Un clic sur la ligne verrouillée affiche brièvement la même indication dans la barre d'état et ne change rien à l'interrupteur. Pour désactiver la base, désactivez d'abord ses dépendantes ; son interrupteur est ensuite libre.

Le verrouillage ne s'applique que là où l'extension dépendante ne peut plus fonctionner sans sa base. Lorsque la désactivation d'une extension ne fait qu'appauvrir une autre — un élément de commande disparaît, une suggestion ne vient pas, une vérification se tait, tandis que l'extension continue de fonctionner par ailleurs —, l'interrupteur reste libre.

Si une configuration importée d'ailleurs comporte une base désactivée alors qu'une extension dépendante est activée, cet état reste tel quel : la dépendante est sans effet et affiche l'indication « Désactivé par dépendance » ; elle conserve son propre état et redevient effective dès que la base est réactivée.

## Les données sont conservées

Désactiver ne supprime rien : l'arborescence des marque-pages, les définitions d'états de tâches, la visibilité des panneaux, les raccourcis personnalisés et tous les autres réglages restent enregistrés et reviennent à l'activation.

## Extensions externes

Outre les extensions internes, l'application charge aussi des paquets d'extension externes créés par vous-même. Ils se gèrent dans la section de paramètres Extensions (externes) : les paquets nouvellement détectés sont désactivés, l'activation exige une confirmation explicite dans la boîte d'avertissement (le code tiers obtient un accès complet aux documents et à l'application), et les paquets défectueux sont désactivés automatiquement. La création d'un paquet est décrite sur la page [Créer des extensions](extensions-dev.md).
