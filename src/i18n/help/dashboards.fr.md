# Tableaux de bord

Un **tableau de bord** dispose des **tuiles** en rangées. Chaque tuile exécute une [Requête Perspective](frontmatter-query.md) et affiche son résultat sous forme de chiffre clé, de liste, de tableau, de graphique en barres ou en secteurs, ou bien elle contient son propre texte. Des **filtres** en tête restreignent à la fois les requêtes de toutes les tuiles. Il en résulte une vue d'ensemble qui se tient d'elle-même à jour avec le contenu de la zone : tâches ouvertes par statut, pages par thème, livres les plus longs d'une table de base de données, tout d'un coup d'œil.

**À ne pas confondre avec la vue « Tableau de bord » des événements.** Un [bloc d'événements](events.md) propose parmi ses vues une vue qui s'appelle elle aussi « Tableau de bord » (`view: dashboard`) : elle regroupe les événements à venir, les jalons et la répartition par catégorie **de ce seul bloc**. Cette page décrit autre chose : le bloc de code `perspective-dashboard` à part entière, dont les tuiles affichent des requêtes quelconques sur toute la zone.

Un tableau de bord est porté par un bloc de code avec l'étiquette de langage `perspective-dashboard`. Un document peut en contenir autant qu'il le souhaite, et tout le reste y demeure du Markdown ordinaire.

La fonction fait partie des [extensions internes](extensions.md) (« Tableau de bord ») et est activée à partir du mode de travail **Avancé**. Elle ne dépend d'aucune autre extension, pas même de « Graphique d'une requête ». Désactivée, le bloc apparaît sous forme de texte source avec une remarque au-dessus, et la commande « Insérer un tableau de bord » disparaît. Le document reste inchangé, et après la réactivation le tableau de bord réapparaît.

## Insérer un tableau de bord

La commande **« Insérer un tableau de bord »** insère un squelette au point d'insertion. Deux chemins y mènent : la palette de commandes (`Ctrl+K` par défaut) et le menu contextuel de l'éditeur → Insérer → Insérer un tableau de bord. Aucun raccourci n'est préaffecté ; il peut être attribué dans les paramètres. La commande suppose un document modifiable.

Elle insère une rangée avec un chiffre clé portant sur tous les documents du périmètre de recherche ; son titre suit la langue du programme choisie :

````markdown
```perspective-dashboard
!zeile
!kachel kennzahl titel="Nombre"
LIST
```
````

La requête `LIST` est ensuite sélectionnée, parce que c'est elle qu'on remplace en premier.

## Structure du bloc

À l'intérieur du bloc, chaque élément commence par une **ligne de marqueur** : elle se trouve en colonne 0 et commence par `!` suivi d'un mot. La ligne de marqueur porte les indications de l'élément ; les lignes suivantes jusqu'au marqueur suivant sont son contenu. Il existe trois éléments :

| Marqueur | Écriture | Lignes de contenu |
|---|---|---|
| `!filter` | `!filter <nom> [titel="…"] [eigenschaft=<champ>] [vorbelegung=<valeur>]` | valeurs énumérées, une par ligne |
| `!zeile` | `!zeile` | aucune |
| `!kachel` | `!kachel <type> [titel="…"] [breite=<part>] [abfrage="<fichier de requête>"]` | la requête, pour le type `text` du Markdown |

- Les **indications** ont la forme `nom=valeur`. Une valeur est un mot sans espace ou une chaîne entre guillemets doubles, dans laquelle `\"` représente un guillemet et `\\` une barre oblique inverse.
- **Vocabulaire :** Les mots du bloc sont allemands, comme ceux de la [surface Canvas](canvas.md), et sont les mêmes dans toutes les langues du programme : `!filter` est un filtre, `!zeile` une rangée, `!kachel` une tuile, `titel=` le titre, `eigenschaft=` la propriété, `vorbelegung=` la présélection, `breite=` la largeur et `abfrage=` le fichier de requête. Marqueurs, types de tuile et mots de largeur s'écrivent en minuscules ; `!Kachel` est un marqueur inconnu. Seuls les noms des filtres sont libres dans leur graphie.
- **Protection :** Une ligne de contenu qui doit commencer par `!` en colonne 0 est protégée par `\!`, par exemple une ligne de requête qui commence par `!=`.
- **Ordre :** Les filtres peuvent se trouver n'importe où dans le bloc et apparaissent rassemblés en tête, dans l'ordre du bloc. Les rangées et les tuiles suivent l'ordre du bloc.
- **L'inconnu est conservé.** Un marqueur ou une indication que l'application ne connaît pas reste dans le bloc avec son texte, et un élément inchangé est réécrit mot pour mot. Une erreur ne jette jamais rien : elle apparaît comme remarque, et le texte reste tel quel.

## Filtres (`!filter`)

En tête du tableau de bord, un filtre devient un **champ de sélection**. Ce qui y est choisi, l'application l'insère dans chaque requête qui porte son espace réservé (section « Espaces réservés dans les requêtes »).

````markdown
```perspective-dashboard
!filter statut titel="Statut" vorbelegung=ouvert
!filter prio titel="Priorité"
haute
moyenne
basse
```
````

- **Nom :** lettres, chiffres et trait de soulignement, sans chiffre au début ; les lettres accentuées sont permises, le trait d'union et le point ne le sont pas. Majuscules et minuscules ne comptent pas. Le nom est aussi le nom de l'espace réservé.
- **`titel=`** étiquette le champ de sélection ; sans indication, c'est le nom qui y figure.
- **D'où viennent les valeurs :** Si le filtre porte des lignes de contenu, les valeurs sont **énumérées** : chaque ligne non vide est une valeur, les espaces en bordure sont supprimés. Sinon, **`eigenschaft=`** nomme la propriété du frontmatter dont les valeurs attribuées dans la zone sont proposées ; une valeur de liste compte par élément, et ce qui se trouve dans le dossier de modèles ne compte pas. Si les deux manquent, la propriété du même nom s'applique : `!filter statut` seul est complet. Si des valeurs énumérées et `eigenschaft=` sont présentes à la fois, ce sont les valeurs énumérées qui s'appliquent, avec une remarque au champ.
- **Le choix** commence toujours par l'entrée **« tous »**. Suivent les valeurs énumérées dans leur ordre ou les valeurs issues de la zone, par ordre alphabétique selon la langue du programme choisie. Si une propriété n'apparaît pas dans la zone, le champ ne propose que « tous », sans remarque.
- **`vorbelegung=`** fixe la valeur par laquelle le champ commence ; sans indication, c'est « tous ». Avec des valeurs énumérées, la présélection doit être l'une d'elles (sans égard à la casse), sinon le champ commence par « tous » et une remarque figure au champ. Avec des valeurs issues de la zone, la présélection s'applique même si la valeur n'apparaît nulle part pour le moment.
- **Un choix n'est pas une modification.** Il vaut tant que le document est ouvert, séparément pour chaque colonne de la vue partagée, et n'est jamais écrit dans le fichier ; le document ne reçoit pas de marque de modification. Après fermeture et réouverture, le champ recommence par la présélection. Si la suite des filtres change dans le bloc, les champs recommencent également à zéro.
- **Seul ce qui est concerné se recharge.** Après un nouveau choix, seules les tuiles dont la requête porte l'espace réservé de ce filtre sont réévaluées ; les autres restent telles quelles.
- **Les valeurs restent à jour.** Si une valeur apparaît dans la zone ou en disparaît, le champ de sélection suit. Une valeur choisie qui a disparu de la zone reste choisie ; les tuiles n'affichent alors aucun résultat jusqu'à ce qu'un autre choix soit fait.
- **Limites des champs :** Au plus 20 filtres reçoivent un champ de sélection, et les valeurs de plus de 500 caractères ne sont pas proposées.
- **Cas d'erreur :** Un filtre sans nom valide est supprimé, de même qu'un second filtre du même nom ; c'est le premier qui s'applique. La remarque récapitulative au pied du tableau de bord nomme les deux.

## Espaces réservés dans les requêtes

Dans la requête d'une tuile, **`$nom`** représente le choix du filtre de ce nom, sans égard à la casse. Un espace réservé ne figure que dans `WHERE` et `HAVING`, mais là à n'importe quelle place d'une expression : comme côté d'une comparaison, dans une liste `IN` ou comme argument d'une fonction telle que `contains(tags, $tag)`.

````markdown
```perspective-dashboard
!filter statut
!kachel kennzahl titel="Résultats"
LIST FROM "Tâches" WHERE priorite = "haute" OR statut = $statut
```
````

- **Une valeur choisie** se compare comme une chaîne ; `statut = $statut` se comporte donc exactement comme `statut = "ouvert"` : sans égard à la casse et, pour une propriété de liste, comme appartenance. La valeur n'est jamais lue comme texte de requête.
- **Si le filtre est sur « tous »,** la plus petite condition qui porte l'espace réservé disparaît et compte comme remplie ; un `NOT` placé juste devant disparaît avec elle. `AND` et `OR` au-dessus calculent normalement : dans l'exemple, « tous » fournit donc toutes les tâches, parce que le côté droit du `OR` est rempli. Une propriété qui porte littéralement la valeur « tous » n'entre pas en conflit avec cela.
- **Un nom sans filtre** compte comme « tous » ; une remarque avec le nom figure alors au-dessus du résultat de la tuile.

Le comportement des espaces réservés en dehors d'un tableau de bord, par exemple dans une requête au fil du texte ou dans un fichier de requête ouvert seul, est décrit sur la page [Requête Perspective](frontmatter-query.md), section « Espaces réservés ».

## Rangées (`!zeile`)

`!zeile` commence une nouvelle rangée de la grille ; il ne porte pas d'indications. Les tuiles placées avant le premier `!zeile` forment une première rangée, de sorte qu'un tableau de bord d'une seule rangée se passe de ce marqueur. Un `!zeile` sans tuile à sa suite reste vide. Du texte dans les lignes sous `!zeile` n'a pas de signification, reste en place et est nommé dans la remarque récapitulative.

## Tuiles (`!kachel`)

Une tuile nomme d'abord son **type**, ensuite au choix un titre, une largeur et un fichier de requête. Sans type, elle n'est pas complète ; il n'existe pas de type par défaut.

- **`titel=`** figure au-dessus de la tuile. Sans indication, la ligne de titre reste vide, et un chiffre clé n'affiche que son nombre.
- **Source de données, exactement une :** Soit les lignes de contenu sont la requête, soit `abfrage=` nomme un fichier de requête (section « Tuile avec fichier de requête »).
- D'autres mots après le type, par exemple `!kachel kennzahl Ouvertes`, n'ont pas de signification ; la tuile reste valide, et une remarque au-dessus d'elle renvoie à l'indication `titel=`. Il en va de même pour des mots après le nom d'un filtre.

### Largeur

| Indication | Part de la rangée |
|---|---|
| `breite=ganz` (entière) | 12/12 |
| `breite=halb` (moitié) | 6/12 |
| `breite=drittel` (tiers) | 4/12 |
| `breite=viertel` (quart) | 3/12 |
| `breite=n/12` (n de 1 à 12) | n/12 ; un `n` nu vaut de même |

- **Les tuiles sans indication** se partagent à parts égales ce que les tuiles avec indication laissent dans leur rangée. Sans aucune indication, toutes les tuiles se partagent la pleine largeur.
- **Plus de douze douzièmes** dans une rangée passent à la ligne suivante sans remarque.
- **Un tableau de bord étroit** place les tuiles les unes sous les autres, de même que les champs de sélection en tête. Ce qui compte est la largeur du bloc, non celle de la fenêtre, afin qu'il reste lisible aussi dans une colonne de la vue partagée.
- Une valeur inconnue produit une remarque au-dessus de la tuile, qui se comporte alors comme sans indication.

### Les six types de tuile

Le type détermine la présentation. Un `DISPLAY` dans la requête est ignoré, sans remarque.

| Type | Attend | Affiche | Ne convient pas |
|---|---|---|---|
| `kennzahl` (chiffre clé) | toute requête | un grand nombre ou un nombre par groupe (ci-dessous) | tableau regroupé ou total général, dans les deux cas sans nombre : tableau avec remarque |
| `liste` (liste) | `LIST`, aussi avec `TASKS` et `BLOCKS` | la liste comme au fil du texte | `TABLE` : tableau avec remarque |
| `tabelle` (tableau) | `TABLE` | le tableau comme au fil du texte | `LIST` : liste avec remarque |
| `balken` (barres) | `TABLE` avec une colonne de nombres | un graphique en barres comme avec `DISPLAY bar` | tableau avec la raison en remarque |
| `kreis` (secteurs) | `TABLE` avec une colonne de nombres | un graphique en secteurs comme avec `DISPLAY pie` | tableau avec la raison en remarque |
| `text` | aucune requête | le Markdown des lignes de contenu | — |

Barres et secteurs lisent le tableau selon les règles des graphiques de la page [Requête Perspective](frontmatter-query.md), section « Forme de présentation ». Ils dépendent de l'extension « Graphique d'une requête » ; si elle est désactivée, ils affichent le tableau avec la remarque que la présentation en graphique est désactivée.

Liste et tableau affichent le résultat d'une requête d'enregistrements dont le fichier de requête active le [formulaire de liste](database.md) sous forme de grille, comme au fil du texte ; le chiffre clé n'affiche alors aussi que son nombre.

**Le chiffre clé** obtient son nombre selon la requête :

- Un tableau dont les colonnes sont exclusivement des agrégats, sans `GROUP BY` (le **total général**, par exemple `TABLE WITHOUT ID sum(effort)`) : sa première valeur.
- Toute autre requête sans regroupement : le nombre de résultats, après `LIMIT`.
- Un tableau regroupé : par groupe, la valeur de la première colonne qui porte un nombre ; si elle manque à un groupe, un tiret y figure, et un texte dans cette colonne apparaît comme texte.
- Une liste regroupée : par groupe, le nombre de ses résultats.

Un seul groupe donne un grand nombre, plusieurs donnent par groupe un nombre avec libellé ; sur plusieurs niveaux, les valeurs de groupe sont reliées par « › », comme dans le libellé d'un graphique. Sans résultat, c'est `0` qui figure. Une date ou une durée compte aussi comme nombre, de sorte que `min(…)` et `max(…)` sur des dates affichent le jour le plus ancien ou le plus récent. Nombres, dates et durées apparaissent au format de la langue du programme choisie.

### Tuiles de texte

Une tuile du type `text` affiche le Markdown de ses lignes de contenu, avec liens, mises en évidence et listes comme dans le reste du document. Trois particularités :

- **Les titres dans une tuile de texte** ressemblent à des titres mais n'appartiennent pas au plan du document : ils n'apparaissent pas dans la table des matières, ne portent pas de numérotation et ne sont pas une cible de saut.
- **Tableaux de données, notes de bas de page et ancres de bloc** dans une tuile de texte reçoivent leurs propres identifiants et numérotations, qui peuvent coïncider avec ceux du reste du document.
- **Un bloc de tableau de bord dans une tuile de texte** reste du texte source. Ses lignes de marqueur y ont besoin de la protection `\!`, parce que le bloc extérieur lit sinon chaque ligne avec `!` en colonne 0 comme un élément propre.

Une tuile de texte n'a pas de requête ; une indication `abfrage=` sur elle est ignorée avec une remarque.

### Tuile avec fichier de requête

Au lieu d'une requête propre, une tuile peut nommer un **fichier de requête**, un fichier portant la marque `db-query` et exactement un bloc de requête (page [Base de données](database.md), section « Fichiers de requête »). Plusieurs tableaux de bord partagent ainsi une requête entretenue à un seul endroit.

````markdown
```perspective-dashboard
!kachel liste titel="Requête partagée" abfrage="Requêtes/Modifiés récemment"
```
````

- **Cible :** le nom du document ou un chemin relatif au tableau de bord, les mêmes formes que pour `doc=` d'une carte de la [surface Canvas](canvas.md).
- **Référence :** La requête s'exécute comme si elle se trouvait dans le fichier de requête. `this.` et le lien wiki vide désignent le fichier de requête, non le tableau de bord.
- **Les espaces réservés** dans le fichier de requête agissent comme dans une requête du bloc. Sans espace réservé, la tuile n'est pas touchée par les filtres.
- **Lien dans la zone :** L'indication compte comme lien vers le fichier de requête. Le tableau de bord apparaît donc dans les [rétroliens](linking.md) du fichier de requête, la tuile parmi les liens sortants du tableau de bord comme intégration, et si le fichier de requête est renommé ou déplacé, l'indication suit, aperçu du renommage compris. Une cible qui n'existe pas reste un lien ouvert.
- **Cas d'erreur :** Si la cible est introuvable, n'est pas un fichier de requête, ou contient aucun ou plus d'un bloc de requête, la tuile affiche une remarque avec le nom indiqué.
- **Une seule source :** Si des lignes de requête figurent sous la tuile en même temps que `abfrage=`, aucune des deux n'est exécutée ; la tuile devient une tuile d'erreur.

## Lignes de commentaire

Une ligne qui commence en colonne 0 par `%%` et se termine par `%%` est un **commentaire**. Elle peut se trouver avant le premier élément, entre les éléments et entre les lignes d'une requête ; elle disparaît avant l'évaluation et n'est affichée nulle part. Dans une tuile de texte, `%%` suit les règles de l'extension « Commentaires » comme dans le reste du document.

## Remarques et tuiles d'erreur

Une erreur dans le bloc n'interrompt pas le tableau de bord ; chaque constat apparaît là où il a sa place :

- **Une tuile d'erreur** se trouve à sa place dans la grille, avec une bordure en tirets, avec titre, remarque et la ligne dans le bloc, comptée à partir de 1. Devient tuile d'erreur une tuile au type inconnu ou manquant, et une tuile d'un type de données sans source valide : ni requête ni fichier de requête, les deux à la fois, ou un fichier de requête inutilisable.
- **Les remarques d'une tuile valide**, par exemple sur une largeur inconnue, figurent au-dessus de son contenu.
- **Une erreur de syntaxe de la requête** apparaît avec sa position à la place du résultat de la tuile, comme pour une requête au fil du texte.
- **Les remarques d'un filtre** figurent sous son champ de sélection : valeurs énumérées et `eigenschaft=` à la fois, présélection inconnue, mots sans signification.
- **La remarque récapitulative** « Remarques sur ce tableau de bord » au pied nomme ce qui n'a pas de place propre, chaque fois avec sa ligne dans le bloc : un marqueur inconnu, du texte avant le premier élément, du texte sous `!zeile` et un filtre supprimé. Un marqueur inconnu n'apparaît pas lui-même, afin de ne pas décaler la grille.
- **Un tableau de bord sans tuile** affiche à la place de la grille une zone de remarque qui explique comment naît une tuile ; les filtres en tête restent.

Un bloc de tableau de bord qui se trouve lui-même dans un bloc de code extérieur reste du texte littéral.

## Vues, impression et export

- **Vues :** Rendu, Partagé et Direct affichent le même tableau de bord avec les mêmes valeurs. En mode Direct, le bloc se déplie en texte source dès que le curseur le touche, et se replie en tableau de bord lorsqu'on le quitte. Dans la vue purement source, il reste du code.
- **Intégration :** Un tableau de bord dans un document ou une section intégrés apparaît comme dans l'original, et ses champs de sélection restent utilisables, parce qu'un choix ne modifie rien au document.
- **Mise à jour en direct :** Les fichiers nouveaux, modifiés et supprimés se répercutent sur les tuiles dès que l'index les a saisis, de même que les modifications non enregistrées d'un fichier ouvert.
- **L'impression et l'export PDF** affichent les tuiles avec le **choix actuel** des filtres, dans leur disposition et sans les champs de sélection. Les graphiques y apparaissent clairs, même si l'application fonctionne en sombre.
- **Le Markdown portable** (**Fichier → Autres fonctions de fichier → Exporter → Markdown portable…**) remplace le bloc par un état statique avec la **présélection** des filtres, non avec le choix actuel. En haut figure une ligne « État de la présélection : … » qui nomme chaque filtre avec son titre et sa valeur, « tous » pour un filtre sans présélection ; un tableau de bord sans filtre n'a pas cette ligne. Suivent les tuiles **les unes sous les autres**, parce que le Markdown ordinaire ne connaît pas de grille, chacune avec son titre comme titre de section : le chiffre clé comme texte, la liste comme énumération, le tableau comme tableau Markdown, barres et secteurs comme image claire, la tuile de texte comme Markdown. Une tuile d'erreur apparaît comme titre avec sa remarque, ligne dans le bloc comprise, et une tuile dont l'évaluation ne se termine pas à temps avec une remarque à ce sujet. Il n'y a pas de champs de sélection dans l'export. Si l'extension est désactivée, le bloc reste un bloc de code dans l'export.

## Périmètre de recherche

Le périmètre de recherche des tuiles est le même que pour toute requête : avec une zone active, toute la zone ; sans zone, le dossier du document plus deux sous-niveaux. Ce qui se trouve dans le dossier de modèles n'est pas un résultat, sauf si une requête le nomme. Un document non encore enregistré n'a pas de périmètre de recherche ; ses tuiles affichent alors l'avis indiquant que la requête sera disponible après l'enregistrement.

## Un exemple complet

````markdown
```perspective-dashboard
%% Vue d'ensemble du projet, état 2026-11 %%
!filter statut titel="Statut" vorbelegung=ouvert
!filter prio titel="Priorité"
haute
moyenne
basse

!kachel text breite=ganz
## Vue d'ensemble du projet
Travail ouvert par statut et priorité ; détails dans [[Règles du projet]].

!zeile
!kachel kennzahl titel="Tâches ouvertes" breite=drittel
LIST FROM "Tâches" WHERE statut = $statut AND priorite = $prio
!kachel kennzahl titel="Effort total" breite=drittel
TABLE WITHOUT ID sum(effort) AS "Effort" FROM "Tâches" WHERE statut = $statut
!kachel kennzahl titel="Par priorité" breite=drittel
TABLE count() AS "Nombre" FROM "Tâches" WHERE statut = $statut GROUP BY priorite

!zeile
!kachel balken titel="Tâches par statut" breite=halb
TABLE count() AS "Nombre" FROM "Tâches" WHERE priorite = $prio GROUP BY statut
!kachel kreis titel="Part par catégorie" breite=halb
TABLE count() AS "Nombre" FROM "Tâches" WHERE statut = $statut GROUP BY categorie

!zeile
!kachel tabelle titel="Les dix plus anciennes" breite=8/12
TABLE statut, priorite FROM "Tâches" WHERE statut = $statut SORT file.ctime ASC LIMIT 10
!kachel liste titel="Requête partagée" abfrage="Requêtes/Modifiés récemment"
```
````

- Le commentaire de la première ligne n'apparaît nulle part. Le filtre « Statut » propose les valeurs de la propriété `statut` issues de la zone et commence par `ouvert` ; le filtre « Priorité » propose les trois valeurs énumérées et commence par « tous ».
- La tuile de texte se trouve avant le premier `!zeile` et forme seule la première rangée ; son titre n'appartient pas au plan du document.
- « Tâches ouvertes » compte les résultats, « Effort total » affiche le total général sans regroupement, « Par priorité » un nombre par priorité avec libellé.
- « Tâches par statut » ne dépend que du filtre Priorité et ne se recharge donc pas lorsque le statut change.
- La dernière tuile n'a pas d'indication de largeur et remplit les 4/12 restants. Elle n'est pas touchée par les filtres tant que son fichier de requête ne porte pas d'espace réservé.

Un tableau de bord fonctionnel sur les fichiers de la Demo-Area figure sur sa page « 17 Dashboards ».

## Limites

- **Les valeurs d'un filtre issues de la zone** proviennent des propriétés du frontmatter des documents de la zone, non des champs d'enregistrements ou de tâches ; pour ceux-ci, il y a les valeurs énumérées.
- **Un filtre choisit exactement une valeur** ou « tous » ; il n'y a pas de choix multiple.
- **Un espace réservé ne figure que dans `WHERE` et `HAVING`.** Dans `FROM`, dans les colonnes, dans `SORT`, `GROUP BY` et `LIMIT`, c'est une erreur de syntaxe.
- **Les types de tuile sont choisis par le seul type,** non par `DISPLAY` ; l'arbre (`DISPLAY tree`) n'est pas accessible dans une tuile.
- **`!zeile` ne porte pas d'indications,** et une tuile n'a pas de hauteur à choisir ; la hauteur suit son contenu.
- **Le graphique d'une tuile est une image sans commande ;** un clic dessus n'ouvre aucun résultat. Les résultats d'une liste ou d'un tableau sont en revanche cliquables comme au fil du texte.
- **Le choix des filtres n'est pas enregistré.** Qui veut voir durablement un état précis le fixe comme présélection dans le bloc.
- **Un tableau de bord dans une citation ou une liste** peut perdre le choix de ses filtres lors du passage en mode Direct et revenir à la présélection.
