# Systèmes de calendrier

Des chronologies librement définissables pour des mondes imaginaires et des cas d'usage particuliers : chaque zone peut tenir ses propres blocs de calendrier, dont les calendriers peuvent être construits tout autrement que le calendrier standard habituel — avec leurs propres longueurs de mois, règles intercalaires, cycles hebdomadaires et époques. La fonction fait partie de l'extension « Systèmes de calendrier » et ne vaut que dans le contexte d'une zone : sans zone ouverte, la section des paramètres et la commande d'insertion sont inactives.

## Concept

### Blocs

Un bloc est un monde temporel autonome doté d'un nom et d'un nombre quelconque de calendriers. Les calendriers d'un même bloc s'exécutent en parallèle, peuvent être mis en correspondance et convertis les uns dans les autres. Des blocs différents n'ont volontairement rien à voir entre eux — entre eux, il n'y a ni conversion ni comparabilité.

### Calendriers et niveaux

Un calendrier se compose d'une liste ordonnée de niveaux, le plus petit d'abord (par exemple seconde → minute → heure → jour → mois → année), regroupés en groupes de niveaux nommés (dans le modèle standard « Temps » et « Date »). Chaque niveau décrit sa relation avec le niveau immédiatement inférieur à l'aide de l'un des cinq types de relation :

- **Facteur fixe** — un nombre fixe d'unités inférieures, par exemple 60 secondes par minute.
- **Table de longueurs** — des unités aux longueurs individuelles, par exemple trois mois de 30, 30 et 35 jours ; les noms de ligne de la table sont en même temps les noms de position (noms de mois).
- **Règle intercalaire** — détermine les années bissextiles soit **par divisibilité**, avec des règles de cycle suivant le schéma « intercalation tous les 4, sauf tous les 100, sauf tous les 400 », soit **selon un motif** : une longueur de cycle en années et les positions des années bissextiles dans ce cycle, comptées à partir de 1 — par exemple 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 pour un cycle de 30 ans. Dans les deux cas, l'unité prolongée et la prolongation en font partie.
- **Cycle indépendant** — le schéma hebdomadaire : un cycle de longueur fixe court par-delà les limites de mois et d'année, ancré à une date de référence, éventuellement avec une règle de numérotation (le numéro du cycle suit l'année dans laquelle tombe le jour déterminant du cycle).
- **Regroupement** — une simple synthèse calculatoire, par exemple des trimestres de trois mois chacun.

### Époques

Chaque calendrier a exactement une époque passée ouverte (elle compte à rebours), un nombre quelconque d'époques intermédiaires fermées et une époque future ouverte. Les limites s'enchaînent sans interruption et se situent sur une date sans composante horaire ; le comptage des années démarre à 1 dans chaque époque, il n'y a pas d'année 0. Une limite d'époque peut tomber au milieu de l'année — l'année 1 de la nouvelle époque est alors une année partielle.

### Conversion via l'axe du bloc

Chaque bloc possède un axe temporel neutre. Chaque calendrier est projeté sur cet axe via une ancre (l'instant du calendrier qui se trouve au point zéro de l'axe) et une échelle (la durée de sa plus petite unité en unités de l'axe, sous forme de fraction numérateur/dénominateur). Les conversions entre calendriers passent toujours par l'axe du bloc et arrondissent de manière déterministe au niveau le plus petit du calendrier cible ; la commande « Convertir une date » en affiche le résultat (section du même nom).

## Maintenance dans les paramètres

La section de paramètres « Systèmes de calendrier » montre les blocs de la zone ouverte en deux étapes : la vue d'ensemble gère les blocs (ajouter, renommer, ouvrir, supprimer), la vue détaillée d'un bloc montre ses calendriers sous forme de formulaires avec des éditeurs pour les niveaux, les époques, les cycles, les regroupements et l'axe du bloc.

- Le menu déroulant **« Insérer un modèle … »** crée une chronologie entièrement remplie à partir des modèles fournis (section « Modèles fournis »). Pour commencer sans modèle, **« Ajouter un calendrier »** crée une chronologie vide.
- **Pluriel :** à côté du nom de chaque niveau figure le champ « Pluriel », de même au cycle (« Nom du cycle (pluriel) ») et à chaque regroupement (« Nom du regroupement (pluriel) »). Une durée affiche le singulier pour exactement une unité et le pluriel sinon, par exemple « 1 mois, 2 semaines, 4 jours » ; sans pluriel, le singulier s'applique toujours.
- **« Toujours écrire l'abréviation de l'époque » :** la case à cocher à la fin du groupe « Époques » écrit l'abréviation dans la valeur également pour l'époque la plus récente. C'est utile si d'autres époques sont ajoutées plus tard : les valeurs déjà enregistrées conservent alors leur signification. Une valeur de l'époque la plus récente désigne le même jour avec et sans abréviation. Ce qu'il advient des valeurs sans abréviation lorsqu'une époque est ajoutée après coup est décrit dans la section « Ajouter une époque après coup ».
- L'**aperçu en direct** montre une valeur d'exemple librement choisie sous forme canonique et avec les noms ; tant qu'une définition est incomplète, l'éditeur le signale comme un indice (validation souple), seule l'application vérifie strictement.
- Les définitions sont enregistrées dans le fichier de zone (fichier `Area_Settings.mdda`) et valent pour toutes les fenêtres de la zone.

L'édition n'est volontairement jamais verrouillée : les changements de structure sur des calendriers déjà utilisés sont autorisés. Les valeurs du document qui en deviennent invalides restent conservées inchangées et sont marquées de manière visible.

### Ajouter une époque après coup

Une valeur de l'époque la plus récente figure sans abréviation dans le document, et une valeur sans abréviation est toujours lue comme une valeur de l'époque la plus récente. Lorsqu'une chronologie reçoit une nouvelle époque la plus récente, les valeurs enregistrées de l'ancienne désigneraient donc un autre jour ou deviendraient invalides. Si la zone contient de telles valeurs, l'application pose la question lors de l'application, avant d'enregistrer, et indique leur nombre :

- **« Sécuriser les valeurs et appliquer »** enregistre la modification et réécrit chaque valeur concernée de sorte qu'elle désigne le même jour qu'auparavant. Une valeur antérieure au début de la nouvelle époque reçoit l'abréviation de la précédente : `@{Nom du calendrier: 30-06-01}` devient `@{Nom du calendrier: 30-06-01 AZ}`. Une valeur située à partir du début de la nouvelle époque reçoit son numéro d'année : si elle commence en l'an 31 de la précédente, `@{Nom du calendrier: 32-01-15}` devient `@{Nom du calendrier: 2-01-15}`. Cela vaut aussi pour une valeur qui porte déjà l'abréviation de l'époque précédente et qui deviendrait sinon invalide.
- **« Appliquer sans sécuriser »** enregistre la modification et laisse les valeurs telles quelles.
- **« Annuler »** laisse les paramètres et les documents inchangés.

Chaque emplacement de texte contenant une valeur concernée est sécurisé, dans les documents Markdown de la zone et dans les notes du document, y compris sur les cartes Canvas, dans les tableaux Kanban et dans les sections de code. Avant de modifier un document, l'application dépose son état précédent dans l'historique du document ; un document ouvert comportant des modifications non enregistrées reçoit la modification dans son état non enregistré et n'est sécurisé qu'une fois enregistré ; le rapport le signale. Les notes du document n'ont pas d'historique.

À la fin, un rapport indique par document le nombre de valeurs sécurisées et, séparément, les documents qui n'ont pas pu être modifiés : les documents divisés, les documents ouverts dans une autre fenêtre avec des modifications non enregistrées et les documents modifiés depuis le comptage. Les valeurs y sont à corriger à la main. Les états antérieurs de l'historique du document restent tels qu'ils ont été enregistrés.

Dans une zone très volumineuse dont la recherche de zone ne tient pas le texte à disposition, l'application ne peut ni compter ni sécuriser les valeurs ; la question le signale et ne propose que « Appliquer » et « Annuler ».

Si d'autres époques sont à prévoir dès le départ, activez « Toujours écrire l'abréviation de l'époque » : chaque nouvelle valeur porte alors son abréviation, et seules restent à sécuriser les valeurs situées à partir du début de la nouvelle époque.

## Modèles fournis

Le menu déroulant **« Insérer un modèle … »** dans la vue détaillée d'un bloc propose les calendriers fournis dans cet ordre :

1. Calendrier grégorien
2. Calendrier julien
3. Calendrier hégirien (tabulaire)
4. Calendrier indien
5. Calendrier bouddhiste
6. Calendrier éthiopien
7. Calendrier copte
8. Calendrier japonais
9. Calendrier républicain chinois

Le choix crée aussitôt la chronologie dans le bloc ouvert, entièrement remplie et sans autre saisie ; le menu revient ensuite à sa première entrée. La chronologie porte le nom du menu ; si ce nom est déjà pris dans la zone, elle reçoit un numéro ajouté, par exemple « Calendrier grégorien 2 ». Comme toute modification de cette section, elle est enregistrée avec **« Appliquer »**.

Chaque modèle apporte les niveaux de temps seconde, minute et heure, une semaine de sept jours ainsi que le singulier et le pluriel de ses unités. Le calendrier grégorien montre en outre tous les types de relation dans une seule définition : douze mois, règle intercalaire, cycle hebdomadaire, trimestres et semestres. Tous les modèles se situent sur le même axe des jours : les chronologies issues de modèles se convertissent les unes dans les autres au sein d'un même bloc, sans autre indication.

### Ce qu'est un modèle créé

Un modèle créé est une chronologie ordinaire de la zone. Elle se modifie, se renomme, se complète et se supprime ensuite comme toute autre ; le modèle est le point de départ, pas un lien durable. Une mise à jour du programme n'atteint donc pas une chronologie déjà créée.

Les autres fonctions de date de l'application restent grégoriennes : les marqueurs de tâche, les journaux, les comparaisons de requête et les types de tableau de données ne connaissent pas de chronologies propres.

### Lectures et limites

- **Calendrier hégirien (tabulaire)** — reproduit la lecture tabulaire : douze mois alternant 30 et 29 jours, le douzième mois (dhou al-hijja) compte 30 jours dans une année bissextile ; les années bissextiles sont les années 2, 5, 7, 10, 13, 16, 18, 21, 24, 26 et 29 de chaque cycle de 30 ans, comptées à partir de l'époque civile. Ce calcul vaut de la même façon pour chaque année. La date vécue dans la pratique religieuse suit en revanche l'observation du croissant de lune et peut s'en écarter d'un jour, rarement de deux. Les jours commencent à minuit, non au coucher du soleil.
- **Calendrier bouddhiste** — le comptage bouddhique des années tel qu'il s'applique en Thaïlande : mois et années bissextiles grégoriens, avec un millésime supérieur de 543 au millésime grégorien. Jusqu'en 1940, l'année thaïlandaise commençait le 1er avril ; le modèle compte partout avec un début d'année au 1er janvier et affiche donc avant 1941, de janvier à mars, une année supérieure d'une unité à l'usage de l'époque, et la même année à partir d'avril.
- **Calendrier indien** et **Calendrier républicain chinois** — tous deux comptent aussi à rebours avant leur introduction (calendrier indien 1957, calendrier républicain chinois 1912). Pour cette période, les sources ne les attestent pas comme valides ; avant 1912, les sources donnent souvent le mois et le jour selon le calendrier lunaire.
- **Calendrier japonais** — mois et années bissextiles grégoriens avec les ères Meiji (à partir du 23 octobre 1868), Taishō (à partir du 30 juillet 1912), Shōwa (à partir du 25 décembre 1926), Heisei (à partir du 8 janvier 1989) et Reiwa (à partir du 1er mai 2019) ; l'année 1 d'une ère va de son début au 31 décembre. Auparavant, l'époque « avant Meiji » compte à rebours ; les ères plus anciennes manquent, car elles reposent sur le calendrier lunaire. Avant 1873, le Japon utilisait le calendrier lunaire : les dates antérieures à 1873 sont donc des dates grégoriennes calculées à rebours et s'écartent de l'usage historique pour le mois et le jour, parfois aussi pour l'année. Le modèle écrit toujours l'ère (case « Toujours écrire l'abréviation de l'époque » cochée) : le 30 septembre 2026 figure dans le document sous la forme `8-09-30 Reiwa`.

### Ajouter une nouvelle ère japonaise

Lorsqu'une nouvelle ère commence au Japon, la prochaine version du programme après son annonce l'ajoute au modèle « Calendrier japonais ». Une chronologie déjà créée n'est pas concernée ; l'ère y est ajoutée à la main :

1. Dans les paramètres, ouvrir la section « Systèmes de calendrier » et ouvrir le bloc avec **« Ouvrir »**.
2. Dans la chronologie japonaise, sous « Époques », choisir **« Ajouter une époque »**.
3. Dans la nouvelle et dernière époque, saisir le nom de l'ère sous **« Nom »** et sous **« Abréviation »**, et sous **« Début »** son premier jour selon le calendrier grégorien.
4. Choisir **« Appliquer »**.

Comme le modèle écrit toujours l'abréviation de l'ère, les valeurs déjà enregistrées avant le début de la nouvelle ère conservent leur signification : `8-09-30 Reiwa` reste le 30 septembre 2026. Une valeur située à partir du début de la nouvelle ère et encore comptée dans la précédente deviendrait invalide ; l'application pose la question lors de l'application et, si vous le souhaitez, la convertit dans le décompte des années de la nouvelle ère (section « Ajouter une époque après coup »).

## Valeurs dans le document

Une valeur de calendrier figure sous forme canonique dans le texte source :

```text
@{Nom du calendrier: Année-Mois-Jour}
@{Nom du calendrier: Année-Mois-Jour Abréviation d'époque}
@{Nom du calendrier: Année-Mois-Jour Heure:Minute:Seconde}
```

Le premier deux-points sépare le nom du calendrier de la valeur. Les segments de date vont du plus grand au plus petit ; l'abréviation d'époque disparaît dans l'époque la plus récente, sauf si « Toujours écrire l'abréviation de l'époque » est activé pour la chronologie, la partie horaire disparaît lorsque tous les segments de temps sont à leur minimum. En vue rendue, en mode direct et à l'export portable, la valeur apparaît sous forme de badge avec les noms de la définition (par exemple noms de mois et abréviation d'époque).

Si le calendrier nommé n'est pas défini dans la zone ou si la valeur est invalide, le texte source reste inchangé et la valeur est marquée de manière visible — comme cet exemple, dont le calendrier n'existe pas sur cette page du manuel :

@{Calendrier d'exemple: 500-2-09 ZZ}

Dans les blocs de code et les codes en ligne, la syntaxe reste intacte : `@{Calendrier d'exemple: 500-2-09 ZZ}`.

## Insérer et modifier

- **Insérer :** la commande « Insérer une date de calendrier » (palette de commandes ; un raccourci peut être attribué) ouvre le sélecteur et insère l'instant choisi sous forme canonique au niveau du curseur. Elle est active dès que la zone ouverte définit au moins un calendrier.
- **Modifier :** les valeurs sont cliquables en mode source et en mode direct ; le clic ouvre le sélecteur pré-rempli avec la valeur, la validation la remplace sur place en une seule étape d'annulation. Sur la ligne portant le curseur, **Ctrl-clic** ouvre le sélecteur tandis que le clic simple y place le curseur.

## Sélecteur

Le sélecteur des calendriers personnalisés fonctionne de façon analogue au sélecteur de date standard :

- Sélections d'en-tête pour **bloc**, **calendrier** et **époque** (les sélections à une seule entrée disparaissent). Un changement de calendrier convertit l'instant choisi ; un changement de bloc saute à l'ancre du calendrier cible.
- La **grille** naît de la structure des niveaux : avec un cycle hebdomadaire défini, sous forme de grille en colonnes (longueur du cycle = nombre de colonnes, noms de position en en-tête, colonne de numéros en cas de règle de numérotation), sans cycle, sous forme de liste continue des jours de l'unité.
- **Navigation :** les boutons fléchés extérieurs décalent la plus grande unité (l'année), les intérieurs l'unité de la grille (le mois) ; les touches fléchées naviguent jour par jour, Entrée valide, Échap annule. **« Vers l'ancre »** saute à l'instant de référence du calendrier.
- **Les niveaux de temps** apparaissent comme des segments réglables individuellement avec saisie par flèches et par chiffres — les valeurs invalides ne peuvent structurellement pas être saisies.

### Affichage de la conversion

Sous la grille, le sélecteur montre l'instant choisi dans tous les calendriers parallèles du bloc. Un clic sur une correspondance y bascule le calendrier actif. Les calendriers de blocs différents ne sont volontairement pas convertibles.

## Convertir une date

La commande « Convertir une date » indique à quel instant des autres calendriers d'un bloc correspond une date. Elle se trouve dans la palette de commandes et dans le menu contextuel de l'éditeur ; un raccourci peut être attribué sous Fichier → Paramètres… → Raccourcis clavier. Elle est active dès que la zone ouverte définit au moins un calendrier, y compris dans la vue de lecture.

La boîte de dialogue propose les sélections **« Bloc »** (seulement s'il y a plusieurs blocs) et **« Calendrier »**, le champ **« Date »** pour une valeur en notation canonique sans nom de calendrier (section « Valeurs dans le document ») et le bouton **« Choisir … »**, qui ouvre le sélecteur. En dessous, la liste **« Correspond à »** affiche une ligne « Nom : valeur » pour chaque autre calendrier du bloc. Un clic ou Entrée sur une ligne fait de son calendrier le point de départ ; la conversion fonctionne ainsi dans tous les sens. La boîte de dialogue est préremplie à partir de la sélection dans le texte : si celle-ci touche une valeur de calendrier ou si le curseur s'y trouve, avec le calendrier et la valeur de celle-ci. Si un texte d'une seule ligne sans valeur de calendrier est sélectionné, il est pris comme valeur en notation canonique dans le premier calendrier de la zone où il est valide ; s'il n'est valide dans aucun, il apparaît dans le premier calendrier avec le message « Ce n'est pas une date valide de ce calendrier. ». Les autres notations, comme « 3.10.2026 », ne sont pas interprétées.

Chaque ligne avec un résultat porte les boutons **« Copier »** et **« Insérer »** ; tous deux reprennent la correspondance comme valeur de calendrier avec son nom, `@{Nom: valeur}`, telle que l'écrit « Insérer une date de calendrier ». « Copier » la place dans le presse-papiers ; la boîte de dialogue reste ouverte et le bouton affiche brièvement « Copié ». « Insérer » l'écrit dans le document en une seule étape d'annulation et ferme la boîte de dialogue : une sélection est remplacée, et si le curseur se trouve sans sélection dans une valeur de calendrier, la correspondance est insérée après celle-ci. Ce n'est possible que si la boîte de dialogue a été ouverte depuis un document en mode édition ; sinon le bouton est désactivé et son infobulle en donne la raison. « Copier » fonctionne toujours. D'elle-même, la boîte de dialogue ne modifie rien dans le document ; seul « Insérer » écrit. Voici comment remplacer une date par sa correspondance : sélectionner la valeur de calendrier entière ou une date sous forme de texte, appeler « Convertir une date » et choisir « Insérer » sur la ligne voulue.

Là où il n'y a pas de résultat, une indication remplace la valeur :

- Une date qui n'existe pas dans le calendrier choisi est signalée par « Ce n'est pas une date valide de ce calendrier. » ; la liste disparaît alors.
- Si un calendrier ne peut pas représenter l'instant, sa ligne indique « Nom : hors de la plage représentable ».
- Si le bloc ne contient qu'un seul calendrier, la boîte de dialogue signale qu'il en manque un second.

La conversion se fait uniquement au sein d'un bloc ; la ligne d'indication de la boîte de dialogue le rappelle. Les calendriers à convertir l'un dans l'autre doivent donc se trouver dans le même bloc. Une chronologie ne peut pas être déplacée vers un autre bloc : on la crée à nouveau dans le bloc cible ou on y insère le modèle. Le résultat vaut ce que valent l'ancre et l'échelle des calendriers concernés : les modèles fournis se situent d'eux-mêmes sur le même axe des jours ; pour les calendriers définis soi-même, le groupe « Axe du bloc (conversion) » des paramètres fixe leur position.

## Calendriers dérivés

Un calendrier dérivé compte à partir d’un point zéro choisi : combien de temps il reste jusqu’à une date, ou depuis combien de temps un événement a eu lieu. Il n’a pas besoin de définition propre, seulement d’un calendrier de référence et d’un point zéro.

### Création

Dans la section de paramètres « Systèmes de calendrier », le bouton **« Ajouter un calendrier dérivé »** ouvre un formulaire court :

- **Calendrier de référence** — un calendrier du même bloc ou le calendrier standard fourni. Un décompte vers une date ne demande donc aucun calendrier propre.
- **Point zéro (jour 1)** — la date dans la notation de la référence, au choix via le sélecteur ; il tombe toujours sur un jour entier.
- **Niveau de détail** — la finesse de la durée, de la plus petite unité seule jusqu’aux années.
- **Abréviations de direction** — deux mots courts pour le temps avant et après le point zéro.

Les éditeurs de niveaux, cycles, regroupements et époques n’apparaissent pas ici, car rien de tout cela n’est modifiable.

### Ce qui est hérité

Le calendrier dérivé reprend les unités de sa référence et déplace leurs limites sur le point zéro. Si celui-ci tombe un 23, chaque mois dérivé commence le 23 et chaque année dérivée le même jour ; les semaines commencent le jour de la semaine du point zéro. Chaque unité conserve donc la longueur qu’elle a dans la référence, et un jour bissextile tombe de lui-même dans la bonne année. Les noms suivent : si le décompte commence en juillet, le premier mois s’appelle toujours juillet. Si le point zéro tombe un jour que tous les mois n’ont pas, la limite recule au dernier jour disponible.

### Valeurs dans le document

La valeur compte dans les deux sens depuis le point zéro : les unités plus grandes comme nombre complet à partir de 0, la plus petite comme numéro d’ordre à partir de 1. Avant le point zéro, la même forme s’applique avec l’abréviation de direction.

```text
@{Calendrier : 0-0-1}             le point zéro lui-même
@{Calendrier : 0-1-18}            un mois et dix-sept jours après
@{Calendrier : 0-0-15 avant GL}   quinze jours avant
```

L’affichage en tire la durée au niveau de détail choisi, sans les parties de longueur nulle, par exemple « 1 mois, 2 semaines, 4 jours ». L’infobulle indique en plus la valeur canonique et le moment correspondant du calendrier de référence. Si le calendrier dérivé repose sur le calendrier standard, les unités apparaissent au singulier et au pluriel ; pour les calendriers définis soi-même, c’est le champ « Pluriel » de l’unité qui s’applique, et sans pluriel le singulier figure toujours.

### Sélecteur

Le sélecteur d’un calendrier dérivé affiche la grille de sa référence : on choisit une date ordinaire, et c’est le décompte qui est inséré. **« Vers l’ancre »** saute au point zéro.

### Modifications du calendrier de référence

Une valeur est une coordonnée de son calendrier. Si la référence change, les valeurs de ses calendriers dérivés se déplacent avec elle. L’éditeur signale en permanence les calendriers dérivés existants et demande une confirmation lors de l’application ; un calendrier avec des dérivés ne peut pas être supprimé tant que ceux-ci existent. Les simples dénominations — noms et pluriels des niveaux, cycles et regroupements ainsi que noms des mois et des jours de la semaine — ne déplacent aucune valeur et ne demandent pas de confirmation.
