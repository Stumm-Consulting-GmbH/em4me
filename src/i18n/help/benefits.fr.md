# Utilité et façons de travailler

Cette page ne répond pas à la question **comment** faire, mais à la question **à quoi cela sert**. Elle a deux moitiés : la première moitié montre quelles **façons de travailler** l'application ouvre, du document isolé à l'espace de travail nommé. La seconde moitié montre ce qu'un fichier Markdown peut **exprimer** au-delà du standard Markdown. Là où les choses deviennent concrètes, un lien à la fin de chaque section mène à la page qui traite le sujet en détail.

## Un document, tel que vous en avez besoin

Lire, écrire et vérifier sont des activités différentes, et elles demandent des présentations différentes du même texte. Plutôt que d'imposer un compromis, l'application tient sept vues à disposition, entre lesquelles une touche suffit à basculer : la page finie pour la lecture, le texte source pour le travail précis, les deux côte à côte pour la comparaison, le mode direct pour écrire sans rupture, la carte mentale pour voir la structure, le canevas pour des cartes sur une surface et le tableau pour des tâches en colonnes. Le changement ne coûte rien et ne modifie jamais le fichier.

- **Rendu** pour lire, **code source** pour le travail précis sur la syntaxe.
- **Partagée** montre source et résultat côte à côte, pour les constructions délicates.
- **Direct** met en forme pendant la frappe et n'affiche les caractères Markdown que dans la ligne courante.
- **Carte mentale** transforme la structure des titres en arborescence.
- **Canevas** montre une surface avec des cartes et des connexions qui se trouve dans le document lui-même.
- **Tableau** place les tâches du document côte à côte, sous forme de cartes en colonnes.

En détail : [Vues et affichage](views-display.md), [Vue carte mentale](mindmap.md), [Surface Canvas](canvas.md), [Tableau Kanban](kanban.md).

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

- **Zone** signifie limite de dossier : ce qui est en dehors n'entre pas — à une seule exception près, que vous posez vous-même.
- **Espace de travail** signifie état de travail enregistré, nommé et repéré par une couleur.
- **Les deux ensemble** donnent un état de travail nommé avec une limite de dossier fixe.
- **Les zones liées** sont cette exception : un préfixe que vous saisissez, un sens, un lien qui franchit. Une porte, pas une limite ouverte.

En détail : [Applications, fenêtres et zones](apps-windows.md).

## Un réseau plutôt qu'un classement

Le savoir pousse rarement dans des dossiers. Il pousse dans des liens : une note renvoie à une deuxième, une troisième reprend les deux, et au bout d'un an votre fonds porte plus de rapprochements qu'une arborescence ne pourrait en représenter. Ces rapprochements sont conservés et se lisent de deux façons — comme une surface qui montre ce qui est relié à quoi, et comme un arbre qui montre ce qui pend sous un point d'entrée, et à quelle profondeur.

- **Des liens dans les deux sens** : ce que ce document nomme, et qui nomme ce document.
- **Le réseau** montre l'entourage d'un document, **l'arbre** depuis une racine choisie l'ordre en dessous.
- **Chaque fichier exactement une fois** dans l'arbre, sur son chemin le plus court vers la racine ; un clic l'ouvre.
- **Ce vers quoi rien ne pointe** ne reste pas caché : les statistiques de la zone nomment ces fichiers.

En détail : [Mise en réseau](linking.md) et [Vue graphe](graph.md).

## Quand l'ordre ne suffit plus

Certaines idées n'ont pas d'ordre. Poser des variantes côte à côte, esquisser un déroulement ou trier des rapprochements demande une surface plutôt que des lignes — et demande de décider soi-même ce qui va où. Un canevas est exactement cela : une surface dans un fichier Markdown ordinaire, sur laquelle vous disposez librement des cartes portant leur propre texte et les reliez par des traits colorés et légendés. Contrairement à la vue graphe, il ne calcule rien, il retient ce que vous avez posé — et comme il se trouve dans le document, les textes des cartes restent lisibles dans n'importe quel autre programme de texte.

- **Des cartes portant leur propre texte**, placées librement et de taille réglable ; leur contenu est du Markdown ordinaire.
- **Des connexions avec sens, couleur et légende** — y compris avec une flèche aux deux bouts, et un côté d'accroche au choix.
- **Votre disposition reste la vôtre** : la surface ne calcule aucune position, elle retient ce que vous avez posé.
- **Du texte clair dans le document** : la surface se trouve dans un bloc de code du fichier Markdown et se lit aussi sans EM4me.
- **Sans souris également** : une liste à côté de la surface énumère tous les éléments et permet de les créer, de les légender, de les relier et de les supprimer au clavier — et de les chercher.
- **Ouvert vers l’extérieur** : une surface peut être enregistrée au format ouvert JSON Canvas et relue depuis celui-ci — pour l’échange avec d’autres outils.

En détail : [Surface Canvas](canvas.md).

## Des tâches que l'on fait avancer

Qui mène de front de nombreuses tâches ne veut pas lire ce qui reste à faire, mais voir où chaque chose en est. Un tableau Kanban range les tâches d'un document en colonnes — à faire, en cours, terminé, ou tout autre nom donné aux étapes de votre déroulement — et ses cartes se poussent à la souris d'une colonne à la suivante ; une colonne peut être réglée pour cocher aussitôt toute tâche qu'on y fait glisser. Tout cela reste du texte ordinaire dans le document : les colonnes en sont les titres, les cartes en sont les lignes de tâche, et ce qui est coché sur le tableau l'est tout autant dans chacune des autres vues. Un tableau écrit avec l'outil de tableaux répandu pour les notes Markdown s'ouvre ici, s'y modifie et se réutilise ensuite là-bas.

En détail : [Tableau Kanban](kanban.md).

## Des fichiers deviennent un livre

Un ouvrage long se compose de nombreux fichiers, et leur ordre réside sinon dans le nom de fichier ou dans l'emplacement du dossier, où chaque renommage le remet en cause. Un livre inverse cela et écrit sa structure de façon explicite : les chapitres restent des fichiers Markdown ordinaires, lisibles même sans l'application, mais leur ordre et leur imbrication sont fixés, la table des matières les montre, et le fil de lecture parcourt l'ouvrage entier par-delà les limites de chapitre. Les étagères regroupent plusieurs livres.

- **Ordre de lecture déclaré** au lieu d'un tri alphabétique par nom de fichier.
- **Les chapitres restent des fichiers**, lisibles isolément et réutilisables ailleurs.
- **Fil de lecture** continu, la table réorganise par glissement ou au clavier.
- **Étagères** pour regrouper plusieurs livres.

En détail : [Livres](books.md).

## Quand un document dépasse la taille d'un fichier

Un document dépasse parfois ce qui se laisse modifier avec fluidité. Plutôt que de vous imposer une limite, l'application divise elle-même un tel document en plusieurs fichiers lors de l'enregistrement et le réunit à l'ouverture. Vous n'en remarquez rien : un texte continu, un historique d'annulation, un résultat de recherche. La coupure se fait uniquement aux titres, afin qu'aucune construction ne soit déchirée, et chaque fichier de partie reste un fichier Markdown ordinaire, lisible sans l'application.

- **La taille cesse d'être une limite** — même les documents très volumineux restent utilisables.
- **Invisible dans votre travail** : un onglet, un texte, un résultat de recherche.
- **La coupure se fait aux titres**, jamais au milieu d’un tableau, d’une liste ou d’un bloc de code.
- **Réversible** : une commande de menu refait un fichier unique à partir des parties.

En détail : [Division des grands documents](document-parts.md).

## Données et prose dans les mêmes fichiers

Un dossier de fichiers Markdown peut être en même temps une base de données, et vous n'avez pas à le déclarer : dès qu'un document décrit la base de données, la zone en contient une, et une vue d'ensemble propre répond en un seul endroit à la question de ce qui s'y trouve, à savoir le nom et la description, les tables avec le nombre de leurs champs et les anomalies en clair. Les tables elles-mêmes sont des fichiers ordinaires : la définition figure dans l'en-tête, les enregistrements se trouvent dans le corps en dessous, et une table est ainsi complète dans un seul fichier. Le véritable gain est ailleurs. Depuis n'importe quel texte de la zone, vous renvoyez à une seule ligne d'une table, comme vous renvoyez ailleurs à un fichier ; la note sur une réunion pointe alors vers l'enregistrement de la personne dont elle parle.

- **La zone devient une base de données** dès qu'un document en décrit une, et reçoit sa propre vue d'ensemble, en lecture seule.
- **La table réside dans son fichier** : les champs dans l'en-tête, les enregistrements dans le corps. Le renommage et le déplacement n'y changent rien, y compris hors de l'application.
- **Huit types de colonne**, avec des étiquettes qui peuvent exister en plusieurs langues.
- **Le lien vers un enregistrement isolé** s'écrit comme une ancre et se comporte comme tout autre lien : le linter Markdown indique s'il vaut, et un clic ouvre le fichier de table.
- **Les grands ensembles restent une seule table** : à partir d'environ 0,7 Mo, l'application répartit les enregistrements sur plusieurs fichiers voisins au moment de la sauvegarde, sans qu'aucun lien en soit affecté.

Ce que cette première étape n'apporte pas encore : les enregistrements se saisissent toujours dans le texte du fichier, il n'y a pas de formulaire de saisie, pas de contrôle des valeurs à l'écriture et pas de requête portant sur les enregistrements.

En détail : [Base de données](database.md).

## L'application s'adapte — et vous suit

Qui travaille longtemps avec un programme finit par le façonner : couleurs, raccourcis clavier, boutons, modèles et favoris grandissent avec votre manière de travailler, et un jour la langue dans laquelle l'interface s'exprime en fait partie elle aussi. Ce travail était jusqu'ici lié à un seul ordinateur et aux langues livrées avec l'application. Les deux sont ouverts : votre configuration peut être écrite dans un fichier lisible et relue ailleurs, et qui a besoin d'une sixième langue traduit lui-même l'interface. S'y ajoute la vue d'ensemble — une page qui montre côte à côte tous vos espaces de travail, zones, livres et bibliothèques, y compris ceux qui ne sont pas raccordés en ce moment.

- **La configuration comme fichier** : l'exporter, l'emporter, la relire ailleurs — en totalité ou en partie, avec un aperçu qui indique au préalable ce qui va se passer.
- **Une sixième langue : la vôtre.** Traduire un modèle, l'installer, la choisir dans la barre d'état ; ce qui y manque apparaît en anglais et non sous forme de clé brute.
- **Tous les contenants en un seul endroit** : saisis à la main plutôt que collectés automatiquement, avec des chiffres et le moment où ils ont été relevés.
- **Rien ne se fait à votre insu** : aucun disque n'est parcouru, et aucune relecture n'écrit quoi que ce soit avant votre confirmation.

En détail : [Exporter et importer les paramètres](setup-exchange.md), [Votre propre langue d'interface](custom-locale.md), [My Extended Memory](my-extended-memory.md).

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

Beaucoup de documents d'une zone partagent les mêmes champs : un statut, une date, une catégorie. Les profils de propriétés décrivent ces champs une seule fois, de manière centralisée, avec type, valeurs admises et valeur par défaut ; les éditeurs de propriétés les proposent et présentent les plages de valeurs sous forme de listes de sélection. Les profils héritent les uns des autres : un profil de base dit ce qui vaut pour tous, et un type de document comme article ou réunion n'ajoute plus que sa propre part, exclut au besoin des champs hérités ou les remplace. Les écarts produisent des indications plutôt que des verrous. Le profil qui s'applique n'a pas besoin d'être inscrit dans le document : une étiquette ou son dossier suffit, et un symbole sur le document montre lequel a été retenu. De même, les valeurs admises d'un champ peuvent venir de votre propre fonds plutôt que de la définition.

- **Décrire les champs une seule fois** au lieu de recommencer dans chaque document : suggestions, listes de sélection et types viennent du profil.
- **Héritage avec exclusion et remplacement :** le commun dans le profil parent, le propre dans le type de document.
- **Indications douces plutôt que verrous :** les écarts sont nommés, rien n'est bloqué.
- **Affectation sans inscription dans le document :** une étiquette ou le dossier décide du profil qui s'applique.
- **Des listes de valeurs qui s'entretiennent d'elles-mêmes :** les valeurs admises viennent soit d'une note, soit d'une requête sur le fonds.
- **Des champs qui portent une structure :** Une réunion à trois participants a besoin d’un champ au lieu de trois listes parallèles pour le nom, le rôle et la société — dans le bloc de métadonnées, cela reste du YAML ordinaire et lisible.

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
- **Présentation** avec formules, diagrammes et code mis en évidence ; lors d'un export portable, un diagramme voyage sous forme d'image finie et reste visible là où EM4me n'est pas installé.
- **Renvois à l'intérieur du texte** par ancres, inclusions et mots-clés.
- **Journée de travail** avec tâches, rappels, rendez-vous, modèles et journaux.
- **Activables une par une** et ouvert à vos propres extensions via une interface documentée.

En détail : [Fonctionnalités](functions.md), [Extensions](extensions.md), [Créer des extensions](extensions-dev.md).

## Collaboration avec un assistant IA

Qui demande à un assistant IA d'écrire des fichiers obtient d'ordinaire du Markdown ordinaire : le modèle ne connaît pas le langage étendu d'EM4me. C'est pourquoi EM4me livre aussi la description de son propre langage Markdown sous une forme qu'un modèle peut lire. Remettez-la à votre assistant et vous obtenez des fichiers avec des requêtes, des tableaux de données, des événements et des surfaces au lieu de simples paragraphes, sans avoir à les reprendre à la main.

- **Une référence de syntaxe dans un seul fichier** : tout le langage, écrit pour un modèle. Elle est livrée avec le programme et se trouve sur le web à une adresse fixe, `em4me.ch/<langue>/manual/em4me-syntax.md`.
- **Chaque page du manuel également en Markdown**, à sa propre adresse, pour la question portant sur un seul sujet.
- **Un fichier d'index `llms.txt` par langue** selon le modèle répandu, grâce auquel un assistant trouve les pages lui-même.
- **Toujours à l'état livré** : tout naît à chaque construction à partir du manuel. Il n'existe pas de seconde source qui pourrait vieillir.
