# Applications, fenêtres et zones

L'app organise le travail sur trois niveaux : les **applications** (contextes de travail indépendants), les **fenêtres** (autant que souhaité par application) et les **onglets**. Cette page décrit le démarrage multiple, la gestion des fenêtres, la systématique des titres, les **zones** (un dossier comme espace de travail exclusif d'une application) et les **espaces de travail** (applications nommées et enregistrées durablement avec toutes leurs fenêtres).

## Applications

Le programme peut être démarré plusieurs fois : chaque démarrage supplémentaire du fichier programme crée une nouvelle application — un contexte de travail indépendant avec ses propres fenêtres et sa propre numérotation. « Fichier → Nouvelle application » fait de même.

Toutes les applications s'exécutent dans un même processus et partagent les réglages. La restauration de session (Aide → Restaurer la session) rouvre au prochain lancement toutes les applications avec leurs fenêtres et onglets.

## Brouillons non enregistrés

Les nouveaux documents jamais enregistrés (onglets sans titre avec contenu) survivent à la fermeture de l'application : leur contenu est conservé à la fermeture et rouvert sous forme d'onglets sans titre au prochain démarrage. Cela fonctionne indépendamment de la restauration de session, donc aussi lorsque celle-ci est désactivée.

La mémoire tampon n'agit qu'à la fermeture de l'application ou d'une fenêtre, pas à la fermeture d'un seul onglet (Ctrl+W) ; un brouillon isolé est délibérément abandonné via la boîte de dialogue d'enregistrement. Les fichiers déjà enregistrés ne sont pas concernés et conservent leur boîte de dialogue d'enregistrement à la fermeture.

Désactivation sous « Paramètres → Comportement » avec « Conserver les nouveaux documents non enregistrés à la fermeture » (par défaut : activé).

## Fenêtres

Au sein d'une application, on peut ouvrir autant de fenêtres que souhaité : via le menu contextuel de l'onglet (« Déplacer vers » / « Copier vers » → « Nouvelle fenêtre »), un onglet passe dans une nouvelle fenêtre de la même application. Avec plusieurs fenêtres ouvertes, le sous-menu liste toutes les autres fenêtres comme destinations ; dès que plusieurs applications sont en cours, les entrées cibles portent le contexte d'application.

## Position des nouveaux onglets

Un onglet créé **depuis un autre** s'ouvre immédiatement à sa droite. Cela concerne chaque clic dans le contenu d'un document — lien wiki, résultat de requête, source d'un événement, navigation de journal, lien de diagramme — ainsi que l'historique du document, qui apparaît à côté de l'onglet de son document. Le lien entre l'origine et la cible reste visible, et le retour est court.

Si une action ouvre plusieurs fichiers à la fois, ils se rangent derrière l'origine dans leur propre ordre. Si le fichier cible est déjà ouvert, seul son onglet est activé ; l'ordre de la barre n'en est jamais modifié.

Toutes les ouvertures **sans** origine se placent comme d'habitude en fin de barre : boîte de dialogue de fichier, palette de commandes, signets, panneaux, liste des fichiers de l'espace, ainsi que le manuel et les réglages.

## Groupes d'onglets

Les onglets peuvent être réunis en groupes nommés et colorés : les membres se tiennent ensemble derrière un **en-tête de groupe** coloré dans la barre d'onglets, et leurs onglets portent un soulignement dans la couleur du groupe.

- **Créer :** menu contextuel d'un onglet → « Nouveau groupe avec cet onglet ». Le groupe reçoit un nom par défaut et la prochaine couleur libre ; la boîte de dialogue de renommage avec choix de couleur (palette fixe de huit couleurs, adaptée aux thèmes clair et sombre) s'ouvre aussitôt.
- **Remplir :** « Ajouter au groupe » dans le menu contextuel de l'onglet, ou glisser un onglet sur l'en-tête du groupe ou entre deux membres. « Retirer du groupe » ou tirer un onglet hors du bloc met fin à l'appartenance ; les groupes restent toujours contigus.
- **Fichiers dérivés :** lorsqu'un clic dans le contenu d'un document groupé ouvre un autre fichier (lien wiki, résultat de requête, ligne d'événement, navigation de journal), le nouvel onglet rejoint le même groupe, à sa position à côté de l'origine (voir « Position des nouveaux onglets »). Le bloc reste d'un seul tenant. Les ouvertures en dehors du contenu du document — liste des fichiers, panneaux, signets, palette de commandes, boîtes de dialogue — restent non groupées ; les fichiers cibles déjà ouverts sont seulement activés.
- **Replier :** un clic sur l'en-tête replie le groupe — seul l'en-tête avec le nombre de membres reste visible ; un onglet actif concerné passe au prochain onglet visible. Un nouveau clic, ou l'activation d'un membre (par exemple à l'ouverture de son fichier), déplie à nouveau le groupe.
- **Gérer :** menu contextuel de l'en-tête — « Renommer et couleur… », « Dissocier le groupe » (les onglets restent ouverts) et « Fermer le groupe » (tous les membres avec les demandes d'enregistrement habituelles). Glisser l'en-tête déplace le groupe entier dans la barre.

Les groupes appartiennent à leur barre d'onglets (une par côté en vue partagée) ; un onglet qui change de barre quitte son groupe. Le nom, la couleur, les membres et l'état replié survivent à la restauration de session. La fonction peut être désactivée en tant qu'extension « Groupes d'onglets » ; les groupes sont conservés et réapparaissent inchangés à la réactivation.

## Forme des onglets

Les onglets et les en-têtes de groupes ont au choix des coins supérieurs droits ou arrondis (Fichier → Paramètres… → Apparence). En mode arrondi, un espace étroit remplace le séparateur vertical entre les onglets ; le repère de l'onglet actif, les bandes de couleur des groupes et le marquage de la colonne active restent inchangés. Le réglage vaut pour toute l'application et prend effet immédiatement dans toutes les fenêtres ouvertes.

## Systématique des titres

Le titre de la fenêtre indique entre parenthèses où appartient une fenêtre — seulement ce qui est nécessaire :

| Situation | Suffixe du titre |
|---|---|
| Une application, une fenêtre | *(aucun suffixe)* |
| Une application, plusieurs fenêtres | `(Fenêtre 2)` |
| Plusieurs applications, une fenêtre chacune | `(App 2)` |
| Plusieurs applications et fenêtres | `(App 2, Fenêtre 3)` |
| Application de zone | `(Zone Notes)` ou `(Zone Notes, Fenêtre 2)` |
| Espace de travail | `(Espace de travail Alpha)` ou combiné `(Espace de travail Alpha, Zone Notes, Fenêtre 2)` |

Les numéros se resserrent à la fermeture : si l'application 1 se ferme, l'application 2 devient le nouveau numéro 1 ; il en va de même pour les numéros de fenêtre au sein d'une application. Les applications de zone ne portent pas de numéro ; elles affichent toujours le nom de leur dossier de zone. Les espaces de travail affichent leur nom, combiné avec le nom de la zone lorsqu'une zone est liée.

## Zones

Une **zone** lie une application à un dossier : tout ce qui se trouve dans ce dossier, sous-dossiers compris, constitue l'espace de travail, rien d'autre. « Fichier → Ouvrir une zone… » choisit le dossier ; « Fichier → Fermer la zone » termine le travail dans la zone et ferme toutes les fenêtres de l'application de zone (avec les demandes d'enregistrement habituelles). Le lien est fixe : une zone ne peut pas être changée, seulement fermée.

Trois règles s'appliquent à l'ouverture :

- Si l'application est vide (aucun fichier ouvert), elle adopte la zone.
- Si l'application a déjà un fichier ouvert, une nouvelle application est créée pour la zone.
- Si la zone est déjà en cours, le focus passe à une fenêtre de l'application de zone existante ; la même zone ne s'exécute jamais deux fois.

**Demo-Area :** « Fichier → Créer la Demo-Area… » copie une collection d'exemples fournie en anglais — des pages Markdown accompagnées de pièces jointes image et PDF qui montrent les fonctions les plus importantes — dans un dossier vide et l'ouvre directement comme zone : un bac à sable pour expérimenter sans risque. Les dossiers cibles non vides sont refusés, et les fichiers existants ne sont jamais écrasés. La fonction peut être désactivée en tant qu'extension « Demo-Area » ; les dossiers de démo déjà créés sont des zones ordinaires et restent intacts.

### Limites strictes

Au sein d'une application de zone, la zone est la limite : le dialogue d'ouverture démarre dans la zone et rejette une sélection extérieure, « Récents » n'affiche que les fichiers de la zone, « Enregistrer sous » n'accepte que des cibles dans la zone, et aucun fichier étranger n'entre par glisser-déposer. Les fichiers ouverts depuis l'explorateur s'ouvrent toujours dans une application sans zone.

Les liens dont la cible se trouve hors de la zone sont marqués d'un soulignement d'avertissement ; l'info-bulle indique le chemin complet de la cible. Un clic n'ouvre pas la cible mais signale la raison dans la barre d'état. Les images intégrées restent affichées même si elles se trouvent à l'extérieur ; la limite concerne l'ouverture de fichiers, pas le rendu.

### Espace de recherche et index

Dans une application de zone, l'espace de recherche des rétroliens, des tags, de l'autocomplétion et du linter couvre **toute** la zone au lieu du seul dossier du fichier actif. Pour que la zone soit prête rapidement à l'ouverture, l'application crée le fichier **`Area_Cache.mdda`** dans le dossier racine de la zone. C'est un simple cache de l'index, qui peut être supprimé sans risque ; il est reconstruit à la prochaine ouverture de la zone.

### Panneau de zone

Le panneau « Zone » affiche la zone comme structure de dossiers dans la barre latérale (ancrable à gauche ou à droite comme tout panneau ; le commutateur est l'icône de dossier dans la barre d'état ou Affichage → Panneaux → Zone) : l'arborescence en haut, en dessous les fichiers Markdown du dossier sélectionné ; les autres types de fichiers n'apparaissent pas. Un clic sur un fichier l'ouvre comme onglet, toutes les entrées affichent le chemin complet en info-bulle, et les modifications externes (fichier créé, supprimé, renommé) apparaissent automatiquement. Le bouton « + » en tête de la liste crée un nouveau fichier Markdown dans le dossier sélectionné et l'ouvre. Dans une application de zone fraîchement ouverte et encore vide, le panneau est visible automatiquement.

### Zones récentes

« Fichier → Zones récentes » liste les zones récemment ouvertes par leur nom de dossier. Un clic ouvre la zone selon les règles habituelles. Les zones sont restaurées avec la session ; si un dossier de zone manque au démarrage, l'application correspondante n'est pas restaurée et un avis s'affiche.

## Espaces de travail

Un **espace de travail** est une application nommée et enregistrée durablement : il comprend toutes ses fenêtres avec les volets, les onglets et leurs réglages d'affichage, les groupes d'onglets, une éventuelle liaison de zone et les brouillons non enregistrés. Un espace de travail ouvert maintient son état à jour **automatiquement**, sans étape d'enregistrement manuelle ; à la réouverture, le travail reprend exactement au dernier état. Accès : le sous-menu « Fichier → Espaces de travail » avec la liste de tous les espaces de travail (le point de couleur indique aussi l'état : plein = ouvert, anneau = fermé) et les quatre actions en dessous ; les mêmes actions sont disponibles comme commandes dans la palette de commandes.

**Zone et espace de travail sont deux choses différentes :** une *zone* lie une application à un **dossier** et délimite son espace de travail (voir plus haut). Un *espace de travail* est une **collection de fenêtres** nommée et réouvrable, autrement dit un état de travail enregistré. Les deux se combinent : un espace de travail dont l'application a lié une zone emporte cette liaison dans son enregistrement.

**Couleur de la barre de titre :** les fenêtres d'un espace de travail ouvert portent sa couleur dans la barre de titre — une variante vive dans le thème clair, une variante pastel de la palette dans le thème sombre, chacune avec une couleur de texte de titre assortie. La coloration suit le cycle de vie : elle apparaît à l'ouverture, change aussitôt avec la couleur dans la gestion, disparaît à la fermeture ou à la suppression, et cesse à la désactivation de l'extension « Espaces de travail ». Elle nécessite Windows 11 ; sans cette prise en charge, la barre de titre standard demeure et l'application n'en est pas affectée.

### Cycle de vie

- **Créer :** « Enregistrer comme espace de travail… » nomme l'application en cours avec toutes ses fenêtres (le dialogue demande le nom et la couleur ; les couleurs proviennent de la palette de huit couleurs des groupes d'onglets). « Nouvel espace de travail… » crée un espace de travail vide et ouvre aussitôt sa première fenêtre.
- **Ouvrir :** un clic sur une entrée de la liste restaure toutes les fenêtres au dernier état. Le même espace de travail n'est jamais ouvert deux fois ; s'il est déjà ouvert, le focus passe à sa fenêtre active la plus récente.
- **Fermer :** « Fermer l'espace de travail » (ou la fermeture de la dernière fenêtre) fige l'état et ferme toutes les fenêtres de l'espace de travail. Les modifications non enregistrées de fichiers nommés passent par les demandes d'enregistrement habituelles ; une annulation arrête la fermeture. Les onglets sans titre non enregistrés rejoignent l'enregistrement sans demande et reviennent à la prochaine ouverture de l'espace de travail.
- **Renommer et couleur :** à tout moment via « Gérer les espaces de travail… » ; le titre de la fenêtre suit immédiatement.
- **Supprimer :** après confirmation, retire uniquement l'enregistrement, jamais les fichiers Markdown. Un espace de travail actuellement ouvert n'est pas fermé pour autant ; il continue comme application ordinaire sans nom, et ses brouillons encore enregistrés passent dans la réserve générale de brouillons.

### Gestion

« Gérer les espaces de travail… » ouvre un dialogue avec tous les espaces de travail : point de couleur, nom, état (ouvert ou fermé) et moment de la dernière ouverture. Chaque entrée propose les actions **Ouvrir**, **Renommer et couleur…** et **Supprimer**.

### Restauration de session et cas limites

Avec la restauration de session active, le prochain démarrage ramène les applications sans nom **et** tous les espaces de travail ouverts au moment de la fermeture. Si la restauration est désactivée, une fenêtre vide s'ouvre comme d'habitude ; les enregistrements restent intacts et peuvent être ouverts à tout moment depuis le sous-menu. Si le dossier de zone lié d'un espace de travail manque à l'ouverture, un avis s'affiche et l'ouverture n'a pas lieu ; l'enregistrement reste inchangé.

La fonction peut être désactivée en tant qu'extension « Espaces de travail » : le sous-menu, les commandes et la gestion disparaissent alors, tandis que les enregistrements et les espaces de travail ouverts restent intacts ; à la réactivation, tout est là, inchangé.
