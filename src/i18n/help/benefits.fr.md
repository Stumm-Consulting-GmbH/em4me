# Utilité et façons de travailler

Cette page ne répond pas à la question **comment** faire, mais à la question **à quoi cela sert**. Elle a deux moitiés : les cinq premières sections montrent quelles **façons de travailler** l'application ouvre, du document isolé à l'espace de travail nommé. La seconde moitié montre ce qu'un fichier Markdown peut **exprimer** au-delà du standard Markdown. Là où les choses deviennent concrètes, un lien à la fin de chaque section mène à la page qui traite le sujet en détail.

## Un document, tel que vous en avez besoin

Lire, écrire et vérifier sont des activités différentes, et elles demandent des présentations différentes du même texte. Plutôt que d'imposer un compromis, l'application tient cinq vues à disposition, entre lesquelles une touche suffit à basculer : la page finie pour la lecture, le texte source pour le travail précis, les deux côte à côte pour la comparaison, le mode direct pour écrire sans rupture et la carte mentale pour voir la structure. Le changement ne coûte rien et ne modifie jamais le fichier.

- **Rendu** pour lire, **code source** pour le travail précis sur la syntaxe.
- **Partagée** montre source et résultat côte à côte, pour les constructions délicates.
- **Direct** met en forme pendant la frappe et n'affiche les caractères Markdown que dans la ligne courante.
- **Carte mentale** transforme la structure des titres en arborescence.

En détail : [Vues et affichage](views-display.md), [Vue carte mentale](mindmap.md).

## Plusieurs documents côte à côte

Une réflexion tient rarement dans un seul fichier. C'est pourquoi plusieurs documents restent ouverts en même temps, dans des onglets que l'on peut organiser : des groupes colorés rassemblent ce qui va ensemble, la deuxième colonne place deux documents l'un à côté de l'autre, et la barre latérale garde sous les yeux la table des matières, les rétroliens, les notes ou les tâches pendant que vous écrivez. Tout cela relève de votre décision, pas de celle du programme : les panneaux passent du côté gauche au côté droit, et les largeurs comme les hauteurs restent telles que vous les avez réglées.

- **Onglets** pour autant de documents ouverts que nécessaire, avec sélection multiple et position au choix.
- **Groupes d'onglets** pour rassembler par couleur les documents liés.
- **Deux colonnes** dans la même fenêtre pour la source et la cible, le brouillon et le modèle, le chapitre et la note.
- **Panneaux latéraux** à gauche ou à droite, avec ordre, largeur et hauteur librement réglés.

En détail : [Applications, fenêtres et zones](apps-windows.md), [Barre latérale](sidebar.md).

## Plus d'une fenêtre, plus d'un contexte

Qui travaille sur plusieurs choses à la fois ne s'en sort pas avec une seule fenêtre. Un onglet passe dans une nouvelle fenêtre par le menu contextuel, et plusieurs fenêtres appartiennent à une application, le contexte de travail commun. On peut en lancer plusieurs : chaque application a ses propres fenêtres et sa propre numérotation, de sorte que deux projets ne se gênent jamais, même s'ils utilisent la même application. Au démarrage suivant, la restauration de session ramène l'ensemble.

- **Fenêtres** en nombre libre, les onglets circulent entre elles.
- **Applications** comme contextes de travail autonomes avec leurs propres fenêtres.
- **Restauration de session** pour retrouver applications, fenêtres et onglets.

En détail : [Applications, fenêtres et zones](apps-windows.md).

## De l'ordre par les limites, de l'ordre par la mémoire

Deux formes d'ordre différentes sont disponibles, et la distinction mérite d'être connue. Une **zone** lie une application à un dossier et en fait une limite : boîte d'ouverture, liste des documents récents, enregistrement et recherche y restent, si bien qu'un projet confidentiel ne déborde jamais par inadvertance sur un autre. Un **espace de travail**, en revanche, retient un état : toutes les fenêtres, tous les onglets, groupes et brouillons sous un nom, tenus à jour sans étape d'enregistrement. Ouvert des semaines plus tard, il vous replace exactement là où vous vous étiez arrêté. Les deux se combinent.

- **Zone** signifie limite de dossier : ce qui est en dehors n'entre pas.
- **Espace de travail** signifie état de travail enregistré, nommé et repéré par une couleur.
- **Les deux ensemble** donnent un état de travail nommé avec une limite de dossier fixe.

En détail : [Applications, fenêtres et zones](apps-windows.md).

## Des fichiers deviennent un livre

Un ouvrage long se compose de nombreux fichiers, et leur ordre réside sinon dans le nom de fichier ou dans l'emplacement du dossier, où chaque renommage le remet en cause. Un livre inverse cela et écrit sa structure de façon explicite : les chapitres restent des fichiers Markdown ordinaires, lisibles même sans l'application, mais leur ordre et leur imbrication sont fixés, la table des matières les montre, et le fil de lecture parcourt l'ouvrage entier par-delà les limites de chapitre. Les étagères regroupent plusieurs livres.

- **Ordre de lecture déclaré** au lieu d'un tri alphabétique par nom de fichier.
- **Les chapitres restent des fichiers**, lisibles isolément et réutilisables ailleurs.
- **Fil de lecture** continu, la table réorganise par glissement ou au clavier.
- **Étagères** pour regrouper plusieurs livres.

En détail : [Livres](books.md).

## Des tableaux qui portent plus qu'une ligne

Ici s'achève la question des façons de travailler et commence celle de ce que le fichier peut exprimer. Le standard Markdown n'a pas besoin d'explication ; ce qui compte, c'est ce qui va au-delà, et cela commence par le tableau. Un tableau standard est fondé sur la ligne et n'accueille donc qu'un texte court. La Perspective Table accueille des blocs entiers dans une cellule : listes imbriquées, plusieurs paragraphes, blocs de code, images, et même un tableau dans le tableau. Le tableau devient ainsi un outil de structuration pour de vrais contenus au lieu d'une collection de mots-clés.

- **Cellules de bloc** avec listes, paragraphes, code et images au lieu de champs d'une seule ligne.
- **Imbrication**, fusions de cellules et alignement pour les présentations exigeantes.
- **Tri et mise en évidence des statuts** directement dans le tableau rendu.
- **Lisible ailleurs aussi :** le bloc reste un bloc de code propre dans d'autres programmes Markdown au lieu de déchirer le texte.

En détail : [Perspective Table](perspective-table.md).

## Des tableaux qui calculent

Pour les chiffres plutôt que le texte, il existe le second type de tableau. La Perspective Datatable est un tableau de données typé : chaque colonne a un type de valeur, les cellules n'acceptent que des valeurs conformes, les lignes d'agrégat calculent en direct et les colonnes calculées évaluent une expression par ligne. La saisie se fait directement dans la grille rendue, sans détour par le texte source. Cela porte des dépenses, un suivi du temps ou des inventaires sans devenir un fichier de base de données, car tout reste en texte clair dans le document.

- **Types de valeurs fixes** par colonne, pour que les nombres restent des nombres et les dates des dates.
- **Agrégats** qui calculent en direct et **colonnes calculées** par ligne.
- **Saisie dans la grille**, sans passer par le texte source.
- **Calculer aussi dans le texte courant :** les calculs en ligne utilisent le même langage d'expressions au milieu d'une phrase.
- **Le texte clair reste du texte clair :** les données figurent telles quelles dans le fichier Markdown.

En détail : [Perspective Datatable](datatable.md).

## Des types de documents qui s'appuient les uns sur les autres

Beaucoup de documents d'une zone partagent les mêmes champs : un statut, une date, une catégorie. Les profils de propriétés décrivent ces champs une seule fois, de manière centralisée, avec type, valeurs admises et valeur par défaut ; les éditeurs de propriétés les proposent et présentent les plages de valeurs sous forme de listes de sélection. Les profils héritent les uns des autres : un profil de base dit ce qui vaut pour tous, et un type de document comme article ou réunion n'ajoute plus que sa propre part, exclut au besoin des champs hérités ou les remplace. Les écarts produisent des indications plutôt que des verrous.

- **Décrire les champs une seule fois** au lieu de recommencer dans chaque document : suggestions, listes de sélection et types viennent du profil.
- **Héritage avec exclusion et remplacement :** le commun dans le profil parent, le propre dans le type de document.
- **Indications douces plutôt que verrous :** les écarts sont nommés, rien n'est bloqué.

En détail : [Profils de propriétés](property-profiles.md).

## Des listes qui se tiennent à jour

Qui gère beaucoup de fichiers entretient sinon des vues d'ensemble à la main, et elles vieillissent le jour même. Une requête Perspective décrit au contraire **ce qui** est cherché, et le résultat apparaît sur place dans le document : une liste ou un tableau cliquable sur l'ensemble, filtré par propriétés, mots-clés et champs de fichier, jusqu'aux blocs de texte et aux tâches. Si l'ensemble change, la sortie change, sans que personne ne mette à jour.

- **Pages thématiques** qui listent d'elles-mêmes les fichiers associés.
- **Filtres** sur les propriétés du frontmatter, les mots-clés et les champs de fichier.
- **Niveau bloc et tâche**, pas seulement des fichiers entiers.
- **Chaque résultat cliquable**, menant directement à sa cible.

En détail : [Requête Perspective](frontmatter-query.md).

## Quand la requête ne suffit pas : les scripts

Certaines analyses ne se formulent pas comme une condition, par exemple un arbre récursif suivant les liens ou une vue qui calcule en chemin. Les blocs de script s'en chargent : un bloc exécute un petit programme, lit le même ensemble que la requête et produit listes, tableaux ou texte mis en forme dans le document. Parce que cela signifie plus de liberté, la fonction est liée à un modèle de confiance explicite et à des limites d'exécution, et elle n'est pas simplement active d'origine.

- **Analyses libres** sur les mêmes données que la requête.
- **Structures récursives** et vues calculées, impossibles à exprimer de façon déclarative.
- **Modèle de confiance explicite** et limites d'exécution au lieu d'une exécution silencieuse.

En détail : [Blocs de script](scripts.md).

## Et le reste du langage

Au-delà des quatre grandes constructions, le langage apporte plus de cinquante extensions : encadrés et notes de bas de page pour le texte, formules et diagrammes pour la présentation, liens, mots-clés et inclusions pour les rapprochements, tâches, rappels et rendez-vous pour la journée de travail, ainsi que modèles et journaux. Rien de tout cela n'est obligatoire : chaque extension a son propre interrupteur, et ce qui est désactivé disparaît des menus, des commandes et de l'affichage au lieu de gêner.

- **Extensions de texte** pour encadrés, notes de bas de page, surlignage et abréviations.
- **Présentation** avec formules, diagrammes et code mis en évidence.
- **Rapprochements** par liens, ancres, inclusions et mots-clés.
- **Journée de travail** avec tâches, rappels, rendez-vous, modèles et journaux.
- **Activables une par une** et ouvert à vos propres extensions via une interface documentée.

En détail : [Fonctionnalités](functions.md), [Extensions](extensions.md), [Créer des extensions](extensions-dev.md).
