# Systèmes de calendrier

Des chronologies librement définissables pour des mondes imaginaires et des cas d'usage particuliers : chaque zone peut tenir ses propres blocs de calendrier, dont les calendriers peuvent être construits tout autrement que le calendrier standard habituel — avec leurs propres longueurs de mois, règles intercalaires, cycles hebdomadaires et époques. La fonction fait partie de l'extension « Systèmes de calendrier » et ne vaut que dans le contexte d'une zone : sans zone ouverte, la section des paramètres et la commande d'insertion sont inactives.

## Concept

### Blocs

Un bloc est un monde temporel autonome doté d'un nom et d'un nombre quelconque de calendriers. Les calendriers d'un même bloc s'exécutent en parallèle, peuvent être mis en correspondance et convertis les uns dans les autres. Des blocs différents n'ont volontairement rien à voir entre eux — entre eux, il n'y a ni conversion ni comparabilité.

### Calendriers et niveaux

Un calendrier se compose d'une liste ordonnée de niveaux, le plus petit d'abord (par exemple seconde → minute → heure → jour → mois → année), regroupés en groupes de niveaux nommés (dans le modèle standard « Temps » et « Date »). Chaque niveau décrit sa relation avec le niveau immédiatement inférieur à l'aide de l'un des cinq types de relation :

- **Facteur fixe** — un nombre fixe d'unités inférieures, par exemple 60 secondes par minute.
- **Table de longueurs** — des unités aux longueurs individuelles, par exemple trois mois de 30, 30 et 35 jours ; les noms de ligne de la table sont en même temps les noms de position (noms de mois).
- **Règle intercalaire** — des règles de cycle suivant le schéma « intercalation tous les 4, sauf tous les 100, sauf tous les 400 », avec indication de l'unité prolongée et de la prolongation.
- **Cycle indépendant** — le schéma hebdomadaire : un cycle de longueur fixe court par-delà les limites de mois et d'année, ancré à une date de référence, éventuellement avec une règle de numérotation (le numéro du cycle suit l'année dans laquelle tombe le jour déterminant du cycle).
- **Regroupement** — une simple synthèse calculatoire, par exemple des trimestres de trois mois chacun.

### Époques

Chaque calendrier a exactement une époque passée ouverte (elle compte à rebours), un nombre quelconque d'époques intermédiaires fermées et une époque future ouverte. Les limites s'enchaînent sans interruption et se situent sur une date sans composante horaire ; le comptage des années démarre à 1 dans chaque époque, il n'y a pas d'année 0. Une limite d'époque peut tomber au milieu de l'année — l'année 1 de la nouvelle époque est alors une année partielle.

### Conversion via l'axe du bloc

Chaque bloc possède un axe temporel neutre. Chaque calendrier est projeté sur cet axe via une ancre (l'instant du calendrier qui se trouve au point zéro de l'axe) et une échelle (la durée de sa plus petite unité en unités de l'axe, sous forme de fraction numérateur/dénominateur). Les conversions entre calendriers passent toujours par l'axe du bloc et arrondissent de manière déterministe au niveau le plus petit du calendrier cible.

## Maintenance dans les paramètres

La section de paramètres « Systèmes de calendrier » montre les blocs de la zone ouverte en deux étapes : la vue d'ensemble gère les blocs (ajouter, renommer, ouvrir, supprimer), la vue détaillée d'un bloc montre ses calendriers sous forme de formulaires avec des éditeurs pour les niveaux, les époques, les cycles, les regroupements et l'axe du bloc.

- Le bouton **« Insérer le calendrier standard comme modèle »** crée une définition complète avec douze mois, une règle intercalaire et un cycle de sept jours — comme point de départ à adapter et comme exemple vivant de tous les types de relation.
- L'**aperçu en direct** montre une valeur d'exemple librement choisie sous forme canonique et avec les noms ; tant qu'une définition est incomplète, l'éditeur le signale comme un indice (validation souple), seule l'application vérifie strictement.
- Les définitions sont enregistrées dans le fichier de zone (fichier `Area_Settings.mdda`) et valent pour toutes les fenêtres de la zone.

L'édition n'est volontairement jamais verrouillée : les changements de structure sur des calendriers déjà utilisés sont autorisés. Les valeurs du document qui en deviennent invalides restent conservées inchangées et sont marquées de manière visible.

## Valeurs dans le document

Une valeur de calendrier figure sous forme canonique dans le texte source :

```text
@{Nom du calendrier: Année-Mois-Jour}
@{Nom du calendrier: Année-Mois-Jour Abréviation d'époque}
@{Nom du calendrier: Année-Mois-Jour Heure:Minute:Seconde}
```

Le premier deux-points sépare le nom du calendrier de la valeur. Les segments de date vont du plus grand au plus petit ; l'abréviation d'époque disparaît dans l'époque la plus récente, la partie horaire disparaît lorsque tous les segments de temps sont à leur minimum. En vue rendue, en mode direct et à l'export portable, la valeur apparaît sous forme de badge avec les noms de la définition (par exemple noms de mois et abréviation d'époque).

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

L’affichage en tire la durée au niveau de détail choisi, sans les parties de longueur nulle, par exemple « 1 mois, 2 semaines, 4 jours ». L’infobulle indique en plus la valeur canonique et le moment correspondant du calendrier de référence. Si le calendrier dérivé repose sur le calendrier standard, les unités apparaissent au singulier et au pluriel ; pour les calendriers définis soi-même, les noms restent tels qu’ils y ont été saisis.

### Sélecteur

Le sélecteur d’un calendrier dérivé affiche la grille de sa référence : on choisit une date ordinaire, et c’est le décompte qui est inséré. **« Vers l’ancre »** saute au point zéro.

### Modifications du calendrier de référence

Une valeur est une coordonnée de son calendrier. Si la référence change, les valeurs de ses calendriers dérivés se déplacent avec elle. L’éditeur signale en permanence les calendriers dérivés existants et demande une confirmation lors de l’application ; un calendrier avec des dérivés ne peut pas être supprimé tant que ceux-ci existent.
