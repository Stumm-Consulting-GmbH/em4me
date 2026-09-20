# Surface Canvas

Un **canevas** est une surface de travail spatiale au sein d'un document Markdown ordinaire : des **cartes** portant leur propre texte y sont disposées librement, des **connexions** tracent les relations entre elles, des **formes** posent des repères à côté d'elles et des **groupes** rassemblent ce qui va ensemble. Une carte porte soit son propre texte, soit elle montre le contenu d'un autre document ou une image de l'espace. Lorsque des variantes sont posées côte à côte, qu'un déroulement est esquissé ou que des idées sont d'abord triées, l'ordre vient ici de la position et non de la séquence.

La surface est portée par un bloc de code avec la balise de langage `perspective-canvas`. Un document peut en contenir autant que voulu, et tout le reste y demeure du Markdown ordinaire.

La fonction fait partie des [extensions internes](extensions.md) (« Vue canevas »). Désactivée, le bloc reste un bloc de code ordinaire, le mode d'affichage disparaît et les commandes pour la surface, la carte, la carte de lien, la carte d'image, la forme, le groupe et l'ordre de superposition s'en vont — et avec elles l'entrée **Modifier le canevas** du menu **Affichage**, qui ne reste pas là, vide. Le document reste parfaitement lisible ; rien n'est perdu.

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
- La commande **« Ajouter une carte au canevas »** (palette de commandes, Affichage → Modifier le canevas, raccourci attribuable) la place au centre de la portion visible. Hors de la vue canevas, elle signale dans la barre d'état que les cartes ne naissent que là.

### Sélectionner, déplacer, redimensionner

- Un **clic** sélectionne une carte, un clic sur le fond annule la sélection. Un seul élément au plus est sélectionné — une carte, une connexion, une forme ou un groupe.
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

### Cartes de lien

Au lieu de porter son propre texte, une carte montre au choix le contenu d'un **autre document** — en entier, ou à partir d'un titre ou d'un bloc. Le contenu reste là où il se trouve : la carte n'en garde aucune copie et ne se modifie pas à cet endroit. S'il ne tient pas dans la carte, celle-ci défile.

- **Créer** — la commande **« Ajouter une carte de lien au canevas »** (palette de commandes, Affichage → Modifier le canevas) la place au centre de la portion visible, le clic droit sur le fond libre à l'endroit du clic. Les deux demandent d'abord la cible : `Entrée` crée la carte, `Échap` abandonne. Sans cible, aucune carte n'est créée.
- **Définir, changer, supprimer la cible** — une carte sélectionnée porte une **barre** avec le champ « Cible du lien » ; à la saisie, il propose les documents de l'espace. Une carte de texte devient ainsi une carte de lien, et « Supprimer le lien » la ramène à une carte de texte — son propre texte reste en place. Les mêmes actions figurent dans le **menu contextuel** de la carte.
- **Ouvrir la cible** — un **double-clic sur le contenu affiché** ouvre le document lié à l'endroit lié, tout comme « Ouvrir la cible » dans la barre et le menu contextuel. Cela reste permis en affichage pur, car ouvrir ne modifie rien.
- **Ligne d'en-tête** — elle porte l'**étiquette** de la carte, c'est-à-dire son propre texte, et sinon la cible avec son ancre. Un double-clic sur la ligne d'en-tête modifie l'étiquette comme le texte de toute autre carte.

Si la cible est introuvable, la carte reste en place et indique, là où serait le contenu, ce qu'elle a cherché ; rien ne change dans le fichier. Si la cible est modifiée dans un autre document ouvert, la carte suit aussitôt ; une modification dans un fichier ouvert nulle part apparaît au prochain tracé de la surface.

### Cartes d'image

Une carte montre tout aussi bien une **image** de l'espace. Là non plus elle n'en garde aucune copie : l'image reste un fichier et la carte y renvoie — par un chemin relatif au document ou par le seul nom de fichier. Elle est **ajustée** à la carte en conservant ses proportions ; une carte d'image ne défile pas.

Elle se manipule comme la carte de lien : la commande **« Ajouter une carte d'image au canevas »** et la même entrée dans le menu contextuel de la surface, dans la barre de la carte sélectionnée le champ « Image » — avec les fichiers image de l'espace en propositions — ainsi que « Supprimer l'image » et « Ouvrir la cible ». Un double-clic sur l'image ouvre le fichier comme l'application ouvre toute [pièce jointe](attachments.md). La ligne d'en-tête porte l'étiquette et sinon le nom du fichier image.

Si l'image est introuvable, trop volumineuse ou sans extension d'image, la carte le dit à la place de l'image. **Une carte montre soit un document, soit une image ;** si les deux attributs figurent côte à côte, c'est le document qui vaut.

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

## Formes

Outre les cartes, la surface porte des **formes géométriques**. Elles ne portent pas de contenu, elles structurent : elles mettent une zone en évidence, marquent une étape d'un déroulement ou posent un repère à côté d'une carte.

### Créer

- Un **clic droit** sur le fond libre → « Insérer une forme » ouvre un sous-menu avec les six sortes et pose la sorte choisie à l'endroit du clic.
- La commande **« Ajouter une forme au canevas »** (palette de commandes, Affichage → Modifier le canevas, raccourci attribuable) pose un rectangle au milieu de la portion visible.

Six sortes sont proposées : **rectangle**, **rectangle arrondi**, **ellipse**, **triangle**, **losange** et **étoile**. Il n'existe pas d'outil pour les traits à main levée.

### Sélectionner, déplacer, redimensionner

Comme pour une carte : un clic sélectionne la forme, faire glisser la déplace, la poignée du coin inférieur droit modifie la taille. Le contour remplit son rectangle et ne conserve pas ses proportions — une ellipse étirée en largeur reste large.

Ce que l'on saisit, c'est la **figure dessinée** et non le rectangle autour d'elle : un clic dans le coin vide à côté d'un triangle atteint ce qui se trouve derrière.

### Sorte, couleurs et étiquette

Une forme sélectionnée porte une **barre d'outils** :

- **Sorte de la forme** — bascule entre les six sortes ; position et taille restent en place.
- **Couleur du contour** — huit couleurs du jeu de couleurs. Sans choix, la couleur par défaut s'applique.
- **Couleur de remplissage** — les mêmes huit couleurs, dessinées en teinte, ainsi que « Sans remplissage ».
- **Modifier l'étiquette** — ouvre la même saisie qu'un double-clic sur la forme.

L'**étiquette** est un **texte simple**, centré dans la forme. Contrairement à une carte, aucun Markdown n'y est rendu et elle ne défile pas : la forme structure, la carte porte le contenu. `Ctrl+Entrée` et un clic à côté valident, `Échap` annule ; un texte vidé retire de nouveau l'étiquette.

Les mêmes actions figurent dans le **menu contextuel** de la forme.

### Supprimer

`Suppr` supprime la forme sélectionnée, tout comme « Supprimer la forme » dans son menu contextuel. Une connexion ne se raccorde pas à une forme ; les connexions relient uniquement des cartes.

## Groupes

Un **groupe** est un rectangle qui rassemble une partie de la surface et la nomme — « Analyse », « écarté », « première version ». Son intérieur reste manipulable : les cartes et les formes qui s'y trouvent restent saisissables, et un double-clic au milieu d'un groupe crée une carte comme partout ailleurs.

### Créer

- Un **clic droit** sur le fond libre → « Insérer un groupe » le pose à l'endroit du clic.
- La commande **« Ajouter un groupe au canevas »** le pose au milieu de la portion visible.

Un nouveau groupe naît **tout au fond** et ne masque donc rien.

### Étiquette et couleur

Un groupe sélectionné porte une barre d'outils avec la **couleur du groupe** — huit couleurs du jeu de couleurs, ainsi que « Couleur par défaut », qui retire de nouveau l'attribut — et avec **Modifier l'étiquette**. L'étiquette se place en haut à gauche du cadre et est un texte simple, comme pour la forme. Les mêmes actions figurent dans le **menu contextuel** du groupe.

### Membres

**Est membre ce qui se trouve entièrement dans le groupe.** Cela n'est écrit nulle part — le rectangle lui-même est l'affirmation, et il n'existe pas de seconde liste qui pourrait s'en écarter. Les bords comptent comme intérieurs ; ce qui dépasse une arête n'est pas membre. Un groupe dans un groupe est membre et se déplace avec lui.

Les trois actions en découlent :

| Action | Effet sur les membres |
| ------ | --------------------- |
| Déplacer le groupe | les membres suivent, leur disposition les uns par rapport aux autres reste inchangée |
| Redimensionner | rien n'est déplacé ; qui est membre se recalcule ensuite |
| Supprimer le groupe | les membres restent en place |

Qui suit le mouvement est fixé au **début du déplacement** : ce qui se trouvait dans le groupe au moment de la saisie vient avec lui — même si le groupe va bien au-delà de son propre emplacement en chemin. Tout le déplacement est **une** étape d'annulation.

Une connexion n'est jamais membre ; elle suit de toute façon ses cartes.

## Ordre de superposition sur la surface

Les cartes, les formes et les groupes se trouvent dans **un ordre commun**. Lorsque deux éléments se chevauchent, c'est lui qui décide lequel est au-dessus ; aucune sorte ne passe durablement devant une autre.

Pour l'élément sélectionné, il existe quatre commandes :

| Commande | Effet |
| -------- | ----- |
| Mettre au premier plan | au-dessus de tous les autres éléments |
| Avancer d'un niveau | devant l'élément suivant situé devant lui |
| Reculer d'un niveau | derrière l'élément suivant situé derrière lui |
| Mettre à l'arrière-plan | en dessous de tous les autres éléments |

Deux chemins y mènent : le **menu contextuel** de l'élément et **Affichage → Modifier le canevas → Ordre de superposition du canevas**. Les mêmes commandes figurent dans la palette de commandes (`Ctrl+K` par défaut) ; aucun raccourci n'est préaffecté, et ils peuvent être attribués dans les réglages.

**Les nouveaux éléments ont leur place :** un nouveau groupe naît tout au fond, une nouvelle forme et une nouvelle carte tout devant.

**Les connexions n'en sont pas touchées.** Elles sont dessinées dans une couche propre, sous tous les éléments, et ne peuvent pas être déplacées dans l'ordre.

## Annuler

`Ctrl+Z` reprend la dernière action sur la surface, `Ctrl+Y` et `Ctrl+Maj+Z` la rétablissent. Chaque action est exactement une étape : une carte déplacée, une taille modifiée, une connexion créée, un texte changé. Tant que la saisie de texte d'une carte ou d'une connexion est ouverte, `Ctrl+Z` s'applique au texte frappé là.

## Naviguer

- **Déplacer** — faire glisser le fond libre avec le bouton de la souris enfoncé.
- **Zoom** — molette au-dessus de la surface, centrée sur le pointeur.
- **Ajuster** — à l'entrée dans la vue et au changement de surface, la portion s'ajuste d'elle-même au contenu.

## Liste du canevas et manipulation sans souris

À côté de la surface, une **liste du canevas** peut être affichée. Elle énumère ce qui se trouve sur la surface actuellement affichée et rend ainsi la surface **dénombrable** : un élément situé hors de la portion visible se retrouve par la liste sans devoir parcourir la surface, et une connexion qui passe sous une carte s'y atteint à coup sûr.

Trois chemins affichent et masquent la liste, comme pour tout autre panneau de la [barre latérale](sidebar.md) : le **bouton** dans la barre d'état, **Affichage → Barre latérale → Panneaux → Liste du canevas** et la palette de commandes (`Ctrl+K` par défaut). Aucun raccourci n'est préattribué ; il s'en attribue un dans les réglages. L'état vaut par colonne et survit au changement de document comme à un redémarrage. Si la vue canevas est désactivée en tant qu'[extension interne](extensions.md), la liste n'existe pas — ni le bouton, ni l'entrée de menu, ni l'entrée dans la palette de commandes.

### Ce que la liste montre

- **Toutes les sortes d'éléments** — cartes, formes et groupes, chaque ligne reconnaissable à sa sorte.
- **Sous chaque carte ses connexions**, chacune avec son sens et son vis-à-vis. Une poignée de repli sur la carte les affiche et les masque.
- **L'ordre de la liste est l'ordre de superposition :** ce qui figure plus bas dans la liste se trouve plus en avant sur la surface. Un second affichage de l'ordre est donc inutile.
- Si le document porte **plusieurs surfaces**, la liste appartient à celle qui est affichée ; un changement par la barre d'onglets fait changer la liste avec.
- Une ligne au-dessus de la liste indique le **nombre d'éléments** — ou dit à sa place qu'aucun document n'est ouvert, que le document ne porte aucune surface ou que la surface est encore vide.

**La sélection et la liste montrent la même chose, dans les deux sens.** Ce qui est sélectionné sur la surface est mis en évidence dans la liste ; ce qui est sélectionné dans la liste est mis en évidence sur la surface et vient **au centre de la portion** — l'agrandissement reste tel quel. Si le document n'est pas dans la vue canevas, sélectionner une entrée y conduit d'abord ; si le document ne porte aucune surface, la barre d'état dit que cette vue n'existe pas pour lui.

### Les touches dans la liste

| Touche | Effet |
| ------ | ----- |
| `Flèche haut`, `Flèche bas` | à la ligne précédente ou suivante ; la surface sélectionne avec et amène l'élément au centre |
| `Origine`, `Fin` | à la première ou à la dernière ligne |
| `Entrée` | modifie l'élément sélectionné — le texte d'une carte, l'intitulé d'une forme, d'un groupe ou d'une connexion |
| `Suppr` | supprime l'élément sélectionné |
| touche de menu contextuel, `Maj+F10` | ouvre le menu contextuel de l'élément ; sans élément sélectionné, le menu de la surface avec ses voies de création |
| `Échap` | lève la sélection |

Modifier et supprimer supposent un document modifiable et une vue canevas ouverte. Si l'une des deux conditions manque, la barre d'état le dit au lieu de ne rien faire en silence ; dans un document non modifiable, la liste continue d'afficher et de sélectionner.

### Ajouter une connexion sans souris

L'entrée **« Ajouter une connexion au canevas… »** du menu contextuel d'une carte lance le **choix de la cible dans la liste**. Il se déroule en deux étapes, car une connexion a deux extrémités et, sans pointeur, il n'existe aucun endroit où nommer le vis-à-vis en passant :

1. La carte de départ est la carte sélectionnée.
2. La liste ne parcourt ensuite que les **autres cartes**, et la ligne au-dessus d'elle dit qu'une cible est à choisir. `Entrée` valide, un clic sur une ligne de carte également, `Échap` annule et rétablit l'état antérieur.

Les côtés de raccordement sont déterminés par l'application d'après la position des deux cartes ; ils se modifient ensuite dans la barre de la connexion sélectionnée. S'il n'y a pas de seconde carte, la barre d'état le dit.

### Rechercher dans la surface

En tête de liste se trouve un **champ de filtre**. Il restreint la liste aux éléments qui contiennent le texte saisi. Sont parcourus

- le **texte** d'une carte ainsi que l'intitulé d'une forme et d'un groupe,
- la **cible de renvoi** d'une carte de lien et le **nom d'image** d'une carte d'image,
- l'**intitulé** d'une connexion.

La recherche porte sur une suite de caractères d'un seul tenant, sans égard à la casse — la même règle que dans la palette de commandes ; ni motifs ni correspondances approchées. Les occurrences sont mises en évidence dans la ligne, la ligne au-dessus de la liste les dénombre, et s'il ne reste rien, elle le dit au lieu de vider la liste sans un mot. Une carte demeure lorsqu'une de ses connexions correspond ; lorsque la carte elle-même correspond, toutes ses connexions demeurent avec elle. Tant qu'un filtre est actif, les cartes sont dépliées — une occurrence sous une carte repliée n'en serait pas une.

| Saisie | Effet |
| ------ | ----- |
| `Entrée` | saute à l'occurrence : sélectionnée, centrée, focus dans la liste. Est prise la ligne sélectionnée si elle figure parmi les occurrences, sinon la première |
| `Flèche bas` | de même ; de là, les flèches parcourent les autres occurrences |
| `Échap` | vide le champ sans toucher à la sélection. Avec un champ vide, il reste sans effet |

**`Ctrl+F` conduit dans ce champ dans la vue canevas** et non dans la barre de recherche. La raison : qui cherche dans cette vue cherche sur la surface devant lui ; la barre de recherche, elle, parcourt le texte du document et montre ses occurrences là où, dans cette vue, il n'y a rien à voir. Dans toute autre vue, `Ctrl+F` ouvre la barre de recherche comme auparavant, et si l'extension canevas est désactivée, cette vue n'existe pas, et cet aiguillage non plus.

## Consulter seulement

La surface suit la modifiabilité de son document. Tant que le document est en simple affichage, sans mode édition, la surface est **consultable seulement** : pas de poignées, pas de glissement, pas de création, pas de saisie, pas de barre d'outils, pas de réordonnancement, et le menu contextuel reste sans entrées. Cela vaut pour chaque sorte — carte, connexion, forme et groupe. Le chemin par la palette de commandes et le menu n'y change rien non plus ; l'échec est dit dans la barre d'état et non passé sous silence. Déplacer la portion, zoomer et sélectionner un élément d'un clic restent permis, car cela ne touche pas au document.

Le mode édition libère la manipulation — crayon dans la barre d'état, `Ctrl+E` par défaut ; les détails figurent sur la page [Vues et affichage](views-display.md).

## La surface hors de la vue canevas

Comme la surface se trouve dans un document Markdown ordinaire, elle se rencontre dans toutes les vues de ce document :

| Vue | Ce qui apparaît |
| --- | --------------- |
| Source | le bloc en clair — cette vue **est** la source |
| Scindée | le texte en clair à gauche, le bloc de synthèse à droite |
| Rendu | **le bloc de synthèse** : nature, volume en cartes, connexions, formes et groupes, un aperçu des textes de cartes et le bouton « Ouvrir la vue Canvas » |
| Live | le même bloc ; lorsque le point d'insertion touche le bloc, celui-ci se déplie en texte brut et devient modifiable |
| Carte mentale | une courte note avec nature et volume au lieu du texte brut |
| Canevas | la surface elle-même |

L'aperçu montre six cartes au plus ; en dessous figure le nombre de cartes restantes. Le bloc se **replie**, sa ligne d'en-tête restant en place ; cet état vaut pour la session en cours et n'est pas écrit dans le document. L'impression et l'export PDF suivent la vue rendue, sans imprimer les deux boutons du bloc.

## La surface dans l'export portable

**Fichier → Autres fonctions de fichier → Exporter → Markdown portable…** écrit une version du document qui dit quelque chose même sans cette application. Chaque surface y figure sous sa **correspondance Markdown** : le même contenu et le même réseau de relations, en Markdown ordinaire. Sans elle, le destinataire recevrait un bloc de code rempli de lignes de coordonnées dont il ne pourrait rien faire.

| Sur la surface | Dans l'export |
| -------------- | ------------- |
| la surface elle-même | une ligne d'en-tête en gras avec son titre — la première ligne de sa première carte — et son volume, la même indication que dans la ligne d'en-tête du bloc |
| une carte | son texte, **inchangé** ; les titres qu'il contient restent tels quels, et aucun titre inventé n'apparaît au-dessus de la carte |
| une carte de lien | son étiquette, en dessous le lien dans la même écriture que dans le reste du texte du document |
| une carte d'image | son étiquette, en dessous l'image en incorporation |
| un groupe | une ligne en gras portant son nom ; juste en dessous figurent les éléments qui se trouvent à l'intérieur |
| une forme avec étiquette | une puce composée de sa sorte et de son étiquette ; une forme sans étiquette est omise |
| les connexions | **une** liste à la fin de la surface, chaque ligne avec les deux cartes, le signe de leur sens et, le cas échéant, l'étiquette |
| un attribut erroné | une ligne de remarque auprès de l'élément concerné — ou à la fin de la surface, s'il ne revient à aucun élément |

L'ordre est celui du bloc, donc l'ordre de superposition que montre aussi la liste du canevas. **Rien n'est abrégé :** toutes les cartes figurent en entier, contrairement à l'aperçu plafonné du bloc. Si le document porte plusieurs surfaces, chacune reçoit son propre en-tête et sa propre liste de connexions.

Cette surface

````markdown
```perspective-canvas
!gruppe g1 x=-300 y=-160 b=600 h=200 farbe=blau
Analyse

!karte k1 x=-260 y=-120 b=240 h=120
Point de départ

!karte k2 x=40 y=-120 b=240 h=120
Cible

!karte k3 x=-100 y=140 b=240 h=120 doc="Concepts/Import.md#Cible"
La cible dans le concept

!form f1 x=220 y=140 b=120 h=120 art=stern rand=rot
Message clé

!linie e1 k1 -> k2 von=rechts nach=links
donne
```
````

se présente ainsi dans l'export portable :

```markdown
**Point de départ · 3 cartes, 1 connexion, 1 forme, 1 groupe**

**Analyse**

Point de départ

Cible

La cible dans le concept

[[Concepts/Import.md#Cible]]

- Étoile : Message clé

**Connexions**

- Point de départ → Cible : donne
```

**Ce qui ne voyage pas, c'est l'agencement spatial.** L'export restitue le contenu et le réseau, pas une image : ce qui était côte à côte et ce qui était éloigné n'y figure pas. Les groupes sont la seule chose qui passe de l'agencement, parce qu'ils portent la structure mentale de la surface. Et la correspondance est une **sortie, pas une seconde forme de stockage** — aucune surface ne peut en être reconstituée. L'original reste intact dans le document : l'export lit la surface et n'y écrit pas.

**L'impression et l'export PDF n'en sont pas affectés.** Ils suivent toujours la vue rendue et montrent la surface sous forme de bloc, comme le décrit le chapitre ci-dessus.

**Si la vue canevas est désactivée en tant qu'[extension interne](extensions.md)**, la surface reste aussi dans l'export un bloc de code lisible — la même affirmation que cette page fait déjà pour la vue rendue : le document reste lisible et rien n'est perdu.

## Échange avec d’autres outils

Une surface n’est pas obligée de rester dans cette application. Elle s’enregistre comme fichier au format ouvert **JSON Canvas** — extension `.canvas` —, que d’autres outils savent lire également ; inversement, un tel fichier se lit ici. Qui travaille avec quelqu’un qui utilise un autre outil peut ainsi transmettre sa surface au lieu de la décrire.

**Le stockage reste le fichier Markdown.** Le fichier écrit est un produit d’échange et non un second format de stockage : il n’est pas mis à jour lorsque la surface change ensuite, et à la lecture il est lu et non repris.

**Écrire une surface** — en quatre étapes :

1. Ouvrir la vue canevas. Si le document porte plusieurs surfaces, choisir l’onglet de celle voulue : ce qui est écrit, c’est la surface actuellement visible.
2. Choisir **Fichier → Autres fonctions de fichier → Exporter → Canevas au format JSON Canvas…**.
3. La boîte d’enregistrement propose le nom du document avec l’extension `.canvas` dans le dossier du document ; le nom et l’emplacement se modifient.
4. Une fois le fichier écrit, un message indique ce qui a été transmis et ce qui ne l’a pas été.

L’entrée n’est sélectionnable que tant que la vue canevas montre une surface ; sinon elle reste visible mais grisée. Le document lui-même n’est pas touché, et s’il porte d’autres surfaces, le message en indique le nombre.

**Lire un fichier** — en quatre étapes :

1. Choisir **Fichier → Autres fonctions de fichier → Importer → Fichier JSON Canvas…**. Cela ne demande ni surface ouverte ni document ouvert.
2. Dans la boîte d’ouverture, choisir un ou plusieurs fichiers portant l’extension `.canvas` ; avec un espace ouvert, ils doivent s’y trouver.
3. Pour chaque fichier choisi, un nouveau document naît **à côté de lui**, avec son nom et l’extension `.md`. Si ce nom est déjà pris, un nombre est ajouté : `Plan.canvas` devient alors `Plan-2.md`. Chaque nouveau document est ouvert et montre la vue canevas.
4. Ensuite, **un seul** message couvre tous les fichiers choisis, avec une section par fichier.

Les fichiers choisis restent en place, inchangés. **Les liens retrouvent leurs fichiers** lorsque le fichier lu se trouve à sa place dans le dossier repris — le cas courant lorsqu’un fonds étranger entier est repris ; une cible introuvable de cette manière figure ensuite sur la carte avec son simple nom de fichier et est nommée dans le message.

**Après chaque opération, l’application dit ce qui a été transmis et ce qui ne l’a pas été** — chaque fois avec un nombre, et aussi lorsque tout est passé. Le message n’est pas un message d’erreur, mais le justificatif de l’échange : les deux formats ne se recouvrent pas complètement, et ce qui ne correspond pas ne doit pas se produire en silence.

**Ce que devient la surface à l’écriture :**

| Sur la surface | Ce que cela devient |
| -------------- | ------------------- |
| une carte, un groupe, une connexion | la même chose là-bas, avec position, taille, ordre, couleur et légende |
| une forme | une carte de texte au même endroit et de la même taille, avec sa légende comme texte et sa couleur de bord comme couleur de la carte ; qu’il s’agissait d’une forme, ainsi que son remplissage, ne figurent plus nulle part |
| la légende d’une carte de lien ou d’image | un cadre avec titre autour de cette carte |
| les couleurs bleu et rose | une valeur de couleur, car l’autre format ne porte pas de nom pour ces deux-là |
| un côté d’attache que l’application choisit elle-même | aucune indication ; l’autre outil choisit le côté |
| les autres surfaces du même document | rien — le fichier porte exactement une surface ; le message en indique le nombre |
| un élément erroné ou inconnu | rien ; il est compté |

**Ce que devient le fichier à la lecture :**

| Dans le fichier | Ce que cela devient |
| --------------- | ------------------- |
| une carte de texte, un groupe, une connexion | la même chose ici, avec position, taille, ordre, couleur et légende |
| un simple saut de ligne dans le texte d’une carte | un saut de ligne forcé ; la carte affiche les mêmes lignes que dans l’autre outil |
| une carte pointant vers un document ou une image | une carte de lien ou une carte d’image ; une cible sur un titre ou un bloc est conservée |
| une carte portant une adresse web | une carte de texte avec l’adresse comme lien cliquable |
| une carte pointant vers un autre type de fichier | une carte de texte avec un lien vers ce fichier |
| la couleur d’une carte | rien — ici, une carte ne porte pas de couleur |
| une valeur de couleur libre sur un groupe ou une connexion | la plus proche des huit couleurs |
| une connexion commençant ou finissant sur un groupe | rien ; ici, les connexions ne relient que des cartes |
| une pointe de flèche au début seulement | une connexion dirigée ordinaire, début et fin échangés — sans perte |
| une image de fond d’un groupe | rien |

**L’aller-retour ne ramène pas au point de départ.** Une surface écrite puis relue ne revient **pas** identique : une forme est devenue une carte de texte et le reste, la légende d’une carte de lien est devenue un cadre. C’est le prix de l’échange et non une lacune — des marques cachées permettant de reconnaître l’élément d’origine n’existent volontairement pas, car elles apparaîtraient comme des déchets de données dans tout autre outil.

**Si la vue canevas est désactivée comme [extension interne](extensions.md)**, aucune des deux voies n’est disponible : l’entrée d’écriture et l’entrée de lecture disparaissent du menu, et les deux commandes ne sont pas davantage accessibles par la palette de commandes.

## Les liens dans le réseau de l'espace

Une carte de lien est un **lien comme un lien dans le texte courant** — simplement posé sur une surface. Elle apparaît donc partout où l'application montre des liens :

| Endroit | Ce qui apparaît |
| ------- | --------------- |
| rétroliens de la cible | la surface comme source, marquée « sur un canevas » ; l'extrait est l'étiquette de la carte |
| liens sortants du document | une entrée du type « Carte de lien sur un canevas », marquée d'un `C` |
| [Vue graphe](graph.md) | une arête comme tout autre lien |

Les rétroliens et les liens sortants sont décrits dans leur ensemble sur la page [Liens](linking.md).

Si la cible est **renommée ou déplacée**, l'attribut de la carte suit, comme un lien dans le texte courant ; il en va de même pour l'image d'une carte d'image.

Deux choses ne comptent pas : une **image** n'obtient pas de nœud dans le graphe des liens, pas plus qu'une image dans le texte courant. Et un lien dans le **propre texte** d'une carte reste en dehors — seule la cible de la carte compte.

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

Deux attributs supplémentaires font de la carte une **carte de lien** ou une **carte d'image** :

```text
!karte <identifiant> x=<nombre> y=<nombre> b=<nombre> h=<nombre> doc="<cible>"
!karte <identifiant> x=<nombre> y=<nombre> b=<nombre> h=<nombre> bild="<image>"
```

`doc=` montre le contenu d'un document. La cible prend les mêmes formes que la cible d'une inclusion : le nom du document ou un chemin relatif au document lui-même, suivi au choix de `#Titre` ou de `#^block-id`.

`bild=` montre une image. La valeur est un chemin relatif au document ou le seul nom d'un fichier image de l'espace ; les extensions admises sont `png`, `jpg`, `jpeg`, `gif`, `svg`, `webp`, `bmp` et `ico`.

Si les deux attributs figurent sur la même carte, c'est `doc=` qui vaut. Une valeur vide et une extension hors de la liste sont un **constat** ; l'attribut reste malgré tout inchangé dans le fichier. Les lignes sous le marqueur sont ici aussi le propre texte de la carte — pour une carte de lien et une carte d'image, son **étiquette**.

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

### Formes

```text
!form <identifiant> x=<nombre> y=<nombre> b=<nombre> h=<nombre> art=<nom> rand=<couleur> füllung=<couleur>
```

La position et la taille comptent comme pour une carte. `art=` est l'un des six noms : `rechteck` (rectangle), `abgerundet` (arrondi), `oval` (ellipse), `dreieck` (triangle), `raute` (losange) et `stern` (étoile). `rand=` et `füllung=` prennent les mêmes huit noms de couleur que la connexion, et `füllung=keine` laisse la forme sans remplissage. Sans `art`, le rectangle s'applique ; sans `rand`, la couleur par défaut ; sans `füllung`, la forme reste sans remplissage — une valeur par défaut n'est pas écrite, car son absence le dit déjà. Les lignes sous le marqueur sont l'**étiquette**.

Un nom inconnu dans `art` ou dans l'une des deux couleurs est un **constat** : la forme est conservée, dessinée en rectangle ou dans la couleur par défaut, et son texte figure inchangé dans le fichier.

### Groupes

```text
!gruppe <identifiant> x=<nombre> y=<nombre> b=<nombre> h=<nombre> farbe=<nom>
```

La position et la taille décrivent le rectangle, `farbe=` prend l'un des huit noms de couleur ; sans cet attribut, la couleur par défaut s'applique. Les lignes sous le marqueur sont l'**étiquette**. **Aucune liste de membres ne figure dans le fichier** — qui se trouve dans le groupe découle des rectangles et de rien d'autre.

### L'ordre dans le bloc

L'**ordre dans le bloc est aussi l'ordre d'empilement** sur les cartes, les formes et les groupes : ce qui figure plus bas se trouve plus en avant. Les connexions figurent dans la même suite, mais n'en sont pas touchées ; elles sont dessinées dans une couche propre, sous tous les éléments.

### Deux règles qui protègent le fichier

- **L'échappement du point d'exclamation.** Une ligne de contenu qui commence par `!` reçoit une barre oblique inverse devant elle à l'écriture et la perd à la lecture : le document contient `\!Attention`, la carte affiche `!Attention`. Si la ligne doit se lire littéralement `\!Attention`, le document contient `\\!Attention`.
- **L'inconnu est conservé.** Un marqueur ou un attribut que l'application ne connaît pas est transporté et réécrit tel quel ; un élément non modifié est ressorti mot pour mot. Ouvrir une surface et l'enregistrer sans changement rend le même fichier. Un attribut erroné ne jette rien non plus : l'élément est alors dessiné de manière visible ou pas du tout, mais il ne disparaît jamais du fichier.

### Un exemple

````markdown
```perspective-canvas
!gruppe g1 x=-360 y=-200 b=740 h=220 farbe=blau
Analyse

!karte k1 x=-320 y=-140 b=260 h=120
## Point de départ

L'import ne lit aujourd'hui qu'une seule source.

!karte k2 x=40 y=-140 b=260 h=120
## Cible

Plusieurs sources, une fusion.

!karte k3 x=-140 y=120 b=260 h=160
## Question ouverte

Comment les conflits sont-ils tranchés ?

!karte k4 x=420 y=-200 b=240 h=160 doc="Concepts/Import.md#Cible"
La cible dans le concept

!karte k5 x=420 y=-20 b=240 h=140 bild="pieces-jointes/croquis.png"
Croquis de l'interface

!form f1 x=260 y=140 b=120 h=120 art=stern rand=rot füllung=gelb
Message clé

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
!gruppe g1 x=-360 y=-200 b=740 h=220 farbe=blau
Analyse

!karte k1 x=-320 y=-140 b=260 h=120
## Point de départ

L'import ne lit aujourd'hui qu'une seule source.

!karte k2 x=40 y=-140 b=260 h=120
## Cible

Plusieurs sources, une fusion.

!karte k3 x=-140 y=120 b=260 h=160
## Question ouverte

Comment les conflits sont-ils tranchés ?

!karte k4 x=420 y=-200 b=240 h=160 doc="Concepts/Import.md#Cible"
La cible dans le concept

!karte k5 x=420 y=-20 b=240 h=140 bild="pieces-jointes/croquis.png"
Croquis de l'interface

!form f1 x=260 y=140 b=120 h=120 art=stern rand=rot füllung=gelb
Message clé

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
donne

!linie e2 k3 -- k1
croquis associé

!linie e3 k2 <-> k3 von=unten nach=oben
se conditionnent
```

## Limites

- Le **contenu affiché** d'une carte de lien ne se modifie pas dans la carte ; il se modifie dans le document sur lequel elle pointe. Les formes et les groupes ne portent aucun contenu rendu — tout au plus une étiquette en texte simple.
- **Les inclusions dans le contenu affiché ne sont pas résolues.** Si une carte de lien montre un document qui inclut lui-même quelque chose, cet endroit reste vide dans la carte ; tout le reste apparaît inchangé.
- Une modification de la cible apparaît **aussitôt** tant que celle-ci est modifiée dans un autre document ouvert ; si un fichier ouvert nulle part est modifié, cela apparaît au prochain tracé de la surface.
- **Le dessin libre n'existe pas.** La surface connaît les six sortes de formes et aucune autre géométrie ; les traits à main levée, les flèches tracées soi-même et la saisie au stylet n'en font pas partie.
- Une **connexion** relie uniquement des cartes ; elle ne se raccorde ni à une forme ni à un groupe.
- Un lien dans le **propre texte** d'une carte n'apparaît ni dans le graphe des liens ni dans les rétroliens ; seule la cible d'une carte de lien compte. Une image n'obtient pas de nœud dans le graphe des liens.
- **Le glissement libre et le zoom n'existent pas au clavier.** La liste du canevas sélectionne, modifie, supprime et crée ; la position d'un élément ne se change au clavier que par les quatre commandes de l'ordre. Déplacer, redimensionner et bouger la portion restent réservés à la souris.
- **La liste rend la surface manipulable, non parlante.** Elle énumère ce qui s'y trouve et ne remplace pas ce que montre l'agencement spatial.
- **La recherche dans l'espace trouve toujours un document porteur d'une surface par son texte**, car la surface y figure en clair ; elle n'est pas pour autant une source d'occurrences à part. Les cartes, formes et groupes pris isolément n'apparaissent donc pas comme occurrences propres — c'est le champ de filtre de la liste du canevas qui les trouve.
- **L'export portable restitue la surface sous forme de texte, pas d'image.** L'agencement spatial ne voyage pas, et aucune surface ne peut être reconstituée à partir de la correspondance ; passent le contenu, les groupes et le réseau des connexions.
- **Un élément erroné n'est pas omis en silence dans l'export** : il est écrit avec ce qu'il a de lisible et accompagné d'une ligne de remarque. Une forme sans étiquette est en revanche omise, parce qu'il n'en resterait rien sans la représentation spatiale.
- **L’échange avec le format ouvert n’est pas un aller-retour sans perte.** Une surface écrite puis relue ne revient pas identique : une forme revient en carte de texte, la légende d’une carte de lien en cadre.
- **Un fichier du format étranger n’est pas ouvert comme document, mais lu.** Il reste en place, inchangé ; la surface est ensuite portée par le nouveau document à côté de lui, et ce qui y est modifié ne repart pas dans le fichier.
- Une surface appartient à son document. Les cartes ne peuvent pas être glissées d'une surface à une autre.
